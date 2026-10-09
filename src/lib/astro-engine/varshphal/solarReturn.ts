// =============================================================================
// Tajik Varshphal — Solar Return (Varshapravesha)
// =============================================================================
// The Varshphal is valid for exactly one year, beginning the instant the
// transiting Sun returns to the precise sidereal longitude it held at birth.
// Finds that instant via binary search (the same technique
// astro-tools/transit-events.ts uses for ingress refinement, reused via its
// exported jdFromDate/dateFromJd) and casts the annual chart (Varsha Kundali)
// at that instant, at the birth location.
// =============================================================================

import { calculatePlanetPositions, calculateChart } from '../calculations/planetPositions.js';
import { jdFromDate, dateFromJd } from '../../astro-tools/transit-events.js';
import type { ChartData, Ayanamsa, HouseSystem } from '@aroha-astrology/shared';
import { dayContextAt, getAstroDay, isDayChart, type DayContext } from '../rules/day.js';

async function sunLongitudeAt(jd: number, ayanamsa: Ayanamsa): Promise<number> {
  const positions = await calculatePlanetPositions(jd, ayanamsa);
  return positions.find((p) => p.planet === 'Sun')?.longitude ?? 0;
}

/** a - b in degrees, normalized to (-180, 180]. */
function angleDiff(a: number, b: number): number {
  return ((((a - b + 540) % 360) + 360) % 360) - 180;
}

const SEARCH_ITERATIONS = 30; // ~3-day window halved 30x is far below a second of precision

/**
 * Binary-searches for the exact UT Julian day the Sun returns to
 * `natalSunLongitude`, for the completed-age anniversary in `targetYear`.
 * Starts from a +/-3-day bracket around the calendar anniversary — the Sun
 * moves close to 1 degree/day and never retrogrades, so the true return
 * instant is always within a day or so of the naive anniversary date, and
 * the sign of angleDiff flips exactly once across the bracket.
 */
export async function findSolarReturnJd(
  natalSunLongitude: number,
  birthDate: Date,
  targetYear: number,
  // The natal Sun's longitude is in the chart's own ayanamsa, so the transit
  // Sun must be read in the same one (audit item TJ4): against the default it
  // lands up to a day and a half away for a non-Lahiri chart.
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<number> {
  const approx = new Date(
    Date.UTC(
      targetYear,
      birthDate.getUTCMonth(),
      birthDate.getUTCDate(),
      birthDate.getUTCHours(),
      birthDate.getUTCMinutes(),
    ),
  );

  let jdLow = jdFromDate(new Date(approx.getTime() - 3 * 86_400_000));
  let jdHigh = jdFromDate(new Date(approx.getTime() + 3 * 86_400_000));

  for (let i = 0; i < SEARCH_ITERATIONS; i++) {
    const mid = (jdLow + jdHigh) / 2;
    const diff = angleDiff(await sunLongitudeAt(mid, ayanamsa), natalSunLongitude);
    if (diff < 0) jdLow = mid;
    else jdHigh = mid;
  }

  return jdHigh;
}

export interface SolarReturnResult {
  jd: number;
  exactAt: Date;
  chart: ChartData;
  /** Whether the return instant falls in local daytime (sunrise-sunset) at the birth location — needed for Dina-Ratri Pati and Punya Saham, which use different rules for day vs. night returns. */
  isDayReturn: boolean;
  /** Weekday, hour and day/night part at the return, from the real sunrise there; null where the Sun does not rise or set that day. */
  dayContext: DayContext | null;
}

/**
 * Finds the solar return instant for `targetYear` and casts the Varsha
 * Kundali (annual chart) for it, at the birth location.
 *
 * `isDayReturn` comes from the real sunrise and sunset at that place. Where
 * those do not exist (polar day or night) it falls back to the chart's own
 * horizon: the Sun is up when it lies in the 180 degrees behind the Ascendant
 * degree. (The Sun's whole-sign house alone, used before, is wrong for up to
 * two hours either side of sunrise and sunset.)
 */
export async function computeSolarReturn(
  natalSunLongitude: number,
  birthDate: Date,
  targetYear: number,
  latitude: number,
  longitude: number,
  ayanamsa: Ayanamsa = 'lahiri',
  houseSystem: HouseSystem = 'W',
): Promise<SolarReturnResult> {
  const jd = await findSolarReturnJd(natalSunLongitude, birthDate, targetYear, ayanamsa);
  const exactAt = dateFromJd(jd);

  const chart = await calculateChart(
    exactAt.getUTCFullYear(),
    exactAt.getUTCMonth() + 1,
    exactAt.getUTCDate(),
    exactAt.getUTCHours(),
    // Seconds ride along as a fraction of the minute; dropping them moved the
    // annual Lagna by up to a quarter of a degree.
    exactAt.getUTCMinutes() + exactAt.getUTCSeconds() / 60,
    0, // exactAt is already UT
    latitude,
    longitude,
    ayanamsa,
    houseSystem,
  );

  // Local mean time is enough to pick the civil date the sunrise belongs to.
  let dayContext: DayContext | null = null;
  try {
    const astroDay = await getAstroDay(exactAt, latitude, longitude, longitude / 15);
    dayContext = astroDay ? dayContextAt(astroDay, exactAt) : null;
  } catch {
    dayContext = null;
  }
  const isDayReturn = dayContext ? dayContext.isDay : isDayChart(chart);

  return { jd, exactAt, chart, isDayReturn, dayContext };
}
