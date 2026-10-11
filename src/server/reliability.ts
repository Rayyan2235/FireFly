import type { FireflyEvent } from '../contract.ts';
import type { Command } from './simulator.ts';

/**
 * The reliability panel: outcomes of the run on screen, counted from its own event log.
 * Counts and times only. No ratios against agent actions, and nothing extrapolated
 * to savings, utilization or cost (ADR 0007).
 */
export interface Reliability {
  label: string;
  events: { from_seq: number; to_seq: number };
  incidents: { opened: number; resolved: number; escalated: number; open: number };
  recovered: { without_supervisor_input: number; with_physical_assistance: number };
  time_to_recovery_s: { median: number | null; max: number | null };
  supervisor_actions: { corrections_saved: number; authorizations_given: number };
  worker_labor: Array<{ worker: string; tasks_accepted: number; tasks_completed: number }>;
  controller_commands: { sent: number; acknowledged: number; completed: number; stopped_blocked: number; rejected: number; timed_out: number };
}

const is = <T extends FireflyEvent['type']>(e: FireflyEvent, type: T): e is FireflyEvent<T> => e.type === type;

/** The events of the current run: everything after the last reset. */
export function currentRun(log: FireflyEvent[]): FireflyEvent[] {
  const reset = log.findLastIndex((e) => e.type === 'world.reset');
  return log.slice(reset + 1);
}

/** `commands` is the controllers' own view of this run; it supplies rejections and timeouts, which have no channel message. */
export function reliability(run: FireflyEvent[], commands: Command[] = []): Reliability {
  const opened = new Map<string, number>(); // incident id → time opened
  const recoveryS: number[] = [];
  const resolved = new Set<string>();
  const escalated = new Set<string>();
  const supervised = new Set<string>(); // incidents with a correction or an authorization attributed to them
  const assisted = new Set<string>(); // incidents with an accepted task
  const accepted = new Map<string, Set<string>>(); // worker → task ids
  const completed = new Map<string, Set<string>>();
  const count = { corrections: 0, authorizations: 0, sent: 0, acknowledged: 0, completed: 0, blocked: 0 };
  const add = (map: Map<string, Set<string>>, worker: string, task: string) => map.set(worker, (map.get(worker) ?? new Set()).add(task));

  for (const e of run) {
    const id = e.incident_id;
    if (is(e, 'incident.opened')) opened.set(e.payload.id, Date.parse(e.ts));
    else if (is(e, 'incident.resolved')) {
      resolved.add(e.payload.id);
      const start = opened.get(e.payload.id);
      if (start !== undefined) recoveryS.push((Date.parse(e.ts) - start) / 1000);
    } else if (is(e, 'incident.updated')) {
      if (e.actor.id === 'runner' && e.payload.status === 'needs_you') escalated.add(e.payload.id); // the system stepped in
    } else if (is(e, 'tool.result')) {
      if (e.payload.tool === 'escalate' && e.payload.ok && id) escalated.add(id); // the agent handed it over
    } else if (is(e, 'correction.saved')) {
      if (e.source_mode === 'human') continue; // a rule being ended, not saved
      count.corrections++;
      if (id) supervised.add(id);
    } else if (is(e, 'approval.changed')) {
      if (e.payload.status !== 'approved') continue;
      count.authorizations++;
      supervised.add(e.payload.incidentId);
    } else if (is(e, 'task.changed')) {
      const { id: task, worker, status, cleared, incidentId } = e.payload;
      if (!worker || status === 'offered' || status === 'withdrawn' || status === 'declined') continue;
      add(accepted, worker, task);
      assisted.add(incidentId);
      if (cleared) add(completed, worker, task);
    } else if (is(e, 'radio')) {
      const { type, to } = e.payload;
      if ((type === 'GO_TO' || type === 'RESUME') && to.startsWith('T-')) count.sent++;
      else if (type === 'ACK') count.acknowledged++;
      else if (type === 'ARRIVED') count.completed++;
      else if (type === 'BLOCKED') count.blocked++;
    }
  }

  const sorted = [...recoveryS].sort((a, b) => a - b);
  const median = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.ceil((sorted.length - 1) / 2)]!) / 2 : null;
  const round = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  return {
    label: 'Simulated yard · twin mode',
    events: { from_seq: run[0]?.seq ?? 0, to_seq: run.at(-1)?.seq ?? 0 },
    incidents: { opened: opened.size, resolved: resolved.size, escalated: escalated.size, open: [...opened.keys()].filter((i) => !resolved.has(i)).length },
    recovered: {
      without_supervisor_input: [...resolved].filter((i) => !supervised.has(i)).length,
      with_physical_assistance: [...resolved].filter((i) => assisted.has(i)).length,
    },
    time_to_recovery_s: { median: round(median), max: round(sorted.at(-1) ?? null) },
    supervisor_actions: { corrections_saved: count.corrections, authorizations_given: count.authorizations },
    worker_labor: [...accepted.keys()].sort().map((worker) => ({ worker, tasks_accepted: accepted.get(worker)!.size, tasks_completed: completed.get(worker)?.size ?? 0 })),
    controller_commands: {
      sent: count.sent,
      acknowledged: count.acknowledged,
      completed: count.completed,
      stopped_blocked: count.blocked,
      rejected: commands.filter((c) => c.status === 'rejected').length,
      timed_out: commands.filter((c) => c.status === 'timed_out').length,
    },
  };
}
