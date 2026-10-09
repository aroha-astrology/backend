// =============================================================================
// The astrological day — real sunrise, sunset, day/night and weekday
// =============================================================================
// One place that answers "is this instant day or night here, how far through
// the day or night is it, and which weekday is running" from the real
// Swiss Ephemeris sunrise (panchang/rise-set.ts), counting the day from
// sunrise to the next sunrise.
//
// Callers still using their own shortcut, to be moved here (audit ids in
// docs/engine-audit/C-critical-corrections.md):
//   S1   shadbala.ts — Hora lord assumes sunrise at 06:00 UT
//   S4   shadbala.ts, yogas MahaBhagya, varshphal/solarReturn.ts — day/night
//        guessed from the Sun's whole-sign house
//   PN1  panchang/index.ts — sunrise from a rough declination formula
//   PN2  panchang/hora.ts — fixed 60-minute horas
//   DSY2 astro-tools/daily-synthesis.ts — weekday from the UTC date
// =============================================================================

import type { ChartData } from '../../shared/types/astrology.js';
import { getSunriseSunset } from '../panchang/rise-set.js';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export interface AstroDay {
  /** Sunrise that opened the day `at` falls in. */
  sunrise: Date;
  sunset: Date;
  nextSunrise: Date;
  isDay: boolean;
  /** 0-1 through the daylight span when `isDay`, through the night otherwise. */
  fraction: number;
  /** 0 = Sunday .. 6 = Saturday, of the local civil date of `sunrise`. */
  weekday: number;
}

/**
 * A Date whose LOCAL getters (getFullYear/getMonth/getDate) give the civil
 * date at the place, which is how rise-set.ts reads its `date` argument.
 */
function civilDate(instant: Date, tzOffsetHours: number, addDays = 0): Date {
  const local = new Date(instant.getTime() + tzOffsetHours * MS_PER_HOUR + addDays * MS_PER_DAY);
  return new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

/**
 * The sunrise-to-sunrise day containing `at`. Null when the Sun does not rise
 * or set that day (polar latitudes); callers must not invent a time.
 */
export async function getAstroDay(
  at: Date,
  latitude: number,
  longitude: number,
  tzOffsetHours: number,
): Promise<AstroDay | null> {
  const riseSet = (addDays: number) =>
    getSunriseSunset(civilDate(at, tzOffsetHours, addDays), latitude, longitude, tzOffsetHours);

  let today = await riseSet(0);
  if (!today.sunrise || !today.sunset) return null;

  let offset = 0;
  // Before today's sunrise the running day is the one that opened yesterday.
  if (at.getTime() < today.sunrise.getTime()) {
    offset = -1;
    today = await riseSet(-1);
    if (!today.sunrise || !today.sunset) return null;
  }
  const next = await riseSet(offset + 1);
  if (!next.sunrise) return null;

  const sunrise = today.sunrise;
  const sunset = today.sunset;
  const nextSunrise = next.sunrise;
  const t = at.getTime();
  const isDay = t < sunset.getTime();
  const fraction = isDay
    ? (t - sunrise.getTime()) / (sunset.getTime() - sunrise.getTime())
    : (t - sunset.getTime()) / (nextSunrise.getTime() - sunset.getTime());

  const localSunrise = new Date(sunrise.getTime() + tzOffsetHours * MS_PER_HOUR);
  return {
    sunrise,
    sunset,
    nextSunrise,
    isDay,
    fraction: Math.max(0, Math.min(1, fraction)),
    weekday: localSunrise.getUTCDay(),
  };
}

/** Which of `parts` equal slices of the running day or night `at` falls in (0-based). */
export function partOfSpan(day: AstroDay, parts: number): number {
  return Math.min(parts - 1, Math.floor(day.fraction * parts));
}

// -----------------------------------------------------------------------------
// Day context — what the day-based strength rules read
// -----------------------------------------------------------------------------

export interface DayContext {
  isDay: boolean;
  /** 0-1 through the daylight span when `isDay`, through the night otherwise. */
  fraction: number;
  /** 0 = Sunday .. 6 = Saturday, of the day that opened at the last sunrise. */
  weekday: number;
  /** Hours elapsed since that sunrise. */
  hoursSinceSunrise: number;
  /** 'ephemeris': from the real sunrise at the place. 'chart': estimated from the Ascendant. */
  basis: 'ephemeris' | 'chart';
}

export function dayContextAt(day: AstroDay, at: Date): DayContext {
  return {
    isDay: day.isDay,
    fraction: day.fraction,
    weekday: day.weekday,
    hoursSinceSunrise: Math.max(0, (at.getTime() - day.sunrise.getTime()) / MS_PER_HOUR),
    basis: 'ephemeris',
  };
}

function normalize360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * The Ascendant is the degree of the ecliptic on the eastern horizon, and the
 * signs rise in order, so the half of the ecliptic already risen is the 180
 * degrees BEHIND the Ascendant. The Sun lies on the ecliptic, so it is above
 * the horizon exactly when it is in that half. (Geometric horizon and the
 * Sun's centre: a few minutes off the refracted upper-limb sunrise.)
 */
export function sunAboveHorizon(ascendantLongitude: number, sunLongitude: number): boolean {
  return normalize360(ascendantLongitude - sunLongitude) < 180;
}

/** Degrees of the ecliptic risen since the Sun rose, or null without an Ascendant degree. */
function risenSinceSunrise(chart: ChartData): number | null {
  const sun = chart.planets.find((p) => p.planet === 'Sun');
  const asc = chart.ascendant;
  if (!sun || !asc || !Number.isFinite(asc.signIndex) || !Number.isFinite(asc.degree)) return null;
  return normalize360(asc.signIndex * 30 + asc.degree - sun.longitude);
}

/**
 * Day or night for a chart whose place is not to hand. Uses the Ascendant
 * degree; a hand-built chart without one falls back to the Sun's whole-sign
 * house (7-12 = day), which is the same test at sign precision.
 */
export function isDayChart(chart: ChartData): boolean {
  const risen = risenSinceSunrise(chart);
  if (risen !== null) return risen < 180;
  const sun = chart.planets.find((p) => p.planet === 'Sun');
  return !sun || (sun.house >= 7 && sun.house <= 12);
}

/**
 * An ESTIMATE of the day context from the chart alone, for callers that do not
 * have the birth place. Day/night is exact (see `sunAboveHorizon`); the rest
 * assumes the ecliptic rises evenly at 15 degrees an hour, which it does not:
 * for Tokyo on 10 March 2024 at 08:30 it gives 3.7 hours since sunrise where
 * the truth is 2.5. So the hour lord from this path is a guess and the third
 * of the day is right only away from its boundaries. The weekday is the UTC
 * weekday of the estimated local noon, which is the local civil date for any
 * place within 12 hours of Greenwich. Pass the real context whenever the
 * place is known.
 */
export function estimateDayContext(chart: ChartData, at: Date): DayContext {
  const sun = chart.planets.find((p) => p.planet === 'Sun');
  // Without an Ascendant degree only the Sun's house is known: take its middle.
  const risen = risenSinceSunrise(chart) ?? (sun ? normalize360((1 - sun.house) * 30 + 15) : 0);
  const isDay = risen < 180;
  const hoursSinceSunrise = risen / 15;
  const estimatedNoon = new Date(at.getTime() + (6 - hoursSinceSunrise) * MS_PER_HOUR);
  return {
    isDay,
    fraction: (isDay ? risen : risen - 180) / 180,
    weekday: estimatedNoon.getUTCDay(),
    hoursSinceSunrise,
    basis: 'chart',
  };
}
