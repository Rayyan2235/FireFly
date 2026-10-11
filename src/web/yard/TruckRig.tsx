import { Component, Suspense, useMemo } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { RoundedBox, useGLTF } from '@react-three/drei';
import { Box3, BufferAttribute, MeshPhysicalMaterial, MeshStandardMaterial, Vector3 } from 'three';
import type { Group, Mesh } from 'three';
import { trailerSkin } from './textures.ts';

// A procedural autonomous tractor-trailer. Local space: +z is the cab end (heading 0 faces +z), y is up.
// The origin sits near the trailer's tandem axles, where a real rig pivots. The yard is only 16 m from
// wall to lane, so the rig is 12 m long (a real one is ~19 m); widths and heights are real.

export const WHEEL_R = 0.5;
export const RIG = { rear: -4.86, front: 7.26 };

const paintCache = new Map<string, MeshPhysicalMaterial>();
const paint = (color: string) =>
  paintCache.get(color) ??
  (paintCache.set(color, new MeshPhysicalMaterial({ color, metalness: 0.35, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 })),
  paintCache.get(color)!);

const M = {
  chrome: new MeshStandardMaterial({ color: '#d9dde2', metalness: 1, roughness: 0.14 }),
  dark: new MeshStandardMaterial({ color: '#17191c', metalness: 0.25, roughness: 0.7 }),
  frame: new MeshStandardMaterial({ color: '#0f1012', metalness: 0.4, roughness: 0.6 }),
  rubber: new MeshStandardMaterial({ color: '#111213', roughness: 0.93 }),
  rim: new MeshStandardMaterial({ color: '#a3a9b0', metalness: 0.85, roughness: 0.26 }),
  glass: new MeshPhysicalMaterial({ color: '#0a0e13', metalness: 0.7, roughness: 0.03, clearcoat: 1 }),
  lamp: new MeshStandardMaterial({ color: '#e9edf2', metalness: 0.2, roughness: 0.12 }),
  amber: new MeshStandardMaterial({ color: '#c97d16', roughness: 0.4 }),
  red: new MeshStandardMaterial({ color: '#8f1a1a', roughness: 0.4 }),
  skirt: new MeshStandardMaterial({ color: '#2a2d32', metalness: 0.2, roughness: 0.55 }),
  lidar: new MeshStandardMaterial({ color: '#1c1f23', metalness: 0.6, roughness: 0.25 }),
};
let skin: MeshStandardMaterial | null = null;
const trailerMat = () => (skin ??= new MeshStandardMaterial({ map: trailerSkin(), metalness: 0.3, roughness: 0.4 }));

/** One wheel end: a tyre and rim (dual = two tyres). The group spins about x as the truck rolls. */
function Wheel({ x, z, dual, set }: { x: number; z: number; dual?: boolean; set: (g: Group | null) => void }) {
  const offsets = dual ? [-0.17, 0.17] : [0];
  return (
    <group position={[x, WHEEL_R, z]} ref={set}>
      {offsets.map((o) => (
        <group key={o} position={[o, 0, 0]} rotation-z={Math.PI / 2}>
          <mesh material={M.rubber} castShadow>
            <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.3, 32]} />
          </mesh>
          <mesh material={M.rim} position={[0, x > 0 ? 0.03 : -0.03, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.31, 24]} />
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

const T = 2.0; // the tractor sits this far forward of where it was in the 10 m rig

export function TruckRig({ color, wheels, withTractor = true, withTrailer = true }: { color: string; wheels: MutableRefObject<Group[]>; withTractor?: boolean; withTrailer?: boolean }) {
  const body = paint(color);
  const set = (i: number) => (g: Group | null) => {
    if (g) wheels.current[i] = g;
  };
  const axles: { z: number; dual: boolean }[] = [
    { z: 4.45 + T, dual: false }, // steer
    { z: 2.45 + T, dual: true }, // drive
    { z: 1.75 + T, dual: true }, // drive
    { z: -3.15, dual: true }, // trailer tandem
    { z: -3.95, dual: true },
  ];

  return (
    <group>
      {/* ---------------- tractor ---------------- */}
      <group position-z={T} visible={withTractor}>
        <mesh material={M.frame} position={[0, 0.85, 3.2]}>
          <boxGeometry args={[1.0, 0.28, 3.4]} />
        </mesh>
        <RoundedBox args={[2.45, 2.0, 1.55]} radius={0.16} smoothness={4} position={[0, 2.3, 3.55]} material={body} castShadow />
        <RoundedBox args={[2.3, 0.55, 1.25]} radius={0.24} smoothness={4} position={[0, 3.55, 3.4]} material={body} castShadow />
        {/* hood slopes down to the grille, like a conventional cab */}
        <RoundedBox args={[2.2, 0.95, 0.9]} radius={0.18} smoothness={4} position={[0, 1.72, 4.7]} rotation-x={0.1} material={body} castShadow />
        {/* fenders over the steer wheels */}
        {[-1.12, 1.12].map((x) => (
          <mesh key={x} material={body} position={[x, 0.98, 4.45]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.62, 0.62, 0.32, 24, 1, true, Math.PI / 2, Math.PI]} />
          </mesh>
        ))}
        <mesh material={M.chrome} position={[0, 1.74, 5.14]}>
          <boxGeometry args={[1.35, 0.72, 0.04]} />
        </mesh>
        <mesh material={M.dark} position={[0, 1.74, 5.15]}>
          <boxGeometry args={[1.2, 0.6, 0.04]} />
        </mesh>
        {[-0.85, 0.85].map((x) => (
          <mesh key={x} material={M.lamp} position={[x, 1.42, 5.12]}>
            <boxGeometry args={[0.36, 0.17, 0.05]} />
          </mesh>
        ))}
        <RoundedBox args={[2.5, 0.34, 0.3]} radius={0.08} smoothness={3} position={[0, 0.82, 5.14]} material={M.chrome} castShadow />
        <mesh material={M.glass} position={[0, 2.82, 4.33]} rotation-x={-0.12}>
          <boxGeometry args={[2.18, 0.78, 0.04]} />
        </mesh>
        {[-1.24, 1.24].map((x) => (
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
          <cylinderGeometry args={[0.22, 0.24, 0.24, 32]} />
        </mesh>
        <mesh material={M.glass} position={[0, 3.98, 4.1]}>
          <cylinderGeometry args={[0.245, 0.245, 0.08, 32]} />
        </mesh>
        {/* fuel tanks, steps, exhaust stacks */}
        {[-1.06, 1.06].map((x) => (
          <group key={x}>
            <mesh material={M.chrome} position={[x, 0.86, 3.35]} rotation-x={Math.PI / 2} castShadow>
              <cylinderGeometry args={[0.3, 0.3, 1.0, 28]} />
            </mesh>
            <mesh material={M.chrome} position={[x * 0.98, 2.75, 2.68]}>
              <cylinderGeometry args={[0.07, 0.07, 2.3, 14]} />
            </mesh>
            <mesh material={M.dark} position={[x * 1.08, 1.32, 3.9]}>
              <boxGeometry args={[0.18, 0.06, 0.5]} />
            </mesh>
          </group>
        ))}
        {/* mud flaps behind the drive axles */}
        {[-1.06, 1.06].map((x) => (
          <mesh key={x} material={M.rubber} position={[x, 0.5, 1.25]}>
            <boxGeometry args={[0.6, 0.7, 0.03]} />
          </mesh>
        ))}
        <mesh material={M.frame} position={[0, 1.08, 1.85]}>
          <cylinderGeometry args={[0.6, 0.6, 0.12, 28]} />
        </mesh>
      </group>

      {/* ---------------- trailer: 9.2 m dry van ---------------- */}
      <group visible={withTrailer}>
      <RoundedBox args={[2.52, 2.6, 9.16]} radius={0.06} smoothness={2} position={[0, 2.42, -0.28]} material={trailerMat()} castShadow receiveShadow />
      <mesh material={M.frame} position={[0, 1.02, -0.28]}>
        <boxGeometry args={[2.3, 0.22, 9.16]} />
      </mesh>
      {[-1.18, 1.18].map((x) => (
        <mesh key={x} material={M.skirt} position={[x, 0.82, -0.3]}>
          <boxGeometry args={[0.04, 0.48, 4.2]} />
        </mesh>
      ))}
      {/* landing gear */}
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} material={M.dark} position={[x, 0.5, 2.6]}>
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
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} material={M.chrome} position={[x, 2.42, -4.91]}>
          <boxGeometry args={[0.04, 2.2, 0.03]} />
        </mesh>
      ))}
      <mesh material={M.chrome} position={[0, 0.62, -4.75]}>
        <boxGeometry args={[2.3, 0.14, 0.12]} />
      </mesh>
      {[-1.05, 1.05].map((x) => (
        <mesh key={x} material={M.red} position={[x, 1.25, -4.9]}>
          <boxGeometry args={[0.24, 0.12, 0.03]} />
        </mesh>
      ))}
      {[-1.27, 1.27].map((x) =>
        [-4.2, -1.8, 0.6, 3.0].map((z) => (
          <mesh key={`${x}${z}`} material={M.amber} position={[x, 3.62, z]}>
            <boxGeometry args={[0.02, 0.07, 0.12]} />
          </mesh>
        )),
      )}

      </group>

      {/* ---------------- wheels ---------------- */}
      {axles.filter((_, i) => (i < 3 ? withTractor : withTrailer)).flatMap((a, i, list) => [
        <Wheel key={`l${a.z}`} x={-1.06} z={a.z} dual={a.dual} set={set(axles.indexOf(list[i]!) * 2)} />,
        <Wheel key={`r${a.z}`} x={1.06} z={a.z} dual={a.dual} set={set(axles.indexOf(list[i]!) * 2 + 1)} />,
      ])}
    </group>
  );
}

/* ------------------------------------------------- a downloaded model, when there is one */

export const TRUCK_GLB = '/models/truck.glb';
export const TRAILER_GLB = '/models/trailer.glb';
const GLB_YAW = 0; // set to Math.PI if the model's cab points the wrong way
const TRAILER_YAW = 0; // set to Math.PI if the trailer's rear doors face the cab
const TRAILER_LENGTH = 9.16;
// A whole downloaded rig may run 14 m: docked, its nose stops just short of trucks passing in the lane.
const SCAN_LENGTH = 14;

/** Clone a loaded model, let it cast shadows, and turn its longest side along z. */
function prepare(scene: Group, yaw: number) {
  const root = scene.clone(true);
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      // Optimised scans can arrive without normals; lighting needs them.
      if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
      // A photogrammetry texture already carries the paint and grime: treat it as a dull, non-metal surface.
      const mat = m.material as MeshStandardMaterial;
      if (mat.isMeshStandardMaterial) {
        mat.metalness = 0;
        mat.roughness = 0.8;
      }
    }
  });
  const size = new Box3().setFromObject(root).getSize(new Vector3());
  if (size.x > size.z) root.rotation.y = Math.PI / 2;
  root.rotation.y += yaw;
  root.updateMatrixWorld(true);
  return root;
}

/**
 * A photogrammetry scan comes with the patch of ground it was scanned on. Drop every triangle that lies
 * entirely within the lowest 15 cm, and return the bounds of what is left (the truck itself).
 */
function stripGround(root: Group) {
  root.updateMatrixWorld(true);
  const v = new Vector3();
  let minY = Infinity;
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position!;
    for (let i = 0; i < pos.count; i++) minY = Math.min(minY, v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).y);
  });
  const cut = minY + 0.15;
  // The truck's footprint, from everything well above the ground (trailer body, cab).
  const body = new Box3();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (v.y > minY + 1.4) body.expandByPoint(v);
    }
  });
  const inFootprint = (p: Vector3) => p.x > body.min.x - 0.25 && p.x < body.max.x + 0.25 && p.z > body.min.z - 0.4 && p.z < body.max.z + 0.4;
  const kept = new Box3();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.geometry.index) return;
    const pos = m.geometry.attributes.position!;
    const idx = m.geometry.index.array;
    const ys = new Float32Array(pos.count);
    const world: Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      world[i] = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      ys[i] = world[i]!.y;
    }
    const out: number[] = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
      if (ys[a]! < cut && ys[b]! < cut && ys[c]! < cut) continue;
      // Low and outside the truck's footprint: scanned ground, not truck.
      const low = minY + 0.7;
      if (ys[a]! < low && ys[b]! < low && ys[c]! < low && !inFootprint(world[a]!) && !inFootprint(world[b]!) && !inFootprint(world[c]!)) continue;
      out.push(a, b, c);
      kept.expandByPoint(world[a]!).expandByPoint(world[b]!).expandByPoint(world[c]!);
    }
    m.geometry = m.geometry.clone();
    m.geometry.setIndex(new BufferAttribute(new Uint32Array(out), 1));
  });
  return kept;
}

/** Scale uniformly, then put the wheels on the ground, centre it, and pin one end in z. */
function place(root: Group, scale: number, pin: { rear?: number; front?: number }) {
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const b = new Box3().setFromObject(root);
  const z = pin.front !== undefined ? pin.front - b.max.z : pin.rear! - b.min.z;
  root.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, z);
}

/** A downloaded trailer: scaled to the rig's trailer length, rear doors at the dock. */
function GlbTrailer() {
  const { scene } = useGLTF(TRAILER_GLB);
  const fitted = useMemo(() => {
    const root = prepare(scene, TRAILER_YAW);
    const b = new Box3().setFromObject(root);
    place(root, TRAILER_LENGTH / (b.max.z - b.min.z), { rear: RIG.rear });
    return root;
  }, [scene]);
  return <primitive object={fitted} />;
}

/**
 * A downloaded truck. A whole rig (long and low) is scaled to the rig's length with its rear at the dock.
 * A tractor alone (short and tall) is scaled to a real 3.9 m cab height with its nose at the rig's front,
 * and pulls the downloaded trailer if there is one, else the procedural trailer.
 */
function GlbTruck({ color, wheels, hasTrailer }: { color: string; wheels: MutableRefObject<Group[]>; hasTrailer: boolean }) {
  const { scene } = useGLTF(TRUCK_GLB);
  const { fitted, tractorOnly } = useMemo(() => {
    const root = prepare(scene, GLB_YAW);
    const truck = stripGround(root);
    const length = truck.max.z - truck.min.z;
    const height = truck.max.y - truck.min.y;
    const tractorOnly = length / height < 2.6;
    if (tractorOnly) {
      place(root, 3.9 / height, { front: RIG.front });
    } else {
      // A whole rig keeps its real height and width; only its length is compressed to fit the yard.
      const k = 3.9 / height;
      root.scale.set(k, k, SCAN_LENGTH / length);
      root.updateMatrixWorld(true);
      const b = new Box3().setFromPoints([truck.min, truck.max].map((p) => p.clone().multiply(root.scale)));
      root.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, RIG.rear - b.min.z);
    }
    return { fitted: root, tractorOnly };
  }, [scene]);
  const trailer = hasTrailer ? <GlbTrailer /> : <TruckRig color={color} wheels={wheels} withTractor={false} />;
  return (
    <>
      {tractorOnly && trailer}
      <primitive object={fitted} />
    </>
  );
}

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Downloaded models where they exist, procedural parts where they don't. Any file that fails to load falls back. */
export function Truck3D({ color, wheels, hasTruck, hasTrailer }: { color: string; wheels: MutableRefObject<Group[]>; hasTruck: boolean; hasTrailer: boolean }) {
  const rig = <TruckRig color={color} wheels={wheels} />;
  if (hasTruck)
    return (
      <Fallback fallback={rig}>
        <Suspense fallback={rig}>
          <GlbTruck color={color} wheels={wheels} hasTrailer={hasTrailer} />
        </Suspense>
      </Fallback>
    );
  if (hasTrailer)
    return (
      <Fallback fallback={rig}>
        <Suspense fallback={rig}>
          <TruckRig color={color} wheels={wheels} withTrailer={false} />
          <GlbTrailer />
        </Suspense>
      </Fallback>
    );
  return rig;
}
