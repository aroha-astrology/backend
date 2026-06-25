'use client';

import dynamic from 'next/dynamic';
import { useLowEndDevice } from './useLowEndDevice';
import { PLANET_VISUAL, resolvePlanetKey, type PlanetKey } from './planet-registry';

const Scene = dynamic(
  () => import('./Planet3DHeroScene').then(m => m.Planet3DHeroScene),
  { ssr: false, loading: () => null },
);

interface Planet3DHeroProps {
  planet: PlanetKey | string;
  /** Pixel height of the canvas. Default 280. */
  height?: number;
  /** Show the starfield backdrop. Default true. */
  withStars?: boolean;
  className?: string;
}

/**
 * Large 3D planet hero — used on dosha pages (Mangal/Shani/Kaal Sarp),
 * gemstone detail, remedy intros. Mounts the full DashaPlanet-style scene
 * with starfield. Falls back to a glowing CSS orb on low-end devices.
 */
export function Planet3DHero({
  planet,
  height = 280,
  withStars = true,
  className,
}: Planet3DHeroProps) {
  const key = (resolvePlanetKey(planet as string) ?? 'Sun') as PlanetKey;
  const low = useLowEndDevice();
  const v = PLANET_VISUAL[key];

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height }}
      aria-label={`${v.nameEn} 3D visualization`}
    >
      {low ? <HeroFallback planet={key} /> : <Scene planet={key} withStars={withStars} />}
    </div>
  );
}

function HeroFallback({ planet }: { planet: PlanetKey }) {
  const v = PLANET_VISUAL[planet];
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div
        className="absolute rounded-full j-glow-pulse"
        style={{
          width: '60%',
          aspectRatio: '1 / 1',
          background: `radial-gradient(circle at 35% 30%, ${v.color} 0%, ${v.color}cc 35%, ${v.color}55 70%, transparent 100%)`,
          boxShadow: `0 0 60px ${v.glow}`,
        }}
      />
      {v.ringed && (
        <div
          className="absolute rounded-full j-rotate-slow"
          style={{
            width: '86%',
            aspectRatio: '1 / 0.32',
            border: `2px solid ${v.color}aa`,
            boxShadow: `0 0 24px ${v.glow}`,
            transform: 'rotate(-18deg)',
          }}
        />
      )}
    </div>
  );
}
