import { describe, expect, it } from 'vitest';
import type { EventInput, EventType, FireflyEvent } from '../../contract.ts';
import { deriveRuns } from './runs.ts';

let seq = 0;
function ev<T extends EventType>(input: Partial<EventInput<T>> & Pick<EventInput<T>, 'type' | 'payload'>): FireflyEvent<T> {
  seq += 1;
  return {
    actor: { kind: 'system', id: 'tools' },
    source_mode: 'system',
    summary: '',
    ...input,
    seq,
    ts: new Date(Date.UTC(2026, 9, 11, 18, 0, seq)).toISOString(),
  } as FireflyEvent<T>;
}

const call = (incident: string, tool: string, summary: string, agent = 'firefly-1') =>
  ev({ type: 'tool.called', incident_id: incident, actor: { kind: 'agent', id: agent }, source_mode: 'real-model', summary, payload: { tool, input: {} } });
const result = (incident: string, tool: string, ok: boolean, summary: string) =>
  ev({ type: 'tool.result', incident_id: incident, summary, payload: { tool, ok, output: {} } });

describe('deriveRuns', () => {
  it('groups tool calls by incident and pairs each result with its call', () => {
    const events = [
      call('R-2', 'reserve_door', 'reserve_door(J-2, Door 4)'),
      call('R-5', 'inspect_incident', 'inspect_incident(R-5)', 'firefly-2'),
      result('R-2', 'reserve_door', false, 'Rejected: Door 4 was just taken by T-7.'),
      call('R-2', 'reserve_door', 'reserve_door(J-2, Door 2)'),
      result('R-2', 'reserve_door', true, 'Reserved Door 2 for J-2.'),
    ];
    const runs = deriveRuns(events);
    const r2 = runs.find((r) => r.incidentId === 'R-2')!;
    expect(r2.agentId).toBe('firefly-1');
    expect(r2.steps.map((s) => [s.call, s.result?.ok])).toEqual([
      ['reserve_door(J-2, Door 4)', false],
      ['reserve_door(J-2, Door 2)', true],
    ]);
    const r5 = runs.find((r) => r.incidentId === 'R-5')!;
    expect(r5.agentId).toBe('firefly-2');
    expect(r5.steps[0]!.result).toBeUndefined(); // still waiting on the tool
  });

  it('takes the trigger from the BLOCKED report and the outcome from the resolve event', () => {
    const events = [
      ev({ type: 'radio', incident_id: 'R-2', actor: { kind: 'robot', id: 'T-2' }, source_mode: 'simulated', payload: { from: 'T-2', to: 'Firefly', type: 'BLOCKED', text: 'Door 3 closed.' } }),
      ev({ type: 'incident.opened', incident_id: 'R-2', payload: { id: 'R-2', kind: 'door_closed', truckId: 'T-2', door: 3, title: 'T-2 · Door 3 closed', status: 'working', agentId: 'firefly-1' } }),
      call('R-2', 'verify_outcome', 'verify_outcome(J-2)'),
      result('R-2', 'verify_outcome', true, 'Controller confirmed arrival.'),
      ev({ type: 'incident.resolved', incident_id: 'R-2', summary: 'Incident R-2 closed.', payload: { id: 'R-2', kind: 'door_closed', truckId: 'T-2', door: 3, title: 'T-2 · Door 3 closed', status: 'resolved', agentId: 'firefly-1' } }),
    ];
    const [run] = deriveRuns(events);
    expect(run!.trigger?.type).toBe('BLOCKED');
    expect(run!.title).toBe('T-2 · Door 3 closed');
    expect(run!.resolved?.summary).toBe('Incident R-2 closed.');
  });
});
