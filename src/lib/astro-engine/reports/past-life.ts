// =============================================================================
// Past Life report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access. The thinnest-margin
// report in the catalogue (₹25) — kept simple by design: Rahu/Ketu axis facts
// plus 12th-lord strength, read straight from the chart.
// =============================================================================

import { analyzePlanetStrengths, type PlanetStrength } from '../gemstones.js';
import { getHouseLord, getPlanetPosition, strengthOfPlanet } from './chart-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

export interface PastLifeScores extends Record<string, unknown> {
  rahuHouse: number | null;
  rahuSign: string | null;
  ketuHouse: number | null;
  ketuSign: string | null;
  twelfthLordStrength: PlanetStrength;
  /** Planets sharing Rahu's or Ketu's house (whole-sign conjunction) — "karmic amplifiers". */
  conjunctPlanets: string[];
}

export function computePastLifeScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): PastLifeScores {
  const chart = ctx.chart;

  // Read Rahu/Ketu directly from the chart's own data rather than assuming Ketu is always
  // exactly 180 degrees from Rahu — true in classical theory, but this function trusts
  // whatever the chart actually computed rather than re-deriving it.
  const rahu = getPlanetPosition('Rahu', chart);
  const ketu = getPlanetPosition('Ketu', chart);

  const analyses = analyzePlanetStrengths(chart);
  const twelfthLord = getHouseLord(12, chart);
  const twelfthLordStrength = twelfthLord ? strengthOfPlanet(twelfthLord, analyses) : 'average';

  const conjunctPlanets: string[] = [];
  const allPlanets = ((chart?.planets ?? []) as Array<{ planet?: string; house?: number }>) || [];
  for (const p of allPlanets) {
    if (!p.planet || p.planet === 'Rahu' || p.planet === 'Ketu') continue;
    if (typeof p.house !== 'number') continue;
    if (p.house === rahu?.house || p.house === ketu?.house) {
      conjunctPlanets.push(p.planet);
    }
  }

  return {
    rahuHouse: rahu?.house ?? null,
    rahuSign: rahu?.sign ?? null,
    ketuHouse: ketu?.house ?? null,
    ketuSign: ketu?.sign ?? null,
    twelfthLordStrength,
    conjunctPlanets,
  };
}
