import type { MutableRefObject } from 'react';
import { RoundedBox } from '@react-three/drei';
import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import type { Group } from 'three';
import { trailerSkin } from './textures.ts';

// A procedural autonomous tractor-trailer. Local space: +z is the cab end (heading 0 faces +z), y is up.
// Length is compressed to fit the yard's 6 m door spacing; heights and widths are real-world.

export const WHEEL_R = 0.5;

const paintCache = new Map<string, MeshPhysicalMaterial>();
const paint = (color: string) =>
  paintCache.get(color) ??
  (paintCache.set(color, new MeshPhysicalMaterial({ color, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 })),
  paintCache.get(color)!);

const M = {
  chrome: new MeshStandardMaterial({ color: '#d9dde2', metalness: 1, roughness: 0.16 }),
  dark: new MeshStandardMaterial({ color: '#17191c', metalness: 0.25, roughness: 0.7 }),
  frame: new MeshStandardMaterial({ color: '#0f1012', metalness: 0.4, roughness: 0.6 }),
  rubber: new MeshStandardMaterial({ color: '#111213', roughness: 0.93 }),
  rim: new MeshStandardMaterial({ color: '#a3a9b0', metalness: 0.85, roughness: 0.28 }),
  glass: new MeshPhysicalMaterial({ color: '#0a0e13', metalness: 0.7, roughness: 0.04, clearcoat: 1 }),
  lamp: new MeshStandardMaterial({ color: '#e9edf2', metalness: 0.2, roughness: 0.15 }),
  amber: new MeshStandardMaterial({ color: '#c97d16', roughness: 0.4 }),
  red: new MeshStandardMaterial({ color: '#8f1a1a', roughness: 0.4 }),
  skirt: new MeshStandardMaterial({ color: '#2a2d32', metalness: 0.2, roughness: 0.55 }),
  lidar: new MeshStandardMaterial({ color: '#1c1f23', metalness: 0.6, roughness: 0.25 }),
};
let skin: MeshStandardMaterial | null = null;
const trailerMat = () => (skin ??= new MeshStandardMaterial({ map: trailerSkin(), metalness: 0.3, roughness: 0.42 }));

/** One wheel end: a tyre and rim (dual = two tyres). The group spins about x as the truck rolls. */
function Wheel({ x, z, dual, set }: { x: number; z: number; dual?: boolean; set: (g: Group | null) => void }) {
  const offsets = dual ? [-0.17, 0.17] : [0];
  return (
    <group position={[x, WHEEL_R, z]} ref={set}>
      {offsets.map((o) => (
        <group key={o} position={[o, 0, 0]} rotation-z={Math.PI / 2}>
          <mesh material={M.rubber} castShadow>
            <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.3, 28]} />
          </mesh>
          <mesh material={M.rim} position={[0, x > 0 ? 0.03 : -0.03, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.31, 20]} />
          </mesh>
          {/* lug-nut hub, off-centre so the spin reads */}
          <mesh material={M.dark} position={[0.12, x > 0 ? 0.17 : -0.17, 0]}>
            <boxGeometry args={[0.07, 0.02, 0.07]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function TruckRig({ color, wheels }: { color: string; wheels: MutableRefObject<Group[]> }) {
  const body = paint(color);
  const set = (i: number) => (g: Group | null) => {
    if (g) wheels.current[i] = g;
  };
  const axles: { z: number; dual: boolean }[] = [
    { z: 4.45, dual: false }, // steer
    { z: 2.45, dual: true }, // drive
    { z: 1.75, dual: true }, // drive
    { z: -3.15, dual: true }, // trailer tandem
    { z: -3.95, dual: true },
  ];

  return (
    <group>
      {/* ---------------- tractor ---------------- */}
      <mesh material={M.frame} position={[0, 0.85, 3.2]}>
        <boxGeometry args={[1.0, 0.28, 3.4]} />
      </mesh>
      <RoundedBox args={[2.45, 2.0, 1.55]} radius={0.12} smoothness={3} position={[0, 2.3, 3.55]} material={body} castShadow />
      <RoundedBox args={[2.3, 0.55, 1.25]} radius={0.2} smoothness={3} position={[0, 3.55, 3.4]} material={body} castShadow />
      <RoundedBox args={[2.25, 0.95, 0.8]} radius={0.12} smoothness={3} position={[0, 1.75, 4.68]} material={body} castShadow />
      <mesh material={M.chrome} position={[0, 1.78, 5.09]}>
        <boxGeometry args={[1.35, 0.72, 0.04]} />
      </mesh>
      <mesh material={M.dark} position={[0, 1.78, 5.1]}>
        <boxGeometry args={[1.2, 0.6, 0.04]} />
      </mesh>
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} material={M.lamp} position={[x, 1.48, 5.08]}>
          <boxGeometry args={[0.36, 0.17, 0.05]} />
        </mesh>
      ))}
      <mesh material={M.chrome} position={[0, 0.82, 5.12]} castShadow>
        <boxGeometry args={[2.5, 0.34, 0.28]} />
      </mesh>
      <mesh material={M.glass} position={[0, 2.82, 4.33]} rotation-x={-0.12}>
        <boxGeometry args={[2.18, 0.78, 0.04]} />
      </mesh>
      {[-1.23, 1.23].map((x) => (
        <mesh key={x} material={M.glass} position={[x, 2.8, 3.95]}>
          <boxGeometry args={[0.03, 0.62, 0.62]} />
        </mesh>
      ))}
      {/* mirror arms with camera / radar pods */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 1.42, 2.75, 4.25]}>
          <mesh material={M.dark}>
            <boxGeometry args={[0.36, 0.06, 0.06]} />
          </mesh>
          <mesh material={M.lidar} position={[s * 0.18, -0.05, 0]}>
            <boxGeometry args={[0.12, 0.4, 0.18]} />
          </mesh>
        </group>
      ))}
      {/* roof lidar */}
      <mesh material={M.lidar} position={[0, 3.98, 4.1]} castShadow>
        <cylinderGeometry args={[0.22, 0.24, 0.24, 28]} />
      </mesh>
      <mesh material={M.glass} position={[0, 3.98, 4.1]}>
        <cylinderGeometry args={[0.245, 0.245, 0.08, 28]} />
      </mesh>
      {/* fuel tanks and exhaust stacks */}
      {[-1.06, 1.06].map((x) => (
        <group key={x}>
          <mesh material={M.chrome} position={[x, 0.86, 3.35]} rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 1.0, 24]} />
          </mesh>
          <mesh material={M.chrome} position={[x * 0.98, 2.75, 2.68]}>
            <cylinderGeometry args={[0.07, 0.07, 2.3, 12]} />
          </mesh>
        </group>
      ))}
      <mesh material={M.frame} position={[0, 1.08, 1.85]}>
        <cylinderGeometry args={[0.6, 0.6, 0.12, 24]} />
      </mesh>

      {/* ---------------- trailer ---------------- */}
      <mesh material={trailerMat()} position={[0, 2.42, -1.42]} castShadow receiveShadow>
        <boxGeometry args={[2.52, 2.6, 6.86]} />
      </mesh>
      <mesh material={M.frame} position={[0, 1.02, -1.42]}>
        <boxGeometry args={[2.3, 0.22, 6.86]} />
      </mesh>
      {[-1.18, 1.18].map((x) => (
        <mesh key={x} material={M.skirt} position={[x, 0.82, -0.9]}>
          <boxGeometry args={[0.04, 0.48, 3.2]} />
        </mesh>
      ))}
      {/* landing gear */}
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} material={M.dark} position={[x, 0.5, 0.95]}>
          <boxGeometry args={[0.12, 1.0, 0.12]} />
        </mesh>
      ))}
      {/* rear doors, underride guard, lamps */}
      <mesh material={M.frame} position={[0, 2.42, -4.86]}>
        <boxGeometry args={[2.52, 2.6, 0.04]} />
      </mesh>
      <mesh material={trailerMat()} position={[0, 2.42, -4.885]}>
        <boxGeometry args={[2.36, 2.44, 0.02]} />
      </mesh>
      <mesh material={M.frame} position={[0, 2.42, -4.9]}>
        <boxGeometry args={[0.04, 2.44, 0.02]} />
      </mesh>
      <mesh material={M.chrome} position={[0, 0.62, -4.75]}>
        <boxGeometry args={[2.3, 0.14, 0.12]} />
      </mesh>
      {[-1.05, 1.05].map((x) => (
        <mesh key={x} material={M.red} position={[x, 1.25, -4.9]}>
          <boxGeometry args={[0.24, 0.12, 0.03]} />
        </mesh>
      ))}
      {[-1.27, 1.27].map((x) =>
        [-4.2, -2.4, -0.6, 1.2].map((z) => (
          <mesh key={`${x}${z}`} material={M.amber} position={[x, 3.62, z]}>
            <boxGeometry args={[0.02, 0.07, 0.12]} />
          </mesh>
        )),
      )}

      {/* ---------------- wheels ---------------- */}
      {axles.flatMap((a, i) => [
        <Wheel key={`l${i}`} x={-1.06} z={a.z} dual={a.dual} set={set(i * 2)} />,
        <Wheel key={`r${i}`} x={1.06} z={a.z} dual={a.dual} set={set(i * 2 + 1)} />,
      ])}
    </group>
  );
}
