// =============================================================================
// Kundli Milan report — deterministic scoring
// =============================================================================
// The one fully-implemented example report type for the reports feature (see
// modules/reports/report-generator.types.ts for the ReportGenerator contract
// this fulfils). Pure, synchronous, fast — no LLM call, no DB access — called
// both at generation time (to ground the narrative prompt) and at every read
// (to merge fresh scores into the cached narrative, never trusting a
// persisted score — same policy as gemstone's buildDeterministicGems).
// =============================================================================

import type { ZodiacSign } from '@aroha-astrology/shared';
import { calculateAshtakoota } from '../matching/ashtakoota.js';
import { calculateDashakoota } from '../matching/dashakoota.js';
import { detectMangalDosha } from '../doshas/mangalDosha.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

export interface MoonPlacement {
  nakshatraIndex: number;
  sign: ZodiacSign;
}

/**
 * Derive the Moon's birth nakshatra index + sign from a computed chart —
 * the same two facts `matchmake()` derives inline in
 * src/modules/astro/astro.service.ts (from `met.planets`) before calling
 * calculateAshtakoota. Factored out here as a shared, pure helper rather than
 * duplicated inline, since kundli-milan's deterministic scoring needs the
 * exact same derivation for both people. Deliberately NOT wired back into
 * matchmake() itself in this change — that function reads from a differently
 * -shaped raw ephemeris array (met.planets) rather than a stored ChartData,
 * and it already has its own passing test coverage; refactoring it is out of
 * scope for the reports feature.
 *
 * Falls back to Ashwini/Aries (index 0 / 'Aries') if the chart is missing or
 * has no Moon entry — same defensive fallback matchmake() uses. In practice
 * this only matters if generation is somehow triggered before a chart is
 * fully ready.
 */
export function getMoonPlacement(chart: Record<string, unknown> | null): MoonPlacement {
  const planets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  const moon = planets.find((p) => p.planet === 'Moon');
  return {
    nakshatraIndex: (moon?.nakshatraIndex as number | undefined) ?? 0,
    sign: (moon?.sign as ZodiacSign | undefined) ?? 'Aries',
  };
}

export type CompatibilityBand = 'poor' | 'average' | 'good' | 'excellent';

/** Standard classical Ashtakoota convention (out of 36): <18 poor, 18-24 average, 25-32 good, 33-36 excellent. */
function compatibilityBandFromGunaScore(score: number): CompatibilityBand {
  if (score < 18) return 'poor';
  if (score < 25) return 'average';
  if (score < 33) return 'good';
  return 'excellent';
}

export interface KootaBreakdownEntry {
  name: string;
  score: number;
  maxScore: number;
  description: string;
}

export interface KundliMilanScores extends Record<string, unknown> {
  gunaMilanScore: number;
  gunaMaxScore: number;
  gunaBreakdown: KootaBreakdownEntry[];
  dashakootaScore: number;
  dashakootaMaxScore: number;
  dashakootaBreakdown: KootaBreakdownEntry[];
  manglikStatus: {
    person1: boolean;
    person2: boolean;
    /** True when EITHER person's Mangal Dosha is classically cancelled (own sign,
     * exaltation, benefic conjunction/aspect, or a documented house+sign exception —
     * see detectMangalDosha's `type` field, reused verbatim here, not re-derived). */
    cancelled: boolean;
  };
  compatibilityBand: CompatibilityBand;
}

/**
 * `ctx.chart` is person1 (the purchasing user's own chart); `ctx.partnerChart`
 * is person2 (the partner birth details supplied at purchase time, computed
 * fresh via computeMetrology on every call site — see reports.service.ts).
 * `periodMonth` is unused for this one-time report type but kept in the
 * signature to match the shared ReportGenerator['computeScores'] contract.
 */
export function computeKundliMilanScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): KundliMilanScores {
  const chart1 = ctx.chart;
  const chart2 = ctx.partnerChart ?? null;

  const moon1 = getMoonPlacement(chart1);
  const moon2 = getMoonPlacement(chart2);

  const ashtakoota = calculateAshtakoota(moon1.nakshatraIndex, moon2.nakshatraIndex, moon1.sign, moon2.sign);
  const dashakoota = calculateDashakoota(moon1.nakshatraIndex, moon2.nakshatraIndex, moon1.sign, moon2.sign);

  // detectMangalDosha's declared parameter is `ChartData` (a much stricter shape than the
  // `Record<string, unknown> | null` this module receives from ReportScoreContext); ashtakoota.ts/
  // dashakoota.ts/mangalDosha.ts are all `@ts-nocheck` internally, so TypeScript still infers exact
  // types for calculateAshtakoota/calculateDashakoota's PARAMETERS (matched above with no cast
  // needed) but detectMangalDosha's ChartData param genuinely needs one here — the true shape at
  // runtime is only as good as the caller's chart, which is why this is defensively narrowed with
  // `?? undefined`-style null checks around the call, not trusted structurally at compile time.
  const mangal1 = chart1 ? detectMangalDosha(chart1 as unknown as Parameters<typeof detectMangalDosha>[0]) : null;
  const mangal2 = chart2 ? detectMangalDosha(chart2 as unknown as Parameters<typeof detectMangalDosha>[0]) : null;

  const cancelled = mangal1?.type === 'cancelled' || mangal2?.type === 'cancelled';

  return {
    gunaMilanScore: ashtakoota.totalScore,
    gunaMaxScore: ashtakoota.maxTotal,
    gunaBreakdown: ashtakoota.scores.map((s) => ({
      name: s.koota,
      score: s.score,
      maxScore: s.maxScore,
      description: s.description,
    })),
    dashakootaScore: dashakoota.totalScore,
    dashakootaMaxScore: dashakoota.maxTotal,
    dashakootaBreakdown: dashakoota.scores.map((s) => ({
      name: s.name,
      score: s.score,
      maxScore: s.maxScore,
      description: s.description,
    })),
    manglikStatus: {
      person1: mangal1?.present ?? false,
      person2: mangal2?.present ?? false,
      cancelled,
    },
    compatibilityBand: compatibilityBandFromGunaScore(ashtakoota.totalScore),
  };
}
