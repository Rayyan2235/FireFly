import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry, DoubleSide, Vector3 } from 'three';
import type { Group, Mesh } from 'three';
import { YARD, doorKind, doorX } from '../../contract.ts';
import type { Door } from '../../contract.ts';
import { TruckRig, WHEEL_R } from '../yard/TruckRig.tsx';
import { DoorBay, Ground, Pallet, TRUCK_COLORS, Warehouse, YardEffects, YardLights } from '../yard/Scenery.tsx';
import { getStoryFrame } from './story.ts';

// The story uses the console's own yard: the same rig, warehouse, dock bays, lighting and effects.

export const parts = ['lidar', 'rear', 'compute', 'cab'] as const;
export type InspectPart = typeof parts[number];
export type HotspotRefs = RefObject<Partial<Record<InspectPart, HTMLButtonElement | null>>>;

const HERO_X = 15;
const HERO_PAINT = '#9b1c1c'; // the story truck: deep red paint on cab, hood and fairing
// Hotspot anchors on the rig (world space at truckZ = 0); the rig's cab faces +z.
const partPoints: Record<InspectPart, [number, number, number]> = {
  lidar: [HERO_X, 4.05, 6.1], rear: [HERO_X, 1.6, -4.98], compute: [HERO_X + 1.32, 2.2, 4.35], cab: [HERO_X + 0.9, 2.6, 5.9],
};
const closeups: Record<InspectPart, [number, number, number]> = {
  lidar: [22, 8.6, 13.5], rear: [24, 5.9, -12.4], compute: [24, 6.4, 8.1], cab: [23.1, 5.2, 14.2],
};

const door = (id: number, occupant: string | null): Door => ({ id, kind: doorKind(id), closed: false, obstruction: false, occupant, reservedBy: null });
const FLEET = [1, 2, 3, 4, 5, 6, 8];
const fleetColors = Object.values(TRUCK_COLORS);

/** Background trucks docked at their doors, rear to the wall. */
function Fleet() {
  const wheels = useRef<Group[]>([]);
  return <group>{FLEET.map((d, i) => <group key={d} position={[doorX(d), 0, YARD.dockZ]}><TruckRig color={fleetColors[i % fleetColors.length]!} wheels={wheels} /></group>)}</group>;
}

/** Extra sensor hardware on the story truck, plus the scan and highlight overlays. */
function SensorKit({ scan, highlight }: { scan: boolean; highlight?: InspectPart }) {
  const band = useRef<Mesh>(null);
  const hull = useMemo(() => new BoxGeometry(2.62, 4.1, 12.2), []);
  useFrame(({ clock }) => {
    if (band.current) band.current.position.z = -4.9 + ((clock.elapsedTime * 6) % 12.2);
  });
  const lit = (part: InspectPart) => (highlight === part ? '#ffffff' : '#1c1f23');
  return <group>
    {/* rear-facing sensor and the side compute box */}
    <mesh position={[0, 1.6, -4.95]}><boxGeometry args={[0.55, 0.26, 0.12]} /><meshStandardMaterial color={lit('rear')} metalness={0.5} roughness={0.3} /></mesh>
    <mesh position={[1.32, 2.2, 4.35]}><boxGeometry args={[0.22, 0.8, 0.7]} /><meshStandardMaterial color={lit('compute')} metalness={0.4} roughness={0.35} /></mesh>
    {highlight === 'lidar' && <mesh position={[0, 4.12, 6.1]} rotation-x={Math.PI / 2}><torusGeometry args={[0.3, 0.025, 8, 40]} /><meshBasicMaterial color="#ffffff" /></mesh>}
    {highlight === 'cab' && <mesh position={[0, 0.03, 5.6]} rotation-x={-Math.PI / 2}><ringGeometry args={[1.9, 2.0, 48]} /><meshBasicMaterial color="#ffffff" /></mesh>}
    {scan && <group>
      {/* x-ray hull and a scan band sweeping along the rig */}
      <lineSegments position={[0, 2.05, 1.2]}>
        <edgesGeometry args={[hull]} />
        <lineBasicMaterial color="#ffffff" transparent opacity={0.6} />
      </lineSegments>
      <mesh ref={band} position={[0, 2.1, 0]}>
        <planeGeometry args={[3.0, 4.4]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} side={DoubleSide} depthWrite={false} />
      </mesh>
      {/* the rear sensor's field of view on the ground, reaching the pallet */}
      <mesh position={[0, 0.04, -4.95]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[4.2, 40, -Math.PI / 2 - 0.5, 1.0]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      {[2.2, 3.4].map((r) => <mesh key={r} position={[0, 0.05, -4.95]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[r, r + 0.05, 40, 1, -Math.PI / 2 - 0.5, 1.0]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} depthWrite={false} />
      </mesh>)}
    </group>}
  </group>;
}

export function Scene({ progress, beat, selected, hotspots, reducedMotion }: {
  progress: RefObject<number>; beat: number; selected: InspectPart | null;
  onSelect: (part: InspectPart) => void; hotspots: HotspotRefs; reducedMotion: boolean;
}) {
  const rig = useRef<Group>(null), pallet = useRef<Group>(null);
  const wheels = useRef<Group[]>([]);
  const lastZ = useRef<number | null>(null);
  const look = useRef(new Vector3(8, 1.8, 0));
  const projected = useMemo(() => new Vector3(), []);
  const cameraDestination = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(), []);
  const { size } = useThree();
  useFrame(({ camera }, delta) => {
    const p = reducedMotion ? beat : progress.current;
    const frame = getStoryFrame(p);
    const inspecting = beat === 3;
    cameraDestination.fromArray(inspecting && selected ? closeups[selected] : frame.camera);
    target.fromArray(inspecting && selected ? partPoints[selected] : frame.target);
    if (size.width >= 760 && inspecting) { target.x += selected === 'rear' ? 3 : selected ? -2.3 : -3; }
    if (size.width < 760) {
      // Reserve the top half of the viewport for copy and keep the rig in the lower half.
      if (beat === 1 || beat === 5) cameraDestination.multiplyScalar(1.25);
      target.x = inspecting ? HERO_X : (beat === 1 || beat === 5 ? 0 : HERO_X);
      if (inspecting && !selected) target.z = 0;
      if (inspecting) cameraDestination.sub(target).multiplyScalar(selected ? 1.3 : 2.1).add(target);
      target.y += inspecting && selected ? 3.8 : 6;
      cameraDestination.y += 6;
      if (beat === 2) {
        // Portrait exception shot frames the sensor and obstacle together.
        cameraDestination.set(30, 22, -26);
        target.set(HERO_X, 6, -6);
      }
      if (beat === 6) {
        target.z += frame.truckZ;
        cameraDestination.z += 10;
        cameraDestination.sub(target).multiplyScalar(1.25).add(target);
      }
    }
    if (size.width < 760 && beat === 0) {
      cameraDestination.set(40, 12, 38);
      target.set(HERO_X, -1.7, 4);
    }
    const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * 5);
    camera.position.lerp(cameraDestination, ease);
    look.current.lerp(target, ease); camera.lookAt(look.current); camera.updateMatrixWorld();
    if (rig.current) {
      rig.current.position.z = frame.truckZ;
      // Wheels roll by the distance the truck actually moved (backwards while reversing).
      if (lastZ.current !== null) for (const w of wheels.current) w.rotation.x += (frame.truckZ - lastZ.current) / WHEEL_R;
      lastZ.current = frame.truckZ;
    }
    if (pallet.current) { pallet.current.position.y = frame.palletY; pallet.current.visible = p > 1.2 && p < 5.7; }
    if (inspecting) for (const part of parts) {
      const button = hotspots.current[part];
      if (!button) continue;
      projected.fromArray(partPoints[part]); projected.z += frame.truckZ; projected.project(camera);
      const x = (projected.x * 0.5 + 0.5) * size.width;
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      const halfWidth = button.offsetWidth / 2;
      const labelX = Math.max(halfWidth + 8, Math.min(size.width - halfWidth - 8, x));
      button.style.transform = `translate(${labelX}px, ${y}px) translate(-50%, -50%)`;
      button.style.visibility = inspecting && projected.z < 1 && x > 0 && x < size.width && y > 0 && y < size.height ? 'visible' : 'hidden';
    }
  });
  const fleet = beat !== 2 && beat !== 3;
  return <>
    <YardLights fogNear={90} fogFar={200} />
    <Ground />
    <Warehouse />
    {Array.from({ length: YARD.doors }, (_, i) => <DoorBay key={i} door={door(i + 1, fleet && FLEET.includes(i + 1) ? `T-${i + 1}` : null)} />)}
    {fleet && <Fleet />}
    <group ref={rig} position={[HERO_X, 0, 4]}>
      <TruckRig color={HERO_PAINT} wheels={wheels} />
      <SensorKit scan={beat === 2} highlight={beat === 3 ? selected ?? undefined : undefined} />
    </group>
    {/* the pallet drops onto the reversing path, 2.5 m behind the trailer once it stops */}
    <group ref={pallet} position={[HERO_X, 7, -7.4]}><Pallet x={0} z={0} /></group>
    {(beat === 4 || beat === 5) && <group>
      <mesh position={[HERO_X, 0.055, -4]} rotation-x={-Math.PI / 2}><planeGeometry args={[0.055, 29]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.55} /></mesh>
      <mesh position={[3, 0.055, 10.5]} rotation-x={-Math.PI / 2}><planeGeometry args={[24, 0.055]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.55} /></mesh>
      {[[-9, 10.5], [HERO_X, -18.5], [HERO_X, 10.5]].map(([x, z]) => <mesh key={`${x}-${z}`} position={[x, 0.06, z]} rotation-x={-Math.PI / 2}><ringGeometry args={[0.45, 0.52, 24]} /><meshBasicMaterial color="#ffffff" /></mesh>)}
    </group>}
    <YardEffects />
  </>;
}
