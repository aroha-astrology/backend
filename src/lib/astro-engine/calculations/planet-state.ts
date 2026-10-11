// =============================================================================
// Planet State — retrogression + combustion (astangata)
// =============================================================================
// Both conditions were already being computed, but only ever INSIDE
// `yogas/index.ts#computePlanetStrength`, as a private 0-100 score that never
// left the yoga detector. Nothing user-facing — not chat grounding, not any
// report — could tell a combust Mercury from a bright one, which is one of
// the loudest "this reading is generic" signals in classical practice.
//
// Extracted here as the single definition both the yoga detector and the
// narration layers read, so the orb table can never drift between them.
// =============================================================================

import { getActiveProfile } from '../rules/profile.js';

/**
 * Combustion orbs in degrees from the Sun, carried over UNCHANGED from the
 * table that was inline in `yogas/index.ts` so extracting this helper does not
 * silently re-score every existing chart's yogas.
 *
 * These are the orbs of a planet in direct motion. A retrograde Mars, Mercury or
 * Venus has a NARROWER orb (COMBUSTION_ORB_RETROGRADE), in the translator's table
 * of the BPHS ch. 7 notes (register BPHS-7-combustion, audit ST1). The earlier
 * comment here said the retrograde orbs were the wider ones; in that table they
 * are not.
 */
export const COMBUSTION_ORB: Record<string, number> = {
  Moon: 12,
  Mars: 17,
  Mercury: 14,
  Jupiter: 11,
  Venus: 10,
  Saturn: 15,
};

/** Orbs of a retrograde planet where they differ: Mars 8, Mercury 12, Venus 8 degrees. */
export const COMBUSTION_ORB_RETROGRADE: Record<string, number> = {
  Mars: 8,
  Mercury: 12,
  Venus: 8,
};

/** Planets that can never be combust: the Sun itself, and the two shadow points. */
const NEVER_COMBUST = new Set<string>(['Sun', 'Rahu', 'Ketu']);

/** Default orb for anything not in the table above. */
const DEFAULT_ORB = 8.5;

/** Shortest angular distance between two ecliptic longitudes, 0-180. */
export function angularSeparation(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * True when `planet` sits within its combustion orb of the Sun.
 * `sunLongitude` null/undefined (degraded chart) ⇒ false, never a false positive.
 */
export function isCombust(
  planet: string,
  planetLongitude: number,
  sunLongitude: number | null | undefined,
  retrograde = false,
): boolean {
  if (NEVER_COMBUST.has(planet)) return false;
  if (sunLongitude == null || !Number.isFinite(sunLongitude)) return false;
  if (!Number.isFinite(planetLongitude)) return false;
  const byMotion = retrograde && getActiveProfile().combustionOrbs === 'by-motion';
  const orb =
    (byMotion ? COMBUSTION_ORB_RETROGRADE[planet] : undefined) ??
    COMBUSTION_ORB[planet] ??
    DEFAULT_ORB;
  return angularSeparation(planetLongitude, sunLongitude) < orb;
}

export interface PlanetState {
  planet: string;
  isRetrograde: boolean;
  isCombust: boolean;
  /** Degrees from the Sun — null for the Sun itself and the shadow points. */
  degreesFromSun: number | null;
}

/**
 * Retrogression + combustion for every planet in a chart.
 *
 * Takes the loose planet-array shape rather than `ChartData` so the narration
 * layers can pass the JSONB-decoded `chartData.planets` straight through
 * without reconstructing a full typed chart.
 */
export function computePlanetStates(
  planets: Array<{ planet: string; longitude?: number; isRetrograde?: boolean }>,
): PlanetState[] {
  const sunLongitude = planets.find((p) => p.planet === 'Sun')?.longitude ?? null;

  return planets.map((p) => {
    const longitude = Number(p.longitude ?? NaN);
    const combustible = !NEVER_COMBUST.has(p.planet);
    return {
      planet: p.planet,
      isRetrograde: Boolean(p.isRetrograde),
      isCombust: isCombust(p.planet, longitude, sunLongitude, Boolean(p.isRetrograde)),
      degreesFromSun:
        combustible && sunLongitude != null && Number.isFinite(longitude)
          ? Math.round(angularSeparation(longitude, sunLongitude) * 10) / 10
          : null,
    };
  });
}
