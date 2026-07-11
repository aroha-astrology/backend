import crypto from 'node:crypto';
import {
  runPipeline,
  newState,
  compileResponse,
  scholarStream,
  computeMetrology,
  synthesizeDailyForecast,
  moonSignPrediction,
  moonSignPeriodicPrediction,
  sunSignPrediction,
  type PeriodicPeriod,
  type ChatDetailLevel,
} from '../../lib/swarm/index.js';
import {
  dateToJulianDay,
  calculatePlanetPositions,
  calculateFullPanchang,
  detectMangalDosha,
} from '../../lib/astro-engine/index.js';
import type { GroundingSource } from '../../lib/chat-grounding.js';
import { compactHistory, type ChatTurn } from '../../lib/chat-compaction.js';
import { getKundliForUser } from '../kundli/kundli.service.js';
import { findActiveUserById } from '../users/users.repo.js';
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

  // Step 2: extract synthesis inputs from metrology
  const natalPlanets = (metrology.planets as Array<Record<string, unknown>>) ?? [];
  const chart = (metrology.chart as Record<string, unknown>) ?? {};
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
  // since traditional practitioners treat it as its own pass/fail gate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  const mangal1 = detectMangalDosha(met1.chart as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  const mangal2 = detectMangalDosha(met2.chart as any);
  const mangalDosha = {
    person1: mangal1.present,
    person2: mangal2.present,
    matched: mangal1.present === mangal2.present,
  };

  const recommendation = buildMatchRecommendation(
    result.totalScore,
    result.maxTotal,
    flags,
    mangalDosha,
  );

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
  };
}

/**
 * Deterministic, template-based recommendation built only from the computed
 * Koota scores and dosha flags above — never LLM-generated, so it can never
 * invent relationship advice not traceable to the actual analysis.
 */
function buildMatchRecommendation(
  totalScore: number,
  maxTotal: number,
  flags: { nadiDosha: boolean; bhakootDosha: boolean },
  mangalDosha: { person1: boolean; person2: boolean; matched: boolean },
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
  if (!mangalDosha.matched) {
    parts.push(
      "Mangal Dosha is present in only one partner's chart — traditionally this asymmetry is discussed with an astrologer, as a matching Mangal Dosha (present or absent in both) is usually considered more favorable than a mismatch.",
    );
  } else if (mangalDosha.person1) {
    parts.push(
      'Mangal Dosha is present in both charts, which traditional practitioners often consider self-cancelling.',
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

  // Approximate timezone offset from longitude (4 min per degree). Rounded to
  // the nearest half-hour rather than whole hour — whole-hour rounding put
  // India (UTC+5:30) and other half/quarter-hour zones off by up to 30min,
  // shifting tithi/nakshatra boundaries near midnight. Still an approximation
  // (no IANA lookup from lat/lon), but meaningfully closer for those zones.
  const timezoneOffset = Math.round((lon / 15) * 2) / 2;

  // Calculate Julian Day for noon local time
  const jd = await dateToJulianDay(year, month, day, 12, 0, timezoneOffset);

  // Get planet positions for Sun and Moon sidereal longitudes
  const planets = await calculatePlanetPositions(jd);
  const sun = planets.find((p) => p.planet === 'Sun');
  const moon = planets.find((p) => p.planet === 'Moon');

  const sunLong = sun?.longitude ?? 0;
  const moonLong = moon?.longitude ?? 0;

  // Calculate full panchang using the astro-engine
  const panchang = calculateFullPanchang(date, lat, lon, sunLong, moonLong, timezoneOffset);

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
): Promise<PanchangMonthDay[]> {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return Promise.all(
    dayNumbers.map(async (day) => {
      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const panchang = await getPanchang(lat, lon, isoDate);
      const { isFullMoon, isNewMoon, isEkadashi } = classifyTithiForCalendar(panchang.tithi.number);
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
      };
    }),
  );
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
    const translated = await translateForecastContent(englishContent, language);
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

/** Planets considered weak when debilitated or in enemy signs. */
const DEBILITATION_SIGNS: Record<string, string> = {
  Sun: 'Libra',
  Moon: 'Scorpio',
  Mars: 'Cancer',
  Mercury: 'Pisces',
  Jupiter: 'Capricorn',
  Venus: 'Virgo',
  Saturn: 'Aries',
};

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
}

/**
 * Get remedies. If birth data is provided, compute the natal chart, identify
 * debilitated / weak planets, and return planet-specific remedies.
 * Otherwise return general remedies.
 */
export async function getRemedies(birthData?: {
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  timezone: string;
}): Promise<RemedyItem[]> {
  if (!birthData) {
    return GENERAL_REMEDIES;
  }

  try {
    const met = await computeMetrology(birthData);
    const planets = (met.planets as Array<Record<string, unknown>>) ?? [];

    // Identify weak planets: debilitated or retrograde
    const weakPlanets: string[] = [];
    for (const p of planets) {
      const name = p.planet as string;
      const sign = p.sign as string;
      const isRetrograde = p.isRetrograde as boolean | undefined;

      if (DEBILITATION_SIGNS[name] && sign === DEBILITATION_SIGNS[name]) {
        weakPlanets.push(name);
      } else if (isRetrograde && name !== 'Rahu' && name !== 'Ketu') {
        // Retrograde planets (excluding always-retrograde nodes) need attention
        weakPlanets.push(name);
      }
    }

    if (weakPlanets.length === 0) {
      // No weak planets found — return general remedies
      return GENERAL_REMEDIES;
    }

    // Return remedies for weak/afflicted planets
    const remedies: RemedyItem[] = weakPlanets
      .filter((name) => PLANET_REMEDIES[name])
      .map((name) => ({
        planet: name,
        ...PLANET_REMEDIES[name],
      }));

    // Pad with general remedies if we have fewer than 3 planet-specific ones
    if (remedies.length < 3) {
      const remaining = GENERAL_REMEDIES.slice(0, 3 - remedies.length);
      remedies.push(...remaining);
    }

    return remedies;
  } catch {
    // If chart computation fails, fall back to general remedies
    return GENERAL_REMEDIES;
  }
}

/* -------------------------------------------------------------------------- */
/* Chat (SSE streaming)                                                        */
/* -------------------------------------------------------------------------- */

export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'summary'; summary: string };

export async function* chatStream(
  userId: string,
  message: string,
  history: ChatTurn[],
  incomingSummary: string | undefined,
  detailLevel: ChatDetailLevel = 'direct',
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const state = newState({ userId, intent: 'chat', consent: true });

  // Best-effort: an unready/missing kundli just means no chart facts get
  // injected (buildGroundingFacts degrades gracefully) — chat still works.
  const [kundli, user] = await Promise.all([
    getKundliForUser(userId).catch(() => undefined),
    findActiveUserById(userId).catch(() => undefined),
  ]);
  const groundingSource: GroundingSource = {
    chart: kundli?.status === 'ready' ? (kundli.chartData ?? null) : null,
    dasha: kundli?.status === 'ready' ? (kundli.dashaData ?? null) : null,
    yogas: kundli?.status === 'ready' ? (kundli.yogaData ?? null) : null,
    doshas: kundli?.status === 'ready' ? (kundli.doshaData ?? null) : null,
    ashtakavarga: kundli?.status === 'ready' ? (kundli.ashtakavargaData ?? null) : null,
  };
  // A user who onboarded with an unknown birth time will NEVER get a ready
  // kundli (see kundli.service.ts#missingKundliParams) — distinct from one
  // that's simply still generating, so the scholar can pick the right
  // "no chart data" fallback copy instead of implying the chart is just late.
  const birthTimeUnknown = user?.birthTimeAccuracy === 'unknown';

  // Bound the prompt size regardless of how long this conversation has run —
  // keeps generation fast (timeout risk) and keeps the model from losing
  // track of what it already knows deep in a long raw transcript.
  const { recentHistory, summary, changed } = await compactHistory(history, incomingSummary);
  if (changed) {
    yield { type: 'summary', summary };
  }
  state.chatContext = { history: recentHistory, summary };

  const tokenStream = scholarStream(
    state,
    message,
    groundingSource,
    birthTimeUnknown,
    detailLevel,
    signal,
  );
  for await (const token of tokenStream) {
    yield { type: 'token', content: token };
  }
}
