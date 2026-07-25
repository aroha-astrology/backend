// =============================================================================
// Marriage report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access — called both at
// generation time (to ground the narrative prompt) and at every read (to
// merge fresh scores into the cached narrative, same policy as
// gemstone's buildDeterministicGems / kundli-milan's computeKundliMilanScores).
// =============================================================================

import type { DashaPeriod } from '@aroha-astrology/shared';
import { analyzePlanetStrengths, type PlanetStrength } from '../gemstones.js';
import { detectMangalDosha } from '../doshas/mangalDosha.js';
import {
  getHouseLord,
  getHouseSign,
  getPlanetPosition,
  getVimshottariDashaFromChart,
  strengthOfPlanet,
  strengthScoreOfPlanet,
} from './chart-facts.js';
import { computeFreshAntardashas } from './monthly-dasha-context.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

export type MarriageBand = 'slow_build' | 'steady' | 'accelerated';

export interface MarriageWindow {
  startDate: string;
  endDate: string;
}

export interface MarriageScores extends Record<string, unknown> {
  marriageScore: number;
  band: MarriageBand;
  manglik: { isManglik: boolean; cancelled: boolean };
  seventhLord: string | undefined;
  seventhLordStrength: PlanetStrength;
  venusStrength: PlanetStrength;
  venusHouse: number | undefined;
  jupiterStrength: PlanetStrength;
  jupiterHouse: number | undefined;
  seventhHouseSign: string | undefined;
  /** Classical sign-quality lore for the 7th house sign, e.g. "direct, driven" for Aries —
   * hardcoded, deliberately generic (not fabricated specificity about "who you will marry"). */
  seventhHouseTemperament: string;
  fourthLordStrength: PlanetStrength;
  /** Earliest Mahadasha/Antardasha window (within 15 years of today) whose Mahadasha OR
   * Antardasha lord is the 7th-lord, Venus, or Jupiter. Null if none found in that span, or if
   * the chart lacks the julianDay/Moon data needed to derive a dasha tree at all. */
  strongestWindow: MarriageWindow | null;
  /** Up to 2 further windows after `strongestWindow`, same criteria, chronological order. */
  upcomingWindows: MarriageWindow[];
}

/**
 * Classical sign-quality lore for the 7th house sign — deliberately generic, labeled in the
 * narrative prompt as "classical sign-quality lore, not fabricated specificity about a real
 * person." Not astrological research, just the well-known temperament associated with each sign.
 */
export const SIGN_TEMPERAMENT: Record<string, string> = {
  Aries: 'direct, driven, and quick to commit once decided',
  Taurus: 'steady, sensual, and loyal once trust is earned',
  Gemini: 'curious, communicative, and drawn to a mentally stimulating partner',
  Cancer: 'nurturing, emotionally deep, and protective of home and family',
  Leo: 'warm, generous, and drawn to a partner who admires them openly',
  Virgo: 'thoughtful, practical, and devoted through acts of service',
  Libra: 'harmony-seeking, charming, and genuinely partnership-oriented',
  Scorpio: 'intense, deeply loyal, and drawn to emotional and physical depth',
  Sagittarius: 'freedom-loving, optimistic, and needs a partner who shares their outlook',
  Capricorn: 'committed, ambitious, and serious about long-term responsibility',
  Aquarius: 'independent, unconventional, and values friendship within partnership',
  Pisces: 'romantic, empathetic, and drawn to a soulful emotional connection',
};

/**
 * Documented weighting: simple unweighted average of the 7th-lord, Venus, and Jupiter strength
 * scores (each mapped weak=30/average=60/strong=90 via chart-facts.ts's STRENGTH_SCORE) — these
 * three are the classical marriage/spouse significators (7th lord = the house of partnership
 * itself; Venus = romantic/relational significator; Jupiter = husband/dharma significator used
 * for both genders in this app's single unified reading). No planet is weighted more than
 * another; a future refinement could weight the 7th lord higher, but an unweighted average is
 * the simplest transparent starting point and is what this report ships with.
 */
function computeMarriageScore(seventhLordScore: number, venusScore: number, jupiterScore: number): number {
  return Math.round((seventhLordScore + venusScore + jupiterScore) / 3);
}

/** <40 slow_build, 40-70 steady (inclusive both ends), >70 accelerated. */
function bandFromScore(score: number): MarriageBand {
  if (score < 40) return 'slow_build';
  if (score <= 70) return 'steady';
  return 'accelerated';
}

const MARRIAGE_WINDOW_YEARS = 15;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

function addYears(date: Date, years: number): Date {
  return new Date(date.getTime() + years * DAYS_PER_YEAR * MS_PER_DAY);
}

/**
 * Walks the full Mahadasha tree, independently recomputing each Mahadasha's Antardasha level
 * (never trusting `subPeriods`/`isActive` — see monthly-dasha-context.ts's doc comment for why),
 * and collects every Antardasha-level period within the next `MARRIAGE_WINDOW_YEARS` whose
 * Mahadasha OR Antardasha lord is one of `significators`. Returns them in chronological order.
 */
function findMarriageWindows(
  mahadashas: DashaPeriod[],
  significators: Set<string>,
  now: Date,
): MarriageWindow[] {
  const windowEnd = addYears(now, MARRIAGE_WINDOW_YEARS);
  const windows: MarriageWindow[] = [];

  for (const mahadasha of mahadashas) {
    // Only consider Mahadashas that overlap [now, windowEnd) at all.
    if (mahadasha.endDate.getTime() <= now.getTime() || mahadasha.startDate.getTime() >= windowEnd.getTime()) {
      continue;
    }

    const antardashas = computeFreshAntardashas(mahadasha);
    for (const antardasha of antardashas) {
      if (antardasha.endDate.getTime() <= now.getTime() || antardasha.startDate.getTime() >= windowEnd.getTime()) {
        continue;
      }
      const qualifies = significators.has(mahadasha.planet) || significators.has(antardasha.planet);
      if (!qualifies) continue;

      windows.push({
        startDate: antardasha.startDate.toISOString(),
        endDate: antardasha.endDate.toISOString(),
      });
    }
  }

  windows.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return windows;
}

export function computeMarriageScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): MarriageScores {
  const chart = ctx.chart;

  const analyses = analyzePlanetStrengths(chart);
  const seventhLord = getHouseLord(7, chart);
  const seventhLordStrength = seventhLord ? strengthOfPlanet(seventhLord, analyses) : 'average';
  const seventhLordScore = seventhLord ? strengthScoreOfPlanet(seventhLord, analyses) : 60;

  const venusStrength = strengthOfPlanet('Venus', analyses);
  const venusScore = strengthScoreOfPlanet('Venus', analyses);
  const venusHouse = getPlanetPosition('Venus', chart)?.house;

  const jupiterStrength = strengthOfPlanet('Jupiter', analyses);
  const jupiterScore = strengthScoreOfPlanet('Jupiter', analyses);
  const jupiterHouse = getPlanetPosition('Jupiter', chart)?.house;

  const marriageScore = computeMarriageScore(seventhLordScore, venusScore, jupiterScore);
  const band = bandFromScore(marriageScore);

  const mangal = chart ? detectMangalDosha(chart as unknown as Parameters<typeof detectMangalDosha>[0]) : null;
  const manglik = {
    isManglik: mangal?.present ?? false,
    cancelled: mangal?.type === 'cancelled',
  };

  const seventhHouseSign = getHouseSign(7, chart);
  const seventhHouseTemperament = seventhHouseSign
    ? (SIGN_TEMPERAMENT[seventhHouseSign] ?? 'a distinct temperament shaped by this house\'s sign')
    : 'unknown — 7th house sign unavailable';

  const fourthLord = getHouseLord(4, chart);
  const fourthLordStrength = fourthLord ? strengthOfPlanet(fourthLord, analyses) : 'average';

  const vimshottari = getVimshottariDashaFromChart(chart);
  const significators = new Set<string>(['Venus', 'Jupiter']);
  if (seventhLord) significators.add(seventhLord);

  let strongestWindow: MarriageWindow | null = null;
  let upcomingWindows: MarriageWindow[] = [];
  if (vimshottari) {
    const windows = findMarriageWindows(vimshottari.mahadashas, significators, new Date());
    strongestWindow = windows[0] ?? null;
    upcomingWindows = windows.slice(1, 3);
  }

  return {
    marriageScore,
    band,
    manglik,
    seventhLord,
    seventhLordStrength,
    venusStrength,
    venusHouse,
    jupiterStrength,
    jupiterHouse,
    seventhHouseSign,
    seventhHouseTemperament,
    fourthLordStrength,
    strongestWindow,
    upcomingWindows,
  };
}
