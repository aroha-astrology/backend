// =============================================================================
// Health (monthly) report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access. See
// monthly-dasha-context.ts for the shared dasha-resolution + scoring formula
// this and the other 3 monthly reports are built on.
// =============================================================================

import { analyzePlanetStrengths } from '../gemstones.js';
import {
  computeConnectedHouses,
  computeMonthlyReportScore,
  findMonthSubPeriods,
  safelyResolveActivePeriod,
  toneFromMonthScore,
  type MonthlyTone,
  type MonthSubPeriod,
} from './monthly-dasha-context.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import { computeLifeContext, HEALTH_KEY_HOUSES } from './report-life-context.js';
import { buildReportHeader } from './report-header.js';
import type { ReportSharedFacts } from './report-shared-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/** 6th house = ailments/obstacles, 1st house = vitality/the body itself, 8th house =
 * longevity/transformation/chronic or hidden conditions — added alongside the dosha/yoga
 * summary below so the report's house-affinity scoring and its dosha checks are both looking
 * at the full classical health-house set, not just 6/1. */
// KEY_HOUSES imported from report-life-context.ts (single source of truth) rather than declared
// here, to avoid a circular import (that module also imports `computeLifeContext` used below).
const KEY_HOUSES = HEALTH_KEY_HOUSES;

export interface HealthMonthlyScores extends Record<string, unknown>, ReportSharedFacts {
  periodMonth: string;
  activeMahadashaLord: string;
  activeAntardashaLord: string;
  monthScore: number;
  keyHouses: number[];
  tone: MonthlyTone;
  doshaYoga: DoshaYogaSummary;
  /** Within-month Pratyantardasha slices, each independently scored — answers "are there
   * specific weeks this month I should be extra careful about," previously unanswerable at only
   * a whole-month grain. Empty when periodMonth/chart data isn't usable (never throws). */
  subPeriods: MonthSubPeriod[];
  /** Which of `keyHouses` the active Antardasha lord actually connects to (rules or sits in) —
   * answers "which health areas need the most attention this month" with a specific house rather
   * than the single combined monthScore alone. */
  connectedHouses: number[];
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

  const subPeriods = findMonthSubPeriods(chart, periodMonth, KEY_HOUSES, analyses);
  const connectedHouses = period
    ? computeConnectedHouses(period.antardashaLord, KEY_HOUSES, chart)
    : [];

  const lifeContext = computeLifeContext(chart, analyses, ctx.dashaData ?? null, new Date());
  const header = buildReportHeader(chart, ctx.personName, ctx.personDob, lifeContext);

  return {
    header,
    lifeContext,
    periodMonth: periodMonth ?? 'unknown',
    activeMahadashaLord: period?.mahadashaLord ?? 'Unknown',
    activeAntardashaLord: period?.antardashaLord ?? 'Unknown',
    monthScore,
    keyHouses: KEY_HOUSES,
    tone: toneFromMonthScore(monthScore),
    doshaYoga,
    subPeriods,
    connectedHouses,
  };
}
