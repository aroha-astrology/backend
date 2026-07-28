// =============================================================================
// Health (monthly) report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access. See
// monthly-dasha-context.ts for the shared dasha-resolution + scoring formula
// this and the other 3 monthly reports are built on.
// =============================================================================

import { analyzePlanetStrengths } from '../gemstones.js';
import {
  computeMonthlyReportScore,
  safelyResolveActivePeriod,
  toneFromMonthScore,
  type MonthlyTone,
} from './monthly-dasha-context.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/** 6th house = ailments/obstacles, 1st house = vitality/the body itself, 8th house =
 * longevity/transformation/chronic or hidden conditions — added alongside the dosha/yoga
 * summary below so the report's house-affinity scoring and its dosha checks are both looking
 * at the full classical health-house set, not just 6/1. */
const KEY_HOUSES = [6, 1, 8];

export interface HealthMonthlyScores extends Record<string, unknown> {
  periodMonth: string;
  activeMahadashaLord: string;
  activeAntardashaLord: string;
  monthScore: number;
  keyHouses: number[];
  tone: MonthlyTone;
  doshaYoga: DoshaYogaSummary;
}

export function computeHealthMonthlyScores(
  ctx: ReportScoreContext,
  periodMonth: string | null,
): HealthMonthlyScores {
  const chart = ctx.chart;
  const analyses = analyzePlanetStrengths(chart);
  const period = safelyResolveActivePeriod(chart, periodMonth);

  const monthScore = period
    ? computeMonthlyReportScore(period.antardashaLord, KEY_HOUSES, chart, analyses)
    : 50; // neutral default when the dasha tree can't be derived — same "unavailable data" spirit
  // as gemstones.ts's analyzePlanetStrengths falling back to preference:50 on missing position data.

  // Kemdruma (isolated Moon => low emotional/mental resilience), Sade Sati (currently-transiting
  // Saturn cycle => sustained low-energy phase), and Grahan (eclipse affliction) are all
  // directly health/resilience-themed but were previously unchecked by this report — no yoga
  // types are positive-flagged here (this report stays caution-focused; a "raja"-style positive
  // panel belongs to the career report, not health).
  const doshaYoga = computeDoshaYogaSummary(
    ctx.doshaData ?? null,
    ctx.yogaData ?? null,
    ['kemDruma', 'sadeSati', 'grahan'],
    ['benefic', 'mahapurusha'],
  );

  return {
    periodMonth: periodMonth ?? 'unknown',
    activeMahadashaLord: period?.mahadashaLord ?? 'Unknown',
    activeAntardashaLord: period?.antardashaLord ?? 'Unknown',
    monthScore,
    keyHouses: KEY_HOUSES,
    tone: toneFromMonthScore(monthScore),
    doshaYoga,
  };
}
