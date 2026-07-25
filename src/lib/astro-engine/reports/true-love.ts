// =============================================================================
// True Love report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access.
// =============================================================================

import { analyzePlanetStrengths } from '../gemstones.js';
import { getHouseLord, isPlanetInHouse, strengthScoreOfPlanet } from './chart-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

export interface TrueLoveScores extends Record<string, unknown> {
  /** Average of 5th-lord strength score and Venus strength score (romance/creativity signifiers). */
  romanceScore: number;
  /** Average of 7th-lord strength score and Venus strength score (partnership signifiers). */
  partnershipScore: number;
  venusInKeyHouse: boolean;
  /** 0-10, higher = more love-marriage-leaning. See computeLoveVsArrangedTilt for the exact formula. */
  loveVsArrangedTilt: number;
}

/**
 * Documented formula: compare "self-initiated romance" signifiers (Venus + 5th lord — the
 * planets classically tied to personal romantic initiative and courtship) against
 * "family-arranged" signifiers (7th lord + 4th lord — partnership formalized through family/home
 * involvement). `tilt = round(5 + (selfInitiated - family) / 12)`, clamped to [0, 10]:
 *   - selfInitiated/family are each 0-100 (average of two STRENGTH_SCORE values in {30,60,90}),
 *     so their difference ranges over [-60, 60].
 *   - Dividing by 12 maps that range onto [-5, 5]; adding 5 recenters it onto [0, 10], with 5
 *     (both sides equal) as the exact neutral midpoint.
 */
function computeLoveVsArrangedTilt(
  venusScore: number,
  fifthLordScore: number,
  seventhLordScore: number,
  fourthLordScore: number,
): number {
  const selfInitiated = (venusScore + fifthLordScore) / 2;
  const family = (seventhLordScore + fourthLordScore) / 2;
  const raw = 5 + (selfInitiated - family) / 12;
  return Math.max(0, Math.min(10, Math.round(raw)));
}

export function computeTrueLoveScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): TrueLoveScores {
  const chart = ctx.chart;
  const analyses = analyzePlanetStrengths(chart);

  const venusScore = strengthScoreOfPlanet('Venus', analyses);

  const fifthLord = getHouseLord(5, chart);
  const fifthLordScore = fifthLord ? strengthScoreOfPlanet(fifthLord, analyses) : 60;

  const seventhLord = getHouseLord(7, chart);
  const seventhLordScore = seventhLord ? strengthScoreOfPlanet(seventhLord, analyses) : 60;

  const fourthLord = getHouseLord(4, chart);
  const fourthLordScore = fourthLord ? strengthScoreOfPlanet(fourthLord, analyses) : 60;

  const romanceScore = Math.round((fifthLordScore + venusScore) / 2);
  const partnershipScore = Math.round((seventhLordScore + venusScore) / 2);
  const venusInKeyHouse = isPlanetInHouse('Venus', [5, 7], chart);
  const loveVsArrangedTilt = computeLoveVsArrangedTilt(
    venusScore,
    fifthLordScore,
    seventhLordScore,
    fourthLordScore,
  );

  return {
    romanceScore,
    partnershipScore,
    venusInKeyHouse,
    loveVsArrangedTilt,
  };
}
