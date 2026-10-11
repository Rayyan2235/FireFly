import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FireflyEvent } from '../../contract.ts';
import { Contention } from '../contention.ts';
import { Dispatch } from '../dispatch.ts';
import { openIncident } from '../incidents.ts';
import { DEMO_SCENARIO, injectProblem } from '../problems.ts';
import { seedWorld } from '../seed.ts';
import { Simulator } from '../simulator.ts';
import type { ToolInput } from '../tools/index.ts';
import { World } from '../world.ts';
import type { AskModel, Message } from './model.ts';
import { AgentRunner } from './runner.ts';

/*
 * These tests replace the model with a fixed list of tool calls so the loop itself
 * can be checked without the network. Nothing here is model output; the real model
 * is only ever reached through `claude()` in model.ts.
 */
type Step = [tool: string, input: ToolInput] | 'done';

function standIn(scripts: Record<string, Step[]>): AskModel {
  let n = 0;
  return async ({ messages }) => {
    const first = messages[0]!.content as string;
    const incidentId = /Incident (\S+) is yours/.exec(first)![1]!;
    const step = scripts[incidentId]?.shift() ?? 'done';
    const content = step === 'done' ? [{ type: 'text', text: 'Done.' }] : [{ type: 'tool_use', id: `tu-${++n}`, name: step[0], input: step[1] }];
    return { content, stop_reason: step === 'done' ? 'end_turn' : 'tool_use', usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Message;
  };
}

const R2_RECOVERY: Step[] = [
  ['inspect_incident', { incident_id: 'R-2' }],
  ['get_job', { job_id: 'J-2' }],
  ['list_compatible_doors', { job_id: 'J-2' }],
  ['reserve_door', { job_id: 'J-2', door: 4 }], // loses the staged race
  ['list_compatible_doors', { job_id: 'J-2' }],
  ['reserve_door', { job_id: 'J-2', door: 2 }],
  ['request_destination', { truck_id: 'T-2', door: 2, request_id: 'r-2-1' }],
  ['get_command_status', { request_id: 'r-2-1', wait_s: 30 }],
  ['verify_outcome', { incident_id: 'R-2' }],
];

function setup(ask: AskModel) {
  const world = new World(seedWorld());
  const events: FireflyEvent[] = [];
  world.subscribe((e) => events.push(e));
  const contention = new Contention();
  let runner: AgentRunner;
  const sim = new Simulator(world, (report) => {
    openIncident(world, report);
    runner.assign();
  });
  const dispatch = new Dispatch(world, sim);
  runner = new AgentRunner({ world, sim, dispatch, contention, ask });
  const runDemo = () => {
    contention.arm();
    for (const problem of DEMO_SCENARIO) injectProblem(world, problem, 'demo scenario');
    dispatch.startShift();
  };
  const incident = (id: string) => world.state.incidents.find((i) => i.id === id)!;
  const worker = (id: string) => world.state.workers.find((w) => w.id === id)!;
  return { world, events, sim, runner, runDemo, incident, worker };
}

describe('AgentRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('works R-2 to a verified outcome through the staged race, with every call in the log', async () => {
    const { events, runDemo, incident, worker } = setup(standIn({ 'R-2': [...R2_RECOVERY] }));
    runDemo();
    await vi.runAllTimersAsync();

    expect(incident('R-2')).toMatchObject({ status: 'resolved', agentId: 'firefly-1', outcome: 'Recovered without supervisor input' });
    expect(worker('firefly-1').status).toBe('free');

    const calls = events.filter((e) => e.type === 'tool.called' && e.incident_id === 'R-2');
    const results = events.filter((e) => e.type === 'tool.result' && e.incident_id === 'R-2') as FireflyEvent<'tool.result'>[];
    expect(calls.map((e) => e.summary)).toContain('reserve_door(J-2, Door 4)');
    expect(results.map((r) => r.caused_by)).toEqual(calls.map((c) => c.seq)); // each result points at its call
    expect(results.map((r) => r.payload.ok)).toEqual([true, true, true, false, true, true, true, true, true]);
    expect(calls.every((e) => e.source_mode === 'real-model' && e.actor.id === 'firefly-1')).toBe(true);
    expect(results.every((e) => e.source_mode === 'system')).toBe(true);
  });

  it('gives two incidents two different agents at once', async () => {
    const { runDemo, incident, worker } = setup(standIn({ 'R-2': [...R2_RECOVERY] }));
    runDemo();
    await vi.advanceTimersByTimeAsync(2500); // both trucks have reported

    expect([incident('R-2').agentId, incident('R-5').agentId]).toEqual(['firefly-1', 'firefly-2']);
    await vi.runAllTimersAsync();
    expect(incident('R-2').status).toBe('resolved');
    expect(incident('R-5').status).toBe('waiting'); // its model ended the turn without a verified outcome
    expect(worker('firefly-2').status).toBe('busy'); // and keeps the incident
  });

  it('queues a third incident until an agent is free', async () => {
    const { world, runner, runDemo, incident } = setup(standIn({ 'R-2': [...R2_RECOVERY] }));
    runDemo();
    await vi.advanceTimersByTimeAsync(2500);
    openIncident(world, { truckId: 'T-8', door: 6, reason: 'obstruction', seq: world.state.seq });
    runner.assign();
    expect(incident('R-8')).toMatchObject({ status: 'queued', agentId: null });

    await vi.runAllTimersAsync(); // R-2 resolves and frees firefly-1
    expect(incident('R-8').agentId).toBe('firefly-1');
  });

  it('the model saying done closes nothing, and a wake-up continues the same run', async () => {
    const scripts: Record<string, Step[]> = { 'R-2': ['done'] };
    const { runner, runDemo, incident } = setup(standIn(scripts));
    runDemo();
    await vi.runAllTimersAsync();
    expect(incident('R-2').status).toBe('waiting');

    scripts['R-2'] = R2_RECOVERY.slice(3); // from the first reservation onwards
    runner.wake('R-2', 'Door 2 is free.');
    await vi.runAllTimersAsync();
    expect(incident('R-2').status).toBe('resolved');
  });

  it('the system escalates, and says so, when the tool budget runs out', async () => {
    const loop: Step[] = Array.from({ length: 30 }, () => ['get_job', { job_id: 'J-2' }]);
    const { events, runDemo, incident, world } = setup(standIn({ 'R-2': loop }));
    runDemo();
    await vi.runAllTimersAsync();

    expect(incident('R-2').status).toBe('needs_you');
    expect(events.filter((e) => e.type === 'tool.called' && e.incident_id === 'R-2')).toHaveLength(15);
    expect(events.some((e) => e.summary.startsWith('R-2 escalated by the system'))).toBe(true);
    expect(world.state.trucks.find((t) => t.id === 'T-2')?.controller).toBe('held');
  });

  it('the system escalates when the model call fails', async () => {
    const { events, runDemo, incident } = setup(async () => {
      throw new Error('no credentials');
    });
    runDemo();
    await vi.runAllTimersAsync();
    expect(incident('R-2').status).toBe('needs_you');
    expect(events.some((e) => e.summary.includes('the model call failed (no credentials)'))).toBe(true);
  });

  it('a reset stops runs from the old yard', async () => {
    const { world, sim, runner, runDemo, events } = setup(standIn({ 'R-2': [...R2_RECOVERY] }));
    runDemo();
    await vi.advanceTimersByTimeAsync(2500);
    runner.stop();
    sim.stop();
    world.reset(seedWorld());
    const after = events.length;
    await vi.runAllTimersAsync();
    expect(events.slice(after).filter((e) => e.type.startsWith('tool.'))).toHaveLength(0);
  });
});
