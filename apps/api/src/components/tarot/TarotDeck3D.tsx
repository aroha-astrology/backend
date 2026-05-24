'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { AdditiveBlending, DoubleSide, type Group } from 'three';
import { Scene3DProvider } from '@/components/3d/Scene3DProvider';

/**
 * A floating, gently bobbing stack of tarot card backs — shown on the
 * "ask a question / pick a spread" screens as ambient atmosphere.
 * Pure visual: no interaction, no reveal, no spread layout.
 */
export function TarotDeck3D({ className }: { className?: string }) {
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Scene3DProvider cameraPosition={[0, 0.5, 4.5]}>
        <ambientLight intensity={0.45} />
        <directionalLight position={[2, 3, 4]} intensity={0.9} color="#F2CA50" />
        <pointLight position={[-3, -1, 2]} intensity={0.45} color="#D4AF37" />
        <DeckStack />
        <GoldDust />
      </Scene3DProvider>
    </div>
  );
}

function DeckStack() {
  const group = useRef<Group>(null);
  const cardCount = 14;

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y = Math.sin(t * 0.25) * 0.18;
    group.current.position.y = Math.sin(t * 0.5) * 0.08;
  });

  const offsets = useMemo(
    () =>
      Array.from({ length: cardCount }).map((_, i) => ({
        z: -i * 0.012,
        x: (i - cardCount / 2) * 0.004,
        rot: (Math.random() - 0.5) * 0.03,
      })),
    [],
  );

  return (
    <group ref={group}>
      {offsets.map((o, i) => (
        <group key={i} position={[o.x, 0, o.z]} rotation={[0, 0, o.rot]}>
          <RoundedBox args={[1.2, 1.85, 0.04]} radius={0.07} smoothness={3}>
            <meshStandardMaterial color="#11131A" roughness={0.6} metalness={0.2} />
          </RoundedBox>
          {/* Gold rim on top card only — keeps the stack readable */}
          {i === cardCount - 1 && (
            <>
              <mesh position={[0, 0, 0.021]}>
                <ringGeometry args={[0.32, 0.42, 32]} />
                <meshBasicMaterial color="#D4AF37" side={DoubleSide} />
              </mesh>
              <mesh position={[0, 0, 0.022]}>
                <circleGeometry args={[0.06, 24]} />
                <meshBasicMaterial color="#F2CA50" side={DoubleSide} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}

function GoldDust() {
  const ref = useRef<Group>(null);
  const dots = useMemo(
    () =>
      Array.from({ length: 30 }).map(() => ({
        x: (Math.random() - 0.5) * 6,
        y: (Math.random() - 0.5) * 4,
        z: (Math.random() - 0.5) * 3 - 1,
        r: 0.008 + Math.random() * 0.012,
        seed: Math.random() * 100,
      })),
    [],
  );

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.04;
  });

  return (
    <group ref={ref}>
      {dots.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, d.z]}>
          <sphereGeometry args={[d.r, 8, 8]} />
          <meshBasicMaterial
            color="#F2CA50"
            transparent
            opacity={0.5}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
