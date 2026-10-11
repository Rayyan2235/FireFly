import type { Door } from '../contract.ts';
import type { Dispatch } from './dispatch.ts';
import type { World } from './world.ts';

/**
 * The staged door race in the demo scenario (disclosed in the README).
 * The first time an agent is about to win a door, routine dispatch really takes
 * that door for T-7 and sends T-7 there. `reserve_door` then fails through its
 * normal checks, so the model gets a real failure, whichever door it picked.
 */
export class Contention {
  private armed = false;

  arm(): void {
    this.armed = true;
  }

  disarm(): void {
    this.armed = false;
  }

  /** Returns true if the routine truck just took `door`. */
  fire(world: World, dispatch: Dispatch, door: Door): boolean {
    if (!this.armed) return false;
    const truck = world.state.trucks.find((t) => t.id === 'T-7');
    const job = world.state.jobs.find((j) => j.truckId === 'T-7');
    if (!truck || !job || truck.controller !== 'parked' || job.kind !== door.kind) return false;

    this.armed = false; // once per scenario
    dispatch.send('T-7', door.id, 'routine move · fixture: r2-contention');
    return true;
  }
}
