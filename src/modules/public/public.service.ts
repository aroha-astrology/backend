import {
  dateToJulianDay,
  calculatePlanetPositions,
  calculateChart,
} from '../../lib/astro-engine/calculations/planetPositions.js';
import type {
  MoonSignRequest,
  MoonSignResponse,
  KundliChartRequest,
  KundliChartResponse,
} from './public.schemas.js';

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

/**
 * Pure computation for the public "free Kundli" tool: a full D1 chart needs
 * an observer location (unlike Moon sign), so lat/lng are required. Mirrors
 * the authenticated kundli.service.ts's call to calculateChart, but skips its
 * DB persistence / background jobs / LLM content entirely — this is compute
 * and return, same as computeMoonSign above.
 */
export async function computeKundliChart(input: KundliChartRequest): Promise<KundliChartResponse> {
  const [year, month, day] = input.date.split('-').map(Number) as [number, number, number];
  const [hour, min] = input.time.split(':').map(Number) as [number, number];
  const timezoneHours = input.tzOffsetMinutes / 60;

  const chart = await calculateChart(
    year,
    month,
    day,
    hour,
    min,
    timezoneHours,
    input.lat,
    input.lng,
    'lahiri',
    'W',
  );

  return {
    planets: chart.planets.map((p) => ({
      planet: p.planet,
      sign: p.sign,
      signIndex: p.signIndex,
      signDegree: Number(p.signDegree.toFixed(2)),
      nakshatra: p.nakshatra,
      nakshatraIndex: p.nakshatraIndex,
      nakshatraPada: p.nakshatraPada,
      nakshatraLord: p.nakshatraLord,
      isRetrograde: p.isRetrograde,
      house: p.house,
    })),
    houses: chart.houses.map((h) => ({
      house: h.house,
      sign: h.sign,
      signIndex: h.signIndex,
      lord: h.lord,
      planets: h.planets,
    })),
    ascendant: {
      sign: chart.ascendant.sign,
      signIndex: chart.ascendant.signIndex,
      degree: Number(chart.ascendant.degree.toFixed(2)),
      nakshatra: chart.ascendant.nakshatra,
      nakshatraPada: chart.ascendant.nakshatraPada,
    },
    ayanamsa: chart.ayanamsa,
  };
}
