import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FireflyEvent } from '../contract.ts';
import { ActionError, Actions } from './actions.ts';
import type { AskModel, Message } from './agent/model.ts';
import { AgentRunner } from './agent/runner.ts';
import { Dispatch } from './dispatch.ts';
import { openIncident } from './incidents.ts';
import { DEMO_SCENARIO, injectProblem } from './problems.ts';
import { seedWorld } from './seed.ts';
import { Simulator } from './simulator.ts';
import { runTool } from './tools/index.ts';
import type { ToolContext, ToolInput } from './tools/index.ts';
import { World } from './world.ts';

/* As in runner.test.ts: a fixed list of tool calls stands in for the model. Nothing here is model output. */
type Step = [tool: string, input: ToolInput] | 'done';
const F3_NOTE = 'F-3 is leaking. Keep it out of assignments until maintenance clears it.';
const SAVE_F3: ToolInput = { subject_type: 'equipment', subject_id: 'F-3', fact: 'leaking', release_condition: 'maintenance clears it', interpretation: 'F-3 excluded until maintenance clears it.' };

function setup() {
  const script: Step[] = [];
  let n = 0;
  const ask: AskModel = async ({ messages }) => {
    const mine = /Incident R-5 is yours/.test(messages[0]!.content as string);
    const step = (mine ? script.shift() : undefined) ?? 'done';
    const content = step === 'done' ? [{ type: 'text', text: 'Waiting.' }] : [{ type: 'tool_use', id: `tu-${++n}`, name: step[0], input: step[1] }];
    return { content, stop_reason: step === 'done' ? 'end_turn' : 'tool_use', usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Message;
  };

  const world = new World(seedWorld());
  const events: FireflyEvent[] = [];
  world.subscribe((e) => events.push(e));
  let runner: AgentRunner;
  const sim = new Simulator(world, (report) => {
    openIncident(world, report);
    runner.assign();
  });
  const dispatch = new Dispatch(world, sim);
  runner = new AgentRunner({ world, sim, dispatch, ask });
  const actions = new Actions(world, runner);
  for (const problem of DEMO_SCENARIO) injectProblem(world, problem, 'demo scenario');
  dispatch.startShift();

  /** Lets the agent on R-5 make these calls, then end its turn. */
  const agent = async (...steps: Step[]) => {
    script.push(...steps, 'done');
    await vi.runAllTimersAsync();
  };
  /** A person does something, and the agent it wakes makes these calls in reply. */
  const after = async (act: () => void, ...steps: Step[]) => {
    script.push(...steps, 'done');
    act();
    await vi.runAllTimersAsync();
  };
  const ctx = (note?: ToolContext['note']): ToolContext => ({ world, sim, dispatch, incidentId: 'R-5', agentId: 'firefly-2', note });
  const task = (id: string) => world.state.tasks.find((t) => t.id === id)!;
  const worker = (id: string) => world.state.workers.find((w) => w.id === id)!;
  const incident = () => world.state.incidents.find((i) => i.id === 'R-5')!;
  const lastResult = () => (events.filter((e) => e.type === 'tool.result').at(-1) as FireflyEvent<'tool.result'>).payload;
  const radio = () => events.filter((e) => e.type === 'radio' && e.incident_id === 'R-5').map((e) => (e as FireflyEvent<'radio'>).payload.type);
  return { world, events, sim, runner, actions, agent, after, ctx, task, worker, incident, lastResult, radio };
}

describe('R-5: people, corrections and the resume gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs the whole story: offer, correction, reassignment, early resume rejected, authorization, verified', async () => {
    const { world, actions, agent, after, task, worker, incident, lastResult, radio } = setup();

    // Routing: robots and agents can't, both forklift workers can. The agent offers Sam.
    await agent(['list_eligible_workers', { task: 'clear_obstruction' }], ['offer_task', { incident_id: 'R-5', worker_id: 'sam' }]);
    expect(task('K-1')).toMatchObject({ worker: 'sam', equipment: 'F-3', status: 'offered' });
    expect(incident().status).toBe('waiting');

    // Maria's one sentence becomes a saved rule, and the rule itself withdraws Sam's unanswered offer.
    await after(() => actions.note(F3_NOTE, 'R-5'), ['save_correction', SAVE_F3], ['list_eligible_workers', { task: 'clear_obstruction' }], ['offer_task', { incident_id: 'R-5', worker_id: 'noor' }]);
    expect(world.state.corrections).toMatchObject([{ subject: 'F-3', source: 'Maria', active: true, interpretation: 'F-3 excluded until maintenance clears it.' }]);
    expect(task('K-1').status).toBe('withdrawn');
    expect(task('K-2')).toMatchObject({ worker: 'noor', equipment: 'F-4', status: 'offered' });
    expect(() => actions.answer('K-1', 'sam', true)).toThrow('This offer was withdrawn.');

    // Noor accepts and clears the pallet. Resuming now is refused: two prerequisites are still missing.
    await after(() => actions.answer('K-2', 'noor', true));
    expect(worker('noor').status).toBe('busy');
    await after(() => actions.report('K-2', 'noor', 'cleared'), ['request_resume', { incident_id: 'R-5', request_id: 'r-5-1' }]);
    expect(lastResult()).toMatchObject({ ok: false, output: { conflict: 'prerequisites_missing', missing: ['The worker has not reported people clear.', 'The supervisor has not authorized the resume.'] } });
    expect(world.state.trucks.find((t) => t.id === 'T-5')?.controller).toBe('held');

    // People clear, then Maria authorizes. Only now does the truck go.
    await after(() => actions.report('K-2', 'noor', 'people_clear'), ['request_authorization', { incident_id: 'R-5' }]);
    expect(incident().status).toBe('needs_you');
    expect(worker('noor').status).toBe('free');
    await after(() => actions.approve('A-1'), ['request_resume', { incident_id: 'R-5', request_id: 'r-5-2' }], ['get_command_status', { request_id: 'r-5-2', wait_s: 30 }], ['verify_outcome', { incident_id: 'R-5' }]);

    expect(incident()).toMatchObject({ status: 'resolved', outcome: 'Recovered with physical assistance' });
    expect(world.state.doors.find((d) => d.id === 7)).toMatchObject({ occupant: 'T-5', obstruction: false });
    expect(radio()).toEqual(['TASK', 'NOTE', 'CANCEL', 'TASK', 'ACCEPT', 'DONE', 'CLEAR', 'APPROVE', 'RESUME', 'ACK', 'ARRIVED']);
  });

  it('memory: a later decision uses the saved rule without asking, until the rule is ended', async () => {
    const { world, actions, ctx, lastResult, agent, after } = setup();
    await agent();
    await after(() => actions.note(F3_NOTE, 'R-5'), ['save_correction', SAVE_F3], ['list_eligible_workers', { task: 'clear_obstruction' }]);
    expect(lastResult().output).toMatchObject({ eligible: [{ worker_id: 'noor', equipment: 'F-4' }] });
    expect(lastResult().output.not_eligible).toContainEqual(expect.objectContaining({ worker_id: 'sam', reason: "F-3 excluded · Maria's rule: leaking" }));

    // The mutation tool refuses Sam by itself, even if a model asks for him anyway.
    expect(await runTool(ctx(), 'offer_task', { incident_id: 'R-5', worker_id: 'sam' })).toMatchObject({ ok: false, output: { conflict: 'not_eligible' } });

    actions.releaseCorrection(world.state.corrections[0]!.id);
    expect(await runTool(ctx(), 'offer_task', { incident_id: 'R-5', worker_id: 'sam' })).toMatchObject({ ok: true, output: { equipment: 'F-3' } });
  });

  it('only a supervisor note gives the authority to save a rule, and only about something real', async () => {
    const { world, ctx, agent } = setup();
    await agent();
    expect(await runTool(ctx(), 'save_correction', SAVE_F3)).toMatchObject({ ok: false, output: { conflict: 'no_supervisor_note' } });
    const note = { from: 'Maria', text: 'F-9 is broken', seq: 1 };
    expect(await runTool(ctx(note), 'save_correction', { ...SAVE_F3, subject_id: 'F-9' })).toMatchObject({ ok: false, output: { conflict: 'unknown_subject' } });
    expect(world.state.corrections).toHaveLength(0);
  });

  it('a correction never takes accepted work away from its worker', async () => {
    const { actions, ctx, task, agent, after } = setup();
    await agent(['offer_task', { incident_id: 'R-5', worker_id: 'sam' }]);
    await after(() => actions.answer('K-1', 'sam', true));

    const saved = await runTool(ctx({ from: 'Maria', text: F3_NOTE, seq: 1 }), 'save_correction', SAVE_F3);
    expect(saved).toMatchObject({ ok: true, output: { withdrawn_offers: [], accepted_work_not_changed: ['K-1'] } });
    expect(task('K-1').status).toBe('accepted');
    expect(await runTool(ctx(), 'withdraw_offer', { task_id: 'K-1' })).toMatchObject({ ok: false, output: { conflict: 'already_accepted' } });
  });

  it('a note with no agent at work says so and saves nothing', async () => {
    const { world, events, runner, actions, agent } = setup();
    await agent();
    runner.stop();
    actions.note(F3_NOTE);
    expect(events.at(-1)?.summary).toContain('nothing was saved');
    expect(world.state.corrections).toHaveLength(0);
  });

  it('a supervisor "resume now" goes through the same gate: refused with what is missing, and recorded', async () => {
    const { world, events, actions, agent, after } = setup();
    await agent(['offer_task', { incident_id: 'R-5', worker_id: 'noor' }]);
    await after(() => actions.answer('K-1', 'noor', true));
    await after(() => actions.report('K-1', 'noor', 'cleared'));

    expect(() => actions.resumeNow('R-5')).toThrow('Resume rejected: The worker has not reported people clear. The supervisor has not authorized the resume.');
    const [asked, refused] = events.slice(-2);
    expect(asked).toMatchObject({ type: 'radio', source_mode: 'human', payload: { from: 'Maria', type: 'RESUME' } });
    expect(refused).toMatchObject({ type: 'incident.updated', source_mode: 'system', caused_by: asked!.seq });
    expect(refused!.summary).toContain('T-5 stays held.');
    expect(world.state.trucks.find((t) => t.id === 'T-5')?.controller).toBe('held');
    expect(events.filter((e) => e.type === 'truck.route' && e.incident_id === 'R-5')).toHaveLength(0); // it never moves a truck

    // Once everything is in place it refuses nothing, and still sends no command of its own.
    await after(() => actions.report('K-1', 'noor', 'people_clear'), ['request_authorization', { incident_id: 'R-5' }]);
    await after(() => actions.approve('A-1'));
    const before = world.state.seq;
    expect(() => actions.resumeNow('R-5')).not.toThrow();
    expect(world.since(before).map((e) => e.type)).toEqual(['radio']);
  });

  it('workers can only act on their own task, in order', async () => {
    const { actions, agent } = setup();
    await agent(['offer_task', { incident_id: 'R-5', worker_id: 'noor' }]);
    expect(() => actions.answer('K-1', 'sam', true)).toThrow(ActionError);
    expect(() => actions.report('K-1', 'noor', 'cleared')).toThrow('not accepted');
    actions.answer('K-1', 'noor', true);
    expect(() => actions.report('K-1', 'noor', 'people_clear')).toThrow('cleared first');
  });
});
