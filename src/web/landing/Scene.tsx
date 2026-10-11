import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CanvasTexture, Object3D, SRGBColorSpace, Vector3 } from 'three';
import type { Group, InstancedMesh } from 'three';
import { Truck } from '../three/Truck.tsx';
import type { TruckPart } from '../three/Truck.tsx';
import { YARD, doorX } from '../../contract.ts';
import { getStoryFrame } from './story.ts';

export const parts = ['lidar', 'compute', 'cab'] as const;
export type InspectPart = typeof parts[number];
export type HotspotRefs = RefObject<Partial<Record<InspectPart, HTMLButtonElement | null>>>;
const partPoints: Record<InspectPart, [number, number, number]> = {
  lidar: [15, 4.15, 5.4], compute: [16.4, 3, 4.05], cab: [15.8, 2.3, 7.7],
};
const closeups: Record<InspectPart, [number, number, number]> = {
  lidar: [22, 8.7, 12.5], compute: [24, 6.5, 8], cab: [23, 5, 16],
};

function DockNumber({ number }: { number: number }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#b3bbc6'; ctx.font = '500 44px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(number), 32, 32);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
  }, [number]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={[doorX(number), 5.45, YARD.wallZ + 0.3]} scale={[1.3, 1.3, 1]}>
    <spriteMaterial map={texture} transparent />
  </sprite>;
}

// The seven background rigs share geometry/materials and use three draw calls.
function Fleet() {
  const trailers = useRef<InstancedMesh>(null), cabs = useRef<InstancedMesh>(null), wheels = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new Object3D();
    const docks = [1, 2, 3, 4, 5, 6, 8];
    docks.forEach((door, i) => {
      const x = doorX(door);
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x, 2.5, -13); dummy.updateMatrix(); trailers.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 1.95, -5.3); dummy.updateMatrix(); cabs.current!.setMatrixAt(i, dummy.matrix);
      [-17, -15.7, -8, -5].forEach((z, axle) => [-1, 1].forEach((side, s) => {
        dummy.position.set(x + side * 1.08, 0.55, z); dummy.rotation.z = Math.PI / 2; dummy.updateMatrix();
        wheels.current!.setMatrixAt(i * 8 + axle * 2 + s, dummy.matrix);
      }));
    });
    for (const ref of [trailers, cabs, wheels]) { ref.current!.instanceMatrix.needsUpdate = true; ref.current!.computeBoundingSphere(); }
  }, []);
  return <group>
    <instancedMesh ref={trailers} args={[undefined, undefined, 7]} castShadow><boxGeometry args={[2.6, 2.9, 12.3]} /><meshStandardMaterial color="#717c8b" roughness={0.65} metalness={0.3} /></instancedMesh>
    <instancedMesh ref={cabs} args={[undefined, undefined, 7]} castShadow><boxGeometry args={[2.4, 2.7, 2.8]} /><meshStandardMaterial color="#4e5d6b" roughness={0.45} metalness={0.4} /></instancedMesh>
    <instancedMesh ref={wheels} args={[undefined, undefined, 56]}><cylinderGeometry args={[0.55, 0.55, 0.4, 12]} /><meshStandardMaterial color="#12171c" /></instancedMesh>
  </group>;
}

function Warehouse() {
  return <group>
    <mesh position={[0, 4.5, -27]} receiveShadow><boxGeometry args={[58, 9, 14]} /><meshStandardMaterial color="#273039" roughness={0.8} /></mesh>
    <mesh position={[0, 8.65, -19.95]}><boxGeometry args={[58, 0.1, 0.08]} /><meshBasicMaterial color="#7c8e9e" /></mesh>
    {Array.from({ length: 8 }, (_, i) => <group key={i}>
      <mesh position={[doorX(i + 1), 2.3, -19.85]}><boxGeometry args={[3.6, 4.6, 0.3]} /><meshStandardMaterial color="#10171e" /></mesh>
      <mesh position={[doorX(i + 1), 2.35, -19.65]}><planeGeometry args={[3, 4.1]} /><meshStandardMaterial color="#46535e" metalness={0.5} roughness={0.65} /></mesh>
      <DockNumber number={i + 1} />
      {[0, 1, 2, 3, 4, 5].map(row => <mesh key={row} position={[doorX(i + 1), 0.65 + row * 0.65, -19.62]}><boxGeometry args={[3, 0.025, 0.015]} /><meshStandardMaterial color="#242d35" /></mesh>)}
      <mesh position={[doorX(i + 1) - 2.25, 0.02, -9]} rotation-x={-Math.PI / 2}><planeGeometry args={[0.055, 21]} /><meshBasicMaterial color="#68727b" transparent opacity={0.25} /></mesh>
    </group>)}
    <Fleet />
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
  const rig = useRef<Group>(null), yard = useRef<Group>(null), pallet = useRef<Group>(null), radar = useRef<Group>(null);
  const look = useRef(new Vector3(8, 1.8, 0));
  const projected = useMemo(() => new Vector3(), []);
  const cameraDestination = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(), []);
  const { size } = useThree();
  useFrame(({ camera, clock }, delta) => {
    const p = reducedMotion ? beat : progress.current;
    const frame = getStoryFrame(p);
    const inspecting = beat === 3;
    cameraDestination.fromArray(inspecting && selected ? closeups[selected] : frame.camera);
    target.fromArray(inspecting && selected ? partPoints[selected] : frame.target);
    if (size.width >= 760 && inspecting) { target.x -= selected ? 2.3 : 3; }
    if (size.width < 760) {
      // Reserve the top half of the viewport for copy and keep the rig in the lower half.
      if (beat === 1 || beat === 5) cameraDestination.multiplyScalar(1.25);
      target.x = inspecting ? 15 : (beat === 1 || beat === 5 ? 0 : 15);
      if (inspecting && selected) cameraDestination.sub(target).multiplyScalar(1.3).add(target);
      target.y += inspecting && selected ? 3.8 : 6;
      cameraDestination.y += 6;
      if (beat === 0 || beat === 6) {
        target.z += frame.truckZ;
        cameraDestination.z += 10;
        cameraDestination.sub(target).multiplyScalar(1.25).add(target);
      }
    }
    const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * 5);
    camera.position.lerp(cameraDestination, ease);
    look.current.lerp(target, ease); camera.lookAt(look.current); camera.updateMatrixWorld();
    if (rig.current) rig.current.position.z = frame.truckZ;
    if (yard.current) {
      const reveal = Math.min(1, p * 1.5, (6 - p) * 1.5);
      yard.current.position.y = -14 * (1 - Math.max(0, reveal));
      yard.current.visible = reveal > 0.01;
    }
    if (pallet.current) { pallet.current.position.y = frame.palletY; pallet.current.visible = p > 1.2 && p < 5.7; }
    if (radar.current) { radar.current.rotation.z = reducedMotion ? 0 : clock.elapsedTime * 0.16; }
    if (inspecting) for (const part of parts) {
      const button = hotspots.current[part];
      if (!button) continue;
      projected.fromArray(partPoints[part]); projected.z += frame.truckZ; projected.project(camera);
      const x = (projected.x * 0.5 + 0.5) * size.width;
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      button.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      button.style.visibility = inspecting && projected.z < 1 && x > 0 && x < size.width && y > 0 && y < size.height ? 'visible' : 'hidden';
    }
  });
  const pick = (part: TruckPart) => { if (part !== 'trailer' && beat === 3) onSelect(part); };
  return <>
    <color attach="background" args={['#08090a']} />
    <fog attach="fog" args={['#08090a', 55, 145]} />
    <hemisphereLight args={['#a6bdd5', '#20201b', 1.9]} />
    <directionalLight position={[15, 28, 12]} intensity={3.5} color="#e8edf5" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005}>
      <orthographicCamera attach="shadow-camera" args={[-40, 40, 35, -35, 1, 100]} />
    </directionalLight>
    <directionalLight position={[-15, 8, -18]} intensity={2.5} color="#c9a762" />
    <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[260, 260]} /><meshStandardMaterial color="#101419" roughness={0.85} /></mesh>
    <group ref={yard}><Warehouse /></group>
    <group ref={rig} position={[15, 0, 4]}>
      <Truck color="#b4bdc8" scan={beat === 2} highlight={beat === 3 ? selected ?? undefined : undefined} onPartClick={pick} animate={!reducedMotion} />
    </group>
    <group ref={pallet} position={[15, 7, -11]}><Pallet /></group>
    {beat === 2 && <group ref={radar} position={[15, 0.06, 0]} rotation-x={-Math.PI / 2}>
      {[4, 8, 12].map(radius => <mesh key={radius}><ringGeometry args={[radius, radius + 0.035, 64, 1, 0, Math.PI * 1.85]} /><meshBasicMaterial color="#FFC93C" transparent opacity={0.28} depthWrite={false} /></mesh>)}
    </group>}
    {(beat === 4 || beat === 5) && <group>
      <mesh position={[15, 0.055, -4]} rotation-x={-Math.PI / 2}><planeGeometry args={[0.055, 29]} /><meshBasicMaterial color="#FFC93C" transparent opacity={0.55} /></mesh>
      <mesh position={[3, 0.055, 10.5]} rotation-x={-Math.PI / 2}><planeGeometry args={[24, 0.055]} /><meshBasicMaterial color="#FFC93C" transparent opacity={0.55} /></mesh>
      {[[-9, 10.5], [15, -18.5], [15, 10.5]].map(([x, z]) => <mesh key={`${x}-${z}`} position={[x, 0.06, z]} rotation-x={-Math.PI / 2}><ringGeometry args={[0.45, 0.52, 24]} /><meshBasicMaterial color="#FFC93C" /></mesh>)}
    </group>}
  </>;
}
