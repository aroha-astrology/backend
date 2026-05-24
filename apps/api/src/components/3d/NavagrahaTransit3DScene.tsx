'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { Scene3DProvider } from './Scene3DProvider';
import { Stars3D } from './Stars3D';
import { PLANET_META, type NavagrahaPlanetPos } from './NavagrahaTransit3D';

const PLANET_ORDER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'] as const;

function OrbitRing({ radius, opacity = 0.18 }: { radius: number; opacity?: number }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.007, 8, 128]} />
      <meshBasicMaterial color="#F2CA50" transparent opacity={opacity} />
    </mesh>
  );
}

function CentralEarth() {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => { if (ref.current) ref.current.rotation.y += delta * 0.15; });
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.55, 48, 48]} />
        <meshStandardMaterial color="#3B6B9B" emissive="#1A3A5E" emissiveIntensity={0.35} roughness={0.55} metalness={0.25} />
      </mesh>
      {/* Soft halo */}
      <mesh>
        <sphereGeometry args={[0.72, 32, 32]} />
        <meshBasicMaterial color="#5DA3E0" transparent opacity={0.08} />
      </mesh>
    </group>
  );
}

function Planet({
  name,
  startAngle,
  retrograde,
}: { name: string; startAngle: number; retrograde?: boolean }) {
  const meta = PLANET_META[name] ?? PLANET_META.Sun;
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      const dir = retrograde ? -1 : 1;
      const t = startAngle + state.clock.elapsedTime * meta.speed * dir;
      groupRef.current.position.x = Math.cos(t) * meta.orbit;
      groupRef.current.position.z = Math.sin(t) * meta.orbit;
    }
    if (meshRef.current) meshRef.current.rotation.y += 0.01;
  });

  const meshRadius = meta.size / 80; // map fallback px → world

  return (
    <group ref={groupRef}>
      <group ref={meshRef}>
        <mesh>
          <sphereGeometry args={[meshRadius, 32, 32]} />
          <meshStandardMaterial
            color={meta.color}
            emissive={meta.color}
            emissiveIntensity={meta.emissive ?? 0.4}
            roughness={0.35}
            metalness={0.6}
          />
        </mesh>
        {/* Saturn gets a ring */}
        {name === 'Saturn' && (
          <mesh rotation={[Math.PI / 2.2, 0, 0]}>
            <torusGeometry args={[meshRadius * 1.6, 0.015, 12, 64]} />
            <meshBasicMaterial color={meta.color} transparent opacity={0.55} />
          </mesh>
        )}
        {/* Sun gets an extra corona */}
        {name === 'Sun' && (
          <mesh>
            <sphereGeometry args={[meshRadius * 1.35, 24, 24]} />
            <meshBasicMaterial color={meta.color} transparent opacity={0.12} />
          </mesh>
        )}
      </group>
    </group>
  );
}

interface SceneProps { planets?: NavagrahaPlanetPos[] }

export function NavagrahaTransit3DScene({ planets }: SceneProps) {
  return (
    <Scene3DProvider cameraPosition={[0, 5.5, 8]}>
      <ambientLight intensity={0.55} />
      <pointLight position={[6, 6, 6]} intensity={1.2} color="#F2CA50" />
      <pointLight position={[-6, -3, 3]} intensity={0.4} color="#9050E0" />
      <Stars3D count={600} radius={20} size={0.025} />

      {/* Concentric zodiac rings */}
      {[1.6, 2.7, 3.8, 4.9, 6.0].map((r, i) => (
        <OrbitRing key={r} radius={r} opacity={0.10 + 0.05 * (i % 2)} />
      ))}

      <CentralEarth />

      {PLANET_ORDER.map((name, i) => {
        const p = planets?.find(x => x.planet === name);
        const startAngle = ((p?.longitude ?? i * 40) * Math.PI) / 180;
        return <Planet key={name} name={name} startAngle={startAngle} retrograde={p?.isRetrograde} />;
      })}
    </Scene3DProvider>
  );
}
