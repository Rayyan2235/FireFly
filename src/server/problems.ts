import type { FireflyEvent } from '../contract.ts';
import type { World } from './world.ts';

/** Something that goes wrong in the yard. Trucks find out for themselves when they get there. */
export interface Problem {
  kind: 'close_door' | 'drop_pallet';
  door: number;
}

/** The preset demo scenario: a list of problems fed into the sandbox, not a script of steps. */
export const DEMO_SCENARIO: Problem[] = [
  { kind: 'close_door', door: 3 },
  { kind: 'drop_pallet', door: 7 },
];

/** The problem injector. It only changes the yard; it never opens an incident or tells a truck anything. */
export function injectProblem(world: World, problem: Problem, cause: string): FireflyEvent {
  const door = world.state.doors.find((d) => d.id === problem.door);
  if (!door) throw new Error(`Unknown door: ${problem.door}`);

  if (problem.kind === 'close_door') door.closed = true;
  else door.obstruction = true;
  return world.emit({
    type: 'door.changed',
    actor: { kind: 'system', id: 'scenario' },
    source_mode: 'simulated',
    summary: `${problem.kind === 'close_door' ? `Door ${door.id} closed` : `Pallet dropped on the Door ${door.id} approach`} (${cause}).`,
    payload: { ...door },
  });
}
