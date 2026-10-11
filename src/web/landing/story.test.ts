import { describe, expect, it } from 'vitest';
import { getStoryFrame } from './story.ts';

describe('landing story', () => {
  it('clamps overscroll to the opening and closing shots', () => {
    expect(getStoryFrame(-2)).toEqual(getStoryFrame(0));
    expect(getStoryFrame(20)).toEqual(getStoryFrame(6));
  });
  it('stops the illustrated truck before the blocked beat and holds it through inspection', () => {
    expect(getStoryFrame(1).truckZ).toBeGreaterThan(getStoryFrame(2).truckZ);
    expect(getStoryFrame(2).truckZ).toBe(getStoryFrame(3).truckZ);
    expect(getStoryFrame(3).truckZ).toBe(getStoryFrame(4).truckZ);
  });
  it('keeps all camera transitions finite and continuous', () => {
    for (let p = 0; p < 6; p += 0.05) {
      const a = getStoryFrame(p), b = getStoryFrame(p + 0.001);
      a.camera.forEach((v, i) => {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v - b.camera[i])).toBeLessThan(0.2);
      });
    }
  });
});
