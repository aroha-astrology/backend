'use client';

import { Planet3DInline } from './Planet3DInline';
import { getPlanetVisual, type PlanetKey } from './planet-registry';
import { cn } from '@/lib/utils';

interface Planet3DBadgeProps {
  planet: PlanetKey | string;
  /** Pixel size of the orb. Default 32. */
  size?: number;
  /** Which label to show next to the orb. */
  label?: 'en' | 'sa' | 'both' | 'none';
  /** Tone/intensity of the chip background. */
  variant?: 'chip' | 'plain';
  className?: string;
}

/**
 * Chip-sized planet representation: rotating 3D orb + planet name label.
 * Drop-in for any "emoji + planet name" pair in tables/cards.
 */
export function Planet3DBadge({
  planet,
  size = 32,
  label = 'en',
  variant = 'plain',
  className,
}: Planet3DBadgeProps) {
  const v = getPlanetVisual(planet as string);

  const text =
    label === 'sa'
      ? v.nameSa
      : label === 'both'
        ? `${v.nameEn} · ${v.nameSa}`
        : label === 'none'
          ? ''
          : v.nameEn;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 align-middle',
        variant === 'chip' &&
          'rounded-full bg-card-soft/60 px-2 py-1 ring-1 ring-border/50',
        className,
      )}
    >
      <Planet3DInline planet={planet} size={size} />
      {text && (
        <span className="text-sm font-medium text-text" style={{ color: undefined }}>
          {text}
        </span>
      )}
    </span>
  );
}
