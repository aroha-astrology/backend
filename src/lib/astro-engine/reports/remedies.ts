// =============================================================================
// Remedies report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access. Composes three
// already-built, previously-uncalled Lal Kitab modules into one report:
//   - getLalKitabRemedies (lalkitab/remedies.ts) — the 108-combination
//     planet x house natal remedy database, evaluated for all 9 classical
//     planets' own natal houses (not just "weak" ones — Lal Kitab prescribes
//     remedies per placement, not only for afflicted planets).
//   - buildKarmicProfile (lalkitab/karmicProfile.ts) — ancestral/karmic debts
//     (Rin), Pakka Ghar (permanent house) placements, and blind planets.
//
// Distinct from GET /v1/remedies (astro.service.ts's getRemedies): that path
// serves the free /remedies page, recomputes the chart from raw birth data,
// and only surfaces "weak" (debilitated/retrograde) planets. This module
// reads the already-computed ReportScoreContext.chart and is comprehensive.
//
// Never throws, matching every other report type's `computeScores`
// convention — a malformed/older chart shape degrades to empty arrays rather
// than crashing generation (same discipline as karmicProfileFacts in
// chat-grounding.ts, which this mirrors).
// =============================================================================

import { getLalKitabRemedies } from '../lalkitab/remedies.js';
import { buildKarmicProfile, type KarmicProfile } from '../lalkitab/karmicProfile.js';
import { getPlanetPosition } from './chart-facts.js';
import { analyzePlanetStrengths } from '../gemstones.js';
import { computeLifeContext } from './report-life-context.js';
import { buildReportHeader } from './report-header.js';
import type { ReportSharedFacts } from './report-shared-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';
import type { ChartData, Planet } from '@aroha-astrology/shared';

const CLASSICAL_NINE: Planet[] = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
];

export interface RemediesPlanetEntry {
  planet: string;
  house: number;
  remedies: string[];
  totke: string[];
}

export interface RemediesScores extends Record<string, unknown>, ReportSharedFacts {
  /** One entry per classical planet whose natal house has a Lal Kitab remedy on file — omitted (not zero-filled) when the chart has no house data for that planet. */
  planetRemedies: RemediesPlanetEntry[];
  presentDebts: KarmicProfile['presentDebts'];
  /** Filtered to isInPakkaGhar === true — a strength note, not the full always-evaluated 9-planet list. */
  pakkaGharPlacements: KarmicProfile['pakkaGharPlacements'];
  /** Filtered to isBlind || isHalfBlind — same "only what's actually present" discipline as presentDebts. */
  blindPlanets: KarmicProfile['blindPlanets'];
}

const EMPTY_PROFILE: KarmicProfile = {
  presentDebts: [],
  pakkaGharPlacements: [],
  blindPlanets: [],
};

function safeKarmicProfile(chart: Record<string, unknown> | null | undefined): KarmicProfile {
  if (!chart || !Array.isArray(chart.planets) || !Array.isArray(chart.houses)) return EMPTY_PROFILE;
  try {
    return buildKarmicProfile(chart as unknown as ChartData);
  } catch {
    return EMPTY_PROFILE;
  }
}

export function computeRemediesScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): RemediesScores {
  const chart = ctx.chart;

  const planetRemedies: RemediesPlanetEntry[] = [];
  for (const planet of CLASSICAL_NINE) {
    const pos = getPlanetPosition(planet, chart);
    if (typeof pos?.house !== 'number') continue;
    const { remedies, totke } = getLalKitabRemedies(planet, pos.house);
    if (remedies.length > 0) {
      planetRemedies.push({ planet, house: pos.house, remedies, totke });
    }
  }

  const profile = safeKarmicProfile(chart);

  const analyses = analyzePlanetStrengths(chart);
  const lifeContext = computeLifeContext(chart, analyses, ctx.dashaData ?? null, new Date());
  const header = buildReportHeader(chart, ctx.personName, ctx.personDob, lifeContext);

  return {
    header,
    lifeContext,
    planetRemedies,
    presentDebts: profile.presentDebts,
    pakkaGharPlacements: profile.pakkaGharPlacements.filter((p) => p.isInPakkaGhar),
    blindPlanets: profile.blindPlanets.filter((p) => p.isBlind || p.isHalfBlind),
  };
}
