'use client';

import dynamic from 'next/dynamic';
import { useLowEndDevice } from './useLowEndDevice';

export interface NavagrahaPlanetPos {
  planet: string;       // Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu
  longitude: number;    // 0–360°, used as starting angle on its orbit
  isRetrograde?: boolean;
}

const Scene = dynamic(
  () => import('./NavagrahaTransit3DScene').then(m => m.NavagrahaTransit3DScene),
  { ssr: false },
);

interface Props {
  planets?: NavagrahaPlanetPos[];
  className?: string;
  /** Height of the canvas wrapper. Defaults to 380px on mobile, 480 desktop. */
  height?: number;
}

/**
 * 3D live transit scene: nine Navagraha planets orbit a central Earth/Lagna,
 * each at its own speed and color. Mobile/reduced-motion devices get a
 * lightweight SVG orbit fallback instead of WebGL.
 */
export function NavagrahaTransit3D({ planets, className, height = 420 }: Props) {
  const low = useLowEndDevice();
  return (
    <div className={className} style={{ height, position: 'relative' }}>
      {low ? <Fallback planets={planets} /> : <Scene planets={planets} />}
    </div>
  );
}

function Fallback({ planets }: { planets?: NavagrahaPlanetPos[] }) {
  const list = planets ?? DEFAULT_PLANETS;
  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="j-aurora-bg" />
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Three concentric rings */}
        {[110, 160, 210].map((r) => (
          <div
            key={r}
            className="absolute rounded-full border j-rotate-slow"
            style={{
              width: r * 2,
              height: r * 2,
              borderColor: 'rgba(242,202,80,0.18)',
            }}
          />
        ))}
        {/* Central sun */}
        <div
          className="absolute rounded-full j-glow-pulse"
          style={{
            width: 56,
            height: 56,
            background: 'radial-gradient(circle, #F2CA50 0%, #D4AF37 60%, transparent 100%)',
          }}
        />
        {/* Planets as CSS-orbit dots */}
        {list.map((p, i) => {
          const angle = ((p.longitude ?? i * 40) * Math.PI) / 180;
          const r = 110 + (i % 3) * 50;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          const meta = PLANET_META[p.planet] ?? PLANET_META.Sun;
          return (
            <div
              key={p.planet}
              className="absolute rounded-full"
              style={{
                left: '50%',
                top: '50%',
                width: meta.size,
                height: meta.size,
                marginLeft: -meta.size / 2,
                marginTop: -meta.size / 2,
                transform: `translate(${x}px, ${y}px)`,
                background: `radial-gradient(circle, ${meta.color} 0%, transparent 75%)`,
                boxShadow: `0 0 14px ${meta.color}`,
              }}
              aria-label={p.planet}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Per-planet rendering metadata (color, mesh radius, orbit radius+speed) ──

export const PLANET_META: Record<string, {
  color: string;
  size: number;          // CSS px for fallback / world units * 100 for 3D
  orbit: number;         // world units
  speed: number;         // radians / sec
  emissive?: number;
}> = {
  Sun:     { color: '#F2CA50', size: 26, orbit: 1.6, speed: 0.18, emissive: 0.9 },
  Moon:    { color: '#C0C8D8', size: 18, orbit: 2.2, speed: 0.32, emissive: 0.5 },
  Mars:    { color: '#FF6B55', size: 18, orbit: 2.7, speed: 0.14 },
  Mercury: { color: '#5DD4A4', size: 16, orbit: 3.2, speed: 0.40 },
  Jupiter: { color: '#F2CA50', size: 24, orbit: 3.8, speed: 0.08 },
  Venus:   { color: '#F091B8', size: 20, orbit: 4.3, speed: 0.22 },
  Saturn:  { color: '#9CA8BC', size: 22, orbit: 4.9, speed: 0.05 },
  Rahu:    { color: '#9050E0', size: 16, orbit: 5.5, speed: 0.10 },
  Ketu:    { color: '#E0506B', size: 16, orbit: 6.0, speed: 0.10 },
};

const DEFAULT_PLANETS: NavagrahaPlanetPos[] = Object.keys(PLANET_META).map((p, i) => ({
  planet: p,
  longitude: i * 40,
}));
