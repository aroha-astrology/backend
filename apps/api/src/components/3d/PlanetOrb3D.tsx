'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

interface PlanetOrbProps {
  /** Hex color or three-compatible color. Defaults to cosmic gold. */
  color?: string;
  /** Sphere radius (world units). */
  radius?: number;
  position?: [number, number, number];
  /** Rotation speed multiplier. Defaults to 1. */
  speed?: number;
  /** Add a glow ring around the orb. */
  glow?: boolean;
  emissiveIntensity?: number;
}

/**
 * A reusable planetary orb mesh — used as the visual proxy for Navagraha planets,
 * the auth-screen hero, gemstone previews, etc. Self-rotates and gently bobs.
 */
export function PlanetOrb3D({
  color = '#D4AF37',
  radius = 1,
  position = [0, 0, 0],
  speed = 1,
  glow = true,
  emissiveIntensity = 0.4,
}: PlanetOrbProps) {
  const ref = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.4 * speed;
      ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.6) * 0.08;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.15 * speed;
    }
  });

  return (
    <group position={position}>
      <mesh ref={ref}>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          roughness={0.35}
          metalness={0.7}
        />
      </mesh>
      {glow && (
        <mesh ref={ringRef}>
          <torusGeometry args={[radius * 1.55, 0.02, 16, 96]} />
          <meshBasicMaterial color={color} transparent opacity={0.55} />
        </mesh>
      )}
      {glow && (
        <mesh>
          <sphereGeometry args={[radius * 1.18, 24, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.06} />
        </mesh>
      )}
    </group>
  );
}
