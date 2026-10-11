import { describe, expect, it } from 'vitest';
import { YARD, doorX, parkX } from '../contract.ts';
import { poseAfter, routeToDoor, travelMs } from './routes.ts';

const parked = (slot: number) => ({ x: parkX(slot), z: YARD.parkZ, heading: Math.PI });

describe('routes', () => {
  it('goes out to the lane, along it, then backs into the door', () => {
    expect(routeToDoor(parked(1), 4)).toEqual([
      { x: parkX(1), z: YARD.laneZ },
      { x: doorX(4), z: YARD.laneZ },
      { x: doorX(4), z: YARD.dockZ, reverse: true },
    ]);
  });

  it('only backs in when the truck is already lined up on the lane', () => {
    const linedUp = { x: doorX(7), z: YARD.laneZ, heading: Math.PI };
    expect(routeToDoor(linedUp, 7)).toEqual([{ x: doorX(7), z: YARD.dockZ, reverse: true }]);
  });

  it('times forward and reverse steps at their own speeds', () => {
    const path = routeToDoor(parked(2), 3); // slot 2 is straight in front of door 3
    const forward = (YARD.parkZ - YARD.laneZ) / YARD.speed;
    const reverse = (YARD.laneZ - YARD.dockZ) / YARD.reverseSpeed;
    expect(travelMs(parked(2), path)).toBeCloseTo((forward + reverse) * 1000);
  });

  it('faces the way it last drove', () => {
    const end = poseAfter(parked(1), routeToDoor(parked(1), 4).slice(0, -1));
    expect(end).toEqual({ x: doorX(4), z: YARD.laneZ, heading: Math.PI / 2 });
  });
});
