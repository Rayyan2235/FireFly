import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dispatch } from './dispatch.ts';
import { openIncident } from './incidents.ts';
import { DEMO_SCENARIO, injectProblem } from './problems.ts';
import { seedWorld } from './seed.ts';
import { Simulator } from './simulator.ts';
import { World } from './world.ts';

function setup() {
  const world = new World(seedWorld());
  const sim = new Simulator(world, (report) => openIncident(world, report));
  const dispatch = new Dispatch(world, sim);
  const runDemo = () => {
    for (const problem of DEMO_SCENARIO) injectProblem(world, problem, 'demo scenario');
    dispatch.startShift();
  };
  return { world, sim, dispatch, runDemo };
}

describe('demo scenario', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('two trucks hit problems at once and each report opens an incident', () => {
    const { world, runDemo } = setup();
    runDemo();
    expect(world.state.incidents).toHaveLength(0); // nothing is open until a truck reports

    vi.runAllTimers();
    expect(world.state.incidents).toMatchObject([
      { id: 'R-2', kind: 'door_closed', truckId: 'T-2', door: 3, status: 'queued' },
      { id: 'R-5', kind: 'obstruction', truckId: 'T-5', door: 7, status: 'queued' },
    ]);
    expect(world.state.trucks.filter((t) => t.controller === 'held').map((t) => t.id)).toEqual(['T-2', 'T-5']);
  });

  it('dispatch reserves the door before sending the truck', () => {
    const { world, dispatch } = setup();
    dispatch.send('T-7', 4);
    expect(world.state.doors.find((d) => d.id === 4)?.reservedBy).toBe('J-7');
    expect(world.state.jobs.find((j) => j.id === 'J-7')?.assignedDoor).toBe(4);
  });

  it('reset cancels moves in flight and keeps corrections', () => {
    const { world, sim, runDemo } = setup();
    world.state.corrections.push({ id: 'c-1', subject: 'F-3', fact: 'leaking', source: 'maria', createdAt: '', releaseCondition: 'maintenance clears it', active: true, interpretation: '' });
    runDemo();
    const before = world.state.seq;

    sim.stop();
    world.reset(seedWorld());
    vi.runAllTimers();

    expect(world.state.incidents).toHaveLength(0);
    expect(world.state.doors.some((d) => d.closed || d.obstruction)).toBe(false);
    expect(world.state.corrections).toHaveLength(1);
    expect(world.state.seq).toBe(before + 1); // only the reset event; seq never goes back
    expect(world.since(before)).toMatchObject([{ type: 'world.reset', payload: { seq: before + 1 } }]);
  });
});
