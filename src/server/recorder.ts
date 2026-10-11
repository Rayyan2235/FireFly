import { MongoClient } from 'mongodb';
import type { Collection, Document } from 'mongodb';
import type { Correction, EventInput, FireflyEvent } from '../contract.ts';
import { lanePipeline } from './lanes.ts';
import type { Lane, LaneStats } from './lanes.ts';
import type { Fixture } from './replay.ts';

type Recorded = FireflyEvent & { shift: string; at: Date };

const MAX_GAP_MS = 8000; // on replay, long waits on a person are shortened to this; truck moves are shorter and keep their timing

/**
 * The yard's flight recorder, kept in MongoDB. Every event of every shift is written
 * here, so a past shift can be replayed exactly and later decisions can read what
 * earlier shifts recorded.
 *
 * It only ever follows the yard. The live yard stays in memory, and nothing waits on
 * the database: events are queued and written in the background, and a failed write is
 * logged, never thrown into the yard.
 */
export class FlightRecorder {
  shift = newShiftId();
  private readonly client: MongoClient;
  private readonly events: Collection<Recorded>;
  private readonly rules: Collection<Correction>;
  private queue: Recorded[] = [];
  private writing: Promise<unknown> = Promise.resolve();

  private constructor(client: MongoClient) {
    this.client = client;
    this.events = client.db().collection<Recorded>('events');
    this.rules = client.db().collection<Correction>('rules');
  }

  static async connect(uri: string): Promise<FlightRecorder> {
    const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 4000, ignoreUndefined: true }).connect();
    const recorder = new FlightRecorder(client);
    await recorder.events.createIndex({ shift: 1, seq: 1 }, { unique: true }); // one place per event; a retry can't duplicate it
    await recorder.events.createIndex({ type: 1, shift: 1 });
    await recorder.rules.createIndex({ subject: 1 }, { unique: true });
    return recorder;
  }

  /** Queues one event for the record. A reset starts a new shift, and the reset is that shift's first entry. */
  record(event: FireflyEvent): void {
    if (event.type === 'world.reset') this.shift = newShiftId(this.shift);
    this.queue.push({ ...event, shift: this.shift, at: new Date(event.ts) });
    if (event.type === 'correction.saved') this.saveRule((event as FireflyEvent<'correction.saved'>).payload);
    if (this.queue.length === 1) this.writing = this.writing.then(() => this.flush());
  }

  /** Resolves once everything queued so far has been written (or has failed and been logged). */
  settled(): Promise<unknown> {
    return this.writing;
  }

  close(): Promise<void> {
    return this.client.close();
  }

  private async flush(): Promise<void> {
    const batch = this.queue;
    this.queue = [];
    if (!batch.length) return;
    try {
      await this.events.insertMany(batch, { ordered: true });
    } catch (err) {
      console.error(`[recorder] ${batch.length} events not written:`, err instanceof Error ? err.message : err);
    }
  }

  /* ---------- the supervisor's rules outlive a restart ---------- */

  private saveRule(rule: Correction): void {
    this.writing = this.writing
      .then(() => this.rules.updateOne({ subject: rule.subject }, { $set: rule }, { upsert: true }))
      .catch((err) => console.error('[recorder] rule not written:', err instanceof Error ? err.message : err));
  }

  /** Rules still in force, for a server that is just starting. */
  activeRules(): Promise<Correction[]> {
    return this.rules.find({ active: true }, { projection: { _id: 0 } }).toArray() as Promise<Correction[]>;
  }

  /* ---------- replay: any past shift, event for event ---------- */

  /** Every recorded shift, newest first, with what happened in it. */
  shifts(): Promise<Document[]> {
    const count = (type: string) => ({ $sum: { $cond: [{ $eq: ['$type', type] }, 1, 0] } });
    return this.events
      .aggregate([
        {
          $group: {
            _id: '$shift',
            started_at: { $min: '$at' },
            ended_at: { $max: '$at' },
            events: { $sum: 1 },
            incidents_opened: count('incident.opened'),
            incidents_resolved: count('incident.resolved'),
            model_tool_calls: count('tool.called'),
          },
        },
        { $sort: { started_at: -1 } },
        { $limit: 50 },
        { $project: { _id: 0, shift: '$_id', started_at: 1, ended_at: 1, events: 1, incidents_opened: 1, incidents_resolved: 1, model_tool_calls: 1 } },
      ])
      .toArray();
  }

  /** One shift's events in order, exactly as they were recorded. */
  async eventsOf(shift: string): Promise<FireflyEvent[]> {
    const docs = await this.events.find({ shift }, { projection: { _id: 0, shift: 0, at: 0 } }).sort({ seq: 1 }).toArray();
    return docs as unknown as FireflyEvent[];
  }

  /** A recorded shift in the shape the existing replay stream plays, with its original timing. */
  async replayOf(shift: string): Promise<Fixture> {
    const events = await this.eventsOf(shift);
    if (!events.length) throw new Error(`No recorded shift ${shift}`);
    let at = 0;
    let previous = Date.parse(events[0]!.ts);
    return {
      name: shift,
      note: 'A recorded shift replayed from MongoDB. Nothing here is happening now.',
      events: events.map(({ seq: _seq, ts, ...event }) => {
        at += Math.min(Date.parse(ts) - previous, MAX_GAP_MS);
        previous = Date.parse(ts);
        return { at, ...(event as EventInput) };
      }),
    };
  }

  /** Trip statistics for one lane, computed here from the imported public dataset (`lane_trips`). */
  async laneStats(lane: Lane): Promise<LaneStats | null> {
    const [stats] = await this.client.db().collection('lane_trips').aggregate<LaneStats>(lanePipeline(lane), { maxTimeMS: 5000 }).toArray();
    return stats ?? null;
  }

  /* ---------- memory: what earlier shifts recorded ---------- */

  /**
   * Outcomes from every shift before this one, worked out inside MongoDB:
   * how workers did, what happened at each door, and how incidents ended.
   * Counts and averages of recorded events only.
   */
  async earlierShifts(): Promise<Record<string, unknown>> {
    const earlier = { shift: { $ne: this.shift } };
    const seconds = (from: string, to: string) => ({ $divide: [{ $subtract: [to, from] }, 1000] });
    const when = (cond: Document) => ({ $min: { $cond: [cond, '$at', null] } });

    const [shifts, workers, doors, lost, incidents] = await Promise.all([
      this.events.distinct('shift', earlier),
      this.events
        .aggregate([
          { $match: { ...earlier, type: 'task.changed', 'payload.worker': { $ne: null } } },
          {
            $group: {
              _id: { shift: '$shift', task: '$payload.id' },
              worker: { $last: '$payload.worker' },
              equipment: { $last: '$payload.equipment' },
              accepted_at: when({ $eq: ['$payload.status', 'accepted'] }),
              cleared_at: when({ $eq: ['$payload.cleared', true] }),
              declined: { $max: { $cond: [{ $eq: ['$payload.status', 'declined'] }, 1, 0] } },
            },
          },
          {
            $group: {
              _id: { worker: '$worker', equipment: '$equipment' },
              tasks_cleared: { $sum: { $cond: [{ $ifNull: ['$cleared_at', false] }, 1, 0] } },
              offers_declined: { $sum: '$declined' },
              avg_accept_to_clear_s: { $avg: seconds('$accepted_at', '$cleared_at') },
            },
          },
          { $project: { _id: 0, worker: '$_id.worker', equipment: '$_id.equipment', tasks_cleared: 1, offers_declined: 1, avg_accept_to_clear_s: { $round: ['$avg_accept_to_clear_s', 1] } } },
          { $sort: { worker: 1 } },
        ])
        .toArray(),
      this.events
        .aggregate([
          { $match: { ...earlier, type: 'door.changed', 'actor.id': 'scenario' } },
          { $group: { _id: '$payload.id', times_closed: { $sum: { $cond: ['$payload.closed', 1, 0] } }, times_obstructed: { $sum: { $cond: ['$payload.obstruction', 1, 0] } } } },
        ])
        .toArray(),
      // A lost reservation is a failed tool result; the door it was for is on the call that caused it.
      this.events
        .aggregate([
          { $match: { ...earlier, type: 'tool.result', 'payload.tool': 'reserve_door', 'payload.output.conflict': 'door_taken' } },
          {
            $lookup: {
              from: 'events',
              let: { shift: '$shift', call: '$caused_by' },
              pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$shift', '$$shift'] }, { $eq: ['$seq', '$$call'] }] } } }, { $project: { _id: 0, door: '$payload.input.door' } }],
              as: 'call',
            },
          },
          { $group: { _id: { $first: '$call.door' }, reservations_lost: { $sum: 1 } } },
        ])
        .toArray(),
      this.events
        .aggregate([
          { $match: { ...earlier, type: { $in: ['incident.opened', 'incident.resolved'] } } },
          {
            $group: {
              _id: { shift: '$shift', incident: '$payload.id' },
              kind: { $first: '$payload.kind' },
              opened_at: when({ $eq: ['$type', 'incident.opened'] }),
              resolved_at: when({ $eq: ['$type', 'incident.resolved'] }),
            },
          },
          {
            $group: {
              _id: '$kind',
              opened: { $sum: 1 },
              resolved: { $sum: { $cond: [{ $ifNull: ['$resolved_at', false] }, 1, 0] } },
              avg_recovery_s: { $avg: seconds('$opened_at', '$resolved_at') },
            },
          },
          { $project: { _id: 0, kind: '$_id', opened: 1, resolved: 1, avg_recovery_s: { $round: ['$avg_recovery_s', 1] } } },
          { $sort: { kind: 1 } },
        ])
        .toArray(),
    ]);

    const byDoor = new Map<number, Record<string, number>>();
    for (const d of doors) byDoor.set(d._id, { door: d._id, times_closed: d.times_closed, times_obstructed: d.times_obstructed, reservations_lost: 0 });
    for (const l of lost) byDoor.set(l._id, { door: l._id, times_closed: 0, times_obstructed: 0, ...byDoor.get(l._id), reservations_lost: l.reservations_lost });
    return { shifts_on_record: shifts.length, workers, doors: [...byDoor.values()].sort((a, b) => a.door! - b.door!), incidents };
  }
}

/** `shift-20261011-175204`, with a suffix if two shifts start in the same second. */
function newShiftId(previous?: string): string {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const id = `shift-${stamp.slice(0, 8)}-${stamp.slice(8)}`;
  if (!previous?.startsWith(id)) return id;
  return `${id}-${Number(previous.slice(id.length + 1) || 1) + 1}`;
}
