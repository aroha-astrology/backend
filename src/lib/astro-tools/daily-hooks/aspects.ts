// =============================================================================
// Aspect helpers shared by Text Timing and Mystery Synastry (pure)
// =============================================================================

import { ZODIAC_SIGNS } from '@aroha-astrology/shared';

export const norm = (d: number): number => ((d % 360) + 360) % 360;

/** Smallest angle between two longitudes, 0 to 180. */
export function separation(a: number, b: number): number {
  const d = Math.abs(norm(a) - norm(b));
  return d > 180 ? 360 - d : d;
}

/** How comfortably two points sit, 0 to 1: conjunction, sextile and trine are warm; square and opposition are tense. */
const ASPECT_VALUE = [
  { angle: 0, value: 0.9, name: 'conjunction' },
  { angle: 60, value: 0.9, name: 'sextile' },
  { angle: 90, value: 0.2, name: 'square' },
  { angle: 120, value: 1, name: 'trine' },
  { angle: 180, value: 0.3, name: 'opposition' },
] as const;
const NEUTRAL = 0.5;
export const HARMONY_ORB = 6;

export interface Contact {
  /** 0 (tense) to 1 (warm); 0.5 when no aspect is within the orb. */
  value: number;
  aspect: (typeof ASPECT_VALUE)[number]['name'] | null;
  orbDeg: number | null;
}

/** The comfort of the angle between two longitudes: the nearest aspect within 6 degrees, blended to neutral at the edge of the orb. */
export function contact(a: number, b: number): Contact {
  const sep = separation(a, b);
  let best: Contact = { value: NEUTRAL, aspect: null, orbDeg: null };
  let bestOrb = HARMONY_ORB + 1;
  for (const asp of ASPECT_VALUE) {
    const orb = Math.abs(sep - asp.angle);
    if (orb <= HARMONY_ORB && orb < bestOrb) {
      bestOrb = orb;
      best = { value: asp.value + (NEUTRAL - asp.value) * (orb / HARMONY_ORB), aspect: asp.name, orbDeg: Math.round(orb * 100) / 100 };
    }
  }
  return best;
}

export function degText(lon: number): string {
  const inSign = norm(lon) % 30;
  const d = Math.floor(inSign);
  const m = Math.round((inSign - d) * 60);
  const dd = m === 60 ? d + 1 : d;
  return `${dd}°${String(m === 60 ? 0 : m).padStart(2, '0')}′ ${ZODIAC_SIGNS[Math.floor(norm(lon) / 30)]}`;
}

export const signOf = (lon: number): number => Math.floor(norm(lon) / 30);
