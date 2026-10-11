type V3 = [number, number, number];
const shots: { camera: V3; target: V3 }[] = [
  { camera: [35, 8, 26], target: [15, -1.6, 2] },
  { camera: [43, 38, 48], target: [0, 0, -6] },
  { camera: [32, 19, 7], target: [10, 0, -4] },
  { camera: [28, 11, 18], target: [11, 2, 3] },
  { camera: [37, 22, 26], target: [6, 1, -5] },
  { camera: [44, 37, 39], target: [2, 0, -6] },
  { camera: [34, 10, 25], target: [8, 1.8, 0] },
];
const smooth = (v: number) => v * v * (3 - 2 * v);
export function getStoryFrame(progress: number) {
  const p = Math.max(0, Math.min(6, Number.isFinite(progress) ? progress : 0));
  const i = Math.min(5, Math.floor(p));
  const t = smooth(p - i);
  const mix = (a: V3, b: V3): V3 => a.map((v, n) => v + (b[n] - v) * t) as V3;
  return {
    camera: mix(shots[i].camera, shots[i + 1].camera),
    target: mix(shots[i].target, shots[i + 1].target),
    truckZ: 4 * (1 - smooth(Math.max(0, Math.min(1, (p - 1) / 0.8)))),
    palletY: 7 * (1 - smooth(Math.max(0, Math.min(1, (p - 1.35) / 0.4)))),
  };
}
