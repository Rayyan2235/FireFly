import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BufferGeometry, Float32BufferAttribute, DoubleSide } from 'three';
import type { Mesh } from 'three';

export type TruckPart = 'lidar' | 'rear' | 'compute' | 'cab' | 'trailer';
export interface TruckProps { color?: string; scan?: boolean; highlight?: TruckPart; onPartClick?: (part: TruckPart) => void; animate?: boolean; detail?: boolean }
type V3 = [number, number, number];
const ACCENT = '#0081c0';
export const REAR_SENSOR: V3 = [0, 1.75, -8.57];

function Panel({ size, at, color, radius = 0.04 }: { size: V3; at: V3; color: string; radius?: number }) {
  const [w, h, d] = size;
  const geometry = useMemo(() => new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 3, h / 3, d / 3)), [w, h, d, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={at} castShadow receiveShadow><meshStandardMaterial color={color} metalness={0.35} roughness={0.32} /></mesh>;
}

// Rounded cross sections produce a curved roof, tapered shoulders and a swept nose.
// Original geometry, not a reproduction or redistribution of a commercial truck asset.
function bodyGeometry(rings: number[][]) {
  const points: number[] = [], indices: number[] = [], count = 40;
  for (const [z, halfWidth, bottom, top] of rings) {
    for (let j = 0; j < count; j++) {
      const a = j / count * Math.PI * 2;
      const s = Math.sin(a), c = Math.cos(a);
      points.push(Math.sign(s) * Math.pow(Math.abs(s), 0.36) * halfWidth, (bottom + top) / 2 + Math.sign(c) * Math.pow(Math.abs(c), 0.36) * (top - bottom) / 2, z);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < count; j++) {
    const a = i * count + j, b = i * count + (j + 1) % count, c = b + count, d = a + count;
    indices.push(a, b, d, b, c, d);
  }
  for (const end of [0, rings.length - 1]) {
    const [z, , bottom, top] = rings[end], center = points.length / 3;
    points.push(0, (bottom + top) / 2, z);
    for (let j = 0; j < count; j++) { const a = end * count + j, b = end * count + (j + 1) % count; indices.push(...(end === 0 ? [center, b, a] : [center, a, b])); }
  }
  const geo = new BufferGeometry(); geo.setAttribute('position', new Float32BufferAttribute(points, 3)); geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}
function Body({ color, active }: { color: string; active: boolean }) {
  const cab = useMemo(() => bodyGeometry([[3.94,.98,1.22,3.5],[4.08,1.12,1.1,3.7],[4.5,1.14,1.08,3.82],[5.35,1.13,1.08,3.79],[5.7,1.1,1.08,3.63],[6.08,1.07,1.12,3.12],[6.48,1.03,1.2,2.42],[6.65,.96,1.28,2.12]]), []);
  const hood = useMemo(() => bodyGeometry([[6.25,.98,1.28,2.16],[6.65,1.04,1.29,2.14],[7.25,1.01,1.29,2.02],[7.95,.92,1.26,1.85],[8.35,.84,1.22,1.66],[8.5,.77,1.2,1.55]]), []);
  useEffect(() => () => { cab.dispose(); hood.dispose(); }, [cab, hood]);
  return <>{[cab, hood].map((geometry, i) => <mesh key={i} geometry={geometry} castShadow receiveShadow><meshPhysicalMaterial color={color} metalness={0.5} roughness={0.27} clearcoat={0.8} clearcoatRoughness={0.2} emissive={active ? ACCENT : '#000'} emissiveIntensity={0.12} side={DoubleSide} /></mesh>)}</>;
}
function Glass({ points }: { points: number[] }) {
  const geometry = useMemo(() => { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(points, 3)); g.setIndex([0,1,2,0,2,3]); g.computeVertexNormals(); return g; }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}><meshPhysicalMaterial color="#183841" metalness={0.6} roughness={0.12} clearcoat={1} side={DoubleSide} /></mesh>;
}
function Wheel({ side, z, detail }: { side: number; z: number; detail: boolean }) {
  return <group position={[side * 1.12, 0.61, z]} rotation-z={Math.PI / 2}>
    <mesh castShadow><cylinderGeometry args={[0.61,0.61,0.32,32]} /><meshStandardMaterial color="#252b2c" roughness={0.95} /></mesh>
    <mesh position-y={side * -0.18}><cylinderGeometry args={[0.38,0.38,0.06,32]} /><meshStandardMaterial color="#bac4c5" metalness={0.85} roughness={0.22} /></mesh>
    {detail && <><mesh position-y={side * -0.22}><cylinderGeometry args={[0.16,0.16,0.12,16]} /><meshStandardMaterial color="#59666a" metalness={0.8} roughness={0.25} /></mesh>
      {Array.from({length:8},(_,i)=><mesh key={i} position={[Math.cos(i*Math.PI/4)*.27,side*-.218,Math.sin(i*Math.PI/4)*.27]}><sphereGeometry args={[.038,8,6]} /><meshStandardMaterial color="#344248" /></mesh>)}</>}
  </group>;
}
function Sensor({ at, active = false }: { at: V3; active?: boolean }) {
  return <group position={at}>
    <mesh castShadow><cylinderGeometry args={[.22,.28,.13,32]} /><meshStandardMaterial color="#344549" metalness={.6} roughness={.3} /></mesh>
    <mesh position-y={.13}><cylinderGeometry args={[.205,.205,.18,32]} /><meshPhysicalMaterial color="#122e35" roughness={.12} metalness={.6} clearcoat={1} /></mesh>
    <mesh position-y={.23}><cylinderGeometry args={[.21,.22,.035,32]} /><meshStandardMaterial color={active ? ACCENT : '#d5dedc'} /></mesh>
  </group>;
}
function RearScan({ animate }: { animate: boolean }) {
  const fan = useRef<Mesh>(null);
  const geometry = useMemo(() => { const g = new BufferGeometry(); g.setAttribute('position',new Float32BufferAttribute([0,1.75,-8.62,-2.8,.08,-14.5,2.8,.08,-14.5],3)); g.setIndex([0,1,2]); g.computeVertexNormals(); return g; },[]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({clock}) => { if (fan.current) { const material = fan.current.material as import('three').MeshBasicMaterial; material.opacity = animate ? .1 + Math.sin(clock.elapsedTime*2)*.035 : .12; } });
  return <group>
    <mesh geometry={geometry} ref={fan}><meshBasicMaterial color={ACCENT} transparent opacity={.12} side={DoubleSide} depthWrite={false} /></mesh>
    {[1.4,2.8,4.2].map(r=><mesh key={r} position={[0,.06,-8.62]} rotation-x={-Math.PI/2} rotation-z={Math.PI/2-.5}><ringGeometry args={[r,r+.035,36,1,0,1]} /><meshBasicMaterial color={ACCENT} transparent opacity={.65} side={DoubleSide} depthWrite={false} /></mesh>)}
  </group>;
}

/** Original articulated semi. Ground y=0; cab forward +z; rear sensing faces -z. */
export function Truck({color='#dbe6e2',scan=false,highlight,onPartClick,animate=true,detail=true}:TruckProps) {
  const pick=(part:TruckPart)=>(event:ThreeEvent<MouseEvent>)=>{if(onPartClick){event.stopPropagation();onPartClick(part);}};
  return <group>
    <Panel size={[1.65,.22,15.8]} at={[0,.91,-.25]} color="#354246" />
    <group onClick={pick('trailer')}>
      <Panel size={[2.6,2.83,12.15]} at={[0,2.62,-2.35]} color="#edf0e9" radius={.09} />
      {[-1,1].map(side=><group key={side}>
        <Panel size={[.04,.13,12]} at={[side*1.31,1.27,-2.35]} color="#8d9c9b" />
        <Panel size={[.045,.05,12]} at={[side*1.3,3.98,-2.35]} color="#c7d1cc" />
        <Panel size={[.08,.55,5.5]} at={[side*1.23,.98,-1.2]} color="#c2ceca" />
        {detail && <>{Array.from({length:15},(_,i)=><Panel key={i} size={[.012,2.59,.014]} at={[side*1.307,2.62,-7.95+i*.79]} color="#c5cfca" />)}
          {[-7.7,-4.8,-1.9,1,3].map(z=><Panel key={z} size={[.03,.06,.28]} at={[side*1.335,1.28,z]} color="#d99c4c" />)}</>}
      </group>)}
      <Panel size={[2.34,2.52,.045]} at={[0,2.62,-8.445]} color="#d2dad4" />
      {[-.56,.56].map(x=><Panel key={x} size={[.035,2.35,.04]} at={[x,2.62,-8.49]} color="#7c8d8e" />)}
      <Panel size={[.018,2.51,.045]} at={[0,2.62,-8.48]} color="#566564" />
      <Panel size={[2.5,.14,.16]} at={[0,.52,-8.43]} color="#809291" />
      {[-1,1].map(side=><Panel key={side} size={[.32,.12,.03]} at={[side*.91,1.07,-8.52]} color="#ae4b3d" />)}
    </group>
    <group onClick={pick('cab')}>
      <Body color={color} active={highlight==='cab'} />
      <Glass points={[-.94,3.51,5.94,.94,3.51,5.94,.91,2.6,6.55,-.91,2.6,6.55]} />
      {[-1,1].map(side=><group key={side}>
        <Glass points={[side*1.145,2.48,4.98,side*1.137,3.38,4.98,side*1.119,3.39,5.52,side*1.09,2.48,6.19]} />
        <Panel size={[.15,.45,.26]} at={[side*1.35,2.88,6.07]} color="#35484b" radius={.07} />
        <Panel size={[.3,.055,.1]} at={[side*1.19,2.72,6.08]} color="#55686a" />
        <Panel size={[.09,.09,.29]} at={[side*1.14,2.26,5.1]} color="#516665" />
        <Panel size={[.26,.12,1.6]} at={[side*1.1,.93,5.24]} color="#9eaead" />
        <Panel size={[.22,.1,1.34]} at={[side*1.12,.65,5.2]} color="#4b6062" />
        <mesh position={[side*1.115,.61,7.16]} rotation-y={Math.PI/2}><torusGeometry args={[.685,.095,8,32,Math.PI]} /><meshStandardMaterial color={color} metalness={.4} roughness={.3} /></mesh>
        <Panel size={[.44,.075,.035]} at={[side*.78,1.44,8.45]} color="#e8f5f3" />
      </group>)}
      <Panel size={[1.06,.42,.1]} at={[0,1.43,8.49]} color="#293b3c" radius={.05} />
      {detail && [0,1,2,3].map(i=><Panel key={i} size={[.88,.022,.012]} at={[0,1.29+i*.085,8.547]} color="#7e9393" />)}
      <Panel size={[2.14,.2,.22]} at={[0,1.02,8.33]} color={color} radius={.065} />
    </group>
    <group onClick={pick('compute')}><Panel size={[.25,.8,.7]} at={[1.15,2.23,4.24]} color={highlight==='compute'?ACCENT:'#33494a'} radius={.06} /></group>
    <group onClick={pick('lidar')}><Panel size={[1.64,.1,.42]} at={[0,3.85,5.1]} color="#596f70" /><Sensor at={[0,3.94,5.1]} active={highlight==='lidar'} />
      {[-1,1].map(side=><Sensor key={side} at={[side*1.19,3.49,4.5]} />)}</group>
    <group onClick={pick('rear')}><Panel size={[.55,.27,.13]} at={REAR_SENSOR} color={highlight==='rear'?ACCENT:'#273f42'} radius={.06} />
      <mesh position={[0,1.76,-8.65]}><sphereGeometry args={[.075,16,12]} /><meshPhysicalMaterial color="#15343c" metalness={.7} roughness={.1} /></mesh></group>
    {[-6.6,-5.3,2.3,3.6,7.16].flatMap(z=>[-1,1].map(side=><Wheel key={`${z}-${side}`} z={z} side={side} detail={detail} />))}
    {scan && <RearScan animate={animate} />}
  </group>;
}
