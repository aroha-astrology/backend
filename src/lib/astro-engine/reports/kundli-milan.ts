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
import { calculateAshtakootaForPair } from '../matching/ashtakoota.js';
import { calculateDashakootaForPair } from '../matching/dashakoota.js';
import { manglikPairStatus, type ManglikPairStatus } from './manglik-status.js';
import { computeMatchRiskFactors, type MatchRiskFactor } from '../matching/match-risks.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import { analyzePlanetStrengths } from '../gemstones.js';
import { computeLifeContext } from './report-life-context.js';
import { buildReportHeader } from './report-header.js';
import { buildReportRemedies } from './report-remedy-slots.js';
import { computeReportVargas, type ReportVarga } from './report-vargas.js';
import type { ReportSharedFactsWithRemedies } from './report-shared-facts.js';
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
 * Null when the chart is missing or its Moon has no nakshatra or sign. This
 * used to fall back to Ashwini in Aries, which turned a not-ready chart into a
 * made-up Guna score instead of an error.
 */
export function getMoonPlacement(chart: Record<string, unknown> | null): MoonPlacement | null {
  const planets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  const moon = planets.find((p) => p.planet === 'Moon');
  if (!moon || !Number.isInteger(moon.nakshatraIndex) || typeof moon.sign !== 'string') return null;
  return { nakshatraIndex: moon.nakshatraIndex as number, sign: moon.sign as ZodiacSign };
}

export type CompatibilityBand = 'poor' | 'average' | 'good' | 'excellent';

/** Standard classical Ashtakoota convention (out of 36): <18 poor, 18-24 average, 25-32 good, 33-36 excellent. */
export function compatibilityBandFromGunaScore(score: number): CompatibilityBand {
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

export interface KundliMilanScores extends Record<string, unknown>, ReportSharedFactsWithRemedies {
  gunaMilanScore: number;
  gunaMaxScore: number;
  gunaBreakdown: KootaBreakdownEntry[];
  dashakootaScore: number;
  dashakootaMaxScore: number;
  dashakootaBreakdown: KootaBreakdownEntry[];
  /**
   * `calculateDashakoota`'s own `overallCompatibility` verdict ('excellent'|'good'|'average'|
   * 'below_average'|'poor') — this was already being computed on every call but silently
   * discarded (only `.totalScore`/`.maxTotal`/`.scores` were ever read out of the result), leaving
   * the narrative with no given verdict to answer "what's the overall Dashakoot verdict on our
   * compatibility?" other than a bare score/max pair. Optional (not required) for the same
   * additive-only reason `MarriageScores.relationshipStatus` is optional — `MatchReportScores`
   * (match-report.ts) extends this interface and its own test fixtures construct literals without
   * this field; making it required would force updates there, out of scope for this change.
   */
  dashakootaCompatibility?: ReturnType<typeof calculateDashakootaForPair>['overallCompatibility'];
  /**
   * `person1`/`person2` are EACH person's EFFECTIVE status: Manglik only when the dosha is found
   * and not cancelled (audit Sprint 5, SB1/SB2; it used to be raw presence, so a cancelled dosha
   * read "present"). `cancelled` stays the either-person flag for older readers; `cancelled1/2`
   * and `reasons1/2` give each person their own cancellation and its reasons
   * (see detectMangalDosha's `cancellations`, reused verbatim, not re-derived).
   */
  manglikStatus: ManglikPairStatus;
  compatibilityBand: CompatibilityBand;
  /**
   * Dosha/yoga summary for the PRIMARY person (`ctx.chart`) ONLY. The partner chart is computed
   * fresh via `computeMetrology` at purchase time (see reports.service.ts) and has no saved
   * `doshaData`/`yogaData`, so this panel stays primary-only. The partner's own Sade Sati and
   * Shani Dhaiya are NOT missing: `withUpcomingTransits` (reports.service.ts) reads them from the
   * partner chart with `analyzeAllDoshasAt` and adds them to the facts as `PARTNER —` lines
   * (audit Sprint 5, M8). The partner's Mangal Dosha is in `manglikStatus` above.
   */
  primaryDoshaYoga: DoshaYogaSummary;
  /** 8 life-area synastry read (wealth/health/children/harmony/career/timing/intimacy/inlaws) —
   * the SAME computeMatchRiskFactors match-report.ts's pricier sibling report already uses
   * (MatchReportScores extends this interface). Was previously computed only for match_report,
   * leaving kundli_milan (which costs MORE, ₹99 vs match_report's ₹50) with no way to answer
   * "how well matched are we on health/finance/career," "what about having children," "is the
   * timing right, or should we wait" — none of which the Guna/Dashakoota koota breakdowns
   * actually speak to directly. Reused here rather than reinvented. */
  riskFactors: MatchRiskFactor[];
  /** Person2's (the partner's) own Navamsa (D9) — kept separate from the shared `vargas` field
   * (which is person1's/the purchasing user's own, same convention every other report type uses),
   * since a synastry report needs BOTH people's D9, not just the primary person's. `[]` when
   * `ctx.partnerChart` has no usable planet longitudes/ascendant (same degrade-gracefully contract
   * as `vargas` itself). */
  partnerVargas?: ReportVarga[];
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
  // Generation marks the row failed and refunds it; never score a made-up Moon.
  if (!moon1 || !moon2) throw new Error('kundli_milan: a Moon position is missing from a chart');

  // The buyer used to be read as the boy whatever their gender.
  const ashtakoota = calculateAshtakootaForPair(moon1, moon2, ctx.personGender, ctx.partnerGender);
  const dashakoota = calculateDashakootaForPair(moon1, moon2, ctx.personGender, ctx.partnerGender);

  // Each person's own effective Manglik status and cancellation reasons (manglik-status.ts).
  const manglikStatus = manglikPairStatus(chart1, chart2);

  // Primary-person-only, by design — see `primaryDoshaYoga`'s doc comment on
  // `KundliMilanScores` above for why the partner side is never attempted here.
  const primaryDoshaYoga = computeDoshaYogaSummary(
    ctx.doshaData ?? null,
    ctx.yogaData ?? null,
    ['kaalSarp', 'sadeSati', 'dhaiya', 'mangal', 'guruChandal'],
    ['raja', 'mahapurusha', 'benefic'],
  );

  // Built before `riskFactors` since computeMatchRiskFactors (below) reads this same object's
  // gunaBreakdown/manglikStatus (its `harmony` factor cross-references the Bhakoot/Nadi kootas).
  const baseScores = {
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
    dashakootaCompatibility: dashakoota.overallCompatibility,
    manglikStatus,
    compatibilityBand: compatibilityBandFromGunaScore(ashtakoota.totalScore),
    primaryDoshaYoga,
  };

  const riskFactors = computeMatchRiskFactors(
    chart1,
    chart2,
    baseScores as KundliMilanScores,
    ctx.dashaData ?? null,
  );

  // header/lifeContext/planetRemedies are scoped to the PRIMARY person (chart1) only — same
  // "primary person's own chart, never the partner's" precedent as primaryDoshaYoga above.
  const now = new Date();
  const analyses1 = analyzePlanetStrengths(chart1);
  const lifeContext = computeLifeContext(chart1, analyses1, ctx.dashaData ?? null, now);
  const header = buildReportHeader(chart1, ctx.personName, ctx.personDob, lifeContext);
  const planetRemedies = buildReportRemedies('kundli_milan', chart1);
  // Navamsa (D9) for BOTH people — the classical marriage chart, read jointly for synastry.
  const vargas = computeReportVargas(chart1, ['D9']);
  const partnerVargas = computeReportVargas(chart2, ['D9']);

  return { ...baseScores, riskFactors, header, lifeContext, planetRemedies, vargas, partnerVargas };
}
