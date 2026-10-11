import type { FireflyEvent, RadioMessage } from '../../contract.ts';

export interface ToolStep {
  seq: number;
  ts: string;
  tool: string;
  call: string; // the event summary, e.g. "reserve_door(J-2, Door 4)"
  result?: { ok: boolean; summary: string; ts: string };
}

/** One agent's work on one incident, rebuilt from the event log. */
export interface AgentRun {
  incidentId: string;
  agentId: string | null;
  title: string;
  trigger?: RadioMessage & { ts: string }; // the robot's BLOCKED report, if there was one
  steps: ToolStep[];
  resolved?: { summary: string; ts: string };
  firstTs: string;
  lastTs: string;
  lastSeq: number;
}

/** Groups events by incident. Every line the agent panel shows comes from one of these events. */
export function deriveRuns(events: FireflyEvent[]): AgentRun[] {
  const runs = new Map<string, AgentRun>();
  const runFor = (e: FireflyEvent) => {
    const id = e.incident_id!;
    let run = runs.get(id);
    if (!run) {
      run = { incidentId: id, agentId: null, title: id, steps: [], firstTs: e.ts, lastTs: e.ts, lastSeq: e.seq };
      runs.set(id, run);
    }
    run.lastTs = e.ts;
    run.lastSeq = e.seq;
    return run;
  };

  for (const e of events) {
    if (!e.incident_id) continue;
    switch (e.type) {
      case 'incident.opened':
      case 'incident.updated': {
        const run = runFor(e);
        const inc = (e as FireflyEvent<'incident.opened'>).payload;
        run.title = inc.title;
        run.agentId = inc.agentId ?? run.agentId;
        break;
      }
      case 'incident.resolved': {
        const run = runFor(e);
        run.resolved = { summary: e.summary, ts: e.ts };
        break;
      }
      case 'radio': {
        const m = (e as FireflyEvent<'radio'>).payload;
        if (m.type === 'BLOCKED') {
          const run = runFor(e);
          run.trigger ??= { ...m, ts: e.ts };
        }
        break;
      }
      case 'tool.called': {
        const run = runFor(e);
        const p = (e as FireflyEvent<'tool.called'>).payload;
        run.agentId ??= e.actor.id;
        run.steps.push({ seq: e.seq, ts: e.ts, tool: p.tool, call: e.summary });
        break;
      }
      case 'tool.result': {
        const run = runFor(e);
        const p = (e as FireflyEvent<'tool.result'>).payload;
        const step = run.steps.find((s) => !s.result && s.tool === p.tool) ?? run.steps.findLast((s) => !s.result);
        if (step) step.result = { ok: p.ok, summary: e.summary, ts: e.ts };
        break;
      }
    }
  }
  return [...runs.values()];
}

export const seconds = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
