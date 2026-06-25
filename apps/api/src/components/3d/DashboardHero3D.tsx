'use client';

import dynamic from 'next/dynamic';
import { useLowEndDevice } from './useLowEndDevice';

const Scene = dynamic(() => import('./DashboardHero3DScene').then(m => m.DashboardHero3DScene), { ssr: false });

/** Dashboard hero — orbiting moon/sun + starfield, sized to header card. */
export function DashboardHero3D({ className }: { className?: string }) {
  const low = useLowEndDevice();
  if (low) return <DashboardHeroFallback className={className} />;
  return <div className={className}><Scene /></div>;
}

function DashboardHeroFallback({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative w-full h-full">
        <div className="j-zodiac-ring j-rotate-slow" style={{ inset: 0 }} />
        <div
          className="absolute right-4 top-4 j-float"
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #F2CA50 0%, transparent 70%)',
            boxShadow: '0 0 32px rgba(242,202,80,0.55)',
          }}
        />
      </div>
    </div>
  );
}
