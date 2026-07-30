// =============================================================================
// Finance (monthly) report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access. See
// monthly-dasha-context.ts for the shared dasha-resolution + scoring formula
// this and the other 3 monthly reports are built on.
// =============================================================================

import { analyzePlanetStrengths } from '../gemstones.js';
import {
  computeMonthlyReportScore,
  findMonthSubPeriods,
  safelyResolveActivePeriod,
  toneFromMonthScore,
  type MonthlyTone,
  type MonthSubPeriod,
} from './monthly-dasha-context.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/** 2nd house = accumulated wealth, 11th house = monthly gains/income. */
const KEY_HOUSES = [2, 11];

export interface FinanceMonthlyScores extends Record<string, unknown> {
  periodMonth: string;
  activeMahadashaLord: string;
  activeAntardashaLord: string;
  monthScore: number;
  keyHouses: number[];
  tone: MonthlyTone;
  /** Dhana-yoga presence — same single-yoga-type signal wealth.ts's own doshaYoga block reads.
   * No dosha list at this single-month scope: every traditional dosha here (mangal, kaalSarp,
   * sadeSati, pitra, kemDruma, grahan, guruChandal) is a fixed natal (or, for sadeSati, a
   * multi-year transiting) condition, not something that meaningfully turns on/off within a
   * single calendar month — surfacing one here would just repeat the SAME caution every month
   * this report is bought for, which reads as noise rather than a month-specific signal. */
  doshaYoga: DoshaYogaSummary;
  /** Within-month Pratyantardasha slices, each independently scored — answers "are there
   * windows this month good for investments or big purchases" and "what decisions are better
   * postponed until next month." Empty when periodMonth/chart data isn't usable (never throws). */
  subPeriods: MonthSubPeriod[];
}

export function computeFinanceMonthlyScores(
  ctx: ReportScoreContext,
  periodMonth: string | null,
): FinanceMonthlyScores {
  const chart = ctx.chart;
  const analyses = analyzePlanetStrengths(chart);
  const period = safelyResolveActivePeriod(chart, periodMonth);

  const monthScore = period
    ? computeMonthlyReportScore(period.antardashaLord, KEY_HOUSES, chart, analyses)
    : 50;

  const doshaYoga = computeDoshaYogaSummary(
    ctx.doshaData ?? null,
    ctx.yogaData ?? null,
    ['kemDruma', 'pitra'],
    ['dhana', 'lunar'],
  );

  const subPeriods = findMonthSubPeriods(chart, periodMonth, KEY_HOUSES, analyses);

  return {
    periodMonth: periodMonth ?? 'unknown',
    activeMahadashaLord: period?.mahadashaLord ?? 'Unknown',
    activeAntardashaLord: period?.antardashaLord ?? 'Unknown',
    monthScore,
    keyHouses: KEY_HOUSES,
    tone: toneFromMonthScore(monthScore),
    doshaYoga,
    subPeriods,
  };
}
