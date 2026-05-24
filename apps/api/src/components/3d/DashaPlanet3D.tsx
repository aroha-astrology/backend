'use client';

import dynamic from 'next/dynamic';
import { useLowEndDevice } from './useLowEndDevice';
import { PLANET_META } from './NavagrahaTransit3D';

const Scene = dynamic(
  () => import('./DashaPlanet3DScene').then(m => m.DashaPlanet3DScene),
  { ssr: false, loading: () => <Fallback planet="Sun" /> },
);

interface Props {
  planet: string;
  className?: string;
}

export function DashaPlanet3D({ planet, className }: Props) {
  const low = useLowEndDevice();
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {low ? <Fallback planet={planet} /> : <Scene planet={planet} />}
    </div>
  );
}

const PLANET_TEXTURE: Record<string, string> = {
  Sun:     '/textures/planets/sunmap.jpg',
  Moon:    '/textures/planets/moonmap.jpg',
  Mars:    '/textures/planets/marsmap.jpg',
  Mercury: '/textures/planets/mercurymap.jpg',
  Jupiter: '/textures/planets/jupitermap.jpg',
  Venus:   '/textures/planets/venusmap.jpg',
  Saturn:  '/textures/planets/saturnmap.jpg',
  Rahu:    '/textures/planets/moonmap.jpg',
  Ketu:    '/textures/planets/moonmap.jpg',
};

function Fallback({ planet }: { planet: string }) {
  const meta = PLANET_META[planet] ?? PLANET_META.Sun;
  const src = PLANET_TEXTURE[planet] ?? PLANET_TEXTURE.Sun;
  const hasRing = planet === 'Saturn';
  const isShadow = planet === 'Rahu' || planet === 'Ketu';
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div
        className="absolute rounded-full"
        style={{
          width: '72%',
          aspectRatio: '1 / 1',
          background: `radial-gradient(circle, ${meta.color}55 0%, transparent 70%)`,
          filter: 'blur(10px)',
        }}
      />
      <div
        className="relative rounded-full overflow-hidden j-rotate-slow"
        style={{
          width: '62%',
          aspectRatio: '1 / 1',
          boxShadow: `inset -10px -10px 30px rgba(0,0,0,0.55), 0 0 14 ${meta.color}66`,
          filter: isShadow ? 'brightness(0.55) saturate(0.6)' : undefined,
        }}
      >
        <img
          src={src}
          alt={`${planet} surface`}
          loading="lazy"
          decoding="async"
          style={{ width: '200%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
      {hasRing && (
        <img
          src="/textures/planets/saturnringalpha.png"
          alt=""
          aria-hidden
          className="absolute"
          style={{
            width: '110%',
            height: 'auto',
            transform: 'rotate(-18deg) scaleY(0.32)',
            opacity: 0.95,
          }}
        />
      )}
    </div>
  );
}
