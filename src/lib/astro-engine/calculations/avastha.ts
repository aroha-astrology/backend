// =============================================================================
// Baladi Avastha, Graha Yuddha and Vimsopaka Bala
// =============================================================================
// Shadbala answers "how much strength does this planet have"; these three
// answer "and is it in any condition to use it". A planet can clear its
// Shadbala minimum and still be an infant (Bala avastha), or have just lost a
// planetary war, or hold its dignity in the Rasi chart alone and collapse
// across every divisional chart. None of the three existed anywhere in this
// engine — grep for `avastha`, `yuddha` or `vimsopaka` before this file and
// there are zero hits.
//
// All three are pure functions over data the chart already carries.
// =============================================================================

import { dashaLordTransitQuality } from '../../astro-tools/transit.js';
import { calculateAllDivisionalChartsWithLagna } from '../charts/divisionalCharts.js';

/* -------------------------------------------------------------------------- */
/* Baladi Avastha — the five "ages" of a planet by degree within its sign      */
/* -------------------------------------------------------------------------- */

export type Avastha = 'Bala' | 'Kumara' | 'Yuva' | 'Vriddha' | 'Mrita';

/** Classical result-yielding capacity of each state, as a 0-1 multiplier. */
export const AVASTHA_POTENCY: Record<Avastha, number> = {
  Bala: 0.25, // infant — cannot yet deliver
  Kumara: 0.5, // adolescent — partial
  Yuva: 1.0, // adult — full results
  Vriddha: 0.25, // old — declining
  Mrita: 0.0, // dead — no results
};

const ODD_SEQUENCE: Avastha[] = ['Bala', 'Kumara', 'Yuva', 'Vriddha', 'Mrita'];

/**
 * The planet's Baladi avastha from its degree within its own sign.
 *
 * Each state spans 6 degrees. The sequence runs forward in odd (masculine)
 * signs and backward in even ones — so the same 3 degrees means "infant" in
 * Aries and "dead" in Taurus.
 */
export function baladiAvastha(signDegree: number, signIndex: number): Avastha {
  const step = Math.min(Math.floor(signDegree / 6), 4);
  const isOddSign = signIndex % 2 === 0; // signIndex 0 = Aries = 1st = odd
  const seq = isOddSign ? ODD_SEQUENCE : [...ODD_SEQUENCE].reverse();
  return seq[step]!;
}

/* -------------------------------------------------------------------------- */
/* Graha Yuddha — planetary war                                               */
/* -------------------------------------------------------------------------- */

/** Only the five true planets fight. Luminaries and the shadow points do not. */
const COMBATANTS = new Set(['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']);

/** Classical orb for a planetary war: within one degree of each other. */
const WAR_ORB = 1;

export interface GrahaYuddhaResult {
  winner: string;
  loser: string;
  /** Degrees between the two combatants. */
  separation: number;
}

/**
 * Planetary wars in a chart: any two of the five true planets within 1 degree.
 *
 * Winner is decided by celestial latitude — the more northerly planet wins,
 * which is the rule most modern software follows and the one this engine can
 * actually evaluate (the alternative, apparent brightness, is not in the
 * position data). The loser is severely damaged regardless of its Shadbala.
 */
export function detectGrahaYuddha(
  planets: Array<{ planet: string; longitude?: number; latitude?: number }>,
): GrahaYuddhaResult[] {
  const fighters = planets.filter(
    (p) => COMBATANTS.has(p.planet) && Number.isFinite(Number(p.longitude)),
  );

  const wars: GrahaYuddhaResult[] = [];
  for (let i = 0; i < fighters.length; i++) {
    for (let j = i + 1; j < fighters.length; j++) {
      const a = fighters[i]!;
      const b = fighters[j]!;
      const diff = Math.abs(Number(a.longitude) - Number(b.longitude));
      const separation = diff > 180 ? 360 - diff : diff;
      if (separation >= WAR_ORB) continue;

      const aLat = Number(a.latitude ?? 0);
      const bLat = Number(b.latitude ?? 0);
      const aWins = aLat >= bLat;
      wars.push({
        winner: aWins ? a.planet : b.planet,
        loser: aWins ? b.planet : a.planet,
        separation: Math.round(separation * 100) / 100,
      });
    }
  }
  return wars;
}

/* -------------------------------------------------------------------------- */
/* Vimsopaka Bala — dignity weighted across the divisional charts             */
/* -------------------------------------------------------------------------- */

/**
 * Shadvarga weights (the 6-chart scheme), summing to 20 — hence "Vimsopaka",
 * twenty-fold. A planet dignified in the Rasi chart but wrecked in the Navamsa
 * scores badly here even though the Rasi chart alone looks fine, which is
 * precisely the case a single-chart reading gets wrong.
 */
const SHADVARGA_WEIGHTS: Record<string, number> = {
  D1: 6,
  D2: 2,
  D3: 4,
  D9: 5,
  D12: 2,
  D30: 1,
};

export interface VimsopakaResult {
  planet: string;
  /** 0-20. Classically: 15+ very strong, 10-15 good, 5-10 middling, below 5 weak. */
  score: number;
}

/**
 * Vimsopaka Bala for every planet in the chart.
 *
 * Dignity per varga is scored with `dashaLordTransitQuality`'s existing 0-5
 * `qualityScore` (exalted 5 ... debilitated 0) rather than a second dignity
 * table, so this can never disagree with the dignity the rest of the app
 * reports. Returns an empty array if the vargas cannot be computed.
 */
export function calculateVimsopakaBala(chartData: unknown): VimsopakaResult[] {
  let vargas: Record<string, { planets: Array<{ planet: string; signIndex: number }> }>;
  try {
    vargas = calculateAllDivisionalChartsWithLagna(chartData as never);
  } catch {
    return [];
  }
  if (!vargas) return [];

  const totals = new Map<string, number>();
  const maxWeight = Object.values(SHADVARGA_WEIGHTS).reduce((a, b) => a + b, 0);

  for (const [varga, weight] of Object.entries(SHADVARGA_WEIGHTS)) {
    const entry = vargas[varga];
    if (!entry?.planets) continue;
    for (const p of entry.planets) {
      // qualityScore is 0-5; normalise to 0-1 and weight it.
      const quality = dashaLordTransitQuality(p.planet, p.signIndex).qualityScore / 5;
      totals.set(p.planet, (totals.get(p.planet) ?? 0) + quality * weight);
    }
  }

  return [...totals.entries()]
    .map(([planet, raw]) => ({
      planet,
      // Already on the 0-20 scale: weights sum to 20 and quality is 0-1.
      score: Math.round((raw / maxWeight) * 20 * 10) / 10,
    }))
    .sort((a, b) => b.score - a.score);
}
