import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Actions } from './actions.ts';
import { Dispatch } from './dispatch.ts';
import { openIncident } from './incidents.ts';
import { DEMO_SCENARIO, injectProblem } from './problems.ts';
import { currentRun, reliability } from './reliability.ts';
import { seedWorld } from './seed.ts';
import { Simulator } from './simulator.ts';
import { runTool } from './tools/index.ts';
import type { ToolInput } from './tools/index.ts';
import { World } from './world.ts';

/** Plays the demo story by calling the tools and the people's actions directly (no model), then reads the panel. */
async function playStory() {
  const world = new World(seedWorld());
  const sim = new Simulator(world, (report) => openIncident(world, report));
  const dispatch = new Dispatch(world, sim);
  const actions = new Actions(world, { wake: () => {}, supervisorNote: () => 0 });
  const tool = (incidentId: string, name: string, input: ToolInput) => runTool({ world, sim, dispatch, incidentId, agentId: 'firefly-1' }, name, input);

  for (const problem of DEMO_SCENARIO) injectProblem(world, problem, 'demo scenario');
  dispatch.startShift();
  vi.runAllTimers();

  await tool('R-2', 'reserve_door', { job_id: 'J-2', door: 2 });
  await tool('R-2', 'request_destination', { truck_id: 'T-2', door: 2, request_id: 'r-1' });
  vi.runAllTimers();
  await tool('R-2', 'verify_outcome', { incident_id: 'R-2' });

  await tool('R-5', 'offer_task', { incident_id: 'R-5', worker_id: 'noor' });
  actions.answer('K-1', 'noor', true);
  actions.report('K-1', 'noor', 'cleared');
  actions.report('K-1', 'noor', 'people_clear');
  await tool('R-5', 'request_authorization', { incident_id: 'R-5' });
  actions.approve('A-1');
  await tool('R-5', 'request_resume', { incident_id: 'R-5', request_id: 'r-2' });
  vi.runAllTimers();
  await tool('R-5', 'verify_outcome', { incident_id: 'R-5' });
  return { world, sim, tool };
}

describe('reliability panel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts the outcomes of the run from its own event log', async () => {
    const { world, sim } = await playStory();
    const panel = reliability(currentRun(world.since(0)), [...sim.commands.values()]);

    expect(panel.label).toBe('Simulated yard · twin mode');
    expect(panel.incidents).toEqual({ opened: 2, resolved: 2, escalated: 0, open: 0 });
    expect(panel.recovered).toEqual({ without_supervisor_input: 1, with_physical_assistance: 1 });
    expect(panel.supervisor_actions).toEqual({ corrections_saved: 0, authorizations_given: 1 });
    expect(panel.worker_labor).toEqual([{ worker: 'noor', tasks_accepted: 1, tasks_completed: 1 }]);
    expect(panel.controller_commands).toEqual({ sent: 4, acknowledged: 4, completed: 2, stopped_blocked: 2, rejected: 0, timed_out: 0 });
    expect(panel.time_to_recovery_s.max).toBeGreaterThanOrEqual(panel.time_to_recovery_s.median!);
  });

  it('counts an escalation and leaves that incident open', async () => {
    const { world, tool } = await playStory();
    injectProblem(world, { kind: 'drop_pallet', door: 6 }, 'test');
    openIncident(world, { truckId: 'T-8', door: 6, reason: 'obstruction', seq: world.state.seq });
    const called = world.emit({ type: 'tool.called', actor: { kind: 'agent', id: 'firefly-1' }, source_mode: 'real-model', incident_id: 'R-8', summary: 'escalate(R-8)', payload: { tool: 'escalate', input: {} } });
    const result = await tool('R-8', 'escalate', { incident_id: 'R-8', missing: 'Nobody is eligible.' });
    world.emit({ type: 'tool.result', actor: { kind: 'system', id: 'tools' }, source_mode: 'system', incident_id: 'R-8', caused_by: called.seq, summary: result.summary, payload: { tool: 'escalate', ok: result.ok, output: result.output } });

    expect(reliability(currentRun(world.since(0))).incidents).toEqual({ opened: 3, resolved: 2, escalated: 1, open: 1 });
  });

  it('only counts the current run: a reset starts the panel again', async () => {
    const { world } = await playStory();
    world.reset(seedWorld());
    const panel = reliability(currentRun(world.since(0)));
    expect(panel.incidents.opened).toBe(0);
    expect(panel.time_to_recovery_s).toEqual({ median: null, max: null });
  });
});
