// =============================================================================
// Report decade-by-decade forecast arc
// =============================================================================
// Every existing report reads as a single current-moment snapshot. This
// module produces a small number of forward-looking "decade" bands (Years
// 1-10, 11-20, 21-30 from now, by default) each with a 0-100 score and a
// one-line tone, so a report can show a long-arc forecast alongside its
// current-moment reading.
//
// Design (a documented, deliberate simplification, not a shortcut to hide):
// for each decade band, every Mahadasha overlapping that band is found via
// `getVimshottariDashaFromChart` (chart-facts.ts). For EACH overlapping
// Mahadasha, its own lord is treated as the "antardasha lord" input to
// `computeMonthlyReportScore` (monthly-dasha-context.ts) — i.e. decade-level
// granularity scores the Mahadasha lord's own strength + house-affinity,
// rather than resolving individual Antardashas within it. Resolving every
// Antardasha across a 10-year band would be noisy at this timescale (a decade
// view is meant to read as a long arc, not a month-by-month rollup) and would
// require walking `computeFreshAntardashas` for every Mahadasha in every
// band — needless cost for a granularity nobody asked this view to have.
// Each qualifying Mahadasha's score is weighted by how many of the decade's
// years it actually covers (a Mahadasha that only covers 2 of the decade's 10
// years contributes proportionally less to that decade's blended average
// than one that covers all 10), producing one blended average score per
// decade band.
// =============================================================================

import type { DashaPeriod } from '@aroha-astrology/shared';
import { analyzePlanetStrengths } from '../gemstones.js';
import { getVimshottariDashaFromChart } from './chart-facts.js';
import {
  computeMonthlyReportScore,
  toneFromMonthScore,
  type MonthlyTone,
} from './monthly-dasha-context.js';

export interface DecadeBand {
  /** e.g. "Years 1-10" */
  label: string;
  /** ISO date string. */
  startDate: string;
  /** ISO date string. */
  endDate: string;
  /** 0-100, weighted blend of every Mahadasha overlapping this band — see module doc comment. */
  score: number;
  tone: 'challenging' | 'mixed' | 'favorable';
}

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;

/** Neutral placeholder score used ONLY when a decade band has zero overlapping Mahadasha data
 * at all (missing chart/julianDay/Moon data, or a band that falls outside the computed 120-year
 * Vimshottari span entirely) — distinct from `STRENGTH_SCORE.average` (60), which means "this
 * specific planet's natal strength is average," not "we have no data whatsoever." */
const NO_DATA_SCORE = 50;

function addYears(date: Date, years: number): Date {
  return new Date(date.getTime() + years * MS_PER_YEAR);
}

/** Years of overlap between two date ranges, clamped to >= 0 (0 when they don't overlap at all). */
function overlapYears(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, end - start) / MS_PER_YEAR;
}

/**
 * Produces `decades` forward-looking decade bands starting at `now`, each with a 0-100 score and
 * a tone classification — see the module doc comment above for the exact scoring design
 * (Mahadasha-lord-only granularity, time-weighted blend across overlapping Mahadashas).
 *
 * @param chart      `kundli.chartData` — used to derive the Vimshottari Dasha tree (via
 *                   `getVimshottariDashaFromChart`) and each Mahadasha lord's natal strength.
 * @param keyHouses  The report's key houses (e.g. marriage: [7], career: [10]) — passed straight
 *                   through to `computeMonthlyReportScore`'s house-affinity adjustment.
 * @param now        Defaults to `new Date()`; pass explicitly in tests for deterministic output.
 * @param decades    How many 10-year bands to produce, starting at `now`. Defaults to 3
 *                   (Years 1-10, 11-20, 21-30).
 * @returns          Always exactly `decades` bands, in order. Never throws: a chart with no
 *                   derivable dasha tree (or a band with no overlapping Mahadasha data at all)
 *                   yields `NO_DATA_SCORE` (50, tone 'mixed') for the affected band(s) rather
 *                   than failing the whole call.
 */
export function computeDecadeArc(
  chart: Record<string, unknown> | null,
  keyHouses: number[],
  now: Date = new Date(),
  decades: number = 3,
): DecadeBand[] {
  const vimshottari = getVimshottariDashaFromChart(chart);
  const analyses = analyzePlanetStrengths(chart);
  const mahadashas: DashaPeriod[] = vimshottari?.mahadashas ?? [];

  const bands: DecadeBand[] = [];
  for (let i = 0; i < decades; i++) {
    const bandStart = addYears(now, 10 * i);
    const bandEnd = addYears(now, 10 * (i + 1));

    let weightedSum = 0;
    let totalWeight = 0;
    for (const mahadasha of mahadashas) {
      const weight = overlapYears(bandStart, bandEnd, mahadasha.startDate, mahadasha.endDate);
      if (weight <= 0) continue;
      const score = computeMonthlyReportScore(mahadasha.planet, keyHouses, chart, analyses);
      weightedSum += score * weight;
      totalWeight += weight;
    }

    const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : NO_DATA_SCORE;
    const tone: MonthlyTone = toneFromMonthScore(score);

    bands.push({
      label: `Years ${10 * i + 1}-${10 * (i + 1)}`,
      startDate: bandStart.toISOString(),
      endDate: bandEnd.toISOString(),
      score,
      tone,
    });
  }

  return bands;
}
