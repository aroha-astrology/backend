import { calculateAshtakavarga } from '../../src/lib/astro-engine/calculations/ashtakavarga';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { ScrollChart, ScrollPlanet } from '../../src/lib/astro-tools/daily-hooks/rahasya';

// A hand-made chart with easy numbers. Ascendant Libra 5°; Sun Leo 10° (own sign); Moon Taurus 15° (Rohini
// pada 2); Mars Capricorn 5° (exalted); Mercury Virgo 0°; Jupiter Cancer 10° (exalted); Venus Pisces 10°
// (exalted); Saturn Libra 20° (exalted); Rahu Gemini 20°; Ketu Sagittarius 20°.
const NAK_NAMES = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha',
  'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];

const NAK_LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];

function planetAt(planet: string, longitude: number, retro = false): ScrollPlanet & { signIndex: number; nakshatraIndex: number; house: number } {
  const nakshatraIndex = Math.floor(longitude / (360 / 27));
  return {
    planet,
    longitude,
    signIndex: Math.floor(longitude / 30),
    signDegree: longitude % 30,
    nakshatra: NAK_NAMES[nakshatraIndex]!,
    nakshatraIndex,
    nakshatraPada: Math.floor(((longitude % (360 / 27)) / (360 / 27)) * 4) + 1,
    nakshatraLord: NAK_LORDS[nakshatraIndex % 9],
    isRetrograde: retro,
    house: 1,
  };
}

export const FIXTURE_PLANETS = [
  planetAt('Sun', 130),
  planetAt('Moon', 45),
  planetAt('Mars', 275),
  planetAt('Mercury', 150),
  planetAt('Jupiter', 100),
  planetAt('Venus', 340),
  planetAt('Saturn', 200),
  planetAt('Rahu', 80, true),
  planetAt('Ketu', 260, true),
];

export function fixtureChart(opts: { exactTime?: boolean } = {}): ScrollChart {
  const chartData = {
    planets: FIXTURE_PLANETS,
    ascendant: { sign: ZODIAC_SIGNS[6], signIndex: 6, degree: 5, nakshatra: 'Chitra', nakshatraPada: 3 },
    houses: [],
  };
  const av = calculateAshtakavarga(chartData as never);
  return {
    planets: FIXTURE_PLANETS,
    ascendant: { signIndex: 6, degree: 5 },
    exactTime: opts.exactTime ?? true,
    bhinna: av.bhinna.map((b) => ({ planet: b.planet, bindus: b.bindus })),
    sarva: av.sarva.bindus,
    dasha: {
      mahadasha: { planet: 'Venus', startDate: '2021-03-01T00:00:00.000Z', endDate: '2041-03-01T00:00:00.000Z' },
      antardasha: { planet: 'Mercury', startDate: '2026-02-01T00:00:00.000Z', endDate: '2028-12-01T00:00:00.000Z' },
    },
    asOf: '2026-10-26T06:30:00.000Z',
  };
}
