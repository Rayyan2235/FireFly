import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Truck as Vehicle } from './three/Truck.tsx';
import { YardLighting, YardGround } from './three/YardEnvironment.tsx';
import { OrbitControls } from '@react-three/drei';
import { CanvasTexture, SRGBColorSpace, PCFShadowMap } from 'three';
import type { Group } from 'three';
import { YARD, doorX } from '../contract.ts';
import type { Door, Truck } from '../contract.ts';
import { lerpAngle, poseAt } from './route.ts';
import type { ActiveRoute } from './useStream.ts';

// Yard materials share the landing’s warm industrial palette.
const C = { ground: '#c6cec4', apron: '#d0d5c9', lane: '#aab6b0', wall: '#c0cbbd', door: '#536963', closed: '#d2382f', reserved: '#e3a008', cab: '#2a323b', trailer: '#fafbfc' };

function Plane({ w, d, x, z, color, y = 0.01 }: { w: number; d: number; x: number; z: number; color: string; y?: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[x, y, z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/**
 * A text label drawn to a canvas and shown as a sprite that always faces the camera.
 * (drei's <Html> makes one React root per label, which logs unmount errors with React 19.)
 */
function Label({ text, position, fg = '#ffffff', bg = '#1f2937', size = 1.3 }: { text: string; position: [number, number, number]; fg?: string; bg?: string | null; size?: number }) {
  const { texture, aspect } = useMemo(() => {
    const font = '600 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const pad = 14;
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d')!;
    g.font = font;
    canvas.width = Math.ceil(g.measureText(text).width) + pad * 2;
    canvas.height = 44 + pad * 2;
    g.font = font;
    if (bg) {
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(0, 0, canvas.width, canvas.height, 12);
      g.fill();
    }
    g.fillStyle = fg;
    g.textBaseline = 'middle';
    g.fillText(text, pad, canvas.height / 2 + 2);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return { texture: t, aspect: canvas.width / canvas.height };
  }, [text, fg, bg]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[size * aspect, size, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

function DoorBay({ door }: { door: Door }) {
  const x = doorX(door.id);
  return (
    <group>
      <mesh position={[x, 2.05, YARD.wallZ + 0.22]}>
        <planeGeometry args={[3.3, 3.8]} />
        <meshStandardMaterial color={door.closed ? C.closed : C.door} />
      </mesh>
      {door.reservedBy && !door.occupant && <Plane w={5.2} d={11.6} x={x} z={-14} color={C.reserved} y={0.04} />}
      <Label text={door.closed ? `${door.id} · closed` : String(door.id)} position={[x, 5.4, YARD.wallZ + 0.3]} fg={door.closed ? C.closed : '#334155'} bg={null} size={1.6} />
    </group>
  );
}

function TruckModel({ truck, active }: { truck: Truck; active?: ActiveRoute }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    // Motion only ever follows a controller-accepted route (or the last reported pose).
    const target = active ? poseAt(active.route, performance.now() - active.startedAt).pose : truck.pose;
    const k = 1 - Math.exp(-dt * 12);
    g.position.x += (target.x - g.position.x) * k;
    g.position.z += (target.z - g.position.z) * k;
    g.rotation.y = lerpAngle(g.rotation.y, target.heading, k);
  });
  return (
    <group ref={ref} position={[truck.pose.x, 0, truck.pose.z]} rotation-y={truck.pose.heading}>
      {/* Uniform display scale fits the controller's existing yard footprint. */}
      <group scale={0.61}><Vehicle detail={false} color={truck.controller === 'held' ? '#bdaca0' : '#b6c9c2'} /></group>
      {truck.controller === 'held' && <Plane w={3.4} d={10.6} x={0} z={0} color={C.closed} y={0.06} />}
      <Label text={truck.controller === 'held' ? `${truck.id} · held` : truck.id} position={[0, 4.6, 0]} bg={truck.controller === 'held' ? C.closed : '#1f2937'} />
    </group>
  );
}

function YardCamera() {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    // Fit the full dock row and parking apron when the canvas becomes portrait.
    const scale = Math.max(1, 1.35 / (size.width / size.height));
    camera.position.set(34 * scale, 46 * scale, 62 * scale - 4);
    camera.lookAt(0, 0, -4);
  }, [camera, size.width, size.height]);
  return null;
}

export function Yard({ doors, trucks, routes }: { doors: Door[]; trucks: Truck[]; routes: Record<string, ActiveRoute> }) {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1,1.5]} camera={{ position: [34, 46, 58], fov: 38 }}>
      <YardCamera />
      <YardLighting fog={false} />
      <YardGround />
      <Plane w={58} d={12.4} x={0} z={-14} color={C.apron} />
      <Plane w={74} d={6} x={0} z={YARD.laneZ} color={C.lane} y={0.02} />
      <Plane w={52} d={13} x={0} z={YARD.parkZ} color={C.apron} />
      <mesh position={[0, 4.5, -27]} castShadow receiveShadow>
        <boxGeometry args={[58, 9, 14]} />
        <meshStandardMaterial color={C.wall} />
      </mesh>
      {doors.map((d) => (
        <DoorBay key={d.id} door={d} />
      ))}
      {trucks.map((t) => (
        <TruckModel key={t.id} truck={t} active={routes[t.id]} />
      ))}
      <OrbitControls target={[0, 0, -4]} enablePan={false} minPolarAngle={0.35} maxPolarAngle={1.12} minDistance={45} maxDistance={160} />
    </Canvas>
  );
}
