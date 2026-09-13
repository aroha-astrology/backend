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
import {
  getPlanetPosition,
  getVimshottariDashaFromChart,
  strengthScoreOfPlanet,
} from './chart-facts.js';
import {
  computeFreshAntardashas,
  computeMonthlyReportScore,
  toneFromMonthScore,
  type MonthlyTone,
} from './monthly-dasha-context.js';
import type { PlanetAnalysis } from '../gemstones.js';

/** One Antardasha inside a lived Mahadasha chapter (Life So Far only). */
export interface LifeSubPeriod {
  /** e.g. "Age 7–8 · Venus–Sun" */
  label: string;
  /** The Antardasha lord. */
  lord: string;
  /** ISO date string. */
  startDate: string;
  /** ISO date string. */
  endDate: string;
  /** 0-100, internal only — drives the graph shape and tone, never shown to the reader. */
  score: number;
  tone: 'challenging' | 'mixed' | 'favorable';
}

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
  /** Life So Far only: the lived Antardashas of this Mahadasha, in order. */
  subPeriods?: LifeSubPeriod[];
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

/**
 * A Mahadasha shorter than this, once clipped to [birth, now], is dropped: Vimshottari
 * starts mid-period (the first Mahadasha runs only for whatever balance the natal Moon's
 * nakshatra had left), so without this the arc can open with a two-month sliver that reads
 * as a life chapter but isn't one.
 *
 * The STILL-RUNNING chapter is exempt — see `isRunning` below. It is short for the opposite
 * reason (it is clipped at today because it has not finished yet, not because it was nearly
 * over when life started), and it is the single chapter the reader is actually standing in.
 */
const MIN_CHAPTER_YEARS = 1;

function yearsBetweenDates(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_YEAR;
}

const GOOD_HOUSES = new Set([1, 4, 5, 7, 9, 10]);
const DUSTHANA_HOUSES = new Set([6, 8, 12]);

/** 1-based count from house `a` to house `b` (same house = 1). */
function houseDistance(a: number, b: number): number {
  return ((((b - a) % 12) + 12) % 12) + 1;
}

/**
 * Internal 0-100 score for one Mahadasha/Antardasha slice of a lived life:
 *   - 0.4 × Mahadasha lord strength + 0.6 × Antardasha lord strength (30/60/90 each);
 *   - Antardasha lord in a kendra/trikona +10, in a dusthana −10;
 *   - the two lords 6/8 or 2/12 apart −5, 1/7, 5/9 or 3/11 apart +5;
 *   - the usual `keyHouses` affinity adjustment when a report passes key houses.
 */
function lifeChapterScore(
  mahadashaLord: string,
  antardashaLord: string,
  keyHouses: number[],
  chart: Record<string, unknown> | null,
  analyses: PlanetAnalysis[],
): number {
  let score =
    0.4 * strengthScoreOfPlanet(mahadashaLord, analyses) +
    0.6 * strengthScoreOfPlanet(antardashaLord, analyses);

  const adHouse = getPlanetPosition(antardashaLord, chart)?.house;
  if (typeof adHouse === 'number') {
    if (GOOD_HOUSES.has(adHouse)) score += 10;
    else if (DUSTHANA_HOUSES.has(adHouse)) score -= 10;
  }

  const mdHouse = getPlanetPosition(mahadashaLord, chart)?.house;
  if (
    typeof adHouse === 'number' &&
    typeof mdHouse === 'number' &&
    mahadashaLord !== antardashaLord
  ) {
    const d = houseDistance(mdHouse, adHouse);
    if (d === 6 || d === 8 || d === 2 || d === 12) score -= 5;
    else if (d === 1 || d === 7 || d === 5 || d === 9 || d === 3 || d === 11) score += 5;
  }

  if (keyHouses.length > 0) {
    score +=
      computeMonthlyReportScore(antardashaLord, keyHouses, chart, analyses) -
      strengthScoreOfPlanet(antardashaLord, analyses);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * The BACKWARD-looking companion to `computeDecadeArc`: the reader's life from birth to
 * today, as the Mahadashas they have actually already lived through.
 *
 * Two deliberate differences from `computeDecadeArc`, both because the past is a
 * different question from the future:
 *
 *  - Bands are the Mahadashas themselves, not fixed 10-year slices. A Mahadasha IS the
 *    classical unit of a life chapter (and its lord is what the narrative can then talk
 *    about), so cutting the lived past into arbitrary decades would blur exactly the
 *    boundaries a reader recognises — "things changed for me around 26" is a Mahadasha
 *    change, not a decade boundary.
 *  - Each chapter is broken into its lived Antardashas (`subPeriods`), and each slice is
 *    scored by `lifeChapterScore` — both lords' natal strength, the Antardasha lord's house
 *    (kendra/trikona vs dusthana) and the two lords' mutual placement. Scoring the Mahadasha
 *    lord alone gave only 30/60/90, so a whole life read as one flat "Mixed" line. The
 *    chapter's own score is the time-weighted average of its slices. Scores are internal:
 *    the UI shows only the tone and the graph's shape, never the number.
 *  - `keyHouses`, when non-empty, adds the usual house-affinity adjustment on top.
 *
 * Returns `[]` (not a filled placeholder) when there is no derivable dasha tree or no
 * birth date — an empty arc renders as nothing, whereas a NO_DATA_SCORE band would be a
 * fabricated claim about a real person's real past. Never throws.
 */
export function computeLifeSoFarArc(
  chart: Record<string, unknown> | null,
  birthDate: Date | null,
  keyHouses: number[] = [],
  now: Date = new Date(),
): DecadeBand[] {
  if (!birthDate || Number.isNaN(birthDate.getTime())) return [];
  if (birthDate.getTime() >= now.getTime()) return [];

  const vimshottari = getVimshottariDashaFromChart(chart);
  const mahadashas: DashaPeriod[] = vimshottari?.mahadashas ?? [];
  if (mahadashas.length === 0) return [];

  const analyses = analyzePlanetStrengths(chart);
  const bands: DecadeBand[] = [];

  for (const mahadasha of mahadashas) {
    // Clip to the lived window: the running Mahadasha ends at `now`, not at its real
    // end date — this arc describes what has happened, never what is still to come.
    const start = new Date(Math.max(mahadasha.startDate.getTime(), birthDate.getTime()));
    const end = new Date(Math.min(mahadasha.endDate.getTime(), now.getTime()));
    if (end.getTime() <= start.getTime()) continue;

    const isRunning = mahadasha.endDate.getTime() > now.getTime();
    if (!isRunning && yearsBetweenDates(start, end) < MIN_CHAPTER_YEARS) continue;

    const subPeriods: LifeSubPeriod[] = [];
    let weightedSum = 0;
    let totalWeight = 0;
    for (const antardasha of computeFreshAntardashas(mahadasha)) {
      const subStart = new Date(Math.max(antardasha.startDate.getTime(), start.getTime()));
      const subEnd = new Date(Math.min(antardasha.endDate.getTime(), end.getTime()));
      if (subEnd.getTime() <= subStart.getTime()) continue;

      const subScore = lifeChapterScore(
        mahadasha.planet,
        antardasha.planet,
        keyHouses,
        chart,
        analyses,
      );
      const weight = yearsBetweenDates(subStart, subEnd);
      weightedSum += subScore * weight;
      totalWeight += weight;

      const subStartAge = Math.max(0, Math.floor(yearsBetweenDates(birthDate, subStart)));
      const subEndAge = Math.max(subStartAge, Math.floor(yearsBetweenDates(birthDate, subEnd)));
      const ageText =
        subStartAge === subEndAge ? `Age ${subStartAge}` : `Age ${subStartAge}–${subEndAge}`;
      subPeriods.push({
        label: `${ageText} · ${mahadasha.planet}–${antardasha.planet}`,
        lord: antardasha.planet,
        startDate: subStart.toISOString(),
        endDate: subEnd.toISOString(),
        score: subScore,
        tone: toneFromMonthScore(subScore),
      });
    }

    const score =
      totalWeight > 0
        ? Math.round(weightedSum / totalWeight)
        : lifeChapterScore(mahadasha.planet, mahadasha.planet, keyHouses, chart, analyses);
    const startAge = Math.max(0, Math.floor(yearsBetweenDates(birthDate, start)));
    const endAge = Math.max(startAge, Math.floor(yearsBetweenDates(birthDate, end)));

    bands.push({
      label: `Age ${startAge}–${endAge} · ${mahadasha.planet}`,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      score,
      tone: toneFromMonthScore(score),
      subPeriods,
    });
  }

  return bands;
}
