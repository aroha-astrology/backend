// =============================================================================
// Public ephemeris API — cache + optional worker-pool dispatch.
// Same exported names/signatures as before the refactor: every existing
// caller (kundli.service.ts, astro.service.ts, chat-grounding.ts, etc.)
// keeps working unchanged.
// =============================================================================

import type {
  Ayanamsa,
  ChartData,
  HouseSystem,
  PlanetPosition,
  HouseData,
  AscendantData,
} from '@aroha-astrology/shared';

import {
  getSwe,
  AYANAMSA_MAP,
  getLunarNodeType,
  dateToJulianDay,
  calculatePlanetPositions as calculatePlanetPositionsCore,
  calculateHouses as calculateHousesCore,
  calculateAscendant as calculateAscendantCore,
  assignPlanetsToHouses,
} from './planetPositions.core.js';
import { EphemerisCache } from './ephemeris-cache.js';
import { getEphemerisPool } from './ephemeris-pool.js';

export { dateToJulianDay };

const MAX_CACHE_ENTRIES = 2000;

const planetPositionsCache = new EphemerisCache<PlanetPosition[]>(MAX_CACHE_ENTRIES);
const housesCache = new EphemerisCache<HouseData[]>(MAX_CACHE_ENTRIES);
const ascendantCache = new EphemerisCache<AscendantData>(MAX_CACHE_ENTRIES);

/**
 * Calculate sidereal positions of all 9 Vedic planets.
 * Cached by (jd, ayanamsa, node type) — the same instant is requested by many
 * concurrent users (e.g. daily transits), so this is a shared, high-hit-rate
 * cache regardless of the caller's own location.
 *
 * The node type belongs in the key even though it is process-wide and set once
 * at boot: without it, flipping the setting serves back charts computed with the
 * OTHER node from cache, which is both a latent correctness trap and impossible
 * to test (it silently defeated the mean-vs-true test that found this).
 */
export async function calculatePlanetPositions(
  jd: number,
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<PlanetPosition[]> {
  const pool = getEphemerisPool();
  // ponytail: the worker pool is not told the node type — each worker thread
  // keeps its own module state and would silently use the 'mean' default. Safe
  // today because the pool ships disabled (EPHEMERIS_POOL env flag) and the
  // node type ships as 'mean', so the two can only disagree if BOTH are changed.
  // Thread nodeType through ephemeris-pool/worker before enabling the pool
  // alongside LUNAR_NODE_TYPE=true.
  return planetPositionsCache.get(`${jd}|${ayanamsa}|${getLunarNodeType()}`, () =>
    pool.isEnabled()
      ? (pool.runPlanetPositions(jd, ayanamsa) as Promise<PlanetPosition[]>)
      : calculatePlanetPositionsCore(jd, ayanamsa),
  );
}

/**
 * Calculate house cusps for a given time and geographic location.
 */
export async function calculateHouses(
  jd: number,
  lat: number,
  lng: number,
  system: HouseSystem = 'W',
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<HouseData[]> {
  const pool = getEphemerisPool();
  return housesCache.get(`${jd}|${lat}|${lng}|${system}|${ayanamsa}`, () =>
    pool.isEnabled()
      ? (pool.runHouses(jd, lat, lng, system, ayanamsa) as Promise<HouseData[]>)
      : calculateHousesCore(jd, lat, lng, system, ayanamsa),
  );
}

/**
 * Calculate the ascendant (lagna) position.
 */
export async function calculateAscendant(
  jd: number,
  lat: number,
  lng: number,
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<AscendantData> {
  const pool = getEphemerisPool();
  return ascendantCache.get(`${jd}|${lat}|${lng}|${ayanamsa}`, () =>
    pool.isEnabled()
      ? (pool.runAscendant(jd, lat, lng, ayanamsa) as Promise<AscendantData>)
      : calculateAscendantCore(jd, lat, lng, ayanamsa),
  );
}

/**
 * Generate a complete chart with planets, houses, and ascendant.
 */
export async function calculateChart(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  timezone: number,
  lat: number,
  lng: number,
  ayanamsa: Ayanamsa = 'lahiri',
  houseSystem: HouseSystem = 'W',
): Promise<ChartData> {
  const jd = await dateToJulianDay(year, month, day, hour, min, timezone);
  const [planets, houses, ascendant] = await Promise.all([
    calculatePlanetPositions(jd, ayanamsa),
    calculateHouses(jd, lat, lng, houseSystem, ayanamsa),
    calculateAscendant(jd, lat, lng, ayanamsa),
  ]);

  assignPlanetsToHouses(planets, houses);

  // Deliberately re-set sid_mode right before reading it, rather than relying
  // on a set_sid_mode() side effect from one of the three calls above — those
  // may have been cache hits (or pool dispatches) that never touched the
  // main-thread swe instance's sid_mode at all.
  const swe = await getSwe();
  swe.set_sid_mode(AYANAMSA_MAP[ayanamsa], 0, 0);
  const ayanamsaValue = swe.get_ayanamsa(jd);

  return {
    planets,
    houses,
    ascendant,
    ayanamsa,
    ayanamsaValue,
    julianDay: jd,
  };
}
