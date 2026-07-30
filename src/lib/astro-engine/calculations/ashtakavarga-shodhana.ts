// =============================================================================
// Ashtakavarga Shodhana (reduction) — Trikona, Ekadhipatya, and Shodhya Pinda
// =============================================================================
// Raw Bhinnashtakavarga/Sarvashtakavarga bindu counts (calculateBhinnaAshtakavarga
// / calculateSarvaAshtakavarga in ./ashtakavarga.ts) are the classical starting
// point, but two further reductions are required before the counts are used
// for fine-grained transit judgment — see the audit this module responds to
// (docs/superpowers/specs equivalent: the 2026-07-30 predictive-engine plan).
// This file is purely additive: it never modifies ashtakavarga.ts's raw
// tables, so every existing consumer of calculateBhinnaAshtakavarga/
// calculateSarvaAshtakavarga is unaffected.
// =============================================================================

import type {
  ChartData,
  Planet,
  BhinnaAshtakavarga,
  SarvaAshtakavarga,
  AshtakavargaData,
} from '@aroha-astrology/shared';

// ---------------------------------------------------------------------------
// Trikona Shodhana (trine reduction)
// ---------------------------------------------------------------------------

/**
 * The 4 elemental trine groups, as fixed zodiacal sign indices (0=Aries .. 11=Pisces).
 * Fire: Aries/Leo/Sagittarius. Earth: Taurus/Virgo/Capricorn. Air: Gemini/Libra/Aquarius.
 * Water: Cancer/Scorpio/Pisces. These are the same 3 signs regardless of chart/ascendant.
 */
export const TRIKONA_GROUPS: readonly (readonly [number, number, number])[] = [
  [0, 4, 8], // Fire
  [1, 5, 9], // Earth
  [2, 6, 10], // Air
  [3, 7, 11], // Water
];

/**
 * Trikona Shodhana: for each trine group, subtract the group's minimum bindu
 * count from all three members. If any member already has 0 bindus, the
 * whole group is reduced to 0 (per B.V. Raman's Ashtakavarga System — a
 * single "empty" sign in a trine nullifies the trine's shared strength).
 *
 * Pure function over a single planet's 12-sign bindu array; does not mutate
 * its input.
 */
export function trikonaShodhana(bindus: readonly number[]): number[] {
  const result = [...bindus];
  for (const group of TRIKONA_GROUPS) {
    const values = group.map((i) => bindus[i] ?? 0);
    if (values.some((v) => v === 0)) {
      for (const i of group) result[i] = 0;
    } else {
      const min = Math.min(...values);
      for (const i of group) result[i] = (result[i] ?? 0) - min;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Ekadhipatya Shodhana (dual-lordship reduction)
// ---------------------------------------------------------------------------

/**
 * The 5 sign-pairs sharing a single planetary lord (Cancer/Leo are exempt —
 * Moon and Sun each rule only one sign, so there is nothing to reduce there).
 */
export const DUAL_LORDSHIP_PAIRS: readonly { lord: Planet; signs: readonly [number, number] }[] = [
  { lord: 'Mars', signs: [0, 7] }, // Aries / Scorpio
  { lord: 'Venus', signs: [1, 6] }, // Taurus / Libra
  { lord: 'Mercury', signs: [2, 5] }, // Gemini / Virgo
  { lord: 'Jupiter', signs: [8, 11] }, // Sagittarius / Pisces
  { lord: 'Saturn', signs: [9, 10] }, // Capricorn / Aquarius
];

/**
 * Ekadhipatya Shodhana: for each dual-lordship pair, occupancy by a natal
 * planet decides which sign's bindus survive. Classical sources describe the
 * one-occupied case unambiguously; the both-occupied/both-vacant cases are
 * less consistently documented across texts, so this implements a single
 * deterministic, documented convention rather than guessing at authority it
 * can't verify:
 *
 * - Both signs occupied by a natal planet: no reduction (occupancy in both
 *   halves of the lordship is taken as evidence both deserve to stand).
 * - Exactly one occupied: the occupied sign wins ONLY if its bindu count is
 *   >= the vacant sign's — in that case the vacant sign is zeroed. If the
 *   vacant sign actually has MORE bindus, neither sign is touched (occupancy
 *   is not allowed to overrule a clearly stronger vacant sign).
 * - Neither occupied: the lower-bindu sign of the pair is zeroed; an exact
 *   tie zeroes the second sign of the pair (deterministic tie-break).
 *
 * Must run AFTER trikonaShodhana — operates on already-trine-reduced bindus.
 */
export function ekadhipatyaShodhana(reduced: readonly number[], chartData: ChartData): number[] {
  const result = [...reduced];
  const occupiedSigns = new Set(chartData.planets.map((p) => p.signIndex));

  for (const { signs } of DUAL_LORDSHIP_PAIRS) {
    const [a, b] = signs;
    const aOccupied = occupiedSigns.has(a);
    const bOccupied = occupiedSigns.has(b);
    const aVal = result[a] ?? 0;
    const bVal = result[b] ?? 0;

    if (aOccupied && bOccupied) continue;

    if (!aOccupied && !bOccupied) {
      // Strictly lower loses; an exact tie zeroes the second sign of the pair.
      if (aVal < bVal) result[a] = 0;
      else result[b] = 0;
      continue;
    }

    const occupiedIndex = aOccupied ? a : b;
    const vacantIndex = aOccupied ? b : a;
    const occupiedVal = result[occupiedIndex] ?? 0;
    const vacantVal = result[vacantIndex] ?? 0;
    if (occupiedVal >= vacantVal) result[vacantIndex] = 0;
    // else: leave both as-is.
  }

  return result;
}

/** Runs both reductions in the correct classical order (trine, then dual-lordship). */
export function reduceBindus(bindus: readonly number[], chartData: ChartData): number[] {
  return ekadhipatyaShodhana(trikonaShodhana(bindus), chartData);
}

// ---------------------------------------------------------------------------
// Shodhya Pinda (Rasi Pinda + Graha Pinda)
// ---------------------------------------------------------------------------
// Fixed classical multiplier tables — verified against astrobix.com/learn's
// dedicated Shodhya Pinda reference (cross-checked across two independent
// fetches; a third page's numbers looked like a worked single-chart example
// rather than the general table and were discarded as unreliable).

/** Rashi Gunakar — one fixed multiplier per sign, Aries(0)..Pisces(11). */
export const RASHI_GUNAKAR: readonly number[] = [7, 10, 8, 4, 10, 5, 7, 8, 9, 5, 11, 12];

/** Graha Gunakar — one fixed multiplier per planet. */
export const GRAHA_GUNAKAR: Record<
  'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn',
  number
> = {
  Sun: 5,
  Moon: 5,
  Mars: 8,
  Mercury: 5,
  Jupiter: 10,
  Venus: 7,
  Saturn: 5,
};

export interface ShodhyaPinda {
  /** Sum over signs of (reduced bindus x that sign's Rashi Gunakar). */
  rasiPinda: number;
  /** Sum over signs of (reduced bindus x this planet's fixed Graha Gunakar). */
  grahaPinda: number;
  /** rasiPinda + grahaPinda — the planet's final Shodhya Pinda strength. */
  shodhyaPinda: number;
}

export function shodhyaPinda(
  reducedBindus: readonly number[],
  planet: keyof typeof GRAHA_GUNAKAR,
): ShodhyaPinda {
  let rasiPinda = 0;
  for (let i = 0; i < 12; i++) {
    rasiPinda += (reducedBindus[i] ?? 0) * (RASHI_GUNAKAR[i] ?? 0);
  }
  const grahaGunakar = GRAHA_GUNAKAR[planet];
  const totalReducedBindus = reducedBindus.reduce((sum, b) => sum + b, 0);
  const grahaPinda = totalReducedBindus * grahaGunakar;
  return { rasiPinda, grahaPinda, shodhyaPinda: rasiPinda + grahaPinda };
}

// ---------------------------------------------------------------------------
// Interpretation bands (audit-specified thresholds, replacing the ±1-point
// evaluateSignStrength band already in ashtakavarga.ts for reduced tables)
// ---------------------------------------------------------------------------

export type SavStrength = 'power-center' | 'baseline' | 'karmic-struggle' | 'moderate';

/** SAV interpretation: >=30 a power center (even malefics deliver good results
 * here), <=25 a karmic-struggle zone (results demand real effort), 28 is the
 * classical cosmic baseline; values between get a moderate label. */
export function evaluateSavBand(sarvaBinduCount: number): SavStrength {
  if (sarvaBinduCount >= 30) return 'power-center';
  if (sarvaBinduCount <= 25) return 'karmic-struggle';
  if (sarvaBinduCount === 28) return 'baseline';
  return 'moderate';
}

/** BAV interpretation: >=4 bindus is the classical mandate for a transiting
 * planet to deliver favorable results in that sign; below is an obstructed transit. */
export function hasBinduMandate(bavBinduCount: number): boolean {
  return bavBinduCount >= 4;
}

// ---------------------------------------------------------------------------
// Composed: raw AshtakavargaData -> reduced, in the same shape
// ---------------------------------------------------------------------------

export interface ReducedAshtakavargaData extends AshtakavargaData {
  /** Per-planet Shodhya Pinda, keyed by planet name. */
  shodhyaPinda: Record<string, ShodhyaPinda>;
}

/**
 * Applies Trikona then Ekadhipatya Shodhana to every planet's raw BAV, and
 * re-derives SAV from the reduced BAVs (never from the raw SAV — the whole
 * point of the reduction is that the raw 337-point total is not what should
 * drive fine-grained transit judgment). Also computes each planet's Shodhya
 * Pinda from its reduced bindus.
 *
 * Returned in the same `{ bhinna, sarva }` shape as `calculateAshtakavarga`'s
 * raw output so any consumer already reading that shape can read `.reduced`
 * identically — see kundli.service.ts, which stores this alongside (never
 * instead of) the raw table.
 */
export function computeReducedAshtakavarga(
  raw: AshtakavargaData,
  chartData: ChartData,
): ReducedAshtakavargaData {
  const bhinna: BhinnaAshtakavarga[] = raw.bhinna.map((b) => {
    const bindus = reduceBindus(b.bindus, chartData);
    return { planet: b.planet, bindus, total: bindus.reduce((sum, v) => sum + v, 0) };
  });

  const sarvaBindus = new Array<number>(12).fill(0);
  for (const b of bhinna) {
    for (let i = 0; i < 12; i++) sarvaBindus[i] = (sarvaBindus[i] ?? 0) + (b.bindus[i] ?? 0);
  }
  const sarva: SarvaAshtakavarga = {
    bindus: sarvaBindus,
    total: sarvaBindus.reduce((sum, v) => sum + v, 0),
  };

  const shodhyaPindaByPlanet: Record<string, ShodhyaPinda> = {};
  for (const b of bhinna) {
    if (b.planet in GRAHA_GUNAKAR) {
      shodhyaPindaByPlanet[b.planet] = shodhyaPinda(
        b.bindus,
        b.planet as keyof typeof GRAHA_GUNAKAR,
      );
    }
  }

  return { bhinna, sarva, shodhyaPinda: shodhyaPindaByPlanet };
}
