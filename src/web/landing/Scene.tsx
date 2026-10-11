import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three';
import type { Group } from 'three';
import { Truck } from '../three/Truck.tsx';
import { YardLighting, YardGround } from '../three/YardEnvironment.tsx';
import type { TruckPart } from '../three/Truck.tsx';
import { YARD, doorX } from '../../contract.ts';
import { getStoryFrame } from './story.ts';

export const parts = ['lidar', 'rear', 'compute', 'cab'] as const;
export type InspectPart = typeof parts[number];
export type HotspotRefs = RefObject<Partial<Record<InspectPart, HTMLButtonElement | null>>>;
const partPoints: Record<InspectPart, [number, number, number]> = {
  lidar: [15, 4.15, 5.1], rear: [15, 1.75, -8.57], compute: [16.3, 2.3, 4.24], cab: [15.8, 2.3, 7.7],
};
const closeups: Record<InspectPart, [number, number, number]> = {
  lidar: [22, 8.7, 12.5], rear: [24, 6, -16], compute: [24, 6.5, 8], cab: [23, 5, 16],
};

function DockNumber({ number }: { number: number }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#374d49'; ctx.font = '500 44px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(number), 32, 32);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
  }, [number]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={[doorX(number), 5.45, YARD.wallZ + 0.3]} scale={[1.3, 1.3, 1]}>
    <spriteMaterial map={texture} transparent />
  </sprite>;
}

// The background uses the same silhouette and sensors, with fine trim omitted.
function Fleet() {
  return <group>{[1,2,3,4,5,6,8].map(door=><group key={door} position={[doorX(door),0,-10.65]}><Truck detail={false} color={door%2 ? '#899f99' : '#bac9bd'} /></group>)}</group>;
}

function Warehouse({ fleet }: { fleet: boolean }) {
  return <group>
    <mesh position={[0, 4.5, -27]} receiveShadow><boxGeometry args={[58, 9, 14]} /><meshStandardMaterial color="#c0cbbd" roughness={0.8} /></mesh>
    <mesh position={[0, 8.65, -19.95]}><boxGeometry args={[58, 0.1, 0.08]} /><meshBasicMaterial color="#f3f1db" /></mesh>
    {Array.from({ length: 8 }, (_, i) => <group key={i}>
      <mesh position={[doorX(i + 1), 2.3, -19.85]}><boxGeometry args={[3.6, 4.6, 0.3]} /><meshStandardMaterial color="#536963" /></mesh>
      <mesh position={[doorX(i + 1), 2.35, -19.65]}><planeGeometry args={[3, 4.1]} /><meshStandardMaterial color="#899b90" metalness={0.5} roughness={0.65} /></mesh>
      <DockNumber number={i + 1} />
      {[0, 1, 2, 3, 4, 5].map(row => <mesh key={row} position={[doorX(i + 1), 0.65 + row * 0.65, -19.62]}><boxGeometry args={[3, 0.025, 0.015]} /><meshStandardMaterial color="#657d72" /></mesh>)}
      <mesh position={[doorX(i + 1) - 2.25, 0.02, -9]} rotation-x={-Math.PI / 2}><planeGeometry args={[0.055, 21]} /><meshBasicMaterial color="#f3f0d5" transparent opacity={0.8} /></mesh>
    </group>)}
    {Array.from({length:30},(_,i)=><mesh key={i} position={[-28+i*1.9,7,-19.97]}><boxGeometry args={[.025,3.2,.03]} /><meshStandardMaterial color="#91a48f" /></mesh>)}
    {[-24,-12,0,12,24].map(x=><mesh key={x} position={[x,9.7,-27]} castShadow><boxGeometry args={[4,1.4,3]} /><meshStandardMaterial color="#a7b6ab" /></mesh>)}
    {Array.from({length:8},(_,i)=><group key={i} position={[doorX(i+1),0,0]}>{[-2,2].map(x=><mesh key={x} position={[x,.65,-19.1]} castShadow><cylinderGeometry args={[.1,.12,1.3,12]} /><meshStandardMaterial color="#c4a455" /></mesh>)}</group>)}
    {fleet && <Fleet />}
  </group>;
}

function Pallet() {
  return <group>
    {[-0.55, 0, 0.55].map(x => <mesh key={x} position={[x, 0.13, 0]} castShadow><boxGeometry args={[0.13, 0.24, 1.3]} /><meshStandardMaterial color="#806c4f" /></mesh>)}
    {[-0.55, -0.28, 0, 0.28, 0.55].map(z => <mesh key={z} position={[0, 0.31, z]} castShadow><boxGeometry args={[1.4, 0.13, 0.2]} /><meshStandardMaterial color="#b59765" /></mesh>)}
    <mesh position={[0, 0.72, 0]} castShadow><boxGeometry args={[1.05, 0.7, 0.95]} /><meshStandardMaterial color="#9e875f" /></mesh>
  </group>;
}

export function Scene({ progress, beat, selected, onSelect, hotspots, reducedMotion }: {
  progress: RefObject<number>; beat: number; selected: InspectPart | null;
  onSelect: (part: InspectPart) => void; hotspots: HotspotRefs; reducedMotion: boolean;
}) {
  const rig = useRef<Group>(null), pallet = useRef<Group>(null);
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
      target.x = inspecting ? 15 : (beat === 1 || beat === 5 ? 0 : 15);
      if (inspecting && !selected) target.z = 0;
      if (inspecting) cameraDestination.sub(target).multiplyScalar(selected ? 1.3 : 2.1).add(target);
      target.y += inspecting && selected ? 3.8 : 6;
      cameraDestination.y += 6;
      if (beat === 2) {
        // Portrait exception shot frames the sensor and obstacle together.
        cameraDestination.set(30, 22, -29);
        target.set(15, 6, -8.5);
      }
      if (beat === 6) {
        target.z += frame.truckZ;
        cameraDestination.z += 10;
        cameraDestination.sub(target).multiplyScalar(1.25).add(target);
      }
    }
    if (size.width < 760 && beat === 0) {
      cameraDestination.set(40, 12, 38);
      target.set(15, -1.7, 4);
    }
    const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * 5);
    camera.position.lerp(cameraDestination, ease);
    look.current.lerp(target, ease); camera.lookAt(look.current); camera.updateMatrixWorld();
    if (rig.current) rig.current.position.z = frame.truckZ;
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
  const pick = (part: TruckPart) => { if (part !== 'trailer' && beat === 3) onSelect(part); };
  return <>
    <YardLighting />
    <YardGround />
    <Warehouse fleet={beat !== 2 && beat !== 3} />
    <group ref={rig} position={[15, 0, 4]}>
      <Truck color="#b6c9c2" scan={beat === 2} highlight={beat === 3 ? selected ?? undefined : undefined} onPartClick={pick} animate={!reducedMotion} />
    </group>
    <group ref={pallet} position={[15, 7, -11]}><Pallet /></group>
    {(beat === 4 || beat === 5) && <group>
      <mesh position={[15, 0.055, -4]} rotation-x={-Math.PI / 2}><planeGeometry args={[0.055, 29]} /><meshBasicMaterial color="#0081c0" transparent opacity={0.55} /></mesh>
      <mesh position={[3, 0.055, 10.5]} rotation-x={-Math.PI / 2}><planeGeometry args={[24, 0.055]} /><meshBasicMaterial color="#0081c0" transparent opacity={0.55} /></mesh>
      {[[-9, 10.5], [15, -18.5], [15, 10.5]].map(([x, z]) => <mesh key={`${x}-${z}`} position={[x, 0.06, z]} rotation-x={-Math.PI / 2}><ringGeometry args={[0.45, 0.52, 24]} /><meshBasicMaterial color="#0081c0" /></mesh>)}
    </group>}
  </>;
}
