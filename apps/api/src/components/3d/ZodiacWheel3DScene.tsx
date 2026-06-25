'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Group, Mesh } from 'three';
import { Scene3DProvider } from './Scene3DProvider';
import { Stars3D } from './Stars3D';
import { PLANET_VISUAL, type PlanetKey } from './planet-registry';
import { getPlanetTexture } from './procedural-planet-textures';

interface Orbit {
  key: PlanetKey;
  size: number;
  radius: number;
  speed: number;
  phase: number;
  axialTilt: number;
}

// Rahu & Ketu move RETROGRADE (negative speed) and are always 180° apart
const ORBITS: readonly Orbit[] = [
  { key: 'Mercury', size: 0.20, radius: 4.0,  speed:  0.42, phase: 0.2,           axialTilt: 0.05 },
  { key: 'Venus',   size: 0.27, radius: 5.0,  speed:  0.34, phase: 1.1,           axialTilt: 0.12 },
  { key: 'Moon',    size: 0.24, radius: 5.8,  speed:  0.28, phase: 2.3,           axialTilt: 0.2  },
  { key: 'Mars',    size: 0.26, radius: 6.5,  speed:  0.23, phase: 3.6,           axialTilt: 0.32 },
  { key: 'Jupiter', size: 0.48, radius: 7.0,  speed:  0.17, phase: 4.9,           axialTilt: 0.05 },
  { key: 'Saturn',  size: 0.41, radius: 7.6,  speed:  0.13, phase: 5.7,           axialTilt: 0.46 },
  { key: 'Rahu',    size: 0.32, radius: 8.2,  speed: -0.07, phase: 1.6,           axialTilt: 0.0  },
  { key: 'Ketu',    size: 0.32, radius: 8.2,  speed: -0.07, phase: 1.6 + Math.PI, axialTilt: 0.0  },
] as const;

function OrbitRing({ radius }: { radius: number }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.006, 12, 160]} />
      <meshBasicMaterial color="#B8D4E8" transparent opacity={0.10} />
    </mesh>
  );
}

function CentralSun() {
  const ref = useRef<Mesh>(null);
  const texture = useMemo(() => getPlanetTexture('Sun'), []);

  useFrame((_s, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.12;
  });

  return (
    <group>
      <mesh ref={ref} onClick={(e) => e.stopPropagation()}>
        <sphereGeometry args={[2.5, 128, 128]} />
        <meshStandardMaterial
          map={texture ?? undefined}
          emissiveMap={texture ?? undefined}
          color={texture ? '#FFFFFF' : '#F2CA50'}
          emissive={texture ? '#FFFFFF' : '#F2CA50'}
          emissiveIntensity={texture ? 0.85 : 1.1}
          roughness={0.6}
          metalness={0.0}
        />
      </mesh>
      {/* Single subtle limb glow */}
      <mesh>
        <sphereGeometry args={[2.5 * 1.05, 32, 32]} />
        <meshBasicMaterial color="#FFB347" transparent opacity={0.10} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

interface PlanetProps {
  orbit: Orbit;
  selected: boolean;
  onSelect: (key: PlanetKey | null) => void;
}

// Target front-facing position (closest point to camera on the orbit)
const FRONT = new THREE.Vector3(0, 0, 1);

function Planet({ orbit, selected, onSelect }: PlanetProps) {
  const v = PLANET_VISUAL[orbit.key];
  const pivotRef = useRef<Group>(null);
  const planetRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const texture = useMemo(() => getPlanetTexture(orbit.key), [orbit.key]);
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const isRahu = orbit.key === 'Rahu';
  const isKetu = orbit.key === 'Ketu';

  useFrame((state, delta) => {
    if (!pivotRef.current) return;

    if (selectedRef.current) {
      // Glide to front of orbit (facing camera)
      const target = FRONT.clone().multiplyScalar(orbit.radius);
      pivotRef.current.position.lerp(target, delta * 4);
      return;
    }

    const angle = orbit.phase + state.clock.elapsedTime * orbit.speed;
    pivotRef.current.position.set(
      Math.cos(angle) * orbit.radius,
      0,
      Math.sin(angle) * orbit.radius,
    );
    if (planetRef.current) planetRef.current.rotation.y += delta * 0.4;
    if (ringRef.current) ringRef.current.rotation.z += delta * 0.05;
  });

  const s = orbit.size;

  return (
    <group ref={pivotRef}>
      <group rotation={[orbit.axialTilt, 0, 0]}>

        {/* ── RAHU — Serpent HEAD ─────────────────────────────── */}
        {isRahu && (
          <group>
            {/* Head sphere */}
            <mesh
              ref={planetRef}
              onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : orbit.key); }}
            >
              <sphereGeometry args={[s, 48, 48]} />
              <meshStandardMaterial
                map={texture ?? undefined}
                color={texture ? '#FFFFFF' : v.color}
                emissive={v.color}
                emissiveIntensity={selected ? 0.7 : 0.35}
                roughness={0.7}
                metalness={0.2}
                transparent
                opacity={0.9}
              />
            </mesh>
            {/* Cobra hood — flared torus arc spreading upward */}
            <mesh rotation={[0, 0, 0]}>
              <torusGeometry args={[s * 1.4, s * 0.08, 8, 28, Math.PI * 1.6]} />
              <meshBasicMaterial color="#AA22EE" transparent opacity={0.85} />
            </mesh>
            {/* Hood inner highlight */}
            <mesh rotation={[0, 0, 0]}>
              <torusGeometry args={[s * 1.2, s * 0.04, 6, 24, Math.PI * 1.4]} />
              <meshBasicMaterial color="#DD88FF" transparent opacity={0.5} />
            </mesh>
            {/* Left eye glow */}
            <mesh position={[-s * 0.26, s * 0.18, s * 0.92]}>
              <sphereGeometry args={[s * 0.11, 8, 8]} />
              <meshBasicMaterial color="#FF1515" />
            </mesh>
            {/* Right eye glow */}
            <mesh position={[s * 0.26, s * 0.18, s * 0.92]}>
              <sphereGeometry args={[s * 0.11, 8, 8]} />
              <meshBasicMaterial color="#FF1515" />
            </mesh>
            {/* Fang left */}
            <mesh position={[-s * 0.15, -s * 0.32, s * 0.88]} rotation={[0.3, 0, -0.2]}>
              <coneGeometry args={[s * 0.05, s * 0.28, 5]} />
              <meshBasicMaterial color="#EEDDFF" transparent opacity={0.8} />
            </mesh>
            {/* Fang right */}
            <mesh position={[s * 0.15, -s * 0.32, s * 0.88]} rotation={[0.3, 0, 0.2]}>
              <coneGeometry args={[s * 0.05, s * 0.28, 5]} />
              <meshBasicMaterial color="#EEDDFF" transparent opacity={0.8} />
            </mesh>
            {/* Ghost aura */}
            <mesh>
              <sphereGeometry args={[s * 1.5, 24, 24]} />
              <meshBasicMaterial color={v.color} transparent opacity={0.15} />
            </mesh>
          </group>
        )}

        {/* ── KETU — Serpent TAIL ─────────────────────────────── */}
        {isKetu && (
          <group>
            {/* Body sphere */}
            <mesh
              ref={planetRef}
              onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : orbit.key); }}
            >
              <sphereGeometry args={[s, 48, 48]} />
              <meshStandardMaterial
                map={texture ?? undefined}
                color={texture ? '#FFFFFF' : v.color}
                emissive={v.color}
                emissiveIntensity={selected ? 0.7 : 0.35}
                roughness={0.7}
                metalness={0.2}
                transparent
                opacity={0.9}
              />
            </mesh>
            {/* Primary tail cone — extending down-right */}
            <mesh position={[s * 0.3, -s * 1.5, 0]} rotation={[0, 0, -0.4]}>
              <coneGeometry args={[s * 0.42, s * 2.8, 10]} />
              <meshBasicMaterial color="#E0506B" transparent opacity={0.60} />
            </mesh>
            {/* Secondary thin tail tip */}
            <mesh position={[s * 0.55, -s * 3.1, 0]} rotation={[0, 0, -0.4]}>
              <coneGeometry args={[s * 0.18, s * 1.6, 8]} />
              <meshBasicMaterial color="#FF8080" transparent opacity={0.35} />
            </mesh>
            {/* Ghost aura */}
            <mesh>
              <sphereGeometry args={[s * 1.5, 24, 24]} />
              <meshBasicMaterial color={v.color} transparent opacity={0.15} />
            </mesh>
          </group>
        )}

        {/* ── NORMAL PLANETS ──────────────────────────────────── */}
        {!isRahu && !isKetu && (
          <mesh
            ref={planetRef}
            onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : orbit.key); }}
          >
            <sphereGeometry args={[s, 48, 48]} />
            <meshStandardMaterial
              map={texture ?? undefined}
              color={texture ? '#FFFFFF' : v.color}
              emissive={v.color}
              emissiveIntensity={selected ? 0.7 : v.emissive * 0.35}
              roughness={0.6}
              metalness={0.4}
            />
          </mesh>
        )}

        {/* Saturn / Jupiter rings */}
        {v.ringed && (
          <>
            <mesh ref={ringRef} rotation={[Math.PI / 2.3, 0, 0]}>
              <ringGeometry args={[s * 1.45, s * 2.2, 96]} />
              <meshBasicMaterial
                color={v.color}
                transparent
                opacity={orbit.key === 'Saturn' ? 0.65 : 0.32}
                side={THREE.DoubleSide}
              />
            </mesh>
            {orbit.key === 'Saturn' && (
              <mesh rotation={[Math.PI / 2.3, 0, 0]}>
                <ringGeometry args={[s * 2.25, s * 2.45, 96]} />
                <meshBasicMaterial color="#E8CB95" transparent opacity={0.35} side={THREE.DoubleSide} />
              </mesh>
            )}
          </>
        )}

      </group>
    </group>
  );
}

function SceneContent({
  selected,
  onSelect,
}: {
  selected: PlanetKey | null;
  onSelect: (k: PlanetKey | null) => void;
}) {
  const { size } = useThree();
  const isMobile = size.width < 560;
  const scale = isMobile ? 0.82 : 1;
  const offsetX = isMobile ? 0 : 1.5;

  return (
    <group position={[offsetX, 0, 0]} scale={[scale, scale, scale]}>
      {ORBITS.map((o) => (
        <OrbitRing key={`ring-${o.key}`} radius={o.radius} />
      ))}
      <CentralSun />
      {ORBITS.map((o) => (
        <Planet
          key={o.key}
          orbit={o}
          selected={selected === o.key}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

interface ZodiacWheel3DSceneProps {
  selected?: PlanetKey | null;
  onSelect?: (k: PlanetKey | null) => void;
}

export function ZodiacWheel3DScene({ selected = null, onSelect }: ZodiacWheel3DSceneProps) {
  const handleSelect = (k: PlanetKey | null) => onSelect?.(k);

  return (
    <Scene3DProvider cameraPosition={[0, 0.8, 10]}>
      <ambientLight intensity={0.30} color="#9BBDCC" />
      <directionalLight position={[8, 3, 5]} intensity={1.2} color="#E8F4FF" />
      <pointLight position={[-8, 2, -3]} intensity={0.4} color="#3060A0" distance={30} decay={1.5} />
      <Stars3D count={700} radius={28} size={0.025} color="#D0E8FF" />
      {/* Invisible backdrop — clicking empty space deselects */}
      <mesh onClick={() => handleSelect(null)} visible={false}>
        <sphereGeometry args={[25, 6, 6]} />
        <meshBasicMaterial side={THREE.BackSide} />
      </mesh>
      <SceneContent selected={selected} onSelect={handleSelect} />
    </Scene3DProvider>
  );
}
