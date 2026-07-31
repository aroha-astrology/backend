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

async function sunLongitudeAt(jd: number): Promise<number> {
  const positions = await calculatePlanetPositions(jd);
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
    const diff = angleDiff(await sunLongitudeAt(mid), natalSunLongitude);
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
}

/**
 * Finds the solar return instant for `targetYear` and casts the Varsha
 * Kundali (annual chart) for it, at the birth location.
 *
 * `isDayReturn` is derived from the annual chart's OWN Sun house placement
 * (houses 7-12 = above the horizon = day; 1-6 = below = night) rather than a
 * separate sunrise/sunset lookup — the Ascendant/Descendant axis IS the
 * horizon in a chart already cast for this exact instant and location, so
 * this needs no additional ephemeris call.
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
  const jd = await findSolarReturnJd(natalSunLongitude, birthDate, targetYear);
  const exactAt = dateFromJd(jd);

  const chart = await calculateChart(
    exactAt.getUTCFullYear(),
    exactAt.getUTCMonth() + 1,
    exactAt.getUTCDate(),
    exactAt.getUTCHours(),
    exactAt.getUTCMinutes(),
    0, // exactAt is already UT
    latitude,
    longitude,
    ayanamsa,
    houseSystem,
  );

  const sunPlanet = chart.planets.find((p) => p.planet === 'Sun');
  const sunHouse = sunPlanet?.house ?? 1;
  const isDayReturn = sunHouse >= 7 && sunHouse <= 12;

  return { jd, exactAt, chart, isDayReturn };
}
