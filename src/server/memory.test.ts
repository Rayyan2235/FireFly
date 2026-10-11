import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FireflyEvent } from '../contract.ts';
import { Actions } from './actions.ts';
import type { AskModel, Message } from './agent/model.ts';
import { AgentRunner } from './agent/runner.ts';
import { Dispatch } from './dispatch.ts';
import { openClearance, openIncident } from './incidents.ts';
import { DEMO_SCENARIO, injectProblem } from './problems.ts';
import { seedWorld } from './seed.ts';
import { Simulator } from './simulator.ts';
import type { ToolInput } from './tools/index.ts';
import { World } from './world.ts';

/* A fixed list of tool calls per incident stands in for the model. Nothing here is model output. */
type Step = [tool: string, input: ToolInput] | 'done';

function setup() {
  const scripts: Record<string, Step[]> = {};
  let n = 0;
  const ask: AskModel = async ({ messages }) => {
    const id = /Incident (\S+) is yours/.exec(messages[0]!.content as string)![1]!;
    const step = scripts[id]?.shift() ?? 'done';
    const content = step === 'done' ? [{ type: 'text', text: 'Waiting.' }] : [{ type: 'tool_use', id: `tu-${++n}`, name: step[0], input: step[1] }];
    return { content, stop_reason: step === 'done' ? 'end_turn' : 'tool_use', usage: { input_tokens: 0, output_tokens: 0 } } as unknown as Message;
  };
  const world = new World(seedWorld());
  const events: FireflyEvent[] = [];
  world.subscribe((e) => events.push(e));
  let runner: AgentRunner;
  const sim = new Simulator(world, (report) => {
    const incident = openIncident(world, report);
    if (incident.status === 'queued') runner.assign();
    else runner.wake(incident.id, `${report.truckId} reported BLOCKED again.`);
  });
  const dispatch = new Dispatch(world, sim);
  runner = new AgentRunner({ world, sim, dispatch, ask });
  const actions = new Actions(world, runner);

  /** Queues tool calls for the agent on `incidentId`, runs `act`, and lets everything settle. */
  const play = async (incidentId: string, act: () => void, ...steps: Step[]) => {
    (scripts[incidentId] ??= []).push(...steps, 'done');
    act();
    await vi.runAllTimersAsync();
  };
  const dropPallet = (door: number) => {
    const event = injectProblem(world, { kind: 'drop_pallet', door }, 'reported from the console');
    if (openClearance(world, door, event.seq)) runner.assign();
  };
  const incident = (id: string) => world.state.incidents.find((i) => i.id === id)!;
  const results = (id: string) => events.filter((e) => e.type === 'tool.result' && e.incident_id === id) as FireflyEvent<'tool.result'>[];
  return { world, events, dispatch, actions, play, dropPallet, incident, results };
}

describe('memory and clearance incidents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a later pallet is routed around F-3 without asking the supervisor again', async () => {
    const { world, events, dispatch, actions, play, dropPallet, incident, results } = setup();

    // Earlier in the shift: R-5 is open and Maria's F-3 rule gets saved. (Only the pallet, so one agent stays free.)
    await play('R-5', () => {
      injectProblem(world, DEMO_SCENARIO[1]!, 'demo scenario');
      dispatch.startShift();
    });
    await play('R-5', () => actions.note('F-3 is leaking. Keep it out of assignments until maintenance clears it.', 'R-5'), [
      'save_correction',
      { subject_type: 'equipment', subject_id: 'F-3', fact: 'leaking', release_condition: 'maintenance clears it', interpretation: 'F-3 excluded until maintenance clears it.' },
    ]);
    const notesBefore = events.filter((e) => e.type === 'radio' && e.source_mode === 'human').length;

    // Later: someone drops a pallet at Door 6. No truck is behind it, so it gets a clearance incident.
    await play('C-1', () => dropPallet(6), ['list_eligible_workers', { task: 'clear_obstruction' }], ['offer_task', { incident_id: 'C-1', worker_id: 'noor' }]);
    expect(incident('C-1')).toMatchObject({ kind: 'clearance', truckId: null, door: 6 });
    expect(results('C-1')[0]!.summary).toBe("Eligible: Noor + F-4. Excluded: Sam (F-3 excluded · Maria's rule: leaking). Yard trucks and agents cannot do this.");
    expect(world.state.tasks.at(-1)).toMatchObject({ worker: 'noor', equipment: 'F-4', status: 'offered' });
    expect(events.filter((e) => e.type === 'radio' && e.source_mode === 'human')).toHaveLength(notesBefore); // nobody was asked

    // Noor clears it; only then does verify_outcome close the incident.
    const task = world.state.tasks.at(-1)!.id;
    await play('C-1', () => actions.answer(task, 'noor', true), ['verify_outcome', { incident_id: 'C-1' }]);
    expect(results('C-1').at(-1)!.payload).toMatchObject({ ok: false, output: { conflict: 'not_verified' } });
    await play('C-1', () => actions.report(task, 'noor', 'cleared'), ['verify_outcome', { incident_id: 'C-1' }]);
    expect(incident('C-1')).toMatchObject({ status: 'resolved', outcome: 'Obstruction cleared with physical assistance' });
  });

  it('a truck that reaches an obstruction already being cleared joins that incident', async () => {
    const { world, dispatch, play, dropPallet, incident } = setup();
    await play('C-1', () => dropPallet(6));
    await play('C-1', () => dispatch.send('T-8', 6)); // T-8 is an outbound truck with no door yet

    expect(world.state.incidents).toHaveLength(1);
    expect(incident('C-1')).toMatchObject({ kind: 'obstruction', truckId: 'T-8', door: 6 });
    expect(world.state.trucks.find((t) => t.id === 'T-8')?.controller).toBe('held');
  });

  it('does not open a second incident for an obstruction that already has one', () => {
    const { world } = setup();
    expect(openClearance(world, 6, 0)).not.toBeNull();
    expect(openClearance(world, 6, 0)).toBeNull();
  });
});
