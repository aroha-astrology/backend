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
