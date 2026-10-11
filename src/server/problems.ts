import type { FireflyEvent } from '../contract.ts';
import type { World } from './world.ts';

/** Something that goes wrong in the yard. Trucks find out for themselves when they get there. */
export type Problem =
  | { kind: 'close_door' | 'drop_pallet'; door: number }
  | { kind: 'forklift_down'; equipment: string }
  | { kind: 'worker_home'; worker: string };

/** The preset demo scenario: a list of problems fed into the sandbox, not a script of steps. */
export const DEMO_SCENARIO: Problem[] = [
  { kind: 'close_door', door: 3 },
  { kind: 'drop_pallet', door: 7 },
];

const SIMULATED = { actor: { kind: 'system', id: 'scenario' }, source_mode: 'simulated' } as const;

/** The problem injector. It only changes the yard; it never opens an incident or tells a truck anything. */
export function injectProblem(world: World, problem: Problem, cause: string): FireflyEvent {
  const { doors, equipment, workers } = world.state;

  if (problem.kind === 'forklift_down') {
    const forklift = equipment.find((e) => e.id === problem.equipment);
    if (!forklift) throw new Error(`Unknown equipment: ${problem.equipment}`);
    forklift.outOfService = true;
    return world.emit({ ...SIMULATED, type: 'equipment.changed', summary: `${forklift.id} out of service (${cause}).`, payload: { ...forklift } });
  }
  if (problem.kind === 'worker_home') {
    const worker = workers.find((w) => w.id === problem.worker && w.kind === 'person');
    if (!worker) throw new Error(`Unknown worker: ${problem.worker}`);
    worker.status = 'off_shift';
    return world.emit({ ...SIMULATED, type: 'worker.changed', summary: `${worker.name} went off shift (${cause}).`, payload: { ...worker } });
  }

  const door = doors.find((d) => d.id === problem.door);
  if (!door) throw new Error(`Unknown door: ${problem.door}`);
  if (problem.kind === 'close_door') door.closed = true;
  else door.obstruction = true;
  return world.emit({
    ...SIMULATED,
    type: 'door.changed',
    summary: `${problem.kind === 'close_door' ? `Door ${door.id} closed` : `Pallet dropped on the Door ${door.id} approach`} (${cause}).`,
    payload: { ...door },
  });
}

/**
 * A forklift or a worker just became unavailable. Offers nobody has accepted yet are
 * withdrawn at once; accepted work stays with its worker (it is never silently transferred).
 * Returns the news each affected incident's agent should hear.
 */
export function withdrawOffersFor(world: World, subject: string, why: string): Array<{ incidentId: string; text: string }> {
  const news: Array<{ incidentId: string; text: string }> = [];
  for (const task of world.state.tasks.filter((t) => t.equipment === subject || t.worker === subject)) {
    const name = world.state.workers.find((w) => w.id === task.worker)?.name ?? task.worker ?? 'the worker';
    if (task.status === 'offered') {
      task.status = 'withdrawn';
      const event = { actor: { kind: 'system', id: 'firefly' }, source_mode: 'system', incident_id: task.incidentId } as const;
      world.emit({ ...event, type: 'radio', summary: `Firefly → ${name} CANCEL: ${why}`, payload: { from: 'Firefly', to: name, type: 'CANCEL', text: why } });
      world.emit({ ...event, type: 'task.changed', summary: `Offer ${task.id} to ${name} withdrawn: ${why}`, payload: { ...task } });
      news.push({ incidentId: task.incidentId, text: `Your offer ${task.id} to ${name} was withdrawn: ${why}` });
    } else if (task.status === 'accepted') {
      news.push({ incidentId: task.incidentId, text: `${name} accepted ${task.id} but may not be able to finish it: ${why} The task is still theirs.` });
    }
  }
  return news;
}
