import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Locally generated softbox reflections, without a remote HDR dependency. */
export function YardLighting({ fog = true }: { fog?: boolean }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const generator = new PMREMGenerator(gl), room = new RoomEnvironment();
    const target = generator.fromScene(room, .04), previous = scene.environment;
    scene.environment = target.texture; scene.environmentIntensity = .65;
    return () => { scene.environment = previous; target.dispose(); room.dispose(); generator.dispose(); };
  }, [gl, scene]);
  return <>
    <color attach="background" args={['#e7ebe5']} />
    {fog && <fog attach="fog" args={['#e7ebe5',75,185]} />}
    <hemisphereLight args={['#f3f7ff','#a6ae98',1.5]} />
    <directionalLight position={[-22,38,18]} intensity={3.1} color="#fff3df" castShadow shadow-mapSize={[2048,2048]} shadow-bias={-.0003} shadow-normalBias={.03}>
      <orthographicCamera attach="shadow-camera" args={[-55,55,45,-45,1,150]} />
    </directionalLight>
  </>;
}

/** Yard-specific background detail: poured slabs, perimeter rails and dock infrastructure. */
export function YardGround() {
  return <group>
    <mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[300,300]} /><meshStandardMaterial color="#c6cec4" roughness={.95} /></mesh>
    <mesh position={[0,.008,5]} rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[86,72]} /><meshStandardMaterial color="#aab6b0" roughness={.92} /></mesh>
    <mesh position={[0,.016,-10]} rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[60,20]} /><meshStandardMaterial color="#d0d5c9" roughness={.92} /></mesh>
    {Array.from({length:11},(_,i)=><mesh key={i} position={[-40+i*8,.025,5]} rotation-x={-Math.PI/2}><planeGeometry args={[.022,72]} /><meshBasicMaterial color="#879a93" /></mesh>)}
    {Array.from({length:9},(_,i)=><mesh key={i} position={[0,.026,-30+i*8]} rotation-x={-Math.PI/2}><planeGeometry args={[86,.022]} /><meshBasicMaterial color="#879a93" /></mesh>)}
    {Array.from({length:12},(_,i)=><mesh key={i} position={[-39+i*7,.03,16]} rotation-x={-Math.PI/2}><planeGeometry args={[3,.11]} /><meshBasicMaterial color="#e8ebd7" /></mesh>)}
    {[-44,44].map(x=><group key={x}>
      <mesh position={[x,.12,0]} receiveShadow><boxGeometry args={[.35,.24,80]} /><meshStandardMaterial color="#d7ddd0" /></mesh>
      {[-34,-18,-2,14,30].map(z=><group key={z} position={[x,0,z]}>
        <mesh position-y={4.5} castShadow><cylinderGeometry args={[.07,.11,9,12]} /><meshStandardMaterial color="#637976" metalness={.4} roughness={.4} /></mesh>
        <mesh position={[x>0?-.55:.55,9,0]}><boxGeometry args={[1.3,.12,.3]} /><meshStandardMaterial color="#566e6b" /></mesh>
      </group>)}
    </group>)}
    {[-52,52].map(x=><group key={x}>
      {[-39,-20,0,20,40].map(z=><mesh key={z} position={[x,1.4,z]}><boxGeometry args={[.08,2.8,.08]} /><meshStandardMaterial color="#688179" /></mesh>)}
      {[.7,1.4,2.1].map(y=><mesh key={y} position={[x,y,0]}><boxGeometry args={[.045,.04,80]} /><meshStandardMaterial color="#8fa399" /></mesh>)}
    </group>)}
  </group>;
}
