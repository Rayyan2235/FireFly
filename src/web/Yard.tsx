import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';
import type { Group } from 'three';
import { YARD, doorX, parkX } from '../contract.ts';
import type { Door, Truck } from '../contract.ts';
import { lerpAngle, poseAt } from './route.ts';
import type { ActiveRoute } from './useStream.ts';
import { TruckRig, WHEEL_R } from './yard/TruckRig.tsx';
import { asphalt, cladding, concrete, doorPanels } from './yard/textures.ts';

// A dusk yard, rendered physically: image-based reflections, soft shadows, ambient occlusion.
// Everything that moves still moves only on controller events (see TruckModel).

const BG = '#0c0d0f';
const PAINT_WHITE = '#c9ccd0';
const PAINT_YELLOW = '#8a7228';
const PAINT_YELLOW_LIVE = '#d8b13a';
const TRUCK_COLORS: Record<string, string> = {
  'T-1': '#e7e9ec',
  'T-2': '#1f2a3a',
  'T-3': '#b9bec5',
  'T-4': '#e7e9ec',
  'T-5': '#6b1b1d',
  'T-6': '#2b2f36',
  'T-7': '#d9d3c4',
  'T-8': '#e7e9ec',
};

const M = {
  asphalt: () => new MeshStandardMaterial({ map: asphalt(), roughness: 0.96, metalness: 0 }),
  concrete: () => new MeshStandardMaterial({ map: concrete(), roughness: 0.9 }),
  cladding: () => new MeshStandardMaterial({ map: cladding(), roughness: 0.55, metalness: 0.45 }),
  door: () => new MeshStandardMaterial({ map: doorPanels(), roughness: 0.5, metalness: 0.4 }),
};

function Plane({ w, d, x, z, color, y = 0.01 }: { w: number; d: number; x: number; z: number; color: string; y?: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[x, y, z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

/**
 * A text label drawn to a canvas and shown as a sprite that always faces the camera.
 * (drei's <Html> makes one React root per label, which logs unmount errors with React 19.)
 */
function Label({ text, position, fg = '#ffffff', bg = '#1d1f23', size = 1.3 }: { text: string; position: [number, number, number]; fg?: string; bg?: string | null; size?: number }) {
  const { texture, aspect } = useMemo(() => {
    const font = '600 44px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const pad = 16;
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d')!;
    g.font = font;
    canvas.width = Math.ceil(g.measureText(text).width) + pad * 2;
    canvas.height = 44 + pad * 2;
    g.font = font;
    if (bg) {
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(0, 0, canvas.width, canvas.height, 14);
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
      <spriteMaterial map={texture} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}

/* ------------------------------------------------------------------ ground */

function Ground() {
  const mats = useMemo(() => ({ asphalt: M.asphalt(), concrete: M.concrete() }), []);
  const dashes = useMemo(() => Array.from({ length: 16 }, (_, k) => -36 + k * 4.8), []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -2]} material={mats.asphalt} receiveShadow>
        <planeGeometry args={[170, 130]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, -14.4]} material={mats.concrete} receiveShadow>
        <planeGeometry args={[60, 11.2]} />
      </mesh>
      {/* approach lane: dashed centre line, solid edges */}
      {dashes.map((x) => (
        <Plane key={x} w={2.4} d={0.16} x={x} z={YARD.laneZ} color={PAINT_WHITE} y={0.02} />
      ))}
      <Plane w={76} d={0.14} x={0} z={YARD.laneZ - 3.1} color={PAINT_WHITE} y={0.02} />
      <Plane w={76} d={0.14} x={0} z={YARD.laneZ + 3.1} color={PAINT_WHITE} y={0.02} />
      {/* parking stalls */}
      {Array.from({ length: 9 }, (_, k) => parkX(k) - 3).map((x) => (
        <Plane key={x} w={0.14} d={12} x={x} z={YARD.parkZ} color={PAINT_WHITE} y={0.02} />
      ))}
      <Plane w={48} d={0.14} x={0} z={YARD.parkZ - 6} color={PAINT_WHITE} y={0.02} />
      {/* light poles */}
      {[
        [-33, 1],
        [33, 1],
        [-33, 17],
        [33, 17],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x!, 0, z!]}>
          <mesh position={[0, 5.5, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.18, 11, 12]} />
            <meshStandardMaterial color="#2a2d31" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[x! > 0 ? -0.9 : 0.9, 10.9, 0]}>
            <boxGeometry args={[1.9, 0.18, 0.5]} />
            <meshStandardMaterial color="#2a2d31" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* --------------------------------------------------------------- warehouse */

function Warehouse() {
  const clad = useMemo(() => M.cladding(), []);
  return (
    <group>
      <mesh position={[0, 5.2, -28]} material={clad} castShadow receiveShadow>
        <boxGeometry args={[60, 10.4, 16]} />
      </mesh>
      {/* parapet cap */}
      <mesh position={[0, 10.45, -20.2]}>
        <boxGeometry args={[60.2, 0.3, 0.6]} />
        <meshStandardMaterial color="#5b6068" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* dock-height concrete band the trailers back up to */}
      <mesh position={[0, 0.6, -19.85]} receiveShadow>
        <boxGeometry args={[60, 1.2, 0.3]} />
        <meshStandardMaterial color="#4a4d51" roughness={0.9} />
      </mesh>
    </group>
  );
}

function DoorBay({ door }: { door: Door }) {
  const x = doorX(door.id);
  const panel = useMemo(() => M.door(), []);
  const open = Boolean(door.occupant) && !door.closed;
  const lineColor = door.reservedBy && !door.occupant ? PAINT_YELLOW_LIVE : PAINT_YELLOW;
  return (
    <group>
      {/* opening and interior */}
      <mesh position={[x, 2.75, -19.93]}>
        <boxGeometry args={[3.2, 3.1, 0.05]} />
        <meshStandardMaterial color="#050607" roughness={1} />
      </mesh>
      {/* sectional door: rolled up when a trailer is docked */}
      <mesh position={[x, open ? 4.05 : 2.75, -19.88]} material={panel}>
        <boxGeometry args={[3.05, open ? 0.5 : 3.0, 0.05]} />
      </mesh>
      {/* dock seal pads */}
      {[-1.76, 1.76].map((dx) => (
        <mesh key={dx} position={[x + dx, 2.75, -19.68]} castShadow>
          <boxGeometry args={[0.32, 3.4, 0.45]} />
          <meshStandardMaterial color="#131415" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[x, 4.62, -19.68]} castShadow>
        <boxGeometry args={[3.84, 0.5, 0.45]} />
        <meshStandardMaterial color="#131415" roughness={0.95} />
      </mesh>
      {/* bumpers */}
      {[-1.15, 1.15].map((dx) => (
        <mesh key={dx} position={[x + dx, 0.95, -19.62]} castShadow>
          <boxGeometry args={[0.3, 0.44, 0.22]} />
          <meshStandardMaterial color="#0e0f10" roughness={0.9} />
        </mesh>
      ))}
      {/* dock light */}
      <mesh position={[x + 2.3, 5.2, -19.75]}>
        <boxGeometry args={[0.5, 0.18, 0.3]} />
        <meshStandardMaterial color="#26292d" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* painted guide lines */}
      {[-2.15, 2.15].map((dx) => (
        <Plane key={dx} w={0.12} d={10.5} x={x + dx} z={-14.3} color={lineColor} y={0.025} />
      ))}
      {/* closed for operations: a red safety bar across the opening */}
      {door.closed && (
        <mesh position={[x, 1.95, -19.6]}>
          <boxGeometry args={[3.5, 0.16, 0.08]} />
          <meshStandardMaterial color="#b42a2a" roughness={0.5} />
        </mesh>
      )}
      {door.obstruction && <Pallet x={x + 0.4} z={-10.6} />}
      <Label text={door.closed ? `${door.id} · closed` : String(door.id)} position={[x, 6.4, -19.4]} fg={door.closed ? '#ff8a8a' : '#c9ced6'} bg={door.closed ? '#3a1416' : null} size={1.5} />
    </group>
  );
}

/** A dropped pallet: the obstruction a truck's own sensors stop for. Sized like the real thing; the load spilled. */
function Pallet({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]} rotation-y={0.35}>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.15, 1.0]} />
        <meshStandardMaterial color="#7a5b39" roughness={0.9} />
      </mesh>
      {/* shrink-wrapped load, tipped over */}
      <mesh position={[0.15, 0.62, 0.05]} rotation-z={-0.32} castShadow>
        <boxGeometry args={[1.05, 0.95, 0.9]} />
        <meshStandardMaterial color="#cfd3d7" roughness={0.35} metalness={0.05} />
      </mesh>
      {[
        [1.25, 0.22, 0.55, 0.4, 0.9],
        [-0.95, 0.2, -0.5, 1.1, 0.2],
        [1.6, 0.18, -0.35, 0.7, 2.1],
        [-0.4, 0.2, 1.05, 0.2, 1.4],
      ].map(([bx, by, bz, ry, rz], i) => (
        <mesh key={i} position={[bx!, by!, bz!]} rotation={[0.1, ry!, rz!]} castShadow>
          <boxGeometry args={[0.5, 0.4, 0.45]} />
          <meshStandardMaterial color={i % 2 ? '#a7814f' : '#b88f5a'} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

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
      {held && <Plane w={3.6} d={11} x={0} z={0} color="#3a1416" y={0.03} />}
      <Label text={held ? `${truck.id} · held` : truck.id} position={[0, 5.4, 0]} bg={held ? '#b42a2a' : '#1d1f23'} />
    </group>
  );
}

export function Yard({ doors, trucks, routes }: { doors: Door[]; trucks: Truck[]; routes: Record<string, ActiveRoute> }) {
  return (
    // The view is shifted right so the yard sits clear of the agent panel floating on the right.
    <Canvas shadows dpr={[1, 2]} camera={{ position: [30, 58, 84], fov: 34, near: 1, far: 400 }}>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 120, 220]} />
      {/* Reflections load from a CDN; the yard renders without waiting for them. */}
      <Suspense fallback={null}>
        <Environment preset="city" environmentIntensity={0.45} />
      </Suspense>
      <hemisphereLight args={['#9fb0c8', '#0b0c0e', 0.55]} />
      {/* low evening key light, warm, from the west */}
      <directionalLight position={[-55, 38, 34]} intensity={2.6} color="#ffd8b0" castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.0004} shadow-normalBias={0.04}>
        <orthographicCamera attach="shadow-camera" args={[-62, 62, 50, -50, 10, 220]} />
      </directionalLight>
      <Ground />
      <Warehouse />
      {doors.map((d) => (
        <DoorBay key={d.id} door={d} />
      ))}
      {trucks.map((t) => (
        <TruckModel key={t.id} truck={t} active={routes[t.id]} />
      ))}
      <OrbitControls target={[13, 0, -5]} enablePan={false} minPolarAngle={0.45} maxPolarAngle={1.25} minDistance={40} maxDistance={150} />
      <EffectComposer multisampling={0}>
        <N8AO halfRes aoRadius={3} intensity={2.4} distanceFalloff={1.2} />
        <SMAA />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}
