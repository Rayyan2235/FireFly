import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EventPayloads, EventType, FireflyEvent } from '../contract.ts';
import { FlightRecorder } from './recorder.ts';
import { reliability } from './reliability.ts';

// Needs a real MongoDB: set MONGODB_URI_TEST to run. The database it names is emptied first.
const URI = process.env.MONGODB_URI_TEST;

const T0 = Date.parse('2026-10-11T14:00:00.000Z');
let seq = 0;
/** One recorded event, `s` seconds into the shift. */
function event<T extends EventType>(s: number, type: T, payload: EventPayloads[T], extra: Partial<FireflyEvent> = {}): FireflyEvent {
  return { seq: ++seq, ts: new Date(T0 + s * 1000).toISOString(), type, actor: { kind: 'system', id: 'tools' }, source_mode: 'system', summary: type, payload, ...extra } as FireflyEvent;
}
const door = (id: number, change: object) => ({ id, kind: 'shipping', closed: false, obstruction: false, occupant: null, reservedBy: null, ...change }) as EventPayloads['door.changed'];
const task = (change: object) => ({ id: 'K-1', incidentId: 'R-5', door: 7, worker: 'noor', equipment: 'F-4', status: 'offered', arrived: false, cleared: false, peopleClear: false, ...change }) as EventPayloads['task.changed'];
const incident = (status: string) => ({ id: 'R-5', kind: 'obstruction', truckId: 'T-5', door: 7, title: 'T-5 · Door 7 approach blocked', status, agentId: 'firefly-2' }) as EventPayloads['incident.opened'];
const scenario = { actor: { kind: 'system', id: 'scenario' }, source_mode: 'simulated' } as const;

describe.skipIf(!URI)('FlightRecorder (MongoDB)', () => {
  let recorder: FlightRecorder;
  let first: string;
  let shiftOne: FireflyEvent[];

  beforeAll(async () => {
    const client = await new MongoClient(URI!).connect();
    await client.db().dropDatabase();
    await client.close();
    recorder = await FlightRecorder.connect(URI!);
    first = recorder.shift;

    shiftOne = [
      event(0, 'door.changed', door(3, { closed: true }), scenario),
      event(0, 'door.changed', door(7, { obstruction: true }), scenario),
      event(2, 'incident.opened', incident('queued'), { incident_id: 'R-5' }),
      event(3, 'tool.called', { tool: 'reserve_door', input: { job_id: 'J-2', door: 4 } }, { incident_id: 'R-2' }),
      event(3, 'tool.result', { tool: 'reserve_door', ok: false, output: { conflict: 'door_taken', by: 'T-7' } }, { incident_id: 'R-2', caused_by: 4 }), // the call above
      event(5, 'task.changed', task({}), { incident_id: 'R-5' }),
      event(10, 'task.changed', task({ status: 'accepted' }), { incident_id: 'R-5', source_mode: 'human' }),
      event(22, 'task.changed', task({ status: 'accepted', cleared: true }), { incident_id: 'R-5', source_mode: 'human' }),
      event(40, 'correction.saved', { id: 'C-1', subject: 'F-3', fact: 'leaking', source: 'Maria', createdAt: '', releaseCondition: 'maintenance clears it', active: true, interpretation: 'F-3 excluded until maintenance clears it.' }),
      event(62, 'incident.resolved', { ...incident('resolved'), outcome: 'Recovered with physical assistance' }, { incident_id: 'R-5' }),
    ];
    for (const e of shiftOne) recorder.record(e);
    recorder.record(event(90, 'world.reset', { seq: 0, doors: [], trucks: [], jobs: [], workers: [], equipment: [], incidents: [], tasks: [], corrections: [], approvals: [] }));
    await recorder.settled();
  });
  afterAll(() => recorder?.close());

  it('keeps every event of a shift, in order, exactly as recorded', async () => {
    expect(await recorder.eventsOf(first)).toEqual(shiftOne);
  });

  it('a reset starts a new shift, and both are listed with what happened in them', async () => {
    expect(recorder.shift).not.toBe(first);
    expect(await recorder.shifts()).toMatchObject([
      { shift: recorder.shift, events: 1, incidents_opened: 0 },
      { shift: first, events: 10, incidents_opened: 1, incidents_resolved: 1, model_tool_calls: 1 },
    ]);
  });

  it('replays a recorded shift with its timing, shortening only the long waits', async () => {
    const replay = await recorder.replayOf(first);
    expect(replay.events.map((e) => e.at / 1000)).toEqual([0, 0, 2, 3, 3, 5, 10, 18, 26, 34]); // 12 s, 18 s and 22 s waits become 8 s
    expect(replay.events[0]).not.toHaveProperty('seq');
    await expect(recorder.replayOf('shift-nope')).rejects.toThrow('No recorded shift');
  });

  it('works out what earlier shifts recorded, inside MongoDB', async () => {
    expect(await recorder.earlierShifts()).toEqual({
      shifts_on_record: 1,
      workers: [{ worker: 'noor', equipment: 'F-4', tasks_cleared: 1, offers_declined: 0, avg_accept_to_clear_s: 12 }],
      doors: [
        { door: 3, times_closed: 1, times_obstructed: 0, reservations_lost: 0 },
        { door: 4, times_closed: 0, times_obstructed: 0, reservations_lost: 1 },
        { door: 7, times_closed: 0, times_obstructed: 1, reservations_lost: 0 },
      ],
      incidents: [{ kind: 'obstruction', opened: 1, resolved: 1, avg_recovery_s: 60 }],
    });
  });

  it("the supervisor's rules survive a restart", async () => {
    expect(await recorder.activeRules()).toMatchObject([{ subject: 'F-3', fact: 'leaking', source: 'Maria', active: true }]);
  });

  it('a past shift gets the same reliability panel, counted from the record', async () => {
    const panel = reliability(await recorder.eventsOf(first));
    expect(panel.incidents).toEqual({ opened: 1, resolved: 1, escalated: 0, open: 0 });
    expect(panel.time_to_recovery_s).toEqual({ median: 60, max: 60 });
  });
});
