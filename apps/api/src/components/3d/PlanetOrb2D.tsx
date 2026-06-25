'use client';

import { getPlanetVisual, type PlanetKey } from './planet-registry';
import { cn } from '@/lib/utils';

interface PlanetOrb2DProps {
  planet: PlanetKey | string;
  /** Pixel size of the orb. Default 22. */
  size?: number;
  /** Show the pulse animation. Default true. */
  pulse?: boolean;
  className?: string;
  title?: string;
}

/**
 * Lightweight CSS-only "planet orb" using a radial gradient + glow shadow.
 * Use this for high-density contexts (chart cells, dasha lists, planet
 * chips) where mounting a dedicated WebGL Canvas per orb would be wasteful.
 * Falls back gracefully to the same look on all devices.
 *
 * For hero contexts or feature focus, prefer `<Planet3DInline>` or
 * `<Planet3DHero>` — they render a true rotating sphere.
 */
export function PlanetOrb2D({
  planet,
  size = 22,
  pulse = true,
  className,
  title,
}: PlanetOrb2DProps) {
  const v = getPlanetVisual(planet);
  return (
    <span
      className={cn(
        'inline-block rounded-full align-middle flex-shrink-0',
        pulse && 'j-glow-pulse',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 30%, ${v.color} 0%, ${v.color}cc 38%, ${v.color}55 72%, transparent 100%)`,
        boxShadow: `0 0 ${Math.round(size * 0.35)}px ${v.glow}`,
      }}
      title={title ?? v.nameEn}
      aria-label={v.nameEn}
    />
  );
}
