'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import {
  AdditiveBlending,
  DoubleSide,
  MathUtils,
  type Group,
  type Mesh,
} from 'three';
import type { CardElement, Orientation } from '@/lib/tarot/deck';

interface TarotCardMeshProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  element: CardElement;
  orientation: Orientation;
  isRevealed: boolean;
  isHighlighted?: boolean;
  delaySeconds?: number;
}

/**
 * A single 3D tarot card.
 * - Obsidian body, gold filigree border, central element glyph on the front
 * - Gold mandala on the back
 * - Smooth Y-rotation to flip between back and front
 * - Reversed cards rotate 180° around Z when face-up
 * - Idle hover with a gentle Y-bob; gold halo when highlighted
 */
export function TarotCardMesh({
  position,
  rotation = [0, 0, 0],
  element,
  orientation,
  isRevealed,
  isHighlighted = false,
  delaySeconds = 0,
}: TarotCardMeshProps) {
  const group = useRef<Group>(null);
  const haloRef = useRef<Mesh>(null);
  const targetRotY = isRevealed ? Math.PI : 0;
  const targetRotZ = isRevealed && orientation === 'Reversed' ? Math.PI : 0;
  const baseY = position[1];

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (!group.current) return;

    if (t < delaySeconds) return; // staggered reveal

    // Ease toward target rotations.
    group.current.rotation.y = MathUtils.damp(group.current.rotation.y, targetRotY, 3, delta);
    group.current.rotation.z = MathUtils.damp(group.current.rotation.z, targetRotZ, 3, delta);

    // Idle bob.
    group.current.position.y = baseY + Math.sin(t * 0.9 + position[0]) * 0.04;

    // Halo pulse when highlighted.
    if (haloRef.current) {
      const target = isHighlighted ? 0.45 : 0.15;
      const pulse = isHighlighted ? 0.08 * Math.sin(t * 2.4) : 0;
      const mat = haloRef.current.material as { opacity?: number };
      if ('opacity' in mat) mat.opacity = target + pulse;
    }
  });

  const glyph = useMemo(() => renderGlyph(element), [element]);

  return (
    <group ref={group} position={position} rotation={rotation}>
      {/* Card body */}
      <RoundedBox args={[1.2, 1.85, 0.04]} radius={0.07} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#11131A" roughness={0.6} metalness={0.2} />
      </RoundedBox>

      {/* Gold filigree border — slightly larger flat frame behind the body */}
      <mesh position={[0, 0, -0.025]}>
        <planeGeometry args={[1.28, 1.93]} />
        <meshStandardMaterial
          color="#D4AF37"
          emissive="#D4AF37"
          emissiveIntensity={0.25}
          metalness={0.7}
          roughness={0.35}
          side={DoubleSide}
        />
      </mesh>

      {/* Front face contents (visible when card flipped, i.e. group rotated 180°) */}
      <group position={[0, 0, 0.021]} rotation={[0, Math.PI, 0]}>
        {/* Inner gold rim — thin */}
        <mesh>
          <planeGeometry args={[1.10, 1.75]} />
          <meshBasicMaterial color="#D4AF37" transparent opacity={0.18} />
        </mesh>
        <mesh position={[0, 0, 0.001]}>
          <planeGeometry args={[1.04, 1.68]} />
          <meshBasicMaterial color="#11131A" />
        </mesh>
        {/* Central element glyph */}
        <group position={[0, 0, 0.002]}>{glyph}</group>
      </group>

      {/* Back face — gold mandala (visible when isRevealed = false) */}
      <group position={[0, 0, 0.021]}>
        <mesh>
          <ringGeometry args={[0.32, 0.42, 32]} />
          <meshBasicMaterial color="#D4AF37" side={DoubleSide} />
        </mesh>
        <mesh>
          <ringGeometry args={[0.16, 0.22, 24]} />
          <meshBasicMaterial color="#F2CA50" side={DoubleSide} />
        </mesh>
        <mesh>
          <circleGeometry args={[0.06, 24]} />
          <meshBasicMaterial color="#D4AF37" side={DoubleSide} />
        </mesh>
        {/* Eight-point burst */}
        {Array.from({ length: 8 }).map((_, i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 4]}>
            <planeGeometry args={[0.02, 0.7]} />
            <meshBasicMaterial color="#D4AF37" transparent opacity={0.55} side={DoubleSide} />
          </mesh>
        ))}
      </group>

      {/* Soft gold halo (always on, intensifies when highlighted) */}
      <mesh ref={haloRef} position={[0, 0, -0.05]}>
        <planeGeometry args={[2.0, 2.7]} />
        <meshBasicMaterial color="#F2CA50" transparent opacity={0.15} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Element-specific glyph rendered on the card front. Kept abstract so it
 * works for all 78 cards without bespoke art.
 */
function renderGlyph(element: CardElement) {
  switch (element) {
    case 'fire':
      // Upward triangle (flame)
      return (
        <mesh>
          <coneGeometry args={[0.22, 0.42, 3]} />
          <meshStandardMaterial color="#F2CA50" emissive="#F2CA50" emissiveIntensity={0.5} />
        </mesh>
      );
    case 'water':
      // Downward triangle (vessel)
      return (
        <mesh rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.22, 0.42, 3]} />
          <meshStandardMaterial color="#D4AF37" emissive="#D4AF37" emissiveIntensity={0.4} />
        </mesh>
      );
    case 'air':
      // Triangle with a bar (alchemical air)
      return (
        <group>
          <mesh>
            <coneGeometry args={[0.22, 0.42, 3]} />
            <meshStandardMaterial color="#F2CA50" emissive="#F2CA50" emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[0, 0.04, 0.01]}>
            <boxGeometry args={[0.26, 0.02, 0.005]} />
            <meshBasicMaterial color="#11131A" />
          </mesh>
        </group>
      );
    case 'earth':
      // Downward triangle with a bar (alchemical earth)
      return (
        <group>
          <mesh rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.22, 0.42, 3]} />
            <meshStandardMaterial color="#D4AF37" emissive="#D4AF37" emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[0, -0.04, 0.01]}>
            <boxGeometry args={[0.26, 0.02, 0.005]} />
            <meshBasicMaterial color="#11131A" />
          </mesh>
        </group>
      );
    case 'spirit':
    default:
      // Ringed dot (akasha / spirit)
      return (
        <group>
          <mesh>
            <ringGeometry args={[0.18, 0.22, 32]} />
            <meshBasicMaterial color="#F2CA50" />
          </mesh>
          <mesh>
            <circleGeometry args={[0.06, 24]} />
            <meshBasicMaterial color="#D4AF37" />
          </mesh>
        </group>
      );
  }
}
