// =============================================================================
// Pancha Pakshi Yamas — 10 time-windows per day (5 day, 5 night)
// =============================================================================
// Each civil day is split into 5 equal day-Yamas (sunrise -> sunset) and 5
// equal night-Yamas (sunset -> next sunrise), ~2h24m each at the equinox,
// varying with season/latitude since they're fractions of the ACTUAL
// sunrise-sunset span, not fixed clock hours. Uses the real swisseph-derived
// sunrise/sunset (astro-engine/panchang/rise-set.ts's getSunriseSunset) —
// deliberately NOT panchang/index.ts's NOAA closed-form approximation, which
// would introduce sub-Yama-boundary error where this system needs precision.
// =============================================================================

import { getSunriseSunset } from '../panchang/rise-set.js';

export interface YamaWindow {
  /** 1-5 for day Yamas, 1-5 for night Yamas (see `period`). */
  index: number;
  period: 'day' | 'night';
  start: Date;
  end: Date;
}

export interface YamaGrid {
  sunrise: Date;
  sunset: Date;
  nextSunrise: Date;
  dayYamas: YamaWindow[];
  nightYamas: YamaWindow[];
}

function splitIntoFive(start: Date, end: Date, period: 'day' | 'night'): YamaWindow[] {
  const totalMs = end.getTime() - start.getTime();
  const stepMs = totalMs / 5;
  return Array.from({ length: 5 }, (_, i) => ({
    index: i + 1,
    period,
    start: new Date(start.getTime() + i * stepMs),
    end: new Date(start.getTime() + (i + 1) * stepMs),
  }));
}

/**
 * Computes the 10 Yama windows for the civil day `date` falls on, at
 * (latitude, longitude). Returns null if sunrise/sunset/next-sunrise could
 * not be determined (extreme latitude edge case) — never fabricates a
 * fallback time.
 */
export async function computeYamaGrid(
  date: Date,
  latitude: number,
  longitude: number,
  timezoneOffsetHours: number,
): Promise<YamaGrid | null> {
  const today = await getSunriseSunset(date, latitude, longitude, timezoneOffsetHours);
  if (!today.sunrise || !today.sunset) return null;

  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const tomorrow = await getSunriseSunset(nextDay, latitude, longitude, timezoneOffsetHours);
  if (!tomorrow.sunrise) return null;

  return {
    sunrise: today.sunrise,
    sunset: today.sunset,
    nextSunrise: tomorrow.sunrise,
    dayYamas: splitIntoFive(today.sunrise, today.sunset, 'day'),
    nightYamas: splitIntoFive(today.sunset, tomorrow.sunrise, 'night'),
  };
}

/** Finds which Yama window (if any) a given instant falls within. */
export function findCurrentYama(grid: YamaGrid, at: Date): YamaWindow | null {
  const all = [...grid.dayYamas, ...grid.nightYamas];
  return all.find((y) => at >= y.start && at < y.end) ?? null;
}
