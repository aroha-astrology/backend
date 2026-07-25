import {
  dateToJulianDay,
  calculatePlanetPositions,
} from '../../lib/astro-engine/calculations/planetPositions.js';
import type { MoonSignRequest, MoonSignResponse } from './public.schemas.js';

/**
 * Pure computation for the public "what's your Moon sign" tool: geocentric
 * Moon longitude doesn't depend on observer location, so — unlike a full
 * chart — no lat/lng input is needed. Same reasoning `/v1/panchang` and
 * `/v1/forecast/moon-sign/{signIndex}` already rely on to stay location-free.
 */
export async function computeMoonSign(input: MoonSignRequest): Promise<MoonSignResponse> {
  const [year, month, day] = input.date.split('-').map(Number) as [number, number, number];
  const [hour, min] = input.time.split(':').map(Number) as [number, number];
  const timezoneHours = input.tzOffsetMinutes / 60;

  const jd = await dateToJulianDay(year, month, day, hour, min, timezoneHours);
  const planets = await calculatePlanetPositions(jd, 'lahiri');

  const moon = planets.find((p) => p.planet === 'Moon');
  if (!moon) {
    // Should be unreachable — calculatePlanetPositions always returns all 9
    // Vedic planets — but fail loudly rather than returning a bogus shape.
    throw new Error('Moon position missing from calculatePlanetPositions result');
  }

  return {
    sign: moon.sign,
    signIndex: moon.signIndex,
    degree: Number(moon.signDegree.toFixed(2)),
    nakshatra: moon.nakshatra,
    nakshatraIndex: moon.nakshatraIndex,
    pada: moon.nakshatraPada,
    nakshatraLord: moon.nakshatraLord,
  };
}
