import { describe, expect, it } from 'vitest';
import { injectProblem, withdrawOffersFor } from './problems.ts';
import { seedWorld } from './seed.ts';
import { eligibility } from './tools/people.ts';
import { World } from './world.ts';

const offer = (world: World, id: string, worker: string, equipment: string, status: 'offered' | 'accepted') =>
  world.state.tasks.push({ id, incidentId: 'R-5', door: 7, worker, equipment, status, arrived: false, cleared: false, peopleClear: false });

describe('problem tools', () => {
  it('a forklift out of service makes its worker ineligible', () => {
    const world = new World(seedWorld());
    const event = injectProblem(world, { kind: 'forklift_down', equipment: 'F-4' }, 'reported from the console');
    expect(event).toMatchObject({ type: 'equipment.changed', source_mode: 'simulated', payload: { id: 'F-4', outOfService: true } });
    const noor = world.state.workers.find((w) => w.id === 'noor')!;
    expect(eligibility(world, noor, 'clear_obstruction')).toEqual({ eligible: false, reason: 'F-4 is out of service' });
  });

  it('a worker sent home is off shift and ineligible', () => {
    const world = new World(seedWorld());
    const event = injectProblem(world, { kind: 'worker_home', worker: 'sam' }, 'reported from the console');
    expect(event).toMatchObject({ type: 'worker.changed', payload: { id: 'sam', status: 'off_shift' } });
    const sam = world.state.workers.find((w) => w.id === 'sam')!;
    expect(eligibility(world, sam, 'clear_obstruction')).toEqual({ eligible: false, reason: 'off shift' });
  });

  it('withdraws unanswered offers that relied on it, and leaves accepted work with its worker', () => {
    const world = new World(seedWorld());
    offer(world, 'K-1', 'sam', 'F-3', 'offered');
    offer(world, 'K-2', 'sam', 'F-3', 'accepted');
    const news = withdrawOffersFor(world, 'F-3', 'F-3 is out of service.');

    expect(world.state.tasks.map((t) => t.status)).toEqual(['withdrawn', 'accepted']);
    expect(news.map((n) => n.text)).toEqual([
      'Your offer K-1 to Sam was withdrawn: F-3 is out of service.',
      'Sam accepted K-2 but may not be able to finish it: F-3 is out of service. The task is still theirs.',
    ]);
    expect(world.since(0).map((e) => e.type)).toEqual(['radio', 'task.changed']);
  });

  it('rejects a problem about something that does not exist', () => {
    const world = new World(seedWorld());
    expect(() => injectProblem(world, { kind: 'forklift_down', equipment: 'F-9' }, 'test')).toThrow('Unknown equipment');
    expect(() => injectProblem(world, { kind: 'worker_home', worker: 'maria-2' }, 'test')).toThrow('Unknown worker');
  });
});
