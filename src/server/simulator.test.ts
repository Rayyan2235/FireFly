import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YARD, doorX } from '../contract.ts';
import type { FireflyEvent } from '../contract.ts';
import { seedWorld } from './seed.ts';
import { Simulator } from './simulator.ts';
import type { BlockedReport, CommandRequest } from './simulator.ts';
import { World } from './world.ts';

const dispatch = { actor: { kind: 'system', id: 'dispatch' }, name: 'Dispatch', source_mode: 'simulated' } as const;
const goTo = (truckId: string, door: number, requestId = 'r-1'): CommandRequest => ({ requestId, truckId, door, kind: 'GO_TO', sender: dispatch });

function setup() {
  const world = new World(seedWorld());
  const events: FireflyEvent[] = [];
  world.subscribe((e) => events.push(e));
  const blocked: BlockedReport[] = [];
  const sim = new Simulator(world, (report) => blocked.push(report));
  const truck = (id: string) => world.state.trucks.find((t) => t.id === id)!;
  const door = (id: number) => world.state.doors.find((d) => d.id === id)!;
  const radio = () => events.filter((e) => e.type === 'radio').map((e) => (e as FireflyEvent<'radio'>).payload.type);
  return { world, events, blocked, sim, truck, door, radio };
}

describe('Simulator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('moves nothing until the controller acknowledges', () => {
    const { sim, truck, events } = setup();
    const command = sim.send(goTo('T-7', 2));
    expect(command.status).toBe('sent');
    expect(truck('T-7').controller).toBe('parked');
    expect(events.some((e) => e.type === 'truck.route')).toBe(false);

    vi.advanceTimersByTime(600);
    expect(command.status).toBe('acknowledged');
    expect(truck('T-7').controller).toBe('moving');
    expect(events.some((e) => e.type === 'truck.route')).toBe(true);
  });

  it('drives to the door, docks and reports ARRIVED', () => {
    const { sim, truck, door, radio } = setup();
    door(2).reservedBy = 'J-7';
    const command = sim.send(goTo('T-7', 2));
    vi.runAllTimers();

    expect(command.status).toBe('completed');
    expect(truck('T-7')).toMatchObject({ controller: 'docked', pose: { x: doorX(2), z: YARD.dockZ, heading: 0 } });
    expect(door(2)).toMatchObject({ occupant: 'T-7', reservedBy: null });
    expect(radio()).toEqual(['GO_TO', 'ACK', 'ARRIVED']);
  });

  it('stops itself in front of a closed door and reports BLOCKED', () => {
    const { sim, truck, door, radio, blocked } = setup();
    door(3).closed = true;
    const command = sim.send(goTo('T-2', 3));
    vi.runAllTimers();

    expect(truck('T-2')).toMatchObject({ controller: 'held', pose: { x: doorX(3), z: YARD.laneZ } });
    expect(radio()).toEqual(['GO_TO', 'ACK', 'BLOCKED']);
    expect(command.status).toBe('acknowledged'); // accepted, never completed
    expect(blocked).toMatchObject([{ truckId: 'T-2', door: 3, reason: 'door_closed' }]);
    expect(door(3).occupant).toBeNull();
  });

  it('reports an obstruction on the approach the same way', () => {
    const { sim, door, blocked } = setup();
    door(7).obstruction = true;
    sim.send(goTo('T-5', 7));
    vi.runAllTimers();
    expect(blocked).toMatchObject([{ truckId: 'T-5', door: 7, reason: 'obstruction' }]);
  });

  it('a held truck accepts a new door and docks there', () => {
    const { sim, truck, door } = setup();
    door(3).closed = true;
    sim.send(goTo('T-2', 3));
    vi.runAllTimers();
    sim.send(goTo('T-2', 2, 'r-2'));
    vi.runAllTimers();
    expect(truck('T-2').controller).toBe('docked');
    expect(door(2).occupant).toBe('T-2');
  });

  it('RESUME backs in once the way is clear, and reports BLOCKED again if it is not', () => {
    const { sim, truck, door, blocked } = setup();
    door(7).obstruction = true;
    sim.send(goTo('T-5', 7));
    vi.runAllTimers();

    sim.send({ ...goTo('T-5', 7, 'r-2'), kind: 'RESUME' });
    vi.runAllTimers();
    expect(truck('T-5').controller).toBe('held');
    expect(blocked).toHaveLength(2);

    door(7).obstruction = false;
    const resume = sim.send({ ...goTo('T-5', 7, 'r-3'), kind: 'RESUME' });
    vi.runAllTimers();
    expect(resume.status).toBe('completed');
    expect(truck('T-5').controller).toBe('docked');
  });

  it('a repeated request id does not run twice', () => {
    const { sim, events } = setup();
    const first = sim.send(goTo('T-7', 2));
    const again = sim.send(goTo('T-7', 2));
    vi.runAllTimers();
    expect(again).toBe(first);
    expect(events.filter((e) => e.type === 'truck.route')).toHaveLength(1);
  });

  it('rejects a command for a truck that is already moving', () => {
    const { sim } = setup();
    sim.send(goTo('T-7', 2));
    vi.advanceTimersByTime(700);
    const second = sim.send(goTo('T-7', 4, 'r-2'));
    vi.advanceTimersByTime(700);
    expect(second).toMatchObject({ status: 'rejected', detail: 'Already moving.' });
  });

  it('frees the door it leaves', () => {
    const { sim, door } = setup();
    sim.send(goTo('T-1', 2)); // T-1 starts docked at door 1
    vi.runAllTimers();
    expect(door(1).occupant).toBeNull();
    expect(door(2).occupant).toBe('T-1');
  });

  it('stop cancels pending moves', () => {
    const { sim, truck, events } = setup();
    sim.send(goTo('T-7', 2));
    sim.stop();
    vi.runAllTimers();
    expect(truck('T-7').controller).toBe('parked');
    expect(events.filter((e) => e.type !== 'radio')).toHaveLength(0);
  });
});
