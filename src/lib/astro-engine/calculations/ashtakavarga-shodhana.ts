// =============================================================================
// Ashtakavarga Shodhana (reduction) — Trikona, Ekadhipatya, and Shodhya Pinda
// =============================================================================
// Raw Bhinnashtakavarga/Sarvashtakavarga bindu counts (calculateBhinnaAshtakavarga
// / calculateSarvaAshtakavarga in ./ashtakavarga.ts) are the starting point;
// the two reductions and the Pindas below follow Bṛhat Parāśara Horā Śāstra
// chapters 67-69 (source register BPHS-67, BPHS-68, BPHS-69), tested by hand in
// test/audit/ashtakavarga-reduction.audit.spec.ts.
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
 * Trikona Shodhana (BPHS 67.4-5): in each trine take the smallest of the three
 * counts and subtract it from all three; if the three are equal all become
 * zero. "ekasmin bhavane śūnyaṃ tat trikoṇaṃ na śodhayet": if ANY sign of a
 * trine has no bindus, that trine is left as it is. (This used to zero the
 * whole trine, which the verse does not say.)
 *
 * Pure function over a single planet's 12-sign bindu array; does not mutate
 * its input.
 */
export function trikonaShodhana(bindus: readonly number[]): number[] {
  const result = [...bindus];
  for (const group of TRIKONA_GROUPS) {
    const values = group.map((i) => bindus[i] ?? 0);
    if (values.some((v) => v === 0)) continue;
    const min = Math.min(...values);
    for (const i of group) result[i] = (result[i] ?? 0) - min;
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
 * Ekadhipatya Shodhana (BPHS 68.2-6), done on the trine-reduced counts, for
 * the two signs of each planet that rules two:
 *
 * - If either sign has no bindus left, nothing is done ("kṣetradvaye phalāni
 *   syuḥ": only when both signs have a number).
 * - Both signs hold a planet: nothing is done.
 * - One holds a planet: if its count is at least the other's, the empty sign
 *   goes to zero; if it is smaller, its count is taken off the empty sign.
 * - Neither holds a planet: equal counts both go to zero; otherwise the
 *   smaller is taken off both (the smaller becomes zero).
 * - Cancer and Leo are not touched: the Moon and the Sun rule one sign each.
 *
 * Rahu and Ketu count as planets for this, as the book's own example does.
 *
 * Must run AFTER trikonaShodhana — operates on already-trine-reduced bindus.
 */
export function ekadhipatyaShodhana(reduced: readonly number[], chartData: ChartData): number[] {
  const result = [...reduced];
  const occupiedSigns = new Set(chartData.planets.map((p) => p.signIndex));

  for (const { signs } of DUAL_LORDSHIP_PAIRS) {
    const [a, b] = signs;
    const aVal = result[a] ?? 0;
    const bVal = result[b] ?? 0;
    if (aVal === 0 || bVal === 0) continue;

    const aOccupied = occupiedSigns.has(a);
    const bOccupied = occupiedSigns.has(b);
    if (aOccupied && bOccupied) continue;

    if (!aOccupied && !bOccupied) {
      const smaller = Math.min(aVal, bVal);
      result[a] = aVal - smaller;
      result[b] = bVal - smaller;
      continue;
    }

    const occupiedIndex = aOccupied ? a : b;
    const vacantIndex = aOccupied ? b : a;
    const occupiedVal = result[occupiedIndex] ?? 0;
    const vacantVal = result[vacantIndex] ?? 0;
    result[vacantIndex] = occupiedVal >= vacantVal ? 0 : vacantVal - occupiedVal;
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
// Multipliers of BPHS 69.1-4 (source register BPHS-69), identical to the ones
// this file used before the audit.

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
  /** Sum over the seven planets of (reduced bindus of the sign it stands in x its Graha Gunakar). */
  grahaPinda: number;
  /** rasiPinda + grahaPinda — the Yoga Pinda of BPHS 69. */
  shodhyaPinda: number;
}

/**
 * Pinda Sadhana (BPHS 69.1-4). Rasi Pinda: each sign's reduced count times
 * the sign's multiplier, added up. Graha Pinda: for each planet in the chart
 * (Rahu and Ketu are not counted), the reduced count of the sign it stands in
 * times the planet's multiplier, added up. Their sum is the Yoga Pinda.
 * Worked example in the chapter: Rasi Pinda 100, Graha Pinda 48, Yoga Pinda 148.
 * (The Graha Pinda used to be the total of all twelve counts times the
 * multiplier of the planet whose table it is, which is not what the chapter says.)
 */
export function shodhyaPinda(reducedBindus: readonly number[], chartData: ChartData): ShodhyaPinda {
  let rasiPinda = 0;
  for (let i = 0; i < 12; i++) {
    rasiPinda += (reducedBindus[i] ?? 0) * (RASHI_GUNAKAR[i] ?? 0);
  }
  let grahaPinda = 0;
  for (const p of chartData.planets) {
    if (!(p.planet in GRAHA_GUNAKAR)) continue;
    grahaPinda +=
      (reducedBindus[p.signIndex] ?? 0) * GRAHA_GUNAKAR[p.planet as keyof typeof GRAHA_GUNAKAR];
  }
  return { rasiPinda, grahaPinda, shodhyaPinda: rasiPinda + grahaPinda };
}

// ---------------------------------------------------------------------------
// Interpretation bands: modern rules of thumb for RAW counts
// ---------------------------------------------------------------------------
// BPHS chapters 66-70 give no such bands (ANCIENT SOURCE NOT VERIFIED). They are
// meant for the raw Sarvashtakavarga (337 points, 28 a sign on average) and the
// raw Bhinnashtakavarga. The reduced tables total about 85, so these bands must
// NOT be applied to them: they called almost every sign a "karmic-struggle zone"
// (audit item A5). Nothing in the app applies them to reduced counts any more.

export type SavStrength = 'power-center' | 'baseline' | 'karmic-struggle' | 'moderate';

/** SAV band for a RAW sign total: >=30 a power center, <=25 a karmic-struggle
 * zone, exactly 28 the average; values between get a moderate label. */
export function evaluateSavBand(sarvaBinduCount: number): SavStrength {
  if (sarvaBinduCount >= 30) return 'power-center';
  if (sarvaBinduCount <= 25) return 'karmic-struggle';
  if (sarvaBinduCount === 28) return 'baseline';
  return 'moderate';
}

/** BAV band for a RAW count: 4 or more bindus is the usual rule of thumb for a
 * transiting planet to give good results in that sign. Not from BPHS. */
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
      shodhyaPindaByPlanet[b.planet] = shodhyaPinda(b.bindus, chartData);
    }
  }

  return { bhinna, sarva, shodhyaPinda: shodhyaPindaByPlanet };
}
