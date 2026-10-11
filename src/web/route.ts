import type { Pose, TruckRoute } from '../contract.ts';

/**
 * Where a truck is `elapsedMs` into a controller-accepted route.
 * Forward steps face the direction of travel; reverse steps face away from it.
 */
export function poseAt(route: TruckRoute, elapsedMs: number): { pose: Pose; done: boolean } {
  let t = elapsedMs / 1000;
  let { x, z, heading } = route.from;
  for (const step of route.path) {
    const dx = step.x - x;
    const dz = step.z - z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) continue;
    const h = step.reverse ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
    const duration = dist / (step.reverse ? route.reverseSpeed : route.speed);
    if (t <= duration) {
      const k = t / duration;
      return { pose: { x: x + dx * k, z: z + dz * k, heading: h }, done: false };
    }
    t -= duration;
    x = step.x;
    z = step.z;
    heading = h;
  }
  return { pose: { x, z, heading }, done: true };
}

/** Shortest-way blend between two angles. */
export function lerpAngle(from: number, to: number, k: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + d * k;
}
