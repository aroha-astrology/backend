'use client';

import dynamic from 'next/dynamic';
import { useLowEndDevice } from './useLowEndDevice';

const Scene = dynamic(() => import('./AuthOrb3DScene').then(m => m.AuthOrb3DScene), { ssr: false });

/** Floating gold orb + starfield for auth/landing routes. Falls back to CSS-only gold orb on low-end devices. */
export function AuthOrb3D() {
  const low = useLowEndDevice();
  if (low) return <AuthOrbFallback />;
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Scene />
    </div>
  );
}

function AuthOrbFallback() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 j-float"
        style={{
          width: 260,
          height: 260,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(242,202,80,0.65) 0%, rgba(212,175,55,0.20) 45%, transparent 75%)',
          filter: 'blur(0.5px)',
          boxShadow: '0 0 60px rgba(242,202,80,0.45), 0 0 120px rgba(212,175,55,0.25)',
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 j-rotate-slow"
        style={{
          width: 360,
          height: 360,
          borderRadius: '50%',
          border: '1px solid rgba(242,202,80,0.20)',
        }}
      />
    </div>
  );
}
