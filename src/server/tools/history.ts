import type { FireflyEvent } from '../../contract.ts';
import { currentRun } from '../reliability.ts';
import { ok, schema, text } from './types.ts';
import type { Tool } from './types.ts';

type Fact = Record<string, unknown> & { seq: number }; // every fact names the event it came from

const is = <T extends FireflyEvent['type']>(e: FireflyEvent, type: T): e is FireflyEvent<T> => e.type === type;
const seconds = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 100) / 10;

/** Doors that closed, were obstructed or cleared, or were lost to another truck mid-reservation. */
function doorFacts(run: FireflyEvent[]): Fact[] {
  const facts: Fact[] = [];
  const state = new Map<number, { closed: boolean; obstruction: boolean; since?: string }>();
  for (const e of run) {
    if (is(e, 'door.changed')) {
      const was = state.get(e.payload.id) ?? { closed: false, obstruction: false };
      if (e.payload.closed && !was.closed) facts.push({ door: e.payload.id, what: 'closed', seq: e.seq });
      if (e.payload.obstruction && !was.obstruction) facts.push({ door: e.payload.id, what: 'approach obstructed', seq: e.seq });
      if (!e.payload.obstruction && was.obstruction) facts.push({ door: e.payload.id, what: 'approach cleared', obstructed_for_s: was.since ? seconds(was.since, e.ts) : null, seq: e.seq });
      state.set(e.payload.id, { closed: e.payload.closed, obstruction: e.payload.obstruction, since: e.payload.obstruction && !was.obstruction ? e.ts : was.since });
    } else if (is(e, 'tool.result') && e.payload.tool === 'reserve_door' && e.payload.output.conflict === 'door_taken') {
      const call = run.find((c) => c.seq === e.caused_by) as FireflyEvent<'tool.called'> | undefined;
      facts.push({ door: call?.payload.input.door ?? null, what: 'reservation lost to another truck', taken_by: e.payload.output.by ?? null, incident: e.incident_id, seq: e.seq });
    }
  }
  return facts;
}

/** What happened to each task: who took it, with what, and how long clearing took. */
function workerFacts(run: FireflyEvent[]): Fact[] {
  const facts: Fact[] = [];
  const acceptedAt = new Map<string, string>();
  const done = new Set<string>();
  for (const e of run) {
    if (!is(e, 'task.changed')) continue;
    const { id: task, worker, equipment, door, status, cleared, incidentId: incident } = e.payload;
    const base = { worker, equipment, door, task, incident };
    if (status === 'accepted' && !acceptedAt.has(task)) acceptedAt.set(task, e.ts);
    if (cleared && !done.has(task)) {
      done.add(task);
      const from = acceptedAt.get(task);
      facts.push({ ...base, what: 'cleared the obstruction', accept_to_clear_s: from ? seconds(from, e.ts) : null, seq: e.seq });
    } else if (status === 'declined') facts.push({ ...base, what: 'declined the offer', seq: e.seq });
    else if (status === 'withdrawn') facts.push({ ...base, what: 'offer withdrawn before an answer', seq: e.seq });
  }
  return facts;
}

/** Forklift outages and the supervisor's rules about equipment, workers and doors. */
function equipmentFacts(run: FireflyEvent[]): Fact[] {
  const facts: Fact[] = [];
  for (const e of run) {
    if (is(e, 'equipment.changed') && e.payload.outOfService) facts.push({ equipment: e.payload.id, what: 'out of service', seq: e.seq });
    else if (is(e, 'correction.saved')) {
      const { subject, fact, source, releaseCondition, active } = e.payload;
      facts.push({ subject, what: active ? 'supervisor rule saved' : 'supervisor rule ended', fact, source, release_condition: releaseCondition, seq: e.seq });
    }
  }
  return facts;
}

/** How earlier incidents ended: resolved (and how fast) or handed to the supervisor. */
function incidentFacts(run: FireflyEvent[]): Fact[] {
  const facts: Fact[] = [];
  const openedAt = new Map<string, string>();
  for (const e of run) {
    if (is(e, 'incident.opened')) openedAt.set(e.payload.id, e.ts);
    else if (is(e, 'incident.resolved')) {
      const from = openedAt.get(e.payload.id);
      facts.push({ incident: e.payload.id, kind: e.payload.kind, door: e.payload.door, what: 'resolved', outcome: e.payload.outcome ?? null, recovery_s: from ? seconds(from, e.ts) : null, seq: e.seq });
    } else if (is(e, 'incident.updated') && e.payload.status === 'needs_you' && e.summary.includes('escalated')) {
      facts.push({ incident: e.payload.id, kind: e.payload.kind, door: e.payload.door, what: 'escalated', record: e.summary, seq: e.seq });
    }
  }
  return facts;
}

const SCOPES = { doors: doorFacts, workers: workerFacts, equipment: equipmentFacts, incidents: incidentFacts };

export const getSiteHistory: Tool = {
  name: 'get_site_history',
  kind: 'read',
  description:
    'Recorded outcomes, so a decision can use what already happened. This shift: doors closed or lost to another truck, how long workers took to clear obstructions, equipment outages and supervisor rules, and how earlier incidents ended, each with the number of the event it came from. Scope earlier_shifts: counts and averages from every shift recorded before this one. Facts only. Use it when you are choosing between options.',
  input_schema: schema({ scope: { type: 'string', enum: [...Object.keys(SCOPES), 'earlier_shifts'], description: 'Which records to read.' } }),
  async run({ world, memory }, input) {
    if (text(input, 'scope') === 'earlier_shifts') {
      if (!memory) return ok('No record of earlier shifts is connected.', { scope: 'earlier_shifts', shifts_on_record: 0 });
      const record = await memory();
      return ok(`Recorded outcomes from ${record.shifts_on_record} earlier ${record.shifts_on_record === 1 ? 'shift' : 'shifts'}.`, { scope: 'earlier_shifts', ...record });
    }
    const scope = text(input, 'scope') as keyof typeof SCOPES;
    const facts = SCOPES[scope]?.(currentRun(world.since(0))) ?? [];
    // Rules saved before a reset still apply, so they are listed even when their event is from an earlier run.
    const rules = scope === 'equipment' ? world.state.corrections.filter((c) => c.active).map((c) => ({ subject: c.subject, fact: c.fact, source: c.source, release_condition: c.releaseCondition })) : undefined;
    // With a flight recorder connected, the same question is also answered from every earlier shift.
    const earlier = memory && scope !== 'equipment' ? await memory().catch(() => null) : null;
    const before = earlier && Number(earlier.shifts_on_record) > 0 ? { shifts_on_record: earlier.shifts_on_record, [scope]: earlier[scope] } : undefined;
    const now = facts.length ? `${facts.length} recorded ${facts.length === 1 ? 'fact' : 'facts'} about ${scope} this shift.` : `Nothing recorded about ${scope} yet this shift.`;
    return ok(before ? `${now} Plus the record of ${before.shifts_on_record} earlier ${before.shifts_on_record === 1 ? 'shift' : 'shifts'}.` : now, {
      scope,
      facts,
      ...(rules ? { rules_in_force: rules } : {}),
      ...(before ? { earlier_shifts: before } : {}),
    });
  },
};
