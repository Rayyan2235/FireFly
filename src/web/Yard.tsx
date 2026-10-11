import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Group } from 'three';
import { YARD, doorX } from '../contract.ts';
import type { Door, Truck } from '../contract.ts';
import { lerpAngle, poseAt } from './route.ts';
import type { ActiveRoute } from './useStream.ts';

// Starting point for the 3D yard. Colours are placeholders until the brand is chosen.
const C = { ground: '#e3e6ea', apron: '#d6dadf', lane: '#c4c9cf', wall: '#f2f3f5', door: '#4a535d', closed: '#d2382f', reserved: '#e3a008', cab: '#2a323b', trailer: '#fafbfc' };

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
      <mesh position={[0, 1.95, -1.25]} castShadow>
        <boxGeometry args={[2.5, 2.9, 7.2]} />
        <meshStandardMaterial color={C.trailer} />
      </mesh>
      <mesh position={[0, 1.6, 3.75]} castShadow>
        <boxGeometry args={[2.4, 2.4, 2.1]} />
        <meshStandardMaterial color={C.cab} />
      </mesh>
      {truck.controller === 'held' && <Plane w={3.4} d={10.6} x={0} z={0} color={C.closed} y={0.06} />}
      <Label text={truck.controller === 'held' ? `${truck.id} · held` : truck.id} position={[0, 4.6, 0]} bg={truck.controller === 'held' ? C.closed : '#1f2937'} />
    </group>
  );
}

export function Yard({ doors, trucks, routes }: { doors: Door[]; trucks: Truck[]; routes: Record<string, ActiveRoute> }) {
  return (
    <Canvas shadows camera={{ position: [0, 90, 78], fov: 30 }}>
      <color attach="background" args={['#eceef1']} />
      <hemisphereLight args={['#ffffff', '#cfd5db', 2]} />
      <directionalLight position={[-34, 70, 40]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-55, 55, 45, -45, 10, 200]} />
      </directionalLight>
      <Plane w={150} d={120} x={0} z={-2} color={C.ground} y={0} />
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
      <OrbitControls target={[0, 0, -4]} enablePan={false} minPolarAngle={0.35} maxPolarAngle={1.12} minDistance={60} maxDistance={160} />
    </Canvas>
  );
}
