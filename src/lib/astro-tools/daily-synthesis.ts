// =============================================================================
// Daily Forecast Synthesis — stacks all predictive layers into one assessment
// =============================================================================
// Layers (per metrology document):
//   1. Panchang (tithi, vara, nakshatra, yoga, karana)
//   2. Dasha-lord transit quality (dignity in current sky)
//   3. SAV filter (bindu count of sign the dasha lord transits)
//   4. Vedha check (is the auspicious transit obstructed?)
//   5. Kakshya daily score (how many planets in bindu-yielding compartments)
//   6. Tara Bala + Chandrabala (lunar day quality)
//   7. Double-transit (Jupiter ∥ Saturn simultaneous aspect)
//   +  Panchaka danger screening
// =============================================================================

import {
  dateToJulianDay,
  calculatePlanetPositions,
  calculateAshtakavarga,
} from '../astro-engine/index.js';
import { checkAllVedha } from './vedha.js';
import { dailyKakshyaScore } from './kakshya.js';
import { dailyLunarAssessment } from './tara-bala.js';
import { detectDoubleTransit, dashaLordTransitQuality, SIGNS } from './transit.js';
import { computePanchaka } from './panchaka.js';

// =============================================================================
// Types
// =============================================================================

export interface DailySynthesisParams {
  /** Planet array from metrology (each has .planet, .signIndex, .longitude, .nakshatra) */
  natalPlanets: Array<Record<string, unknown>>;
  /** Natal ascendant sign index (0-11) */
  natalAscSignIdx: number;
  /** Natal Moon sign index (0-11) */
  natalMoonSignIdx: number;
  /** Natal Moon nakshatra index (0-26) */
  natalMoonNakIdx: number;
  /** Active Mahadasha lord name (e.g. "Jupiter") */
  currentMdPlanet?: string;
  /** Active Antardasha lord name (e.g. "Venus") */
  currentAdPlanet?: string;
  /** UTC ISO string to compute transits for (defaults to now) */
  asOf?: string;
}

export interface DashaTranistDetail {
  planet: string;
  transitSign: string;
  dignity: string;
  qualityScore: number;
  description: string;
}

export interface DailySynthesisResult {
  date: string;
  /** Aggregate score 1 (poor) – 5 (excellent) */
  score: number;
  dashaTransit: {
    mahadasha?: DashaTranistDetail | undefined;
    antardasha?: DashaTranistDetail | undefined;
  };
  vedha: {
    blockedCount: number;
    details: unknown[];
  };
  kakshya: unknown;
  lunar: unknown;
  doubleTransit: unknown[];
  panchaka: unknown;
  /** SAV bindu count per transit sign */
  savTransit: Record<string, number>;
}

export interface MoonSignPrediction {
  sign: string;
  period: 'daily';
  date: string;
  transitMoonSign: string;
  transitMoonNakshatra: string | undefined;
  houseFromSign: number;
  favorable: boolean;
  isAshtamaChandra: boolean;
  quality: 'good' | 'challenging' | 'avoid';
  score: number;
  /** Short hook line (spec 4.1) — tension→resolution or specific-detail→payoff, tied to the house theme. Use for card view. */
  hook: string;
  description: string;
  advice: string;
  luckyColor: string;
  luckyNumber: number;
  keyTransits: { planet: string; sign: string; house: number; influence: string }[];
}

export type PeriodicPeriod = 'weekly' | 'monthly' | 'yearly';

export interface PeriodicMoonSignPrediction {
  sign: string;
  period: PeriodicPeriod;
  periodStart: string;
  periodEnd: string;
  /** Average of the sampled daily scores (1-5), rounded to the nearest integer for display. */
  score: number;
  quality: 'good' | 'challenging' | 'moderate';
  favorableDays: number;
  totalDaysSampled: number;
  bestDay: { date: string; score: number } | undefined;
  worstDay: { date: string; score: number } | undefined;
  hook: string;
  description: string;
  advice: string;
  luckyColor: string;
  luckyNumber: number;
  /** Snapshot of major-planet placements relative to this sign, taken at periodStart. */
  keyTransits: { planet: string; sign: string; house: number; influence: string }[];
}

export interface SunSignPrediction {
  sign: string;
  transitSunSign: string;
  sunHouseFromSign: number;
  jupiterHouseFromSign: number;
  jupiterFavorable: boolean;
  saturnHouseFromSign: number;
  saturnChallenging: boolean;
  quality: 'good' | 'challenging' | 'moderate';
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get Julian Day for a given UTC ISO string (or now).
 */
async function getJdForDate(asOf?: string): Promise<number> {
  const dt = asOf ? new Date(asOf) : new Date();
  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();
  const hour = dt.getUTCHours();
  const minute = dt.getUTCMinutes();
  return dateToJulianDay(year, month, day, hour, minute, 0);
}

/**
 * Compute current sky planet positions and extract sign/longitude/nakshatra maps.
 */
async function getCurrentSky(asOf?: string): Promise<{
  transitSigns: Record<string, number>;
  transitLons: Record<string, number>;
  transitNakshatras: Record<string, number>;
  transitSignNames: Record<string, string>;
  planets: Array<Record<string, unknown>>;
}> {
  const jd = await getJdForDate(asOf);
  const planets = (await calculatePlanetPositions(jd)) as unknown as Array<Record<string, unknown>>;

  const transitSigns: Record<string, number> = {};
  const transitLons: Record<string, number> = {};
  const transitNakshatras: Record<string, number> = {};
  const transitSignNames: Record<string, string> = {};

  for (const p of planets) {
    const name = p.planet as string;
    const signIdx = (p.signIndex as number | undefined) ?? Math.floor((p.longitude as number) / 30);
    transitSigns[name] = signIdx;
    transitLons[name] = p.longitude as number;
    transitSignNames[name] = SIGNS[signIdx] ?? 'Unknown';

    // nakshatra index: each nakshatra spans 13.333... degrees (360/27)
    const nakshatraIdx =
      (p.nakshatraIndex as number | undefined) ?? Math.floor((p.longitude as number) / (360 / 27));
    transitNakshatras[name] = nakshatraIdx;
  }

  return { transitSigns, transitLons, transitNakshatras, transitSignNames, planets };
}

// =============================================================================
// Score computation
// =============================================================================

function computeAggregateScore(
  mdQuality: DashaTranistDetail | undefined,
  adQuality: DashaTranistDetail | undefined,
  kakshya: Record<string, unknown>,
  lunar: Record<string, unknown> | undefined,
  vedhaBlockedCount: number,
  panchaka: Record<string, unknown>,
): number {
  let score = 3.0; // neutral baseline

  if (mdQuality) score += (mdQuality.qualityScore - 3) * 0.3;
  if (adQuality) score += (adQuality.qualityScore - 3) * 0.2;

  const kakshyaMap: Record<string, number> = { good: 1, average: 0, poor: -0.5 };
  score += kakshyaMap[(kakshya.quality as string) ?? 'average'] ?? 0;

  if (lunar) {
    const lunarMap: Record<string, number> = {
      excellent: 1,
      good: 0.5,
      average: 0,
      poor: -1,
    };
    score += lunarMap[(lunar.overallQuality as string) ?? 'average'] ?? 0;
  }

  score -= vedhaBlockedCount * 0.2;

  if (panchaka && (panchaka.isDangerous as boolean)) {
    score -= 0.5;
  }

  return Math.max(1, Math.min(5, Math.round(score)));
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Full daily synthesis — all 7 predictive layers stacked.
 * Port of Python `synthesize_daily_forecast`.
 */
export async function synthesizeDailyForecast(
  params: DailySynthesisParams,
): Promise<DailySynthesisResult> {
  const {
    natalPlanets,
    natalAscSignIdx,
    natalMoonSignIdx,
    natalMoonNakIdx,
    currentMdPlanet,
    currentAdPlanet,
    asOf,
  } = params;

  const now = asOf ? new Date(asOf) : new Date();
  const dateStr = now.toISOString().slice(0, 10);

  // Current sky positions
  const { transitSigns, transitLons, transitNakshatras, transitSignNames } =
    await getCurrentSky(asOf);

  // Natal planet sign index map
  const natalSigns: Record<string, number> = {};
  const natalAscMap: number = natalAscSignIdx;
  for (const p of natalPlanets) {
    natalSigns[p.planet as string] =
      (p.signIndex as number) ?? Math.floor((p.longitude as number) / 30);
  }

  // ── 1. Dasha-lord transit quality ────────────────────────────────────────
  let mdQuality: DashaTranistDetail | undefined;
  let adQuality: DashaTranistDetail | undefined;

  if (currentMdPlanet && transitSigns[currentMdPlanet] !== undefined) {
    const raw = dashaLordTransitQuality(currentMdPlanet, transitSigns[currentMdPlanet]);
    mdQuality = {
      planet: raw.planet,
      transitSign: raw.transitSign,
      dignity: raw.dignity,
      qualityScore: raw.qualityScore,
      description: raw.description,
    };
  }
  if (currentAdPlanet && transitSigns[currentAdPlanet] !== undefined) {
    const raw = dashaLordTransitQuality(currentAdPlanet, transitSigns[currentAdPlanet]);
    adQuality = {
      planet: raw.planet,
      transitSign: raw.transitSign,
      dignity: raw.dignity,
      qualityScore: raw.qualityScore,
      description: raw.description,
    };
  }

  // ── 2. Ashtakavarga — BAV for Kakshya, SAV for overall sign strength ────
  // calculateAshtakavarga returns { bhinnaAshtakavarga, sarvaAshtakavarga }
  const chartData = { planets: natalPlanets, ascendantSign: natalAscMap };
  let bhinnaAvDicts: Array<{ planet: string; bindus: number[] }> = [];
  const savTransit: Record<string, number> = {};

  try {
    const av = calculateAshtakavarga(chartData as never);
    if (av.bhinna) {
      bhinnaAvDicts = av.bhinna.map((b) => ({ planet: b.planet, bindus: b.bindus }));
    }
    if (av.sarva?.bindus) {
      for (let i = 0; i < 12; i++) {
        savTransit[SIGNS[i] ?? `Sign${i}`] = av.sarva.bindus[i] ?? 0;
      }
    }
  } catch {
    // Non-fatal: continue without BAV data
  }

  // ── 3. Vedha check ───────────────────────────────────────────────────────
  const vedhaResults = checkAllVedha(transitSigns, natalMoonSignIdx);
  const vedhaBlockedCount = vedhaResults.filter((v) => !v.netBenefic && v.isAuspiciousHouse).length;

  // ── 4. Kakshya daily score ───────────────────────────────────────────────
  const kakshya = dailyKakshyaScore(transitLons, bhinnaAvDicts);

  // ── 5. Tara Bala + Chandrabala ───────────────────────────────────────────
  let lunar: ReturnType<typeof dailyLunarAssessment> | undefined;
  const transitMoonNakIdx = transitNakshatras['Moon'];
  const transitMoonSignIdx = transitSigns['Moon'];
  if (transitMoonNakIdx !== undefined && transitMoonSignIdx !== undefined) {
    lunar = dailyLunarAssessment(
      natalMoonNakIdx,
      natalMoonSignIdx,
      transitMoonNakIdx,
      transitMoonSignIdx,
    );
  }

  // ── 6. Double Transit ────────────────────────────────────────────────────
  const jupSign = transitSigns['Jupiter'] ?? 0;
  const satSign = transitSigns['Saturn'] ?? 0;
  const doubleTransit = detectDoubleTransit(jupSign, satSign, natalMoonSignIdx);

  // ── 7. Panchaka ──────────────────────────────────────────────────────────
  // Panchaka needs tithi, vara, nakshatra, lagna indices (all 1-based)
  // Use transit moon sign index as a proxy for nakshatra (1-based)
  const varaIndex = now.getUTCDay() + 1; // 1=Sunday .. 7=Saturday
  // tithi: rough estimate from moon-sun angular difference / 12
  // For a full panchang we'd need calculatePanchang; here we use the transit moon nakshatra
  const panchakaResult = computePanchaka(
    (((transitMoonNakIdx ?? 0) + 1) % 30) + 1, // proxy tithi 1-30
    varaIndex,
    (transitMoonNakIdx ?? 0) + 1, // nakshatra 1-based
    natalAscSignIdx + 1, // lagna 1-based
  );

  // ── Score ─────────────────────────────────────────────────────────────────
  const score = computeAggregateScore(
    mdQuality,
    adQuality,
    kakshya as unknown as Record<string, unknown>,
    lunar as unknown as Record<string, unknown> | undefined,
    vedhaBlockedCount,
    panchakaResult as unknown as Record<string, unknown>,
  );

  return {
    date: dateStr,
    score,
    dashaTransit: {
      ...(mdQuality !== undefined ? { mahadasha: mdQuality } : {}),
      ...(adQuality !== undefined ? { antardasha: adQuality } : {}),
    },
    vedha: { blockedCount: vedhaBlockedCount, details: vedhaResults },
    kakshya,
    lunar,
    doubleTransit,
    panchaka: panchakaResult,
    savTransit,
  };
}

// =============================================================================
// Public Moon-sign / Sun-sign forecasts (unauthenticated / generic)
// =============================================================================

/**
 * Generic Moon-sign daily prediction — not personalised to natal chart.
 * Port of Python `moon_sign_prediction`.
 */
const SIGN_RULERS: Record<string, string> = {
  Aries: 'Mars',
  Taurus: 'Venus',
  Gemini: 'Mercury',
  Cancer: 'Moon',
  Leo: 'Sun',
  Virgo: 'Mercury',
  Libra: 'Venus',
  Scorpio: 'Mars',
  Sagittarius: 'Jupiter',
  Capricorn: 'Saturn',
  Aquarius: 'Saturn',
  Pisces: 'Jupiter',
};

const SIGN_ELEMENTS: Record<string, string> = {
  Aries: 'Fire',
  Taurus: 'Earth',
  Gemini: 'Air',
  Cancer: 'Water',
  Leo: 'Fire',
  Virgo: 'Earth',
  Libra: 'Air',
  Scorpio: 'Water',
  Sagittarius: 'Fire',
  Capricorn: 'Earth',
  Aquarius: 'Air',
  Pisces: 'Water',
};

const LUCKY_COLORS: Record<string, string> = {
  Aries: 'Red',
  Taurus: 'Green',
  Gemini: 'Yellow',
  Cancer: 'White',
  Leo: 'Gold',
  Virgo: 'Blue',
  Libra: 'Pink',
  Scorpio: 'Maroon',
  Sagittarius: 'Purple',
  Capricorn: 'Brown',
  Aquarius: 'Turquoise',
  Pisces: 'Sea Green',
};

const HOUSE_THEMES: Record<number, string> = {
  1: 'self, personality & new beginnings',
  2: 'wealth, family & speech',
  3: 'courage, siblings & short travels',
  4: 'home, mother & emotional peace',
  5: 'creativity, children & romance',
  6: 'health, enemies & daily work',
  7: 'partnerships, marriage & public dealings',
  8: 'transformation, obstacles & hidden matters',
  9: 'luck, higher learning & spirituality',
  10: 'career, status & public recognition',
  11: 'gains, friendships & aspirations',
  12: 'expenses, isolation & spiritual growth',
};

const QUALITY_DESC: Record<string, { desc: string; advice: string; score: number }> = {
  good: {
    desc: 'The cosmic energies are aligned in your favour today. Moon transiting a supportive house brings emotional clarity and positive outcomes.',
    advice:
      'Take initiative on important matters. Good day for meetings, decisions, and starting new ventures.',
    score: 4,
  },
  challenging: {
    desc: "The Moon's transit brings some tension today. You may feel emotionally restless or face minor obstacles.",
    advice:
      'Practice patience and avoid impulsive decisions. Focus on routine tasks and self-care.',
    score: 2,
  },
  avoid: {
    desc: 'Ashtama Chandra — Moon transits the 8th house from your sign. This is traditionally considered unfavorable for new undertakings.',
    advice:
      'Postpone important decisions if possible. Focus on meditation, rest, and completing existing work.',
    score: 1,
  },
};

/**
 * Short hook-line templates per quality bucket (spec 4.1: tension→resolution
 * or specific-detail→payoff, never generic filler). Multiple variants per
 * bucket, picked deterministically so the same sign/day always renders the
 * same hook (traceable, cacheable) while different signs/days vary instead
 * of all repeating "This is a time when..." (spec 4.2).
 */
const HOOK_TEMPLATES: Record<'good' | 'challenging' | 'avoid', ((theme: string) => string)[]> = {
  good: [
    (theme) => `The Moon lights up ${theme} today — a good window to act, not just plan.`,
    (theme) => `Something tied to ${theme} finally moves in your favor.`,
    (theme) => `A supportive Moon puts ${theme} front and center today.`,
  ],
  challenging: [
    (theme) =>
      `Expect a little friction around ${theme} today — nothing dramatic, just slower going.`,
    (theme) => `Today's Moon makes ${theme} feel heavier than usual; give it room.`,
    (theme) => `Patience pays off today, especially anything touching ${theme}.`,
  ],
  avoid: [
    (theme) => `Ashtama Chandra today — a quieter day, especially around ${theme}.`,
    (theme) => `The Moon's least favorable angle today; let ${theme} matters wait if you can.`,
  ],
};

function buildHook(
  quality: 'good' | 'challenging' | 'avoid',
  houseFromSign: number,
  variantSeed: number,
): string {
  const theme = HOUSE_THEMES[houseFromSign] ?? 'your day';
  const templates = HOOK_TEMPLATES[quality];
  const fn = templates[((variantSeed % templates.length) + templates.length) % templates.length]!;
  return fn(theme);
}

function dayOfYearFor(date: Date): number {
  return Math.floor(
    (date.getTime() - new Date(Date.UTC(date.getUTCFullYear(), 0, 0)).getTime()) / 86400000,
  );
}

export async function moonSignPrediction(
  moonSignIndex: number,
  asOf?: string,
): Promise<MoonSignPrediction> {
  const { transitSigns, transitSignNames } = await getCurrentSky(asOf);
  const transitMoonSignIdx = transitSigns['Moon'] ?? 0;
  const houseFromSign = ((transitMoonSignIdx - moonSignIndex + 12) % 12) + 1;
  const favorable = [1, 3, 6, 7, 10, 11].includes(houseFromSign);
  const isAshtamaChandra = houseFromSign === 8;

  let quality: 'good' | 'challenging' | 'avoid';
  if (isAshtamaChandra) quality = 'avoid';
  else if (favorable) quality = 'good';
  else quality = 'challenging';

  const jd = await getJdForDate(asOf);
  const planets = (await calculatePlanetPositions(jd)) as unknown as Array<Record<string, unknown>>;
  const moonPlanet = planets.find((p) => p.planet === 'Moon');
  const nakshatra = (moonPlanet?.nakshatra ?? moonPlanet?.nakshatraName) as string | undefined;

  const signName = SIGNS[moonSignIndex] ?? 'Unknown';
  const qualityInfo = QUALITY_DESC[quality];

  const keyTransits: { planet: string; sign: string; house: number; influence: string }[] = [];
  for (const key of ['Sun', 'Jupiter', 'Saturn', 'Rahu', 'Mars', 'Venus']) {
    const signIdx = transitSigns[key];
    if (signIdx === undefined) continue;
    const house = ((signIdx - moonSignIndex + 12) % 12) + 1;
    const planetSign = transitSignNames[key] ?? SIGNS[signIdx] ?? '';
    const theme = HOUSE_THEMES[house] ?? '';
    keyTransits.push({ planet: key, sign: planetSign, house, influence: theme });
  }

  const effectiveDate = asOf ? new Date(asOf) : new Date();
  const dayOfYear = dayOfYearFor(effectiveDate);
  const luckyNumber = ((moonSignIndex + dayOfYear) % 9) + 1;
  const hook = buildHook(quality, houseFromSign, moonSignIndex + dayOfYear);

  return {
    sign: signName,
    period: 'daily',
    date: effectiveDate.toISOString().slice(0, 10),
    transitMoonSign: transitSignNames['Moon'] ?? SIGNS[transitMoonSignIdx] ?? 'Unknown',
    transitMoonNakshatra: nakshatra,
    houseFromSign,
    favorable,
    isAshtamaChandra,
    quality,
    score: qualityInfo.score,
    hook,
    description: qualityInfo.desc,
    advice: qualityInfo.advice,
    luckyColor: LUCKY_COLORS[signName] ?? 'White',
    luckyNumber,
    keyTransits,
  };
}

// =============================================================================
// Weekly / Monthly / Yearly moon-sign aggregation
// =============================================================================
// Per spec 1.1: these MUST be aggregates of the daily engine output, never
// independent narration — every number here traces back to moonSignPrediction
// calls at sampled dates, just averaged/summarized differently per period.

function isoDateNDaysFrom(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

async function sampleDaily(
  moonSignIndex: number,
  isoDates: string[],
): Promise<MoonSignPrediction[]> {
  const results: MoonSignPrediction[] = [];
  for (const iso of isoDates) {
    results.push(await moonSignPrediction(moonSignIndex, iso));
  }
  return results;
}

function aggregateQuality(avgScore: number): 'good' | 'challenging' | 'moderate' {
  if (avgScore >= 3.3) return 'good';
  if (avgScore <= 2.2) return 'challenging';
  return 'moderate';
}

/** Yearly samples one day per month, so its "days" are really month snapshots — phrase accordingly. */
function sampleUnit(period: PeriodicPeriod): string {
  return period === 'yearly' ? 'months sampled' : 'days';
}

const PERIODIC_HOOK_TEMPLATES: Record<
  'good' | 'challenging' | 'moderate',
  (favorableDays: number, totalDays: number, unit: string) => string
> = {
  good: (fav, total, unit) =>
    `${fav} of the next ${total} ${unit} lean in your favor — a genuinely strong stretch.`,
  challenging: (fav, total, unit) =>
    `Only ${fav} of the next ${total} ${unit} look favorable — pace yourself and pick your moments.`,
  moderate: (fav, total, unit) =>
    `A mixed stretch: ${fav} of the next ${total} ${unit} favor you, the rest ask for patience.`,
};

async function buildPeriodic(
  moonSignIndex: number,
  period: PeriodicPeriod,
  periodStart: string,
  periodEnd: string,
  daily: MoonSignPrediction[],
): Promise<PeriodicMoonSignPrediction> {
  const signName = SIGNS[moonSignIndex] ?? 'Unknown';
  const avgScore = daily.reduce((sum, d) => sum + d.score, 0) / Math.max(1, daily.length);
  const quality = aggregateQuality(avgScore);
  const favorableDays = daily.filter((d) => d.favorable && !d.isAshtamaChandra).length;

  let bestDay: { date: string; score: number } | undefined;
  let worstDay: { date: string; score: number } | undefined;
  for (const d of daily) {
    if (!bestDay || d.score > bestDay.score) bestDay = { date: d.date, score: d.score };
    if (!worstDay || d.score < worstDay.score) worstDay = { date: d.date, score: d.score };
  }

  const unit = sampleUnit(period);
  const periodWord = period === 'weekly' ? 'week' : period === 'monthly' ? 'month' : 'year';
  const bestLabel =
    period === 'yearly' ? `the month starting ${bestDay?.date ?? 'n/a'}` : (bestDay?.date ?? 'n/a');
  const worstLabel =
    period === 'yearly'
      ? `the month starting ${worstDay?.date ?? 'n/a'}`
      : (worstDay?.date ?? 'n/a');
  const hook = PERIODIC_HOOK_TEMPLATES[quality](favorableDays, daily.length, unit);
  const description =
    quality === 'good'
      ? `Averaged across the sampled ${unit}, the transits favor you this ${periodWord}. The strongest point sampled was ${bestLabel}.`
      : quality === 'challenging'
        ? `Averaged across the sampled ${unit}, this ${periodWord} runs cooler than usual. The most difficult point sampled was ${worstLabel} — plan around it if you can.`
        : `A balanced ${periodWord} overall — favorable and challenging ${unit} roughly even out.`;
  const advice =
    quality === 'good'
      ? "Use the favorable days for anything you've been putting off; the rest are fine for routine work."
      : quality === 'challenging'
        ? 'Keep new commitments light where you can, and lean on the few favorable days for anything important.'
        : 'No single day dominates — let your own schedule, not the transits, drive the big decisions this period.';

  // Snapshot of the slower-moving outer planets at period start, relative to this sign.
  const { transitSigns, transitSignNames } = await getCurrentSky(periodStart);
  const keyTransits: { planet: string; sign: string; house: number; influence: string }[] = [];
  for (const key of ['Jupiter', 'Saturn']) {
    const signIdx = transitSigns[key];
    if (signIdx === undefined) continue;
    const house = ((signIdx - moonSignIndex + 12) % 12) + 1;
    keyTransits.push({
      planet: key,
      sign: transitSignNames[key] ?? SIGNS[signIdx] ?? '',
      house,
      influence: HOUSE_THEMES[house] ?? '',
    });
  }

  return {
    sign: signName,
    period,
    periodStart: periodStart.slice(0, 10),
    periodEnd: periodEnd.slice(0, 10),
    score: Math.max(1, Math.min(5, Math.round(avgScore))),
    quality,
    favorableDays,
    totalDaysSampled: daily.length,
    bestDay,
    worstDay,
    hook,
    description,
    advice,
    luckyColor: LUCKY_COLORS[signName] ?? 'White',
    luckyNumber: ((moonSignIndex + dayOfYearFor(new Date(periodStart))) % 9) + 1,
    keyTransits,
  };
}

/** Aggregates the next 7 daily predictions — one call per day, per spec 1.1. */
export async function moonSignWeeklyPrediction(
  moonSignIndex: number,
): Promise<PeriodicMoonSignPrediction> {
  const now = new Date();
  const dates = Array.from({ length: 7 }, (_, i) => isoDateNDaysFrom(now, i));
  const daily = await sampleDaily(moonSignIndex, dates);
  return buildPeriodic(moonSignIndex, 'weekly', dates[0]!, dates[dates.length - 1]!, daily);
}

/**
 * Samples every 3rd day across the next 30 days (10 points) — Jupiter/Saturn
 * (the monthly-context planets, per spec 1.1's simplified roll-up) barely
 * move in a month, so a sparse sample of the faster-moving Moon transit is
 * enough to characterize the month without 30 full computations per request.
 */
export async function moonSignMonthlyPrediction(
  moonSignIndex: number,
): Promise<PeriodicMoonSignPrediction> {
  const now = new Date();
  const dates = Array.from({ length: 10 }, (_, i) => isoDateNDaysFrom(now, i * 3));
  const daily = await sampleDaily(moonSignIndex, dates);
  return buildPeriodic(moonSignIndex, 'monthly', dates[0]!, isoDateNDaysFrom(now, 29), daily);
}

/** Samples one day per month across the next 12 months (12 points). */
export async function moonSignYearlyPrediction(
  moonSignIndex: number,
): Promise<PeriodicMoonSignPrediction> {
  const now = new Date();
  const dates = Array.from({ length: 12 }, (_, i) => isoDateNDaysFrom(now, i * 30));
  const daily = await sampleDaily(moonSignIndex, dates);
  return buildPeriodic(moonSignIndex, 'yearly', dates[0]!, isoDateNDaysFrom(now, 364), daily);
}

export async function moonSignPeriodicPrediction(
  moonSignIndex: number,
  period: PeriodicPeriod,
): Promise<PeriodicMoonSignPrediction> {
  if (period === 'weekly') return moonSignWeeklyPrediction(moonSignIndex);
  if (period === 'monthly') return moonSignMonthlyPrediction(moonSignIndex);
  return moonSignYearlyPrediction(moonSignIndex);
}

/**
 * Generic Sun-sign daily prediction.
 * Port of Python `sun_sign_prediction`.
 */
export async function sunSignPrediction(sunSignIndex: number): Promise<SunSignPrediction> {
  const { transitSigns, transitSignNames } = await getCurrentSky();

  const transitSunSignIdx = transitSigns['Sun'] ?? 0;
  const sunHouseFromSign = ((transitSunSignIdx - sunSignIndex + 12) % 12) + 1;

  const transitJupSignIdx = transitSigns['Jupiter'] ?? 0;
  const jupHouseFromSign = ((transitJupSignIdx - sunSignIndex + 12) % 12) + 1;
  const jupiterFavorable = [2, 5, 7, 9, 11].includes(jupHouseFromSign);

  const transitSatSignIdx = transitSigns['Saturn'] ?? 0;
  const satHouseFromSign = ((transitSatSignIdx - sunSignIndex + 12) % 12) + 1;
  const saturnChallenging = [4, 8, 12].includes(satHouseFromSign);

  let quality: 'good' | 'challenging' | 'moderate';
  if (jupiterFavorable && !saturnChallenging) quality = 'good';
  else if (saturnChallenging && !jupiterFavorable) quality = 'challenging';
  else quality = 'moderate';

  return {
    sign: SIGNS[sunSignIndex] ?? 'Unknown',
    transitSunSign: transitSignNames['Sun'] ?? SIGNS[transitSunSignIdx] ?? 'Unknown',
    sunHouseFromSign,
    jupiterHouseFromSign: jupHouseFromSign,
    jupiterFavorable,
    saturnHouseFromSign: satHouseFromSign,
    saturnChallenging,
    quality,
  };
}
