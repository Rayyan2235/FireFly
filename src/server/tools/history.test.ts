import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Actions } from '../actions.ts';
import { Contention } from '../contention.ts';
import { Dispatch } from '../dispatch.ts';
import { openIncident } from '../incidents.ts';
import { DEMO_SCENARIO, injectProblem } from '../problems.ts';
import { seedWorld } from '../seed.ts';
import { Simulator } from '../simulator.ts';
import { World } from '../world.ts';
import { runTool } from './index.ts';
import type { ToolContext, ToolInput } from './index.ts';

/** Runs a tool the way the runner does, including the two events that record the call. */
function setup() {
  const world = new World(seedWorld());
  const sim = new Simulator(world, (report) => openIncident(world, report));
  const dispatch = new Dispatch(world, sim);
  const contention = new Contention();
  const actions = new Actions(world, { wake: () => {}, supervisorNote: () => 0 });
  const tool = async (incidentId: string, name: string, input: ToolInput, note?: ToolContext['note']) => {
    const called = world.emit({ type: 'tool.called', actor: { kind: 'agent', id: 'firefly-1' }, source_mode: 'real-model', incident_id: incidentId, summary: name, payload: { tool: name, input } });
    const result = await runTool({ world, sim, dispatch, contention, incidentId, agentId: 'firefly-1', note }, name, input);
    world.emit({ type: 'tool.result', actor: { kind: 'system', id: 'tools' }, source_mode: 'system', incident_id: incidentId, caused_by: called.seq, summary: result.summary, payload: { tool: name, ok: result.ok, output: result.output } });
    return result;
  };
  contention.arm();
  for (const problem of DEMO_SCENARIO) injectProblem(world, problem, 'demo scenario');
  dispatch.startShift();
  vi.runAllTimers();
  const history = async (scope: string) => (await tool('R-5', 'get_site_history', { scope })).output.facts as Array<Record<string, unknown>>;
  return { world, actions, tool, history };
}

describe('get_site_history', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports doors closed, obstructed and lost to another truck, each with its event number', async () => {
    const { world, tool, history } = setup();
    await tool('R-2', 'reserve_door', { job_id: 'J-2', door: 4 }); // loses the staged race

    const doors = await history('doors');
    expect(doors).toMatchObject([
      { door: 3, what: 'closed' },
      { door: 7, what: 'approach obstructed' },
      { door: 4, what: 'reservation lost to another truck', taken_by: 'T-7', incident: 'R-2' },
    ]);
    const log = world.since(0);
    for (const fact of doors) expect(log.some((e) => e.seq === fact.seq)).toBe(true);
  });

  it('reports who cleared what, how long it took, and the rules and outcomes that followed', async () => {
    const { actions, tool, history } = setup();
    await tool('R-5', 'offer_task', { incident_id: 'R-5', worker_id: 'sam' });
    await tool('R-5', 'save_correction', { subject_type: 'equipment', subject_id: 'F-3', fact: 'leaking', release_condition: 'maintenance clears it', interpretation: 'F-3 excluded until maintenance clears it.' }, { from: 'Maria', text: 'F-3 is leaking.', seq: 1 });
    await tool('R-5', 'offer_task', { incident_id: 'R-5', worker_id: 'noor' });
    actions.answer('K-2', 'noor', true);
    vi.advanceTimersByTime(12_000);
    actions.report('K-2', 'noor', 'cleared');

    expect(await history('workers')).toMatchObject([
      { worker: 'sam', equipment: 'F-3', task: 'K-1', what: 'offer withdrawn before an answer' },
      { worker: 'noor', equipment: 'F-4', door: 7, task: 'K-2', what: 'cleared the obstruction', accept_to_clear_s: 12 },
    ]);
    const equipment = await tool('R-5', 'get_site_history', { scope: 'equipment' });
    expect(equipment.output).toMatchObject({ facts: [{ subject: 'F-3', what: 'supervisor rule saved', source: 'Maria' }], rules_in_force: [{ subject: 'F-3', fact: 'leaking' }] });
    expect((await history('doors')).at(-1)).toMatchObject({ door: 7, what: 'approach cleared' });
  });

  it('reports how earlier incidents ended', async () => {
    const { tool, history } = setup();
    await tool('R-5', 'escalate', { incident_id: 'R-5', missing: 'Nobody is eligible.' });
    await tool('R-2', 'reserve_door', { job_id: 'J-2', door: 4 });
    await tool('R-2', 'reserve_door', { job_id: 'J-2', door: 2 });
    await tool('R-2', 'request_destination', { truck_id: 'T-2', door: 2, request_id: 'r-1' });
    vi.runAllTimers();
    await tool('R-2', 'verify_outcome', { incident_id: 'R-2' });

    expect(await history('incidents')).toMatchObject([
      { incident: 'R-5', what: 'escalated' },
      { incident: 'R-2', kind: 'door_closed', what: 'resolved', outcome: 'Recovered without supervisor input' },
    ]);
  });

  it('says so when nothing is recorded', async () => {
    const { tool } = setup();
    expect(await tool('R-5', 'get_site_history', { scope: 'workers' })).toMatchObject({ ok: true, summary: 'Nothing recorded about workers yet this shift.', output: { facts: [] } });
  });
});
