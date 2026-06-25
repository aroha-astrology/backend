'use client';

import { Canvas, type CanvasProps } from '@react-three/fiber';
import { Suspense, type ReactNode } from 'react';

interface Scene3DProviderProps {
  children: ReactNode;
  className?: string;
  /** Camera position. Defaults to [0, 0, 5]. */
  cameraPosition?: [number, number, number];
  /** Override frameloop ("demand" pauses when nothing changes). */
  frameloop?: CanvasProps['frameloop'];
}

/**
 * Single shared R3F Canvas wrapper. Caps DPR (so retina doesn't murder mobile)
 * and uses on-demand rendering for the static-ish hero scenes.
 */
export function Scene3DProvider({
  children,
  className,
  cameraPosition = [0, 0, 5],
  frameloop = 'always',
}: Scene3DProviderProps) {
  return (
    <Canvas
      className={className}
      dpr={[1, 1.5]}
      frameloop={frameloop}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: cameraPosition, fov: 45 }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}
