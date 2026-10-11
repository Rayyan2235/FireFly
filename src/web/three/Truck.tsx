import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import type { Mesh } from 'three';

export type TruckPart = 'lidar' | 'compute' | 'cab' | 'trailer';
export interface TruckProps {
  color?: string;
  scan?: boolean;
  highlight?: TruckPart;
  onPartClick?: (part: TruckPart) => void;
  /** Disable continuous scan motion for reduced-motion contexts. */
  animate?: boolean;
}

type V3 = [number, number, number];
const GOLD = '#FFC93C';

function Body({ size, at, color, scan = false, active = false }: {
  size: V3; at: V3; color: string; scan?: boolean; active?: boolean;
}) {
  return <group position={at}>
    <mesh castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={active ? GOLD : color} metalness={0.45} roughness={0.4}
        transparent={scan} opacity={scan ? 0.22 : 1} depthWrite={!scan} />
    </mesh>
    {scan && <mesh scale={1.005}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={GOLD} wireframe transparent opacity={0.45} depthTest={false} />
    </mesh>}
  </group>;
}

/** Procedural 2.6 m × 17 m semi. Ground at y=0; cab faces +z at heading 0.
 * Place/rotate it with a parent group. No scene, DOM, asset or app-state dependencies.
 */
export function Truck({ color = '#c4ccd4', scan = false, highlight, onPartClick, animate = true }: TruckProps) {
  const band = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (band.current) band.current.position.z = animate ? (clock.elapsedTime * 3.4) % 17 - 8.5 : 3;
  });
  const pick = (part: TruckPart) => (event: ThreeEvent<MouseEvent>) => {
    if (onPartClick) { event.stopPropagation(); onPartClick(part); }
  };
  return <group>
    <Body size={[2.1, 0.28, 16]} at={[0, 0.95, -0.2]} color="#262c33" scan={scan} />
    <group onClick={pick('trailer')}>
      <Body size={[2.6, 2.9, 12.3]} at={[0, 2.62, -2.35]} color={color} scan={scan} active={highlight === 'trailer'} />
      {[-1, 1].map(side => <group key={side}>
        <Body size={[0.025, 0.085, 12]} at={[side * 1.315, 1.35, -2.35]} color="#d9dee3" />
        <Body size={[0.03, 0.035, 11.9]} at={[side * 1.315, 3.92, -2.35]} color="#89939d" />
        {Array.from({ length: 12 }, (_, i) => <Body key={i} size={[0.035, 2.5, 0.025]} at={[side * 1.31, 2.65, -7.8 + i]} color="#9aa4ae" />)}
      </group>)}
    </group>
    <group onClick={pick('cab')}>
      <Body size={[2.4, 2.65, 2.7]} at={[0, 2.27, 5.45]} color={color} scan={scan} active={highlight === 'cab'} />
      <Body size={[2.35, 1.05, 1.65]} at={[0, 1.5, 7.65]} color={color} scan={scan} active={highlight === 'cab'} />
      <Body size={[2.17, 0.85, 0.06]} at={[0, 2.75, 6.82]} color="#15242e" scan={scan} />
      {[-1, 1].map(side => <group key={side}>
        <Body size={[0.045, 0.83, 1.6]} at={[side * 1.22, 2.75, 5.65]} color="#15242e" scan={scan} />
        <Body size={[0.18, 0.09, 0.45]} at={[side * 1.25, 2.12, 5.05]} color="#262c33" />
        <Body size={[0.16, 0.35, 0.4]} at={[side * 1.25, 2.75, 6.6]} color="#202830" />
        <Body size={[0.32, 0.16, 1.9]} at={[side * 1.1, 0.83, 5.45]} color="#8b949e" />
        <mesh position={[side * 0.88, 1.59, 8.485]}>
          <boxGeometry args={[0.44, 0.14, 0.03]} /><meshBasicMaterial color="#fff0c8" />
        </mesh>
      </group>)}
      <Body size={[1.1, 0.65, 0.06]} at={[0, 1.48, 8.49]} color="#1c2229" />
      <Body size={[2.45, 0.2, 0.16]} at={[0, 0.94, 8.42]} color="#939da7" />
    </group>
    <group onClick={pick('compute')}>
      <Body size={[1.75, 0.95, 0.5]} at={[0, 2.15, 3.82]} color="#29343f" scan={scan} active={highlight === 'compute'} />
      {[-1, 1].map(side => <Body key={side} size={[0.16, 0.34, 0.55]} at={[side * 1.25, 3.05, 4.65]} color={highlight === 'compute' ? GOLD : '#3f505e'} scan={scan} />)}
    </group>
    <group position={[0, 3.82, 5.4]} onClick={pick('lidar')}>
      <mesh castShadow><cylinderGeometry args={[0.42, 0.48, 0.25, 24]} />
        <meshStandardMaterial color={highlight === 'lidar' ? GOLD : '#e0e5e9'} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position-y={0.12}><cylinderGeometry args={[0.38, 0.38, 0.11, 24]} /><meshBasicMaterial color={GOLD} /></mesh>
    </group>
    {[-6.6, -5.3, 2.45, 3.65, 7.1].flatMap(z => [-1, 1].map(side =>
      <group key={`${z}-${side}`} position={[side * 1.08, 0.61, z]} rotation-z={Math.PI / 2}>
        <mesh castShadow><cylinderGeometry args={[0.61, 0.61, 0.42, 16]} /><meshStandardMaterial color="#111519" roughness={0.95} /></mesh>
        <mesh position-y={side * -0.225}><cylinderGeometry args={[0.32, 0.32, 0.025, 12]} /><meshStandardMaterial color="#737d89" metalness={0.8} roughness={0.35} /></mesh>
      </group>))}
    {scan && <mesh ref={band} position-y={2.1}>
      <boxGeometry args={[2.75, 4.15, 0.065]} />
      <meshBasicMaterial color={GOLD} transparent opacity={0.38} depthWrite={false} depthTest={false} />
    </mesh>}
  </group>;
}
