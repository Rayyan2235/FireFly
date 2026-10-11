import { YARD, doorX } from '../contract.ts';
import type { Pose, RouteStep } from '../contract.ts';

/**
 * Path from where a truck is to a dock door: out to the approach lane,
 * along it until the truck is lined up with the door, then backwards into the dock.
 * The last step is always the reverse into the dock.
 */
export function routeToDoor(from: Pose, door: number): RouteStep[] {
  const x = doorX(door);
  const path: RouteStep[] = [];
  if (from.z !== YARD.laneZ) path.push({ x: from.x, z: YARD.laneZ });
  if (from.x !== x) path.push({ x, z: YARD.laneZ });
  path.push({ x, z: YARD.dockZ, reverse: true });
  return path;
}

/** How long a path takes to drive, in ms, at the yard's forward and reverse speeds. */
export function travelMs(from: Pose, path: RouteStep[]): number {
  let { x, z } = from;
  let seconds = 0;
  for (const step of path) {
    seconds += Math.hypot(step.x - x, step.z - z) / (step.reverse ? YARD.reverseSpeed : YARD.speed);
    x = step.x;
    z = step.z;
  }
  return seconds * 1000;
}

/** Where a truck ends up after driving a forward path; it keeps its heading if it didn't move. */
export function poseAfter(from: Pose, path: RouteStep[]): Pose {
  let { x, z, heading } = from;
  for (const step of path) {
    if (step.x !== x || step.z !== z) heading = Math.atan2(step.x - x, step.z - z);
    x = step.x;
    z = step.z;
  }
  return { x, z, heading };
}
