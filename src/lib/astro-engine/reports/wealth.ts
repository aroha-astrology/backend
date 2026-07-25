// =============================================================================
// Wealth report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access.
// =============================================================================

import { analyzePlanetStrengths, type PlanetStrength } from '../gemstones.js';
import { getHouseLord, getPlanetPosition, strengthOfPlanet, strengthScoreOfPlanet } from './chart-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

export type WealthPattern = 'steady_accumulation' | 'volatile_gains' | 'late_blooming';

export interface WealthScores extends Record<string, unknown> {
  /** Unweighted average of 2nd-lord, 11th-lord, and Jupiter strength scores (30/60/90 mapping). */
  wealthScore: number;
  secondLordStrength: PlanetStrength;
  eleventhLordStrength: PlanetStrength;
  jupiterStrength: PlanetStrength;
  jupiterHouse: number | undefined;
  wealthPattern: WealthPattern;
}

/**
 * Documented rule: compare the 2nd-lord (accumulated/saved wealth) strength score against the
 * 11th-lord (income/gains) strength score.
 *   - 2nd notably stronger (diff >= 30, i.e. at least one full weak/average/strong tier ahead)
 *     => 'steady_accumulation' (wealth builds through saving/holding rather than big inflows).
 *   - 11th notably stronger (diff <= -30) => 'volatile_gains' (money arrives in bursts/gains
 *     rather than accumulating steadily).
 *   - Otherwise (roughly tied, |diff| < 30) => 'late_blooming' (no clear early pattern either
 *     way — framed in the narrative as a pattern that takes shape/strengthens later in life).
 * This intentionally does NOT factor in Jupiter's strength — Jupiter is a separate significator
 * surfaced on its own (jupiterStrength/jupiterHouse) and folded into the overall wealthScore, but
 * the steady-vs-volatile-vs-late-blooming SHAPE of the pattern is read purely from 2nd vs 11th.
 */
function wealthPatternFromLordScores(secondLordScore: number, eleventhLordScore: number): WealthPattern {
  const diff = secondLordScore - eleventhLordScore;
  if (diff >= 30) return 'steady_accumulation';
  if (diff <= -30) return 'volatile_gains';
  return 'late_blooming';
}

export function computeWealthScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): WealthScores {
  const chart = ctx.chart;
  const analyses = analyzePlanetStrengths(chart);

  const secondLord = getHouseLord(2, chart);
  const secondLordStrength = secondLord ? strengthOfPlanet(secondLord, analyses) : 'average';
  const secondLordScore = secondLord ? strengthScoreOfPlanet(secondLord, analyses) : 60;

  const eleventhLord = getHouseLord(11, chart);
  const eleventhLordStrength = eleventhLord ? strengthOfPlanet(eleventhLord, analyses) : 'average';
  const eleventhLordScore = eleventhLord ? strengthScoreOfPlanet(eleventhLord, analyses) : 60;

  const jupiterStrength = strengthOfPlanet('Jupiter', analyses);
  const jupiterScore = strengthScoreOfPlanet('Jupiter', analyses);
  const jupiterHouse = getPlanetPosition('Jupiter', chart)?.house;

  const wealthScore = Math.round((secondLordScore + eleventhLordScore + jupiterScore) / 3);
  const wealthPattern = wealthPatternFromLordScores(secondLordScore, eleventhLordScore);

  return {
    wealthScore,
    secondLordStrength,
    eleventhLordStrength,
    jupiterStrength,
    jupiterHouse,
    wealthPattern,
  };
}
