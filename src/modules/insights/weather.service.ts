// =============================================================================
// Astro Weather — the daily view: how the day leans, area by area, and when
// =============================================================================
// Built from what the app already computes, so it costs no AI call:
// - overall score and trend: the deterministic daily synthesis
//   (daily-synthesis.ts) for yesterday, today and tomorrow;
// - area scores: the day's stored personal horoscope category scores when
//   that reading exists, otherwise the net lean of the area's chart factors;
// - "important" moments: the Moon's sign and nakshatra changes that day;
// - Your Day: the day's good and caution windows from the panchang.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { synthesizeDailyForecastFromKundli } from '../../lib/astro-tools/daily-synthesis.js';
import { findMoonChanges } from '../../lib/astro-tools/moon-events.js';
import { explainArea, netEffect } from '../../lib/intelligence/why.js';
import type { LifeArea } from '../../lib/intelligence/areas.js';
import type { WhyFactor } from '../../lib/intelligence/types.js';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { findHoroscope } from '../horoscope/horoscope.repo.js';
import { getPanchang } from '../astro/astro.service.js';
import { panchangLocationFor } from '../purchase-plan/purchase-plan.service.js';
import { istNoon, loadChartContext } from './insights.service.js';

/** The four rows Astro Weather shows, and the horoscope category each reads its score from. */
export const WEATHER_AREAS = [
  { key: 'career', area: 'career', horoscopeCategory: 'career' },
  { key: 'relationships', area: 'relationships', horoscopeCategory: 'marriage' },
  { key: 'money', area: 'money', horoscopeCategory: 'finance' },
  { key: 'energy', area: 'health', horoscopeCategory: 'health' },
] as const satisfies ReadonlyArray<{ key: string; area: LifeArea; horoscopeCategory: string }>;

export type WeatherAreaKey = (typeof WEATHER_AREAS)[number]['key'];
export type Trend = 'improving' | 'steady' | 'declining';

export interface WeatherArea {
  key: WeatherAreaKey;
  area: LifeArea;
  /** 0-100. */
  score: number;
  source: 'horoscope' | 'chart';
}

export interface WeatherMoment {
  kind: 'moonSign' | 'moonNakshatra';
  /** ISO instant. */
  at: string;
  /** 'HH:mm' in IST. */
  time: string;
  from: string;
  to: string;
}

export interface DayWindow {
  /** 'HH:mm' IST. */
  start: string;
  end: string;
  kind: 'good' | 'caution';
  /** Choghadiya name ("Amrit", "Labh"…), or 'abhijit' / 'rahuKaal'. */
  name: string;
}

export interface AstroWeather {
  date: string;
  header: { moonSign: string; mahadasha: string | null; antardasha: string | null };
  overall: { score: number; trend: Trend; tomorrowScore: number | null };
  areas: WeatherArea[];
  moments: WeatherMoment[];
  /** Empty (with `dayAvailable: false`) outside India, where the IST panchang times would be wrong. */
  day: DayWindow[];
  dayAvailable: boolean;
  why: WhyFactor[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A 1-5 synthesis/horoscope score as 0-100. */
export function toPercent(score1to5: number): number {
  return clamp(Math.round(score1to5 * 20), 0, 100);
}

/** An area's score from its chart factors alone: 55 neutral, ±10 per net factor. */
export function chartScore(factors: readonly WhyFactor[]): number {
  return clamp(55 + netEffect(factors) * 10, 15, 95);
}

export function trendOf(today: number, tomorrow: number | null): Trend {
  if (tomorrow == null) return 'steady';
  if (tomorrow - today >= 0.75) return 'improving';
  if (today - tomorrow >= 0.75) return 'declining';
  return 'steady';
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function istTime(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}

/** Good choghadiya, Abhijit and Rahu Kaal for the daytime, in time order. */
export function dayWindows(panchang: {
  choghadiya?: {
    day: Array<{
      name: string;
      type: 'good' | 'bad' | 'neutral';
      startTime: string;
      endTime: string;
    }>;
  };
  rahuKaal?: { start: string; end: string };
  abhijitMuhurta?: { start: string; end: string };
}): DayWindow[] {
  const out: DayWindow[] = [];
  for (const c of panchang.choghadiya?.day ?? []) {
    if (c.type === 'neutral') continue;
    out.push({
      start: c.startTime,
      end: c.endTime,
      kind: c.type === 'good' ? 'good' : 'caution',
      name: c.name,
    });
  }
  if (panchang.abhijitMuhurta) {
    out.push({ ...panchang.abhijitMuhurta, kind: 'good', name: 'abhijit' });
  }
  if (panchang.rahuKaal) {
    out.push({ ...panchang.rahuKaal, kind: 'caution', name: 'rahuKaal' });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

function isIndianTimezone(tz: string | null | undefined): boolean {
  return tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta';
}

export async function getAstroWeather(user: UserRow, date: string): Promise<AstroWeather> {
  const asOf = istNoon(date);
  const loaded = await loadChartContext(user, asOf);
  if (!loaded) throw Errors.conflict('CHART_NOT_READY');
  const { profile, ctx } = loaded;

  const kundli = await findKundliByUserId(user.id, profile.birthProfileId);
  const [today, tomorrow, horoscope] = await Promise.all([
    synthesizeDailyForecastFromKundli(kundli?.chartData, kundli?.dashaData, asOf.toISOString()),
    synthesizeDailyForecastFromKundli(
      kundli?.chartData,
      kundli?.dashaData,
      istNoon(addDays(date, 1)).toISOString(),
    ),
    findHoroscope(user.id, profile.birthProfileId, 'daily', date),
  ]);

  const categories =
    horoscope?.status === 'ready'
      ? ((horoscope.structured as { categories?: Record<string, { score?: number }> } | null)
          ?.categories ?? null)
      : null;

  const areas: WeatherArea[] = WEATHER_AREAS.map(({ key, area, horoscopeCategory }) => {
    const stored = categories?.[horoscopeCategory]?.score;
    return typeof stored === 'number'
      ? { key, area, score: toPercent(stored), source: 'horoscope' }
      : { key, area, score: chartScore(explainArea(area, ctx)), source: 'chart' };
  });

  const overallScore = today?.score ?? 3;
  const dayStart = new Date(`${date}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const moments: WeatherMoment[] = (await findMoonChanges(dayStart, dayEnd)).map((m) => ({
    kind: m.kind === 'sign' ? 'moonSign' : 'moonNakshatra',
    at: m.exactAt.toISOString(),
    time: istTime(m.exactAt),
    from: m.from,
    to: m.to,
  }));

  const timezone = user.currentTimezone ?? profile.placeOfBirth?.tz ?? null;
  const dayAvailable = isIndianTimezone(timezone);
  let day: DayWindow[] = [];
  if (dayAvailable) {
    try {
      const { lat, lon } = panchangLocationFor(user);
      day = dayWindows(await getPanchang(lat, lon, date));
    } catch (err) {
      logger.warn({ err, userId: user.id }, 'astro-weather: panchang lookup failed');
    }
  }

  return {
    date,
    header: {
      moonSign: ZODIAC_SIGNS[ctx.moonSignIndex] ?? '',
      mahadasha: ctx.dasha.mahadasha?.planet ?? null,
      antardasha: ctx.dasha.antardasha?.planet ?? null,
    },
    overall: {
      score: toPercent(overallScore),
      trend: trendOf(overallScore, tomorrow?.score ?? null),
      tomorrowScore: tomorrow ? toPercent(tomorrow.score) : null,
    },
    areas,
    moments,
    day,
    dayAvailable,
    why: explainArea('overall', ctx).slice(0, 3),
  };
}
