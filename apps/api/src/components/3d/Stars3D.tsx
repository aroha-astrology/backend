'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Points } from 'three';
import { BufferGeometry, Float32BufferAttribute } from 'three';

interface Stars3DProps {
  count?: number;
  radius?: number;
  size?: number;
  color?: string;
}

/** Cheap rotating particle field of glowing stars, used as a hero backdrop. */
export function Stars3D({ count = 800, radius = 12, size = 0.04, color = '#F2CA50' }: Stars3DProps) {
  const ref = useRef<Points>(null);

  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = Math.cbrt(Math.random()) * radius;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return g;
  }, [count, radius]);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.02;
      ref.current.rotation.x += delta * 0.01;
    }
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial color={color} size={size} sizeAttenuation transparent opacity={0.85} />
    </points>
  );
}
