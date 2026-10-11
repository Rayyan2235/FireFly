import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Shape, DoubleSide } from 'three';
import type { Mesh } from 'three';

export type TruckPart = 'lidar' | 'compute' | 'cab' | 'trailer';
export interface TruckProps {
  color?: string;
  scan?: boolean;
  highlight?: TruckPart;
  onPartClick?: (part: TruckPart) => void;
  animate?: boolean;
}
type V3 = [number, number, number];
const GOLD = '#FFC93C';

function Panel({ size, at, color, scan = false, active = false, radius = 0.055 }: {
  size: V3; at: V3; color: string; scan?: boolean; active?: boolean; radius?: number;
}) {
  const bevel = Math.min(radius, Math.min(...size) / 3);
  const [width, height, depth] = size;
  const geometry = useMemo(() => new RoundedBoxGeometry(width, height, depth, 2, bevel), [width, height, depth, bevel]);
  return <group position={at}>
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.34}
        emissive={active ? GOLD : '#000000'} emissiveIntensity={active ? 0.12 : 0}
        transparent={scan} opacity={scan ? 0.16 : 1} depthWrite={!scan} />
    </mesh>
    {scan && <mesh scale={1.003}><boxGeometry args={size} />
      <meshBasicMaterial color={GOLD} wireframe transparent opacity={0.35} depthTest={false} />
    </mesh>}
  </group>;
}

export function createCabProfile() {
    const s = new Shape();
    s.moveTo(-4.02, 1.12);
    s.lineTo(-4.02, 3.18);
    s.quadraticCurveTo(-4.05, 3.68, -4.5, 3.72);
    s.lineTo(-5.52, 3.72);
    s.quadraticCurveTo(-5.85, 3.72, -6.06, 3.4);
    s.lineTo(-6.68, 2.37);
    s.quadraticCurveTo(-6.8, 2.14, -7.08, 2.06);
    s.lineTo(-7.95, 1.86);
    s.quadraticCurveTo(-8.38, 1.74, -8.38, 1.35);
    s.lineTo(-8.38, 1.02);
    s.lineTo(-7.62, 1.02);
    // The front wheel arch is cut into the lower body rather than pasted over it.
    s.quadraticCurveTo(-7.63, 1.47, -7.1, 1.47);
    s.quadraticCurveTo(-6.55, 1.47, -6.55, 1.02);
    s.lineTo(-4.02, 1.12); s.closePath();
    return s;
}


/** A swept, bevelled cab side profile, extruded across the vehicle width. */
function CabShell({ color, scan, active }: { color: string; scan: boolean; active: boolean }) {
  const profile = useMemo(createCabProfile, []);
  const options = useMemo(() => ({ depth: 2.18, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.08, bevelSegments: 3, steps: 1, curveSegments: 8 }), []);
  return <group position={[-1.09, 0, 0]} rotation-y={Math.PI / 2}>
    <mesh castShadow receiveShadow><extrudeGeometry args={[profile, options]} />
      <meshStandardMaterial color={color} metalness={0.6} roughness={0.28} transparent={scan} opacity={scan ? 0.15 : 1} depthWrite={!scan} emissive={active ? GOLD : '#000000'} emissiveIntensity={active ? 0.14 : 0} />
    </mesh>
    {scan && <mesh><extrudeGeometry args={[profile, options]} /><meshBasicMaterial color={GOLD} wireframe transparent opacity={0.22} depthTest={false} /></mesh>}
  </group>;
}

function SideWindow({ side }: { side: number }) {
  const shape = useMemo(() => {
    const s = new Shape();
    s.moveTo(-4.68, 2.61); s.lineTo(-4.68, 3.39); s.lineTo(-5.56, 3.39);
    s.quadraticCurveTo(-5.7, 3.39, -5.8, 3.2); s.lineTo(-6.19, 2.61); s.closePath(); return s;
  }, []);
  return <mesh position={[side * 1.178, 0, 0]} rotation-y={Math.PI / 2}>
    <shapeGeometry args={[shape]} /><meshStandardMaterial color="#11232f" metalness={0.7} roughness={0.16} side={DoubleSide} />
  </mesh>;
}

function Wheel({ side, z }: { side: number; z: number }) {
  return <group position={[side * 1.055, 0.61, z]} rotation-y={Math.PI / 2}>
    <mesh castShadow><torusGeometry args={[0.435, 0.17, 10, 28]} /><meshStandardMaterial color="#15191d" roughness={0.92} /></mesh>
    <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[0.37, 0.37, 0.27, 24]} /><meshStandardMaterial color="#8995a1" metalness={0.85} roughness={0.28} /></mesh>
    <mesh position-z={side * 0.16}><torusGeometry args={[0.29, 0.028, 6, 24]} /><meshStandardMaterial color="#bbc4cc" metalness={0.85} roughness={0.23} /></mesh>
    <mesh position-z={side * 0.18} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.13, 0.13, 0.09, 16]} /><meshStandardMaterial color="#b4bec9" metalness={0.85} roughness={0.22} /></mesh>
    {Array.from({ length: 6 }, (_, i) => {
      const angle = i * Math.PI / 3;
      return <mesh key={i} position={[Math.cos(angle) * 0.225, Math.sin(angle) * 0.225, side * 0.16]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.035, 0.035, 0.025, 6]} /><meshStandardMaterial color="#28313a" metalness={0.7} roughness={0.35} />
      </mesh>;
    })}
  </group>;
}

/** Procedural 2.6 m × 17 m semi; ground y=0, cab forward +z. Place with a parent group. */
export function Truck({ color = '#adb9c6', scan = false, highlight, onPartClick, animate = true }: TruckProps) {
  const band = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (band.current) band.current.position.z = animate ? (clock.elapsedTime * 3.4) % 17 - 8.5 : 3;
  });
  const pick = (part: TruckPart) => (event: ThreeEvent<MouseEvent>) => {
    if (onPartClick) { event.stopPropagation(); onPartClick(part); }
  };
  return <group>
    <Panel size={[1.95, 0.24, 15.6]} at={[0, 0.92, -0.2]} color="#252d35" scan={scan} />
    <group onClick={pick('trailer')}>
      <Panel size={[2.6, 2.83, 12.15]} at={[0, 2.62, -2.35]} color="#c3cbd2" scan={scan} active={highlight === 'trailer'} radius={0.12} />
      {[-1, 1].map(side => <group key={side}>
        <Panel size={[0.035, 0.1, 11.95]} at={[side * 1.303, 1.28, -2.35]} color="#81909e" />
        <Panel size={[0.035, 0.04, 11.9]} at={[side * 1.303, 3.94, -2.35]} color="#d8dfe5" />
        <Panel size={[0.06, 0.57, 5.6]} at={[side * 1.24, 0.91, -1.12]} color="#53616d" radius={0.02} />
        {[-7.7, -4.8, -1.9, 1, 3].map(z => <mesh key={z} position={[side * 1.325, 1.29, z]} rotation-y={Math.PI / 2}><planeGeometry args={[0.3, 0.05]} /><meshBasicMaterial color="#ffcd7b" side={DoubleSide} /></mesh>)}
      </group>)}
      <Panel size={[2.28, 2.52, 0.03]} at={[0, 2.6, -8.445]} color="#8997a3" radius={0.008} />
      <Panel size={[0.025, 2.48, 0.05]} at={[0, 2.6, -8.465]} color="#38434d" />
      <Panel size={[2.4, 0.12, 0.14]} at={[0, 0.55, -8.4]} color="#8795a1" />
    </group>
    <group onClick={pick('cab')}>
      <CabShell color={color} scan={scan} active={highlight === 'cab'} />
      <mesh position={[0, 2.985, 6.47]} rotation-x={-0.55}>
        <planeGeometry args={[2.03, 0.94]} /><meshStandardMaterial color="#102531" metalness={0.75} roughness={0.15} />
      </mesh>
      <mesh position={[0, 3.02, 6.49]} rotation-x={-0.55}><planeGeometry args={[0.035, 0.93]} /><meshStandardMaterial color="#73818e" /></mesh>
      {[-1, 1].map(side => <group key={side}>
        <SideWindow side={side} />
        <Panel size={[0.026, 0.025, 1.3]} at={[side * 1.18, 2.48, 5.28]} color="#5a6976" />
        <Panel size={[0.035, 0.09, 0.3]} at={[side * 1.193, 2.22, 4.92]} color="#273642" />
        <Panel size={[0.26, 0.1, 1.65]} at={[side * 1.09, 0.9, 5.18]} color="#8b99a5" />
        <Panel size={[0.23, 0.1, 1.4]} at={[side * 1.08, 0.63, 5.1]} color="#445460" />
        <Panel size={[0.08, 0.06, 0.7]} at={[side * 1.225, 2.6, 6.2]} color="#364653" />
        <Panel size={[0.16, 0.42, 0.25]} at={[side * 1.23, 2.8, 6.45]} color="#394955" radius={0.05} />
        <mesh position={[side * 0.87, 1.49, 8.475]} rotation-y={side * 0.17}><boxGeometry args={[0.42, 0.065, 0.025]} /><meshBasicMaterial color="#f0f7ff" /></mesh>
      </group>)}
      <Panel size={[1.03, 0.5, 0.09]} at={[0, 1.38, 8.50]} color="#1b2933" radius={0.045} />
      {Array.from({ length: 5 }, (_, i) => <Panel key={i} size={[0.86, 0.016, 0.012]} at={[0, 1.2 + i * 0.08, 8.552]} color="#546674" />)}
      <Panel size={[2.32, 0.23, 0.2]} at={[0, 0.92, 8.34]} color="#788894" radius={0.065} />
    </group>
    <group onClick={pick('compute')}>
      <Panel size={[1.7, 0.83, 0.38]} at={[0, 2.14, 3.79]} color="#293b49" scan={scan} active={highlight === 'compute'} radius={0.045} />
      {[-1, 1].map(side => <group key={side}>
        <Panel size={[0.19, 0.29, 0.42]} at={[side * 1.19, 3.35, 4.53]} color={highlight === 'compute' ? GOLD : '#384e60'} radius={0.07} />
        <mesh position={[side * 1.295, 3.36, 4.53]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.07, 0.07, 0.014, 16]} /><meshStandardMaterial color="#102430" metalness={0.75} roughness={0.12} /></mesh>
      </group>)}
    </group>
    <group position={[0, 3.86, 5.15]} onClick={pick('lidar')}>
      <mesh castShadow><cylinderGeometry args={[0.39, 0.48, 0.16, 32]} /><meshStandardMaterial color="#465869" metalness={0.65} roughness={0.26} /></mesh>
      <mesh position-y={0.15}><cylinderGeometry args={[0.34, 0.34, 0.22, 32]} /><meshStandardMaterial color="#132831" metalness={0.8} roughness={0.14} /></mesh>
      <mesh position-y={0.27}><cylinderGeometry args={[0.34, 0.35, 0.04, 32]} /><meshStandardMaterial color={highlight === 'lidar' ? GOLD : '#ced7df'} metalness={0.6} roughness={0.25} /></mesh>
      <mesh position-y={0.09}><cylinderGeometry args={[0.35, 0.35, 0.025, 32]} /><meshBasicMaterial color={GOLD} /></mesh>
    </group>
    {[-6.6, -5.3, 2.4, 3.65, 7.1].flatMap(z => [-1, 1].map(side => <Wheel key={`${z}-${side}`} z={z} side={side} />))}
    {scan && <mesh ref={band} position-y={2.1}><boxGeometry args={[2.75, 4.2, 0.065]} /><meshBasicMaterial color={GOLD} transparent opacity={0.28} depthWrite={false} depthTest={false} /></mesh>}
  </group>;
}
