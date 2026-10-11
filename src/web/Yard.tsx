import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Group } from 'three';
import type { Door, Truck } from '../contract.ts';
import { lerpAngle, poseAt } from './route.ts';
import type { ActiveRoute } from './useStream.ts';
import { TruckRig, WHEEL_R } from './yard/TruckRig.tsx';
import { DoorBay, Ground, Label, TRUCK_COLORS, Warehouse, YardEffects, YardLights } from './yard/Scenery.tsx';

// The console's live yard. Everything that moves moves only on controller events (see TruckModel).

/* ------------------------------------------------------------------ trucks */

function TruckModel({ truck, active }: { truck: Truck; active?: ActiveRoute }) {
  const ref = useRef<Group>(null);
  const wheels = useRef<Group[]>([]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    // Motion only ever follows a controller-accepted route (or the last reported pose).
    const target = active ? poseAt(active.route, performance.now() - active.startedAt).pose : truck.pose;
    const k = 1 - Math.exp(-dt * 12);
    const dx = (target.x - g.position.x) * k;
    const dz = (target.z - g.position.z) * k;
    g.position.x += dx;
    g.position.z += dz;
    g.rotation.y = lerpAngle(g.rotation.y, target.heading, k);
    // Wheels roll by the distance actually travelled along the heading (negative when reversing).
    const rolled = dx * Math.sin(g.rotation.y) + dz * Math.cos(g.rotation.y);
    if (Math.abs(rolled) > 1e-5) for (const w of wheels.current) w.rotation.x += rolled / WHEEL_R;
  });
  const held = truck.controller === 'held';
  return (
    <group ref={ref} position={[truck.pose.x, 0, truck.pose.z]} rotation-y={truck.pose.heading}>
      <TruckRig color={TRUCK_COLORS[truck.id] ?? '#e7e9ec'} wheels={wheels} />
      <Label text={held ? `${truck.id} · held` : truck.id} position={[0, 5.4, 1.2]} fg={held ? '#08090a' : '#ffffff'} bg={held ? '#ffffff' : '#1d1f23'} />
    </group>
  );
}

export function Yard({ doors, trucks, routes }: { doors: Door[]; trucks: Truck[]; routes: Record<string, ActiveRoute> }) {
  return (
    // The view is shifted right so the yard sits clear of the agent panel floating on the right.
    <Canvas shadows dpr={[1, 2]} camera={{ position: [30, 58, 84], fov: 34, near: 1, far: 400 }}>
      <YardLights />
      <Ground />
      <Warehouse />
      {doors.map((d) => (
        <DoorBay key={d.id} door={d} />
      ))}
      {trucks.map((t) => (
        <TruckModel key={t.id} truck={t} active={routes[t.id]} />
      ))}
      <OrbitControls target={[13, 0, -5]} enablePan={false} minPolarAngle={0.45} maxPolarAngle={1.25} minDistance={40} maxDistance={150} />
      <YardEffects />
    </Canvas>
  );
}
