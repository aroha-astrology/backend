import crypto from 'node:crypto';
import {
  runPipeline,
  newState,
  compileResponse,
  scholarStream,
  checkTopicGate,
  computeMetrology,
  synthesizeDailyForecast,
  moonSignPrediction,
  moonSignPeriodicPrediction,
  sunSignPrediction,
  type PeriodicPeriod,
} from '../../lib/swarm/index.js';
import {
  dateToJulianDay,
  calculatePlanetPositions,
  calculateFullPanchangAsync,
  detectMangalDosha,
  getLalKitabRemedies,
  extractActions,
} from '../../lib/astro-engine/index.js';
import {
  buildKarmicProfile,
  type KarmicProfile,
} from '../../lib/astro-engine/lalkitab/karmicProfile.js';
import {
  computeAnnualRotation,
  completedYearsOfAge,
  type AnnualRotation,
} from '../../lib/astro-engine/lalkitab/annualRotation.js';
import { computeVarshphal } from '../../lib/astro-engine/varshphal/index.js';
import { nextEclipses, localEclipses } from '../../lib/astro-engine/panchang/eclipse.js';
import { SIGNS } from '../../lib/astro-tools/index.js';
import { findPredictionsDueForReview, recordPrediction } from './prediction-outcomes.repo.js';
import { MODEL as MODEL_NAME, FORECAST_PERIODIC_TRANSLATION_PROFILE } from '../../config/llm.js';
import {
  rectifyBirthTime,
  type LifeEvent,
  type RectificationResult,
} from '../../lib/astro-engine/calculations/rectification.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import {
  buildProfileFacts,
  type GroundingSource,
  type DomainWindowSink,
} from '../../lib/chat-grounding.js';
import { compactHistory, type ChatTurn } from '../../lib/chat-compaction.js';
import { buildPurchaseFacts } from '../../lib/chat-purchase-facts.js';
import { extractTurnFacts } from '../../lib/chat-fact-extraction.js';
import {
  classifyUserMessage,
  classifyAssistantOutput,
  containsLegalRefusalFraming,
  getNeutralDecline,
} from '../../lib/content-policy.js';
import {
  getKundliForUser,
  withLiveSadeSati,
  tzOffsetHours as tzOffsetHoursForProfile,
} from '../kundli/kundli.service.js';
import { findActiveUserById } from '../users/users.repo.js';
import { getBirthProfile } from '../birth-profiles/birth-profiles.service.js';
import { listBirthProfilesByOwner } from '../birth-profiles/birth-profiles.repo.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';
import { getUserFacts, saveUserFacts } from './user-facts.repo.js';
import '../reports/generators/index.js';
import { findReportById } from '../reports/reports.repo.js';
import {
  partnerInputToBirthRecord,
  hasPartnerBirthInput,
  buildReportScoreContext,
} from '../reports/reports.service.js';
import { REPORT_GENERATORS } from '../reports/report-generator.types.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import type { MatchReportScores } from '../../lib/astro-engine/reports/match-report.js';
import {
  PANCHANG_REFERENCE_POINTS,
  snapToReferencePoint,
  roundCoordToLocationKey,
} from '../../lib/astro-tools/panchang-reference-points.js';
import { findCachedPanchang, upsertCachedPanchang } from './panchang-cache.repo.js';
import { logger } from '../../lib/logger.js';
import type {
  OnboardingRequest,
  ForecastRequest,
  MatchmakingRequest,
  OnboardingResponse,
  ForecastResponse,
  MatchmakingResponse,
} from './astro.schemas.js';
import type { MangalDosha, RegionId, RegionalMonth, Planet } from '@aroha-astrology/shared';

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                  */
/* -------------------------------------------------------------------------- */

export async function onboard(
  userId: string,
  body: OnboardingRequest,
): Promise<OnboardingResponse> {
  const state = newState({
    requestId: crypto.randomUUID(),
    userId,
    intent: 'onboarding',
    consent: body.consent,
    locale: body.locale,
    region: body.region,
    birthRecord: {
      date: body.birth.date,
      time: body.birth.time,
      latitude: body.birth.latitude,
      longitude: body.birth.longitude,
      timezone: body.birth.timezone,
    },
  });

  const result = await runPipeline(state);
  const response = compileResponse(result);

  return {
    profileId: crypto.randomUUID(),
    summary: (response.synthesis as Record<string, unknown> | undefined)
      ? `Ascendant: ${String((response.synthesis as Record<string, unknown>).ascendant)}`
      : 'Chart analysis complete.',
    charts: response.metrology as Record<string, unknown> | undefined,
    insights: Array.isArray(response.findings)
      ? (response.findings as Array<{ claim: string }>).map((f) => f.claim)
      : [],
  };
}

/* -------------------------------------------------------------------------- */
/* Daily forecast (full swarm pipeline)                                        */
/* -------------------------------------------------------------------------- */

export async function dailyForecast(
  userId: string,
  body: ForecastRequest,
): Promise<ForecastResponse> {
  const state = newState({
    requestId: crypto.randomUUID(),
    userId,
    intent: 'daily_forecast',
    consent: body.consent,
    locale: body.locale,
    region: body.region,
    birthRecord: {
      date: body.birth.date,
      time: body.birth.time,
      latitude: body.birth.latitude,
      longitude: body.birth.longitude,
      timezone: body.birth.timezone,
    },
  });

  const result = await runPipeline(state);
  const response = compileResponse(result);

  return {
    date: new Date().toISOString().slice(0, 10),
    forecast: Array.isArray(response.findings)
      ? (response.findings as Array<{ claim: string }>)
          .filter((f) => (f as unknown as { kind: string }).kind !== 'error')
          .map((f) => f.claim)
          .join('\n')
      : '',
    scores: undefined,
    transits: undefined,
    remedies: undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Daily full synthesis (metrology + synthesis, no swarm)                       */
/* -------------------------------------------------------------------------- */

export async function dailyFullSynthesis(
  userId: string,
  body: ForecastRequest,
): Promise<ForecastResponse> {
  const birthRecord = {
    date: body.birth.date,
    time: body.birth.time,
    latitude: body.birth.latitude,
    longitude: body.birth.longitude,
    timezone: body.birth.timezone,
  };

  // Step 1: run the metrologist to get natal chart data
  const metrology = await computeMetrology(birthRecord);

  // Step 2: extract synthesis inputs from metrology.
  // metrology.chart.planets (not the raw metrology.planets) — only the
  // former has house assignment (calculateChart's assignPlanetsToHouses),
  // which synthesizeDailyForecast's Lal Kitab remedy lookup needs to find a
  // debilitated Dasha lord's natal house.
  const chart = (metrology.chart as Record<string, unknown>) ?? {};
  const natalPlanets =
    (chart.planets as Array<Record<string, unknown>> | undefined) ??
    (metrology.planets as Array<Record<string, unknown>>) ??
    [];
  const dasha = (metrology.dasha as Record<string, unknown>) ?? {};

  // Extract ascendant sign index
  const ascendant = chart.ascendant as Record<string, unknown> | undefined;
  const natalAscSignIdx = (ascendant?.signIndex as number) ?? 0;

  // Extract natal moon
  const moonPlanet = natalPlanets.find((p) => p.planet === 'Moon');
  const natalMoonSignIdx = (moonPlanet?.signIndex as number) ?? 0;
  const natalMoonNakIdx = (moonPlanet?.nakshatraIndex as number) ?? 0;

  // Extract current dasha lords
  const currentMd = dasha.currentMahadasha as Record<string, unknown> | undefined;
  const currentAd = dasha.currentAntardasha as Record<string, unknown> | undefined;
  const currentMdPlanet = (currentMd?.lord ?? currentMd?.planet) as string | undefined;
  const currentAdPlanet = (currentAd?.lord ?? currentAd?.planet) as string | undefined;

  const synthesis = await synthesizeDailyForecast({
    natalPlanets,
    natalAscSignIdx,
    natalMoonSignIdx,
    natalMoonNakIdx,
    ...(currentMdPlanet ? { currentMdPlanet } : {}),
    ...(currentAdPlanet ? { currentAdPlanet } : {}),
  });

  return {
    date: synthesis.date,
    forecast: `Daily score: ${synthesis.score}/5`,
    scores: { overall: synthesis.score },
    transits: synthesis.doubleTransit as Array<Record<string, unknown>>,
    remedies: undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Matchmaking (Ashtakoota)                                                    */
/* -------------------------------------------------------------------------- */

export async function matchmake(
  userId: string,
  body: MatchmakingRequest,
): Promise<MatchmakingResponse> {
  const { calculateAshtakoota } = await import('../../lib/astro-engine/matching/ashtakoota.js');

  // calculateAshtakoota(nakshatraIndex1, nakshatraIndex2, moonSign1, moonSign2)
  // We need to compute natal Moon nakshatra and sign for each person.
  // Birth data only has lat/lng/date — we forward to metrologist for each.
  const { computeMetrology } = await import('../../lib/swarm/agents/metrologist.js');
  const met1 = await computeMetrology({
    date: body.person1.date,
    time: body.person1.time,
    latitude: body.person1.latitude,
    longitude: body.person1.longitude,
    timezone: body.person1.timezone,
  });
  const met2 = await computeMetrology({
    date: body.person2.date,
    time: body.person2.time,
    latitude: body.person2.latitude,
    longitude: body.person2.longitude,
    timezone: body.person2.timezone,
  });

  const planets1 = (met1.planets as Array<Record<string, unknown>>) ?? [];
  const planets2 = (met2.planets as Array<Record<string, unknown>>) ?? [];
  const moon1 = planets1.find((p) => p.planet === 'Moon');
  const moon2 = planets2.find((p) => p.planet === 'Moon');

  const nak1 = (moon1?.nakshatraIndex as number) ?? 0;
  const nak2 = (moon2?.nakshatraIndex as number) ?? 0;
  const sign1 = (moon1?.sign as string) ?? 'Aries';
  const sign2 = (moon2?.sign as string) ?? 'Aries';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  const result = calculateAshtakoota(nak1, nak2, sign1 as any, sign2 as any);

  // Nadi (0/8) and Bhakoot (0/7) are near-disqualifying red flags checked
  // independently of the 36-point total — a practitioner would flag these first.
  const nadiScore = result.scores.find((s) => s.koota === 'Nadi');
  const bhakootScore = result.scores.find((s) => s.koota === 'Bhakoot');
  const flags = {
    nadiDosha: nadiScore?.score === 0,
    bhakootDosha: bhakootScore?.score === 0,
  };

  // Mangal Dosha (Kuja Dosha) — checked separately from the 36-point system,
  // since traditional practitioners treat it as its own pass/fail gate. Pass
  // each person's birth date through so a classically-undocumented age-28
  // folk caveat can be noted (never gates cancellation/severity — see
  // mangalDosha.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  const mangal1 = detectMangalDosha(met1.chart as any, body.person1.date);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  const mangal2 = detectMangalDosha(met2.chart as any, body.person2.date);

  const isActive1 = mangal1.present && mangal1.type !== 'cancelled';
  const isActive2 = mangal2.present && mangal2.type !== 'cancelled';
  const mangalDosha = {
    person1: mangal1.present,
    person2: mangal2.present,
    type1: mangal1.type,
    type2: mangal2.type,
    description1: mangal1.description,
    description2: mangal2.description,
    // "Matched" means effectively-Manglik status agrees on both sides — a
    // dosha that's present but classically cancelled counts as NOT Manglik
    // here, same as never having it (see buildMatchRecommendation below).
    matched: isActive1 === isActive2,
  };

  const recommendation = buildMatchRecommendation(
    result.totalScore,
    result.maxTotal,
    flags,
    mangal1,
    mangal2,
  );

  // Ascendant (Lagna)-based results, including the Lagna reference point of
  // Mangal Dosha, are sensitive to exact birth time. A caller-declared
  // 'unknown' time means the submitted time is a placeholder, not a real
  // reported one — surface that instead of silently trusting it.
  const lagnaCaveat =
    body.person1.timeAccuracy === 'unknown' || body.person2.timeAccuracy === 'unknown'
      ? 'Exact birth time was not provided for one or both people — the Lagna (Ascendant)-based reading, including any Mangal Dosha assessed from the Lagna, may be inaccurate. Moon- and Venus-based results are unaffected.'
      : undefined;

  return {
    totalScore: result.totalScore,
    maxScore: result.maxTotal,
    kutaDetails: result.scores.map((s) => ({
      name: s.koota,
      obtained: s.score,
      maximum: s.maxScore,
      description: s.description,
    })),
    compatibility: result.overallCompatibility,
    recommendation,
    flags,
    mangalDosha,
    ...(lagnaCaveat ? { lagnaCaveat } : {}),
  };
}

/**
 * Deterministic, template-based recommendation built only from the computed
 * Koota scores and dosha flags above — never LLM-generated, so it can never
 * invent relationship advice not traceable to the actual analysis.
 *
 * Mangal Dosha status is "effective" status, not raw presence: a dosha that
 * is present but classically cancelled (own sign, Jupiter aspect/conjunction,
 * a documented house+sign exception, mutual cancellation is handled by the
 * "both active" branch below) is treated the same as never having the dosha
 * at all — otherwise a fully rectified chart (e.g. Mars in Aries in the 1st
 * house, aspected by Jupiter) would incorrectly read as an active mismatch
 * against a clean partner.
 */
export function buildMatchRecommendation(
  totalScore: number,
  maxTotal: number,
  flags: { nadiDosha: boolean; bhakootDosha: boolean },
  mangal1: MangalDosha,
  mangal2: MangalDosha,
): string {
  const parts: string[] = [];
  const pct = maxTotal > 0 ? (totalScore / maxTotal) * 100 : 0;

  if (flags.nadiDosha) {
    parts.push(
      'Nadi Dosha is present (0/8) — traditionally considered a serious red flag affecting the health of progeny, regardless of the total score.',
    );
  }
  if (flags.bhakootDosha) {
    parts.push(
      "Bhakoot Dosha is present (0/7) — traditionally considered to affect the couple's general relationship, love, and family life.",
    );
  }

  const isActive1 = mangal1.present && mangal1.type !== 'cancelled';
  const isActive2 = mangal2.present && mangal2.type !== 'cancelled';

  if (isActive1 !== isActive2) {
    const inactiveMangal = isActive1 ? mangal2 : mangal1;
    const cancelNote =
      inactiveMangal.present && inactiveMangal.type === 'cancelled'
        ? ' (the other partner does have Mars in a Mangal Dosha house too, but it is classically cancelled there, so this is a genuine mismatch, not just an apparent one)'
        : '';
    parts.push(
      `Mangal Dosha is actively present in only one partner's chart${cancelNote} — traditionally this asymmetry is discussed with an astrologer, as a matching Mangal Dosha status (present or absent in both, after accounting for cancellation) is usually considered more favorable than a mismatch.`,
    );
  } else if (isActive1) {
    parts.push(
      'Mangal Dosha is actively present in both charts, which traditional practitioners often consider self-cancelling.',
    );
  } else if (
    (mangal1.present && mangal1.type === 'cancelled') ||
    (mangal2.present && mangal2.type === 'cancelled')
  ) {
    parts.push(
      'Mangal Dosha was found in at least one chart but is classically cancelled there, so it does not affect compatibility.',
    );
  }

  if (parts.length === 0) {
    parts.push(
      pct >= 75
        ? 'No Nadi, Bhakoot, or Mangal Dosha mismatch was found, and the overall Guna score is strong.'
        : pct >= 50
          ? 'No Nadi, Bhakoot, or Mangal Dosha mismatch was found, though the overall Guna score is moderate.'
          : 'No Nadi, Bhakoot, or Mangal Dosha mismatch was found, but the overall Guna score is on the lower side.',
    );
  }

  return parts.join(' ');
}

/* -------------------------------------------------------------------------- */
/* Panchang (public)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Panchang depends only on (date, location) — never on who's asking — so
 * every request is served from panchang_cache instead of recomputing per
 * request, and shared by every user who resolves to the same cache key on
 * that day. A request landing on one of the named reference points (see
 * astro-tools/panchang-reference-points.ts) uses that city's stable key —
 * cron-warmed and shared across the whole metro. Any other coordinate falls
 * back to a rounded-to-2-decimal-places key (still shared across nearby
 * users, just not pre-warmed), so no location ever skips the cache.
 */
export async function getPanchang(
  lat: number,
  lon: number,
  dateStr?: string,
  opts: { bypassCache?: boolean } = {},
) {
  const date = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const refKey = snapToReferencePoint(lat, lon) ?? roundCoordToLocationKey(lat, lon);
  if (!opts.bypassCache) {
    const cached = await findCachedPanchang(isoDate, refKey);
    if (cached) {
      return { date: isoDate, ...cached.data };
    }
  }

  // India's civil clock is a single fixed UTC+5:30 nationwide (anchored to
  // 82.5°E, not local solar longitude) — it is NOT derivable from (lat, lon).
  // A previous version of this line approximated it via Math.round((lon/15)*2)/2
  // (half-hour rounding), which looked like a fix but still resolved to 5.0
  // instead of 5.5 for every city west of ~78.75°E — i.e. Delhi, Mumbai, and
  // Bengaluru (3 of the 5 warmed reference points), shifting sunrise/sunset
  // and every derived window (Rahu/Gulika/Yamaganda Kaal, Abhijit Muhurta,
  // Choghadiya, Hora) ~30min early. This product only serves Indian panchang,
  // so hardcode the real civil offset instead of re-deriving an approximation.
  const timezoneOffset = 5.5;

  // Calculate Julian Day for noon local time
  const jd = await dateToJulianDay(year, month, day, 12, 0, timezoneOffset);

  // Get planet positions for Sun and Moon sidereal longitudes
  const planets = await calculatePlanetPositions(jd);
  const sun = planets.find((p) => p.planet === 'Sun');
  const moon = planets.find((p) => p.planet === 'Moon');

  const sunLong = sun?.longitude ?? 0;
  const moonLong = moon?.longitude ?? 0;

  // Calculate full panchang using the astro-engine
  const panchang = await calculateFullPanchangAsync(
    date,
    lat,
    lon,
    sunLong,
    moonLong,
    timezoneOffset,
  );

  await upsertCachedPanchang({ forDate: isoDate, refKey, lat, lon, data: panchang });

  return {
    date: isoDate,
    ...panchang,
  };
}

/**
 * Full moon = tithi 15 (end of Shukla Paksha), new moon = tithi 30 (end of
 * Krishna Paksha), Ekadashi = the 11th tithi of either paksha (11 or 26) —
 * see calculateTithi's 1-30 numbering in lib/astro-engine/panchang/tithi.ts.
 */
export function classifyTithiForCalendar(tithiNumber: number): {
  isFullMoon: boolean;
  isNewMoon: boolean;
  isEkadashi: boolean;
} {
  return {
    isFullMoon: tithiNumber === 15,
    isNewMoon: tithiNumber === 30,
    isEkadashi: tithiNumber === 11 || tithiNumber === 26,
  };
}

export interface PanchangMonthDay {
  day: number;
  isoDate: string;
  tithiName: string;
  tithiNumber: number;
  paksha: string;
  nakshatraName: string;
  vara: string;
  isFullMoon: boolean;
  isNewMoon: boolean;
  isEkadashi: boolean;
  /** This day's own regional-month view, per region — unlike the whole-month `PanchangMonthResult.regionalMonths` label below, this reflects THIS specific day (needed for the calendar grid's per-day date, e.g. day-of-solar-month, which can differ from a mid-month snapshot near a regional month boundary). */
  regionalMonths: Record<RegionId, RegionalMonth> | null;
}

export interface PanchangMonthResult {
  days: PanchangMonthDay[];
  /** The regional lunar/solar calendar view (Vikram Samvat, Shalivahana Shaka, Bengali San) for
   * this month, taken from a single representative day (the 15th) rather than recomputed per
   * day — a whole-month label, not a per-day fact, and mid-month avoids the edge case where day 1
   * could sit just before/after a regional new-year boundary. */
  regionalMonths: Record<RegionId, RegionalMonth> | null;
}

/**
 * Lightweight per-day summaries for a calendar month view. Reuses getPanchang
 * per day (which already caches per reference point), fetched in parallel —
 * no separate month-cache table needed. A non-reference lat/lon (e.g. an
 * exact GPS fix) recomputes fresh for every day; acceptable for a
 * once-per-navigation calendar view, not a hot path.
 */
export async function getPanchangMonth(
  year: number,
  month: number,
  lat: number,
  lon: number,
): Promise<PanchangMonthResult> {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const midMonthDay = Math.min(15, daysInMonth);

  let regionalMonths: Record<RegionId, RegionalMonth> | null = null;

  const days = await Promise.all(
    dayNumbers.map(async (day) => {
      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const panchang = await getPanchang(lat, lon, isoDate);
      const { isFullMoon, isNewMoon, isEkadashi } = classifyTithiForCalendar(panchang.tithi.number);
      if (day === midMonthDay) {
        regionalMonths = panchang.regionalMonths ?? null;
      }
      return {
        day,
        isoDate,
        tithiName: panchang.tithi.name,
        tithiNumber: panchang.tithi.number,
        paksha: panchang.tithi.paksha,
        nakshatraName: panchang.nakshatra.name,
        vara: panchang.vara ?? '',
        isFullMoon,
        isNewMoon,
        isEkadashi,
        regionalMonths: panchang.regionalMonths ?? null,
      };
    }),
  );

  return { days, regionalMonths };
}

export interface PanchangWarmupResult {
  forDate: string;
  warmed: number;
  failed: number;
}

/**
 * Pre-populate panchang_cache for all 5 named reference points for a given
 * date (default: today) — run once daily, before traffic, so users hitting
 * a metro reference point get a cache hit instead of computing fresh.
 * force=true recomputes and overwrites even if already cached (e.g. after an
 * astro-engine bugfix, to flush a day computed with the old logic).
 */
export async function warmupPanchangCache(
  opts: { forDate?: string | undefined; force?: boolean | undefined } = {},
): Promise<PanchangWarmupResult> {
  const forDate = opts.forDate ?? new Date().toISOString().slice(0, 10);
  const force = opts.force ?? false;
  let warmed = 0;
  let failed = 0;

  for (const point of PANCHANG_REFERENCE_POINTS) {
    try {
      if (!force) {
        const existing = await findCachedPanchang(forDate, point.key);
        if (existing) continue;
      }
      // getPanchang itself upserts the cache row when the coords snap to a
      // reference point (which these do, by construction) — reuse it rather
      // than duplicating the compute-and-cache logic. bypassCache is needed
      // for force=true, since getPanchang would otherwise just re-return the
      // still-existing stale row instead of recomputing it.
      await getPanchang(point.lat, point.lon, forDate, { bypassCache: force });
      warmed++;
    } catch (err) {
      failed++;
      logger.error(
        { err, forDate, refKey: point.key },
        'panchang warmup failed for reference point',
      );
    }
  }

  logger.info({ forDate, warmed, failed }, 'panchang cache warmup complete');
  return { forDate, warmed, failed };
}

/* -------------------------------------------------------------------------- */
/* Moon-sign / Sun-sign public forecasts                                       */
/* -------------------------------------------------------------------------- */

export async function moonSignForecast(
  signIndex: number,
  period: 'daily' | PeriodicPeriod = 'daily',
  language: string = 'en',
) {
  let result;
  if (period === 'daily') result = await moonSignPrediction(signIndex);
  else result = await moonSignPeriodicPrediction(signIndex, period);

  if (language === 'en') return result;

  // For periodic forecasts that might not have an `asOf` string directly on them,
  // we use today's date for cache keying
  const forDate = (result as { asOf?: string }).asOf ?? new Date().toISOString().split('T')[0]!;
  return getCachedForecastTranslation(forDate, 'moon', signIndex, period, language, result);
}

export async function sunSignForecast(signIndex: number, language: string = 'en') {
  const result = await sunSignPrediction(signIndex);
  if (language === 'en') return result;

  const forDate = new Date().toISOString().split('T')[0]!;
  return getCachedForecastTranslation(forDate, 'sun', signIndex, 'daily', language, result);
}

import { db } from '../../config/db.js';
import { forecastTranslations } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { translateForecastContent } from '../../lib/llm/horoscope.js';
import { INCOME_ASK_FACT } from '../../lib/chat-income.js';
import { resolveFeaturesForUser } from '../features/features.service.js';

async function getCachedForecastTranslation<T>(
  forDate: string,
  signType: string,
  signIndex: number,
  period: string,
  language: string,
  englishContent: T,
): Promise<T> {
  const dateOnly = forDate.split('T')[0]!;
  const existing = await db
    .select({ data: forecastTranslations.data })
    .from(forecastTranslations)
    .where(
      and(
        eq(forecastTranslations.forDate, dateOnly),
        eq(forecastTranslations.signType, signType),
        eq(forecastTranslations.signIndex, signIndex),
        eq(forecastTranslations.period, period),
        eq(forecastTranslations.language, language),
      ),
    )
    .limit(1)
    .then((r) => r[0]);

  if (existing) {
    return existing.data as T;
  }

  try {
    const translated = await translateForecastContent(
      englishContent,
      language,
      period === 'daily' ? undefined : FORECAST_PERIODIC_TRANSLATION_PROFILE,
    );
    await db
      .insert(forecastTranslations)
      .values({
        forDate: dateOnly,
        signType,
        signIndex,
        period,
        language,
        data: translated,
      })
      .onConflictDoNothing(); // If another request raced and inserted it, that's fine
    return translated;
  } catch (err) {
    logger.warn({ err, signType, signIndex, language }, 'failed to translate forecast');
    return englishContent; // fallback to English if translation fails
  }
}

/* -------------------------------------------------------------------------- */
/* Remedies                                                                    */
/* -------------------------------------------------------------------------- */

/** General remedies served when no chart data is available. */
const GENERAL_REMEDIES = [
  {
    planet: 'General',
    title: 'Career Growth',
    icon: 'briefcase',
    remedy: 'Chant Om Brihaspataye Namah 108 times every Thursday morning facing east.',
  },
  {
    planet: 'General',
    title: 'Marriage & Love',
    icon: 'heart',
    remedy: 'Offer white flowers to Goddess Lakshmi on Fridays and recite Om Shri Lakshmyai Namah.',
  },
  {
    planet: 'General',
    title: 'Health & Vitality',
    icon: 'leaf',
    remedy: 'Recite the Mahamrityunjaya Mantra 108 times daily at sunrise for overall well-being.',
  },
  {
    planet: 'General',
    title: 'Financial Abundance',
    icon: 'coins',
    remedy: "Donate yellow lentils (chana dal) to a Brahmin on Thursday for Jupiter's blessings.",
  },
  {
    planet: 'General',
    title: 'Mental Peace',
    icon: 'brain',
    remedy: 'Light a ghee lamp in front of Lord Shiva on Mondays and offer milk to Shivalinga.',
  },
  {
    planet: 'General',
    title: 'Family Harmony',
    icon: 'home',
    remedy: 'Keep a Tulsi plant at the entrance of your home and water it daily except Sundays.',
  },
];

/** Planet-specific Vedic remedies for weak/afflicted planets. */
const PLANET_REMEDIES: Record<string, { title: string; icon: string; remedy: string }> = {
  Sun: {
    title: 'Strengthen the Sun',
    icon: 'sun',
    remedy:
      'Offer water (arghya) to the Sun at sunrise daily. Wear a Ruby (Manikya) set in gold on the ring finger on a Sunday.',
  },
  Moon: {
    title: 'Strengthen the Moon',
    icon: 'moon',
    remedy:
      'Wear a Pearl (Moti) in silver on the little finger on a Monday. Drink water from a silver glass. Offer milk to Shivalinga on Mondays.',
  },
  Mars: {
    title: 'Pacify Mars',
    icon: 'flame',
    remedy:
      'Recite Hanuman Chalisa on Tuesdays. Donate red lentils (masoor dal) on Tuesdays. Wear a Red Coral (Moonga) on the ring finger.',
  },
  Mercury: {
    title: 'Strengthen Mercury',
    icon: 'book-open',
    remedy:
      'Wear an Emerald (Panna) in gold on the little finger on a Wednesday. Feed green vegetables to cows. Chant Om Budhaya Namah.',
  },
  Jupiter: {
    title: 'Strengthen Jupiter',
    icon: 'sparkles',
    remedy:
      'Wear a Yellow Sapphire (Pukhraj) in gold on the index finger on a Thursday. Offer bananas and yellow sweets at a temple. Apply saffron tilak.',
  },
  Venus: {
    title: 'Strengthen Venus',
    icon: 'diamond',
    remedy:
      'Wear a Diamond or White Sapphire on the middle finger on a Friday. Donate white clothes or sugar on Fridays. Recite Om Shukraya Namah.',
  },
  Saturn: {
    title: 'Pacify Saturn',
    icon: 'shield',
    remedy:
      'Donate black sesame seeds, mustard oil, or iron items on Saturdays. Wear a Blue Sapphire (Neelam) only after a trial period. Recite Shani Stotra.',
  },
  Rahu: {
    title: 'Pacify Rahu',
    icon: 'cloud',
    remedy:
      'Donate coconut, blanket, or electrical items on Saturdays. Keep fennel (saunf) under your pillow. Chant Om Rahave Namah 108 times.',
  },
  Ketu: {
    title: 'Pacify Ketu',
    icon: 'eye',
    remedy:
      "Donate a black-and-white blanket on Tuesdays or Saturdays. Feed stray dogs. Wear a Cat's Eye (Lehsunia) in silver on the middle finger.",
  },
};

export interface RemedyItem {
  planet: string;
  title: string;
  icon: string;
  remedy: string;
  /** Slugs extracted from `remedy` (see extractActions) for the frontend's
   * shared image-per-slug asset library — added uniformly in withActions()
   * below rather than duplicated across GENERAL_REMEDIES / PLANET_REMEDIES /
   * the Lal Kitab branch, so every RemedyItem this function returns gets one. */
  actions?: string[];

  /* ---- Detailed Lal Kitab fields, present only on the per-planet entries ----
   * The free /remedies page renders a full report (every placement explained
   * in both technical and plain terms), not a 3-card summary, so the whole
   * lookup result is returned rather than the first two strings of it. These
   * stay optional because GENERAL_REMEDIES / PLANET_REMEDIES fallback entries
   * have no chart behind them. */

  /** The full Lal Kitab remedy list for this placement — `remedy` above is
   * just these joined, kept for older clients and as the actions source. */
  remedies?: string[];
  /** Totke: the folk/practical rituals paired with the remedies. Previously
   * computed and then discarded entirely. */
  totke?: string[];
  /** Ascendant-based natal house — what the remedy lookup is keyed on. */
  natalHouse?: number;
  /** Lal Kitab's own fixed-house number for this planet (Aries is always the
   * 1st house, per createLalKitabChart). Deliberately reported alongside
   * natalHouse rather than instead of it: the two systems genuinely disagree,
   * and the page shows both rather than silently picking one. */
  lalKitabHouse?: number;
  /** This planet's permanent house in Lal Kitab. */
  pakkaGhar?: number;
  isInPakkaGhar?: boolean;
  /** Engine prose for the displacement from Pakka Ghar (kendra/trikona/dusthana). */
  displacement?: string;
  blindness?: 'blind' | 'half-blind';
  /** Engine prose explaining the blindness. */
  blindReason?: string;
}

export interface RemediesResult {
  remedies: RemedyItem[];
  /** Ancestral/karmic debts actually present in this chart (never the full 8). */
  debts: KarmicProfile['presentDebts'];
  /** This year of life under Lal Kitab's deterministic house rotation. Null
   * when there is no chart to rotate. Recomputed on every request rather than
   * cached — it changes on the reader's birthday. */
  annual: AnnualRotation | null;
}

/** Tag every remedy's prose with action slugs in one place — see the
 * `actions` field doc on RemedyItem for why this isn't done per-table. */
function withActions(items: RemedyItem[]): RemedyItem[] {
  return items.map((item) => ({ ...item, actions: extractActions(item.remedy) }));
}

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

const EMPTY_KARMIC_PROFILE: KarmicProfile = {
  presentDebts: [],
  pakkaGharPlacements: [],
  blindPlanets: [],
};

/**
 * Karmic profile (debts + Pakka Ghar + blind planets) that degrades to empty
 * instead of throwing, matching safeKarmicProfile in astro-engine/reports/
 * remedies.ts — an older or malformed chart shape must not take down a page
 * whose remaining sections render fine without it.
 */
function safeKarmicProfile(chart: Record<string, unknown> | undefined): KarmicProfile {
  if (!chart || !Array.isArray(chart.planets) || !Array.isArray(chart.houses)) {
    return EMPTY_KARMIC_PROFILE;
  }
  try {
    return buildKarmicProfile(chart as never);
  } catch {
    return EMPTY_KARMIC_PROFILE;
  }
}

/**
 * Get remedies. Without birth data, the general list. With it, a full Lal
 * Kitab reading of the chart: every one of the nine classical planets in its
 * natal house, plus the karmic debts (Rin), Pakka Ghar placements and blind
 * planets that give each placement its technical explanation.
 *
 * This deliberately covers ALL nine planets, not only debilitated/retrograde
 * ones. Lal Kitab prescribes a remedy per placement rather than only for
 * afflicted planets, and the old weak-planets-only filter is what limited the
 * page to three or four cards. The whole lookup result is returned too — the
 * previous `.slice(0, 2).join(' Also: ')` dropped a third remedy and four
 * totke per planet, and produced the stray "Also:" that showed up in the UI.
 *
 * PLANET_REMEDIES remains the fallback for a planet whose Lal Kitab lookup
 * comes back empty; house assignment is best-effort elsewhere in this
 * codebase, so that stays defensive rather than assuming it always succeeds.
 */
export async function getRemedies(birthData?: {
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  timezone: string;
}): Promise<RemediesResult> {
  if (!birthData) {
    return { remedies: withActions(GENERAL_REMEDIES), debts: [], annual: null };
  }

  try {
    const met = await computeMetrology(birthData);
    // `met.planets` (raw calculatePlanetPositions output) has no house
    // assignment — that only happens inside calculateChart's
    // assignPlanetsToHouses step, so house-specific remedies must read
    // met.chart.planets, not met.planets.
    const chart = met.chart as Record<string, unknown> | undefined;
    const chartPlanets = (chart?.planets as Array<Record<string, unknown>> | undefined) ?? [];

    // Keyed in CLASSICAL_NINE order so the annual rotation's dignity ties
    // resolve deterministically (see computeAnnualRotation's doc comment).
    const natalHouseOf = new Map<Planet, number>();
    const houseByName = new Map<string, number>();
    for (const p of chartPlanets) {
      const house = p.house as number | undefined;
      if (typeof house === 'number') houseByName.set(p.planet as string, house);
    }
    for (const name of CLASSICAL_NINE) {
      const house = houseByName.get(name);
      if (house !== undefined) natalHouseOf.set(name, house);
    }

    if (natalHouseOf.size === 0) {
      return { remedies: withActions(GENERAL_REMEDIES), debts: [], annual: null };
    }

    // Pakka Ghar / blindness are computed on Lal Kitab's OWN fixed-house
    // chart (Aries is always the 1st house), while the remedy lookup above is
    // keyed on the ascendant-based natal house. Both numbers are surfaced per
    // planet rather than reconciled here — see RemedyItem.lalKitabHouse.
    const profile = safeKarmicProfile(chart);
    const pakkaGharOf = new Map(profile.pakkaGharPlacements.map((p) => [p.planet as string, p]));
    const blindOf = new Map(profile.blindPlanets.map((p) => [p.planet as string, p]));

    const remedies: RemedyItem[] = [];
    for (const name of CLASSICAL_NINE) {
      const house = natalHouseOf.get(name);
      if (house === undefined) continue;

      const lalKitab = getLalKitabRemedies(name, house);
      if (lalKitab.remedies.length === 0) {
        remedies.push(
          PLANET_REMEDIES[name]
            ? { planet: name, ...PLANET_REMEDIES[name] }
            : { planet: name, title: `Strengthen ${name}`, icon: 'sparkles', remedy: '' },
        );
        continue;
      }

      const pakka = pakkaGharOf.get(name);
      const blind = blindOf.get(name);

      remedies.push({
        planet: name,
        title: `${name} in your ${house}${houseOrdinalSuffix(house)} house`,
        icon: PLANET_REMEDIES[name]?.icon ?? 'sparkles',
        // Every remedy string, so extractActions below tags all of them for
        // the image library instead of only the first two.
        remedy: lalKitab.remedies.join(' '),
        remedies: lalKitab.remedies,
        totke: lalKitab.totke,
        natalHouse: house,
        ...(pakka && {
          lalKitabHouse: pakka.currentHouse,
          pakkaGhar: pakka.pakkaGhar,
          isInPakkaGhar: pakka.isInPakkaGhar,
          displacement: pakka.effect,
        }),
        ...(blind && {
          blindness: blind.isBlind ? ('blind' as const) : ('half-blind' as const),
          blindReason: blind.reason,
        }),
      });
    }

    if (remedies.length === 0) {
      return { remedies: withActions(GENERAL_REMEDIES), debts: [], annual: null };
    }

    const annual = computeAnnualRotation(
      natalHouseOf,
      completedYearsOfAge(birthData.date, new Date()),
    );

    return { remedies: withActions(remedies), debts: profile.presentDebts, annual };
  } catch {
    // If chart computation fails, fall back to general remedies
    return { remedies: withActions(GENERAL_REMEDIES), debts: [], annual: null };
  }
}

function houseOrdinalSuffix(house: number): string {
  if (house === 1) return 'st';
  if (house === 2) return 'nd';
  if (house === 3) return 'rd';
  return 'th';
}

/* -------------------------------------------------------------------------- */
/* Chat (SSE streaming)                                                        */
/* -------------------------------------------------------------------------- */

export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'summary'; summary: string };

/**
 * Keyword-gated, unlike Panchang above: a relocation scan costs one
 * computeMetrology() call plus N calculateAscendant() calls (see
 * astrocartography/index.ts), so it's only worth paying for on a message
 * that's actually asking a "where" question — everything else skips it
 * entirely rather than doing this work on every single chat turn.
 */
const RELOCATION_KEYWORDS =
  /\b(relocat\w*|astrocartograph\w*|move\s+(to|abroad)|moving\s+abroad|which\s+(city|country)|where\s+should\s+i\s+(live|move|settle)|best\s+(place|city|country)\s+(for|to)\s+(live|move)|settle\s+(down\s+)?(in|abroad)|thrive\s+(in|abroad))\b/i;

/**
 * Curated-city relocation/astrocartography scan for chat grounding — see
 * astro-engine/astrocartography/index.ts for the full method (relocated
 * Ascendant for the same birth instant, which natal benefics/malefics land
 * angular per city). Best-effort: a missing/incomplete birth record just
 * means no relocation facts get injected, never a broken reply.
 */
async function buildChatRelocationFacts(
  dateOfBirth: string,
  timeOfBirth: string,
  place: { lat: number; lon: number; tz: string },
): Promise<string[]> {
  const natal = await computeMetrology({
    date: dateOfBirth,
    time: timeOfBirth,
    latitude: place.lat,
    longitude: place.lon,
    timezone: place.tz,
  });
  const julianDay = natal.julianDay as number;
  const natalPlanets = ((natal.planets as Array<Record<string, unknown>>) ?? []).map((p) => ({
    planet: asString(p.planet, ''),
    signIndex: Number(p.signIndex ?? 0),
  }));

  const { scoreRelocationCities } =
    await import('../../lib/astro-engine/astrocartography/index.js');
  const ranked = (await scoreRelocationCities(julianDay, natalPlanets)).slice(0, 4);

  const cityLines = ranked.map((r) => {
    const bits = [`Ascendant ${r.ascendantSign}`];
    if (r.angularBenefics.length) bits.push(`favorable: ${r.angularBenefics.join('/')} angular`);
    if (r.angularMalefics.length) bits.push(`caution: ${r.angularMalefics.join('/')} angular`);
    return `${r.city.name}, ${r.city.country} (${bits.join(', ')})`;
  });

  return [
    `Relocation/astrocartography scan — same birth instant relocated to each city, ranked ` +
      `best-first by angular benefics vs. malefics: ${cityLines.join('; ')}.`,
  ];
}

/**
 * Panchang facts for chat grounding — this is the SAME `getPanchang` used by
 * the public `/panchang` endpoint above, so results are already cache-shared
 * across every user at this location today. Previously computed nowhere in
 * the chat path (scholar.ts's SYSTEM_ROLE has never had any muhurta/timing
 * data to cite), so "is today good for X" / "best date for a wedding"
 * questions had nothing to reason from. Best-effort: a Panchang failure
 * (e.g. no birth place on file) must never break the chat reply.
 */
async function buildChatPanchangFacts(lat: number, lon: number): Promise<string[]> {
  const panchang = await getPanchang(lat, lon);
  const goodChoghadiya = (panchang.choghadiya?.day ?? [])
    .filter((c) => c.type === 'good')
    .map((c) => `${c.name} (${c.startTime}-${c.endTime})`)
    .join(', ');

  const facts = [
    `Today's Panchang (${panchang.date}, ${panchang.vara}): Tithi ${panchang.tithi.name} (${panchang.tithi.paksha} Paksha, ${panchang.tithi.isAuspicious ? 'auspicious' : 'not traditionally auspicious'}), Nakshatra ${panchang.nakshatra.name}, Yoga ${panchang.yoga.name}, Karana ${panchang.karana.name}`,
    `Rahu Kaal today (avoid starting anything important): ${panchang.rahuKaal.start}-${panchang.rahuKaal.end}`,
    `Gulika Kaal today (also avoid): ${panchang.gulikaKaal.start}-${panchang.gulikaKaal.end}`,
    `Abhijit Muhurta today (traditionally auspicious for starting things): ${panchang.abhijitMuhurta.start}-${panchang.abhijitMuhurta.end}`,
  ];
  if (goodChoghadiya) {
    facts.push(
      `Favorable Choghadiya windows today (daytime — for pooja/worship timing specifically, prefer an Amrit or Shubh slot over Labh/Char if more than one is listed, since those favor commerce/travel): ${goodChoghadiya}`,
    );
  }
  return facts;
}

/**
 * Next solar/lunar eclipse (grahan) dates for chat grounding. NOT gated on
 * the profile having a birth place — users without one still get the global
 * dates. When a birth place IS on file, also resolves whether that specific
 * eclipse is actually visible from there (swisseph's location-aware search,
 * not just "an eclipse is happening somewhere on Earth"), so chat can answer
 * "will it affect me" directly instead of hedging every time. Best-effort:
 * swisseph failing must never break the chat reply.
 */
async function buildChatEclipseFacts(lat?: number, lon?: number): Promise<string[]> {
  const { solar, lunar } = await nextEclipses();
  const fmt = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const local = lat != null && lon != null ? await localEclipses(lat, lon).catch(() => null) : null;

  const describe = (label: string, globalDate: Date, localDate: Date | undefined): string => {
    if (!localDate) {
      return `Next ${label}: ${fmt(globalDate)} — a global sky event, not necessarily visible from every location.`;
    }
    if (fmt(localDate) === fmt(globalDate)) {
      return `Next ${label}: ${fmt(globalDate)} — this one IS visible from the user's location, so it does affect them.`;
    }
    return `Next ${label} anywhere is ${fmt(globalDate)}, but it is NOT visible from the user's location so it does not affect them there; the next one visible from their location is ${fmt(localDate)}.`;
  };

  return [
    describe('solar eclipse (Surya Grahan)', solar, local?.solar),
    describe('lunar eclipse (Chandra Grahan)', lunar, local?.lunar),
  ];
}

/** Narrows an `unknown` field pulled off a loosely-typed chart object to a
 * string, without `String(unknown)`'s "[object Object]" risk if the field
 * turns out not to be a string at runtime. */
function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Closed, unrated predictions surfaced into chat so the astrologer can ask
 * whether they actually happened.
 *
 * This is the half of the accuracy loop that cannot be automated: the engine
 * can record what it predicted and when, but only the user knows whether it
 * came true. Asking inside the conversation costs nothing and is far more
 * likely to be answered than a survey — and an unanswered claim just stays in
 * the queue rather than being scored wrongly.
 *
 * Deliberately capped at ONE claim per turn: a reply that opens with three
 * "did this happen?" questions reads as an interrogation, not a reading.
 */
async function buildDuePredictionFacts(userId: string): Promise<string[]> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const due = await findPredictionsDueForReview(userId, today, 1);
  const claim = due[0];
  if (!claim) return [];

  return [
    `UNVERIFIED PAST PREDICTION: on ${claim.windowStart ?? 'an earlier date'} this app told the user "${claim.claim}" for the window ending ${claim.windowEnd}. That window has now closed and the user has never told us whether it played out. If — and ONLY if — the conversation reaches a natural pause, ask them once, briefly and warmly, whether that period actually turned out that way. Never open with it, never repeat it if they deflect, and never assume the answer. Their reply is how this app learns whether its timing is any good.`,
  ];
}

/** Unix epoch ms for a Julian Day (UT). */
function dateFromJulianDay(jd: number): Date {
  return new Date((jd - 2440587.5) * 86_400_000);
}

/**
 * Tajik Varshphal (annual solar-return chart) facts for chat grounding.
 *
 * `astro-engine/varshphal/` — solar return, Muntha, Varsheshwara and the
 * Sahams — was fully implemented and tested but had ZERO callers anywhere in
 * the codebase, so "what does this year hold for me" had no annual chart to
 * reason from and fell back to the natal chart plus generic transits. Its own
 * header called a paid report route a follow-up; grounding chat on it is the
 * cheap half of that, and needs no pricing, storage or migration.
 *
 * The Varsha year runs birthday-to-birthday, so the ACTIVE annual chart is
 * last year's solar return whenever this year's birthday hasn't happened yet
 * — computing for the calendar year alone would hand the user a chart that
 * has not started. Best-effort throughout: an ephemeris failure or a missing
 * birth place degrades to no annual facts, never to a broken reply.
 */
async function buildChatVarshphalFacts(
  chart: Record<string, unknown> | null,
  lat: number,
  lon: number,
  now: Date,
): Promise<string[]> {
  const planets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  const natalSunLongitude = Number(planets.find((p) => p.planet === 'Sun')?.longitude ?? NaN);
  const ascendant = chart?.ascendant as Record<string, unknown> | undefined;
  const natalAscSignIndex = Number(ascendant?.signIndex ?? NaN);
  const julianDay = Number(chart?.julianDay ?? NaN);

  if (!Number.isFinite(natalSunLongitude)) return [];
  if (!Number.isFinite(natalAscSignIndex)) return [];
  if (!Number.isFinite(julianDay)) return [];

  // The birth instant straight off the chart's own Julian Day (already UT), so
  // this never re-parses the DOB/time-of-birth strings or re-derives the
  // timezone — one source of truth for the birth moment.
  const birthDate = dateFromJulianDay(julianDay);

  const inputs = {
    natalSunLongitude,
    natalAscSignIndex,
    birthDate,
    latitude: lat,
    longitude: lon,
  };

  let varshphal = await computeVarshphal({ ...inputs, targetYear: now.getUTCFullYear() });
  if (varshphal.solarReturn.exactAt.getTime() > now.getTime()) {
    // This year's birthday is still ahead — the year currently running began
    // at last year's solar return.
    varshphal = await computeVarshphal({ ...inputs, targetYear: now.getUTCFullYear() - 1 });
  }

  const { solarReturn, muntha, varsheshwara, sahams } = varshphal;
  const yearStart = solarReturn.exactAt.toISOString().slice(0, 10);
  const munthaSign = SIGNS[muntha.signIndex] ?? `sign ${muntha.signIndex}`;

  const facts = [
    `Annual chart (Tajik Varshphal) for the year that began ${yearStart} and runs to the next birthday: Varsha Lagna ${solarReturn.chart.ascendant.sign}.`,
    `Lord of the Year (Varsheshwara): ${varsheshwara.varsheshwara} — this planet sets the dominant theme of THIS year specifically, above and beyond the running Mahadasha.`,
    `Muntha (the year's progressed point) is in ${munthaSign}, house ${muntha.houseFromVarshaAsc} of the annual chart — ${muntha.isAuspicious ? 'a supportive placement, the year favours growth in that area' : 'a difficult placement, the year asks for patience in that area'}.`,
  ];

  // Only the Sahams that classical Tajik treats as likely to actually
  // manifest this year (benefic-supported) are worth naming — the full list of
  // ~16 sensitive points would bury the signal.
  const supported = sahams.filter((s) => s.beneficSupported);
  if (supported.length > 0) {
    facts.push(
      `Sahams (annual sensitive points) that are benefic-supported this year and therefore likeliest to actually manifest: ${supported
        .map((s) => `${s.name} in ${s.sign} (house ${s.houseFromVarshaAsc})`)
        .join(', ')}.`,
    );
  }

  return facts;
}

/**
 * Loads a saved birth_profiles row (partner/child/etc., see the
 * `birth_profiles` table) and builds labeled facts for chat grounding: a real
 * Ashtakoota synastry reading — same engine as POST /matchmaking above,
 * `calculateAshtakoota` + `detectMangalDosha` — for partner-type
 * relationships, or the second person's own key placements for a child/other
 * relationship, so parenting questions can read that child's actual chart
 * instead of only the user's own 5th-house derivation. Best-effort: an
 * owner-scoped lookup miss or incomplete birth data on the saved profile must
 * never break the chat reply, just degrade to no second-chart facts.
 */
export async function buildSecondChartFacts(
  userId: string,
  groundingSource: GroundingSource,
  birthProfileId: string,
): Promise<string[]> {
  const profile = await getBirthProfile(userId, birthProfileId);
  const label = profile.displayName
    ? `${profile.displayName} (${profile.relationship ?? 'saved profile'})`
    : (profile.relationship ?? 'this saved profile');

  if (!profile.dateOfBirth || !profile.timeOfBirth || !profile.placeOfBirth) {
    return [
      `Saved profile "${label}" has no exact birth details on file — only general, ` +
        `non-chart-specific guidance is possible for them.`,
    ];
  }

  const { computeMetrology } = await import('../../lib/swarm/agents/metrologist.js');
  const met = await computeMetrology({
    date: profile.dateOfBirth,
    time: profile.timeOfBirth,
    latitude: profile.placeOfBirth.lat,
    longitude: profile.placeOfBirth.lon,
    timezone: profile.placeOfBirth.tz,
  });

  const planets = (met.planets as Array<Record<string, unknown>>) ?? [];
  const moon = planets.find((p) => p.planet === 'Moon');
  const sun = planets.find((p) => p.planet === 'Sun');
  const ascendant = (met.chart as Record<string, unknown> | undefined)?.ascendant as
    | Record<string, unknown>
    | undefined;

  const isPartnerType =
    profile.relationship === 'partner' ||
    profile.relationship === 'spouse' ||
    profile.relationship === 'prospective_match';

  if (isPartnerType && moon) {
    const userMoon = (
      (groundingSource.chart?.planets ?? []) as Array<Record<string, unknown>>
    ).find((p) => p.planet === 'Moon');
    if (userMoon) {
      const { calculateAshtakoota } = await import('../../lib/astro-engine/matching/ashtakoota.js');
      const nak1 = Number(userMoon.nakshatraIndex ?? 0);
      const nak2 = Number(moon.nakshatraIndex ?? 0);
      const sign1 = asString(userMoon.sign, 'Aries');
      const sign2 = asString(moon.sign, 'Aries');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const result = calculateAshtakoota(nak1, nak2, sign1 as any, sign2 as any);
      const nadi = result.scores.find((s) => s.koota === 'Nadi');
      const bhakoot = result.scores.find((s) => s.koota === 'Bhakoot');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const mangalUser = detectMangalDosha(groundingSource.chart as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      const mangalOther = detectMangalDosha(met.chart as any);

      return [
        `Real Ashtakoota synastry reading with saved profile "${label}" (their actual chart, not ` +
          `a guess): total Guna score ${result.totalScore}/${result.maxTotal} (${result.overallCompatibility}). ` +
          `Nadi Dosha ${nadi?.score === 0 ? 'PRESENT (0/8 — traditionally a serious flag)' : 'not present'}. ` +
          `Bhakoot Dosha ${bhakoot?.score === 0 ? 'PRESENT (0/7)' : 'not present'}. ` +
          `Mangal Dosha: you ${mangalUser.present ? 'have it' : 'do not have it'}, they ${
            mangalOther.present ? 'have it' : 'do not have it'
          } (${mangalUser.present === mangalOther.present ? 'matched' : 'MISMATCHED — asymmetric'}).`,
      ];
    }
  }

  if (profile.relationship === 'child') {
    return [
      `Chart snapshot for your child, saved profile "${label}" — read THIS chart's own placements ` +
        `for their temperament and needs, not derived from your own 5th house: Ascendant ` +
        `${asString(ascendant?.sign, 'unknown')}, Moon Sign ${asString(moon?.sign, 'unknown')} ` +
        `(Nakshatra ${asString(moon?.nakshatra, 'unknown')}), Sun Sign ${asString(sun?.sign, 'unknown')}.`,
    ];
  }

  return [
    `Chart snapshot for saved profile "${label}": Ascendant ${asString(ascendant?.sign, 'unknown')}, ` +
      `Moon Sign ${asString(moon?.sign, 'unknown')}, Sun Sign ${asString(sun?.sign, 'unknown')}.`,
  ];
}

/**
 * Lists the account's saved `birth_profiles` (name + relationship) as one grounding fact, every
 * turn, regardless of whether `compareProfileId` was passed — this is what makes the "is this
 * your son?" behavior possible at all: without it, the model has no idea a child/spouse/etc.
 * profile even exists on the account (see the 2026-08-11 audit that found `relationship` was
 * stored but never surfaced to chat). Deliberately name + relationship ONLY, never birth data —
 * a real second chart is only pulled in by `matchSavedProfileByName` below, once the user
 * actually confirms which saved profile they mean. Best-effort: a lookup failure just means no
 * saved-profiles fact this turn, same degrade-gracefully contract as every other fact builder
 * in this function.
 */
function buildSavedProfilesFacts(
  profiles: Array<{ displayName: string | null; relationship: string | null }>,
): string[] {
  // Emitted whether or not any profile is saved: the case it matters MOST in is
  // the empty one, where a spouse/child question is answered purely off the
  // seeker's own 7th/5th house and nothing tells the model a sharper read is
  // even on offer. Worded as an answer-first close so it can never turn into a
  // deflection ("add their profile and then I can tell you") — the standing
  // ANSWER_DIRECTLY / NO_HEDGE_OPENERS rules in scholar.ts forbid that shape,
  // and this fact restates the boundary rather than relying on them alone.
  const addProfileOffer =
    `ADD-A-PROFILE OFFER: when the seeker asks about a specific family member — spouse, ` +
    `child, parent, sibling — whose own profile is NOT saved on this account, answer the ` +
    `question FULLY first from the seeker's own chart exactly as you normally would (7th ` +
    `house and Venus/Jupiter for a spouse, 5th house for children, and so on). Then, only at ` +
    `the very end, add ONE short closing sentence offering to read that person's own chart if ` +
    `they add their birth details, and say where: the profile switcher at the top of the app. ` +
    `Keep it in the prose, not on the "Ask next:" line. Never open with the offer, never let ` +
    `it replace, shorten or hedge the actual answer, never repeat it if any earlier turn in ` +
    `this conversation already made it, and never state a price or call it free.`;

  const named = profiles.filter((p) => p.displayName);
  if (named.length === 0) {
    return [
      `No family or partner profiles are saved on this account, so only the seeker's own chart ` +
        `is available. Answer family questions from it as usual; never invent birth details for ` +
        `anyone else.`,
      addProfileOffer,
    ];
  }
  const list = named
    .map((p) => `${p.displayName} (${p.relationship ?? 'saved profile'})`)
    .join(', ');
  return [
    `Saved profiles on this account, with their real charts on file: ${list}. If a question is ` +
      `about a family member/partner and it's not already clear which saved profile they mean, ` +
      `name the likely candidate(s) by name and ask before assuming — e.g. "Do you mean Arjun? ` +
      `I can read his own chart for this." Once they confirm by name, that saved profile's real ` +
      `chart becomes available. Never guess a name that isn't in this list.`,
    addProfileOffer,
  ];
}

/**
 * If the CURRENT message names a saved profile by its `displayName` (case-insensitive substring
 * match), resolves that profile — this is the "next turn" half of the ask-first flow
 * `buildSavedProfilesFacts` sets up: turn 1 lists names and the model asks; turn 2, once the user
 * replies with (or repeating) the name, this matches it and `buildSecondChartFacts` below actually
 * loads that person's real chart. Deliberately name-based rather than an i18n'd affirmative-word
 * list ("yes"/"haan"/...) — matching a proper name works identically across all 7 app languages
 * with no translation table to maintain, at the cost of requiring the user to say the name (a
 * bare "yes" with no name falls back to no chart this turn, same as not matching at all — never a
 * crash, just one turn of generic-only guidance).
 */
function matchSavedProfileByName<T extends { displayName: string | null }>(
  profiles: T[],
  message: string,
): T | undefined {
  const lower = message.toLowerCase();
  return profiles.find((p) => p.displayName && lower.includes(p.displayName.toLowerCase()));
}

/** Per-section character cap when quoting a purchased report's narrative into chat grounding
 * (see buildMatchReportFacts below) — enough to ground a follow-up, not a full re-quote. */
const MAX_SECTION_FACT_CHARS = 240;

/**
 * Loads an already-purchased match_report row (see POST /v1/reports/purchase, key='match_report')
 * and builds labeled facts for chat grounding: the real Guna Milan score, all 8 life-area risk
 * factors with their classical evidence, and the purchased narrative cards — so "Ask Astrologer"
 * from the compatibility report page can answer follow-up questions grounded in the SAME data the
 * user already paid for and read, not a re-typed summary or a guess. Owner-scoped (404 on a row
 * belonging to someone else reads the same as "not found" — never leaks existence) and best-
 * effort throughout: any failure here must never break the chat reply, just degrade to no
 * match-report facts, same contract as buildSecondChartFacts above.
 */
export async function buildMatchReportFacts(userId: string, reportId: string): Promise<string[]> {
  const row = await findReportById(reportId);
  if (!row || row.userId !== userId || row.reportKey !== 'match_report' || row.status !== 'ready') {
    return [];
  }

  const generator = REPORT_GENERATORS.match_report;
  if (!generator) return [];

  const kundli = await findKundliByUserId(row.userId, row.birthProfileId);

  let partnerChart: Record<string, unknown> | null = null;
  if (hasPartnerBirthInput(row.input)) {
    const metrology = await computeMetrology(partnerInputToBirthRecord(row.input));
    partnerChart = (metrology.chart as Record<string, unknown> | undefined) ?? null;
  }

  // Same context every other path (generation/read/regenerate, see reports.service.ts's
  // buildReportScoreContext) builds for this exact row — previously this passed only
  // { chart, partnerChart }, so a chat question about an already-purchased match report could
  // score a different Guna/risk read than the report page itself (computeKundliMilanScores reads
  // doshaData/yogaData/dashaData; computeMatchRiskFactors reads dashaData — none of which reached
  // this call before).
  const scoreContext = await buildReportScoreContext(row, kundli, partnerChart);
  const scores = generator.computeScores(scoreContext, row.periodMonth) as MatchReportScores;
  const content = row.content as {
    sections?: Array<{ heading: string; paragraphs: string[] }>;
  } | null;
  const sections = content?.sections ?? [];

  const lines: string[] = [
    `Real Compatibility Match Report the user ALREADY PURCHASED and read (report id ${reportId}, ` +
      `not a guess): Guna Milan score ${scores.gunaMilanScore}/${scores.gunaMaxScore} ` +
      `(${scores.compatibilityBand}).`,
  ];
  for (const f of scores.riskFactors) {
    lines.push(`Life area "${f.key}" — severity ${f.severity}. ${f.evidence.join(' ')}`);
  }
  // Only the opening paragraph per section, not the full purchased narrative — chat needs enough
  // to ground a follow-up question, not a second copy of everything already shown on the report
  // page. Unbounded here previously let a single match-report chat turn push the whole
  // <astro_context> block past scholar.ts's MAX_CONTEXT_CHARS clip, silently truncating whatever
  // extraFacts (relocation/purchase facts) were appended after it.
  // ponytail: flat per-line character clip, not token-aware — revisit if an opening paragraph
  // itself ever grows long enough to matter.
  for (const s of sections) {
    const firstParagraph = s.paragraphs[0];
    if (!firstParagraph) continue;
    const clipped =
      firstParagraph.length > MAX_SECTION_FACT_CHARS
        ? `${firstParagraph.slice(0, MAX_SECTION_FACT_CHARS)}…`
        : firstParagraph;
    lines.push(`${s.heading}: ${clipped}`);
  }
  return lines;
}

export async function* chatStream(
  userId: string,
  message: string,
  history: ChatTurn[],
  incomingSummary: string | undefined,
  signal?: AbortSignal,
  locale: string = 'en',
  compareProfileId?: string,
  // ID of an already-purchased match_report row — see ChatRequestSchema's doc comment.
  // Independent of compareProfileId (a match_report is not a saved birth_profiles row).
  matchReportId?: string,
  // The active profile (primary or an additional saved one), already resolved
  // ONCE by the caller (astro.routes.ts's chatRoute — it needs the same
  // resolution for chat-session scoping) and threaded through here rather
  // than re-resolved internally. Every other profile-aware surface in this
  // codebase follows this resolve-once-in-the-route pattern; chat used to be
  // the one exception, doing a second, redundant `resolveActiveProfileContext`
  // call on every single message.
  profile?: ProfileContext,
  // When resuming a stored session, its `updatedAt` — lets buildChatMessages
  // warn the model that the replayed history above may be from a much
  // earlier date (see historyStalenessNote in scholar.ts). Undefined for a
  // brand-new session, which needs no such warning.
  sessionLastActivityAt?: Date,
): AsyncGenerator<ChatStreamEvent> {
  // Death/self-harm policy gate — runs before checkTopicGate (and before any
  // chart/grounding work) so a self-harm message never reaches the topic
  // classifier or the LLM at all. This is the primary defense; see the
  // output-side classifyAssistantOutput check below the generation loop for
  // the backstop. SYSTEM_ROLE (scholar.ts) claims "a separate policy handles"
  // death/self-harm — this is that policy; previously nothing implemented it
  // on this path.
  const inputPolicy = classifyUserMessage(message, locale);
  if (inputPolicy.blocked) {
    yield { type: 'token', content: inputPolicy.cannedResponse };
    return;
  }

  // Gate off-topic messages (coding help, trivia, etc.) before doing any
  // chart/grounding work — see checkTopicGate's own comment for why this
  // needs a dedicated classification call rather than a persona prompt rule.
  const gate = await checkTopicGate(message, history);
  if (!gate.related) {
    yield { type: 'token', content: gate.message };
    return;
  }

  const state = newState({ userId, intent: 'chat', consent: true });

  // The account row is still fetched here — profileFacts below needs it
  // alongside `profile` (e.g. relationshipStatus/interestAreas have no
  // per-profile equivalent and stay account-level), and it's independent of
  // profile resolution. `profile` itself is no longer resolved here: it's
  // passed in already-resolved by the caller (see the parameter's doc
  // comment above). Best-effort: a missing/unreachable user just means
  // account-level facts are skipped — same degrade-gracefully contract as
  // every other fetch below (kundli/userFacts/panchang/secondChartFacts),
  // never a hard failure of the whole chat turn.
  const user = await findActiveUserById(userId).catch(() => undefined);

  // Best-effort: an unready/missing kundli just means no chart facts get
  // injected (buildGroundingFacts degrades gracefully) — chat still works.
  const [kundli, userFacts] = await Promise.all([
    getKundliForUser(userId, profile?.birthProfileId ?? null).catch(() => undefined),
    getUserFacts(userId, profile?.birthProfileId ?? null).catch(() => []),
  ]);
  const groundingSource: GroundingSource = {
    chart: kundli?.status === 'ready' ? (kundli.chartData ?? null) : null,
    dasha: kundli?.status === 'ready' ? (kundli.dashaData ?? null) : null,
    yogas: kundli?.status === 'ready' ? (kundli.yogaData ?? null) : null,
    // Sade Sati is transit-dependent — recompute it live so chat never tells
    // a user their (possibly months/years-stale) cached phase.
    doshas: kundli?.status === 'ready' ? await withLiveSadeSati(kundli.doshaData ?? null) : null,
    ashtakavarga: kundli?.status === 'ready' ? (kundli.ashtakavargaData ?? null) : null,
  };
  // A profile that onboarded with an unknown birth time will NEVER get a
  // ready kundli (see kundli.service.ts#missingKundliParams) — distinct from
  // one that's simply still generating, so the scholar can pick the right
  // "no chart data" fallback copy instead of implying the chart is just late.
  const birthTimeUnknown = profile?.birthTimeAccuracy === 'unknown';

  // Bound the prompt size regardless of how long this conversation has run —
  // keeps generation fast (timeout risk) and keeps the model from losing
  // track of what it already knows deep in a long raw transcript.
  const { recentHistory, summary, changed } = await compactHistory(history, incomingSummary);
  if (changed) {
    yield { type: 'summary', summary };
  }
  state.chatContext = {
    history: recentHistory,
    summary,
    // exactOptionalPropertyTypes: omit the key entirely for a new session
    // rather than setting it to `undefined`.
    ...(sessionLastActivityAt ? { lastActivityAt: sessionLastActivityAt } : {}),
  };

  // Share-safe, non-identifying context (gender/relationship/interests) —
  // does not touch the "never the name" rule, see buildProfileFacts's
  // comment. gender comes from the active PROFILE (if chatting "as" a
  // child/partner profile, gender should reflect them, not the account
  // owner); relationshipStatus/interestAreas have no per-profile equivalent
  // and stay sourced from the account-level user row.
  const profileFacts = user && profile ? buildProfileFacts(profile, user) : [];

  // The income ask ships dark: the money rules in scholar.ts refuse to raise
  // the subject at all unless this one fact line is present, so the whole flow
  // is switched on from Admin -> Features with no prompt edit and no deploy.
  // Best-effort like every other fetch here — an unreachable feature table just
  // means the astrologer reads money questions from the chart alone.
  const incomeAskEnabled = await resolveFeaturesForUser(userId)
    .then((features) => features['chat.incomeAsk']?.enabled ?? false)
    .catch(() => false);
  if (incomeAskEnabled) profileFacts.push(INCOME_ASK_FACT);

  // Today's Panchang at the ACTIVE PROFILE's birth location — best-effort,
  // never blocks the reply (a missing place of birth, or the panchang engine
  // throwing, just means no muhurta facts get injected, same degrade-
  // gracefully contract as groundingSource above). This is chat's own
  // in-context "muhurta at your birth location" injection — unrelated to the
  // standalone GET /panchang dashboard widget above, which is keyed on LIVE
  // current location and is intentionally NOT profile-aware.
  const place = profile?.placeOfBirth;
  const panchangFacts =
    place?.lat != null && place?.lon != null
      ? await buildChatPanchangFacts(place.lat, place.lon).catch(() => [])
      : [];

  // Next eclipse dates — NOT gated on a birth place being on file (unlike
  // panchangFacts above), but uses one when present to resolve local
  // visibility too.
  const eclipseFacts = await buildChatEclipseFacts(place?.lat, place?.lon).catch(() => []);

  // The annual (Varshphal) chart for the year currently running, cast at the
  // birth location — same best-effort contract as the Panchang facts above.
  const varshphalFacts =
    groundingSource.chart && place?.lat != null && place?.lon != null
      ? await buildChatVarshphalFacts(
          groundingSource.chart,
          place.lat,
          place.lon,
          new Date(),
        ).catch(() => [])
      : [];

  // Every saved profile on the account (name + relationship only, no birth data) — always
  // listed when any exist, so the model can offer "is this your son?" instead of staying silent
  // about profiles it has no idea exist. Best-effort, same degrade-gracefully contract as every
  // other fact builder here.
  const savedProfiles = await listBirthProfilesByOwner(userId).catch(() => []);
  const savedProfilesFacts = buildSavedProfilesFacts(savedProfiles);

  // Second chart (partner/child/etc.) — either the client explicitly asked for one via
  // compareProfileId (see ChatRequestSchema, e.g. the compatibility-page hand-off), OR this
  // message itself names one of the saved profiles listed above (the "next turn" half of the
  // ask-first flow: turn 1 the model asks "do you mean Arjun?", turn 2 the user says his name and
  // this matches it). compareProfileId wins if both are somehow present. Unrelated to
  // `profile`/the active profile above — always a SECOND, additional chart layered on top of
  // whichever profile is active. Best-effort: a bad id, an owner mismatch, or no match must never
  // break the chat reply.
  const matchedProfileId = compareProfileId ?? matchSavedProfileByName(savedProfiles, message)?.id;
  const secondChartFacts = matchedProfileId
    ? await buildSecondChartFacts(userId, groundingSource, matchedProfileId).catch(() => [])
    : [];

  // A purchased Compatibility Match Report — only when the client explicitly asks for one via
  // matchReportId (see ChatRequestSchema). Independent of compareProfileId/secondChartFacts above
  // (a match_report is not a saved birth_profiles row). Best-effort: a bad id, an owner mismatch,
  // or a not-yet-ready report must never break the chat reply.
  const matchReportFacts = matchReportId
    ? await buildMatchReportFacts(userId, matchReportId).catch(() => [])
    : [];

  // Relocation/astrocartography scan — only when the message actually asks a
  // "where" question (see RELOCATION_KEYWORDS above for why this is gated
  // unlike Panchang).
  const relocationFacts =
    RELOCATION_KEYWORDS.test(message) &&
    user?.dateOfBirth &&
    user?.timeOfBirth &&
    place?.lat != null &&
    place?.lon != null &&
    place?.tz
      ? await buildChatRelocationFacts(user.dateOfBirth, user.timeOfBirth, {
          lat: place.lat,
          lon: place.lon,
          tz: place.tz,
        }).catch(() => [])
      : [];

  // What the user has already paid for and read — reports, gemstone
  // recommendation, unlocked houses, vastu, palm — so chat can't contradict a
  // report the user already trusts. Read fresh every turn from the source
  // tables themselves (not cached), so it's never stale.
  const purchaseFacts = await buildPurchaseFacts(
    userId,
    profile?.birthProfileId ?? null,
    profile,
  ).catch(() => []);

  // Predictions whose window has already closed and that nobody has scored.
  // Surfaced so the astrologer ASKS — an accuracy table nobody writes a verdict
  // into measures nothing, and the natural place to ask "last month I said X,
  // did that happen?" is the conversation itself, not a survey. Best-effort:
  // never blocks a reply.
  const duePredictionFacts = await buildDuePredictionFacts(userId).catch(() => []);

  const extraFacts = [
    ...profileFacts,
    ...savedProfilesFacts,
    ...panchangFacts,
    ...eclipseFacts,
    ...varshphalFacts,
    ...duePredictionFacts,
    ...secondChartFacts,
    ...matchReportFacts,
    ...relocationFacts,
    ...purchaseFacts,
  ];

  // Collects the dated windows this reply is grounded on so they can be recorded
  // as falsifiable claims once the stream completes (below).
  const windowSink: DomainWindowSink = { windows: [] };

  const startStream = () =>
    scholarStream(
      state,
      message,
      groundingSource,
      birthTimeUnknown,
      signal,
      locale,
      userFacts,
      extraFacts,
      // Same field voice already has and uses for its call-connected opener
      // (buildCallSystemPrompt) — profile.displayName covers both the primary
      // account and an additional saved profile correctly (see profile-context.ts).
      profile?.displayName,
      windowSink,
    );

  // Output-side backstop for the death/self-harm policy: the input filter
  // above is the primary defense, but the LLM can still occasionally produce
  // a violation unprompted (e.g. volunteering a "you will die" framing inside
  // an otherwise benign accident/health answer). Check the accumulated reply
  // text BEFORE each delta is emitted — not after the stream ends — so a
  // violation that only completes mid-reply is caught and swapped for the
  // canned response before that delta ever reaches the client, without
  // sacrificing token-by-token streaming for the rest of the reply.
  //
  // Second guard, same loop: the model borrows the death policy's canned
  // "it's against the law" line for declines that have nothing to do with
  // death — a name change for luck at online games and physical-appearance
  // questions about a partner each reproduced it verbatim. `inputPolicy`
  // did NOT block above, so legal-refusal framing in this reply is a false
  // refusal telling the user their question is illegal when it is not, and
  // that is the part that must never ship. Three prompt-side bans failed to
  // stop it (see containsLegalRefusalFraming's comment), hence enforcement
  // here. The line always LEADS the reply, so hold the first
  // OPENER_HOLD_CHARS before emitting anything — a fraction of a second of
  // generation, and it keeps the reply recallable, which mid-stream token
  // yielding otherwise makes impossible. On a trip, re-roll the generation
  // once: sampling is non-zero temperature, so a resample rarely repeats it.
  const OPENER_HOLD_CHARS = 140;

  let fullText = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    fullText = '';
    let released = false;
    let leaked = false;
    // A re-roll regrounds from scratch; without this the retry's windows
    // would be appended to the abandoned attempt's and double-recorded below.
    windowSink.windows.length = 0;

    for await (const token of startStream()) {
      const tentative = fullText + token;
      const outputPolicy = classifyAssistantOutput(tentative, locale);
      if (outputPolicy.blocked) {
        yield { type: 'token', content: outputPolicy.cannedResponse };
        return;
      }
      fullText = tentative;

      if (released) {
        yield { type: 'token', content: token };
        continue;
      }
      if (fullText.length < OPENER_HOLD_CHARS) continue;
      if (containsLegalRefusalFraming(fullText)) {
        leaked = true;
        break;
      }
      released = true;
      yield { type: 'token', content: fullText };
    }

    // A reply shorter than the hold threshold ended while still buffered, so
    // it was never judged in the loop above — judge it here before emitting.
    if (!released && !leaked) {
      if (containsLegalRefusalFraming(fullText)) {
        leaked = true;
      } else {
        released = true;
        if (fullText) yield { type: 'token', content: fullText };
      }
    }

    if (!leaked) break;

    logger.warn(
      { userId, attempt },
      'reply used the death policy legal-refusal framing for a non-death question',
    );

    if (attempt === 1) {
      // The re-roll leaked too. Send a decline that is at least true.
      fullText = getNeutralDecline(locale);
      yield { type: 'token', content: fullText };
    }
  }

  // Fire-and-forget, every turn — no turn-count threshold, so even a user's
  // first message can seed durable facts. Existing facts are passed in so
  // the model doesn't re-extract near-duplicates. A failure here must never
  // affect the reply already streamed above.
  void extractTurnFacts(message, fullText, userFacts, userId, user?.relationshipStatus ?? null)
    .then((newFacts) => {
      if (newFacts.length > 0) {
        return saveUserFacts(userId, profile?.birthProfileId ?? null, newFacts);
      }
    })
    .catch(() => {});

  // Record the dated windows this reply was grounded on. Fire-and-forget and
  // AFTER the stream, so capture can never delay or break a reply. Only
  // HIGH/MEDIUM windows are kept: a LOW-confidence window is one the engine
  // already doubts, and scoring it would mostly measure its own hedging. The
  // unique index from migration 0052 makes a repeat turn a no-op rather than a
  // duplicate row.
  void (async () => {
    for (const w of windowSink.windows) {
      if (w.level !== 'HIGH' && w.level !== 'MEDIUM') continue;
      await recordPrediction({
        userId,
        birthProfileId: profile?.birthProfileId ?? null,
        surface: 'chat',
        domain: w.domain,
        claim: `${w.domain}: favourable ${w.dashaLevel} window, rated ${w.level}`,
        windowStart: w.startDate,
        windowEnd: w.endDate,
        confidence: w.level,
        model: MODEL_NAME,
        techniques: ['vimshottari', 'dasha_confidence', 'shadbala', 'avastha', 'kp_sublord'],
      });
    }
  })().catch((err: unknown) => {
    logger.warn({ err, userId }, 'chat prediction capture failed, reply unaffected');
  });
}

/* -------------------------------------------------------------------------- */
/* Birth-time rectification                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Suggests a corrected birth time for the user's ACTIVE profile from dated life
 * events they supply.
 *
 * Compute-only by design. It never writes `timeOfBirth`, never touches
 * `birth_time_rectified`, and never invalidates the kundli — silently changing
 * someone's birth time would rewrite every chart, report and dasha date they
 * have already read, which is not a side effect an accuracy tool gets to have.
 * Applying the suggestion is a separate, explicit user action.
 *
 * Returns 'missing_birth_data' when the profile has no usable date/time/place,
 * and `null` when the events simply cannot single out a time (see
 * rectifyBirthTime's evidence floor).
 */
export async function rectifyForUser(
  userId: string,
  events: LifeEvent[],
  windowMinutes?: number,
): Promise<RectificationResult | null | 'missing_birth_data'> {
  const user = await findActiveUserById(userId);
  if (!user) return 'missing_birth_data';
  const profile = await resolveActiveProfileContext(user);
  const place = profile?.placeOfBirth;

  if (!profile?.dateOfBirth || !profile?.timeOfBirth || place?.lat == null || place?.lon == null) {
    return 'missing_birth_data';
  }

  const [y, m, d] = profile.dateOfBirth.split('-').map(Number);
  const [hh, mm] = profile.timeOfBirth.split(':').map(Number);
  if (!y || !m || !d || hh == null || mm == null) return 'missing_birth_data';

  // Same civil-offset resolution the kundli pipeline uses, so a rectification
  // suggestion can never be computed against a different timezone than the
  // chart it is meant to correct.
  const tzOffset = tzOffsetHoursForProfile(place.tz, new Date(Date.UTC(y, m - 1, d)));

  return rectifyBirthTime({
    year: y,
    month: m,
    day: d,
    hour: hh,
    minute: mm,
    tzOffset,
    lat: place.lat,
    lng: place.lon,
    events,
    ...(windowMinutes ? { windowMinutes } : {}),
  });
}
