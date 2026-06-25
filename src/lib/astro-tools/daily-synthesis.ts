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
  transitMoonSign: string;
  transitMoonNakshatra: string | undefined;
  houseFromSign: number;
  favorable: boolean;
  isAshtamaChandra: boolean;
  quality: 'good' | 'challenging' | 'avoid';
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
    const nakshatraIdx = (p.nakshatraIndex as number | undefined) ??
      Math.floor((p.longitude as number) / (360 / 27));
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
    natalSigns[p.planet as string] = (p.signIndex as number) ?? Math.floor((p.longitude as number) / 30);
  }

  // ── 1. Dasha-lord transit quality ────────────────────────────────────────
  let mdQuality: DashaTranistDetail | undefined;
  let adQuality: DashaTranistDetail | undefined;

  if (currentMdPlanet && transitSigns[currentMdPlanet] !== undefined) {
    const raw = dashaLordTransitQuality(currentMdPlanet, transitSigns[currentMdPlanet]);
    mdQuality = { planet: raw.planet, transitSign: raw.transitSign, dignity: raw.dignity, qualityScore: raw.qualityScore, description: raw.description };
  }
  if (currentAdPlanet && transitSigns[currentAdPlanet] !== undefined) {
    const raw = dashaLordTransitQuality(currentAdPlanet, transitSigns[currentAdPlanet]);
    adQuality = { planet: raw.planet, transitSign: raw.transitSign, dignity: raw.dignity, qualityScore: raw.qualityScore, description: raw.description };
  }

  // ── 2. Ashtakavarga — BAV for Kakshya, SAV for overall sign strength ────
  // calculateAshtakavarga returns { bhinnaAshtakavarga, sarvaAshtakavarga }
  const chartData = { planets: natalPlanets, ascendantSign: natalAscMap };
  let bhinnaAvDicts: Array<{ planet: string; bindus: number[] }> = [];
  const savTransit: Record<string, number> = {};

  try {
    const av = calculateAshtakavarga(chartData as never);
    if (av.bhinna) {
      bhinnaAvDicts = av.bhinna.map(
        (b) => ({ planet: b.planet as string, bindus: b.bindus }),
      );
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
  const varaIndex = (now.getUTCDay() + 1); // 1=Sunday .. 7=Saturday
  // tithi: rough estimate from moon-sun angular difference / 12
  // For a full panchang we'd need calculatePanchang; here we use the transit moon nakshatra
  const panchakaResult = computePanchaka(
    (((transitMoonNakIdx ?? 0) + 1) % 30) + 1, // proxy tithi 1-30
    varaIndex,
    (transitMoonNakIdx ?? 0) + 1,              // nakshatra 1-based
    natalAscSignIdx + 1,                        // lagna 1-based
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
export async function moonSignPrediction(moonSignIndex: number): Promise<MoonSignPrediction> {
  const { transitSigns, transitSignNames } = await getCurrentSky();
  const transitMoonSignIdx = transitSigns['Moon'] ?? 0;
  const houseFromSign = ((transitMoonSignIdx - moonSignIndex + 12) % 12) + 1;
  const favorable = [1, 3, 6, 7, 10, 11].includes(houseFromSign);
  const isAshtamaChandra = houseFromSign === 8;

  let quality: 'good' | 'challenging' | 'avoid';
  if (isAshtamaChandra) quality = 'avoid';
  else if (favorable) quality = 'good';
  else quality = 'challenging';

  // Get transit moon nakshatra name by computing planet positions
  const jd = await getJdForDate();
  const planets = (await calculatePlanetPositions(jd)) as unknown as Array<Record<string, unknown>>;
  const moonPlanet = planets.find((p) => p.planet === 'Moon');
  const nakshatra = (moonPlanet?.nakshatra ?? moonPlanet?.nakshatraName) as string | undefined;

  return {
    sign: SIGNS[moonSignIndex] ?? 'Unknown',
    transitMoonSign: transitSignNames['Moon'] ?? SIGNS[transitMoonSignIdx] ?? 'Unknown',
    transitMoonNakshatra: nakshatra,
    houseFromSign,
    favorable,
    isAshtamaChandra,
    quality,
  };
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
