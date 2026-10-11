import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Contention } from '../contention.ts';
import { Dispatch } from '../dispatch.ts';
import { openIncident } from '../incidents.ts';
import { DEMO_SCENARIO, injectProblem } from '../problems.ts';
import { seedWorld } from '../seed.ts';
import { Simulator } from '../simulator.ts';
import { World } from '../world.ts';
import { runTool } from './index.ts';
import type { ToolContext, ToolInput } from './index.ts';

/** The demo yard after both trucks have stopped and reported: R-2 and R-5 are open. */
function setup() {
  const world = new World(seedWorld());
  const sim = new Simulator(world, (report) => openIncident(world, report));
  const dispatch = new Dispatch(world, sim);
  const contention = new Contention();
  for (const problem of DEMO_SCENARIO) injectProblem(world, problem, 'demo scenario');
  dispatch.startShift();
  vi.runAllTimers();

  const ctx = (incidentId: string, agentId = 'firefly-1'): ToolContext => ({ world, sim, dispatch, incidentId, agentId, contention });
  const call = (incidentId: string, name: string, input: ToolInput) => runTool(ctx(incidentId), name, input);
  const door = (id: number) => world.state.doors.find((d) => d.id === id)!;
  const truck = (id: string) => world.state.trucks.find((t) => t.id === id)!;
  const incident = (id: string) => world.state.incidents.find((i) => i.id === id)!;
  return { world, sim, dispatch, contention, call, door, truck, incident };
}

describe('recovery tools', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('read tools describe the incident, the job and the doors', async () => {
    const { call } = setup();
    expect(await call('R-2', 'inspect_incident', { incident_id: 'R-2' })).toMatchObject({
      ok: true,
      output: { controller_report: { from: 'T-2', type: 'BLOCKED' }, truck: { controller: 'held' }, door: { id: 3, closed: true } },
    });
    expect(await call('R-2', 'get_job', { job_id: 'J-2' })).toMatchObject({ output: { needs_door_kind: 'receiving', can_switch_door: true, reserved_doors: [3] } });
    const doors = await call('R-2', 'list_compatible_doors', { job_id: 'J-2' });
    expect(doors.output.free).toEqual([2, 4]);
    expect(doors.summary).toBe('Free: D2, D4. Excluded: D1 occupied, D3 door closed.');
    expect((await call('R-5', 'list_compatible_doors', { job_id: 'J-5' })).output.free).toEqual([]);
  });

  it('the staged race makes the first reservation fail for real, whichever door is tried', async () => {
    const { call, contention, door, truck } = setup();
    contention.arm();

    const first = await call('R-2', 'reserve_door', { job_id: 'J-2', door: 4 });
    expect(first).toMatchObject({ ok: false, output: { conflict: 'door_taken', by: 'T-7' } });
    expect(door(4).reservedBy).toBe('J-7'); // a real world change, not on-screen text
    vi.advanceTimersByTime(700);
    expect(truck('T-7').controller).toBe('moving');

    expect((await call('R-2', 'list_compatible_doors', { job_id: 'J-2' })).output.free).toEqual([2]);
    const second = await call('R-2', 'reserve_door', { job_id: 'J-2', door: 2 });
    expect(second).toMatchObject({ ok: true, output: { door: 2, released: [3] } });
    expect(door(3).reservedBy).toBeNull();
  });

  it('reserve_door rejects an incompatible door by itself', async () => {
    const { call, door } = setup();
    expect(await call('R-2', 'reserve_door', { job_id: 'J-2', door: 6 })).toMatchObject({ ok: false, output: { conflict: 'wrong_kind' } });
    expect(await call('R-2', 'reserve_door', { job_id: 'J-2', door: 3 })).toMatchObject({ ok: false, output: { conflict: 'door_closed' } });
    expect(await call('R-2', 'reserve_door', { job_id: 'J-2', door: 1 })).toMatchObject({ ok: false, output: { conflict: 'occupied', by: 'T-1' } });
    expect(await call('R-5', 'reserve_door', { job_id: 'J-5', door: 6 })).toMatchObject({ ok: false, output: { conflict: 'switch_not_allowed' } });
    expect(door(6).reservedBy).toBeNull();
  });

  it('two agents cannot both win the same door', async () => {
    const { call, world, door } = setup();
    world.state.jobs.find((j) => j.id === 'J-5')!.kind = 'receiving'; // make both jobs want the same doors
    world.state.jobs.find((j) => j.id === 'J-5')!.canSwitchDoor = true;
    const [a, b] = await Promise.all([call('R-2', 'reserve_door', { job_id: 'J-2', door: 2 }), call('R-5', 'reserve_door', { job_id: 'J-5', door: 2 })]);
    expect([a.ok, b.ok]).toEqual([true, false]);
    expect(b.output).toMatchObject({ conflict: 'door_taken', by: 'T-2' });
    expect(door(2).reservedBy).toBe('J-2');
  });

  it('an agent can only act for its own incident', async () => {
    const { call } = setup();
    expect(await call('R-5', 'reserve_door', { job_id: 'J-2', door: 2 })).toMatchObject({ ok: false, output: { conflict: 'not_your_job' } });
    expect(await call('R-5', 'request_destination', { truck_id: 'T-2', door: 2, request_id: 'r-1' })).toMatchObject({ ok: false, output: { conflict: 'not_your_truck' } });
  });

  it('request_destination needs an owned reservation, and a repeat sends nothing', async () => {
    const { call, world } = setup();
    const go = { truck_id: 'T-2', door: 2, request_id: 'r-1' };
    expect(await call('R-2', 'request_destination', go)).toMatchObject({ ok: false, output: { conflict: 'no_reservation' } });

    await call('R-2', 'reserve_door', { job_id: 'J-2', door: 2 });
    expect(await call('R-2', 'request_destination', go)).toMatchObject({ ok: true, output: { status: 'sent' } });
    expect(await call('R-2', 'request_destination', go)).toMatchObject({ ok: true, output: { repeated: true } });
    expect(await call('R-2', 'request_destination', { ...go, door: 4 })).toMatchObject({ ok: false, output: { conflict: 'request_id_reused' } });
    vi.runAllTimers();
    expect(world.since(0).filter((e) => e.type === 'truck.route' && e.request_id === 'r-1')).toHaveLength(1);
  });

  it('get_command_status waits for the controller, and silence is uncertain, never success', async () => {
    const { call } = setup();
    await call('R-2', 'reserve_door', { job_id: 'J-2', door: 2 });
    await call('R-2', 'request_destination', { truck_id: 'T-2', door: 2, request_id: 'r-1' });

    const early = call('R-2', 'get_command_status', { request_id: 'r-1', wait_s: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await early).toMatchObject({ ok: true, output: { status: 'acknowledged', uncertain: true } });

    const later = call('R-2', 'get_command_status', { request_id: 'r-1', wait_s: 30 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await later).toMatchObject({ ok: true, output: { status: 'completed', uncertain: false, truck_controller: 'docked' } });
  });

  it('only verify_outcome resolves an incident, and only after the controller confirms arrival', async () => {
    const { call, incident } = setup();
    await call('R-2', 'reserve_door', { job_id: 'J-2', door: 2 });
    await call('R-2', 'request_destination', { truck_id: 'T-2', door: 2, request_id: 'r-1' });

    expect(await call('R-2', 'verify_outcome', { incident_id: 'R-2' })).toMatchObject({ ok: false, output: { conflict: 'not_verified', resolved: false } });
    expect(incident('R-2').status).toBe('queued');

    vi.runAllTimers();
    expect(await call('R-2', 'verify_outcome', { incident_id: 'R-2' })).toMatchObject({ ok: true, output: { resolved: true, door: 2 } });
    expect(incident('R-2')).toMatchObject({ status: 'resolved', outcome: 'Recovered without supervisor input' });
  });

  it('escalate keeps the truck held and the incident open', async () => {
    const { call, incident, truck } = setup();
    const result = await call('R-5', 'escalate', { incident_id: 'R-5', missing: 'Door 7 is obstructed and J-5 cannot switch doors.' });
    expect(result).toMatchObject({ ok: true, output: { status: 'needs_you', truck_controller: 'held' } });
    expect(incident('R-5').status).toBe('needs_you');
    expect(truck('T-5').controller).toBe('held');
  });

  it('bad input and unknown tools come back as failures, not crashes', async () => {
    const { call } = setup();
    expect(await call('R-2', 'reserve_door', { job_id: 'J-2', door: 'two' })).toMatchObject({ ok: false, output: { conflict: 'bad_input' } });
    expect(await call('R-2', 'open_the_door', {})).toMatchObject({ ok: false, output: { conflict: 'unknown_tool' } });
  });
});
