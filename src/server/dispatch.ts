import type { Command, Simulator } from './simulator.ts';
import type { World } from './world.ts';

const DISPATCH = { actor: { kind: 'system', id: 'dispatch' }, name: 'Dispatch', source_mode: 'simulated' } as const;

/**
 * Routine dispatch: the yard's ordinary, deterministic traffic.
 * It claims a door for a job and sends the truck there. No model is involved.
 */
export class Dispatch {
  private readonly world: World;
  private readonly sim: Simulator;
  private sent = 0;

  constructor(world: World, sim: Simulator) {
    this.world = world;
    this.sim = sim;
  }

  /** Reserves `door` for the truck's job and asks the truck to go there. */
  send(truckId: string, door: number, note = 'routine move'): Command {
    const { doors, jobs } = this.world.state;
    const job = jobs.find((j) => j.truckId === truckId);
    const target = doors.find((d) => d.id === door);
    if (!job || !target) throw new Error(`Cannot dispatch ${truckId} to Door ${door}`);

    job.assignedDoor = door;
    if (target.reservedBy !== job.id) {
      target.reservedBy = job.id;
      this.world.emit({
        type: 'door.changed',
        actor: DISPATCH.actor,
        source_mode: 'simulated',
        job_id: job.id,
        summary: `Door ${door} reserved for ${job.id} (${note}).`,
        payload: { ...target },
      });
    }
    return this.sim.send({ requestId: `d-${++this.sent}`, truckId, door, kind: 'GO_TO', sender: DISPATCH });
  }

  /** Start of shift: every parked truck that already has a door heads for it. */
  startShift(): Command[] {
    const { jobs, trucks } = this.world.state;
    return trucks
      .filter((t) => t.controller === 'parked')
      .map((t) => jobs.find((j) => j.id === t.jobId))
      .filter((j) => j?.assignedDoor != null)
      .map((j) => this.send(j!.truckId, j!.assignedDoor!, 'start of shift'));
  }
}
