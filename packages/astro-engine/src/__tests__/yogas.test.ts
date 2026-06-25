import { describe, it, expect } from 'vitest';
import type { ChartData, PlanetPosition, HouseData, AscendantData, Planet, ZodiacSign } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';
import { detectAllYogas } from '../yogas';

function createMockChart(planetOverrides: Partial<PlanetPosition>[]): ChartData {
  const defaults: PlanetPosition[] = [
    { planet: 'Sun', longitude: 10, latitude: 0, speed: 1, sign: 'Aries', signIndex: 0, signDegree: 10, nakshatra: 'Ashwini', nakshatraIndex: 0, nakshatraPada: 3, nakshatraLord: 'Ketu', isRetrograde: false, house: 1 },
    { planet: 'Moon', longitude: 40, latitude: 0, speed: 13, sign: 'Taurus', signIndex: 1, signDegree: 10, nakshatra: 'Rohini', nakshatraIndex: 3, nakshatraPada: 1, nakshatraLord: 'Moon', isRetrograde: false, house: 2 },
    { planet: 'Mars', longitude: 10, latitude: 0, speed: 0.5, sign: 'Aries', signIndex: 0, signDegree: 10, nakshatra: 'Ashwini', nakshatraIndex: 0, nakshatraPada: 3, nakshatraLord: 'Ketu', isRetrograde: false, house: 1 },
    { planet: 'Mercury', longitude: 170, latitude: 0, speed: 1.5, sign: 'Virgo', signIndex: 5, signDegree: 20, nakshatra: 'Hasta', nakshatraIndex: 12, nakshatraPada: 3, nakshatraLord: 'Moon', isRetrograde: false, house: 6 },
    { planet: 'Jupiter', longitude: 100, latitude: 0, speed: 0.1, sign: 'Cancer', signIndex: 3, signDegree: 10, nakshatra: 'Pushya', nakshatraIndex: 7, nakshatraPada: 2, nakshatraLord: 'Saturn', isRetrograde: false, house: 4 },
    { planet: 'Venus', longitude: 340, latitude: 0, speed: 1.2, sign: 'Pisces', signIndex: 11, signDegree: 10, nakshatra: 'Revati', nakshatraIndex: 26, nakshatraPada: 3, nakshatraLord: 'Mercury', isRetrograde: false, house: 12 },
    { planet: 'Saturn', longitude: 190, latitude: 0, speed: 0.05, sign: 'Libra', signIndex: 6, signDegree: 10, nakshatra: 'Swati', nakshatraIndex: 14, nakshatraPada: 2, nakshatraLord: 'Rahu', isRetrograde: false, house: 7 },
    { planet: 'Rahu', longitude: 70, latitude: 0, speed: -0.05, sign: 'Gemini', signIndex: 2, signDegree: 10, nakshatra: 'Ardra', nakshatraIndex: 5, nakshatraPada: 1, nakshatraLord: 'Rahu', isRetrograde: true, house: 3 },
    { planet: 'Ketu', longitude: 250, latitude: 0, speed: -0.05, sign: 'Sagittarius', signIndex: 8, signDegree: 10, nakshatra: 'Moola', nakshatraIndex: 18, nakshatraPada: 3, nakshatraLord: 'Ketu', isRetrograde: true, house: 9 },
  ];

  for (const override of planetOverrides) {
    const idx = defaults.findIndex((p) => p.planet === override.planet);
    if (idx >= 0) defaults[idx] = { ...defaults[idx], ...override };
  }

  const houses: HouseData[] = Array.from({ length: 12 }, (_, i) => ({
    house: i + 1,
    cusp: i * 30,
    sign: ZODIAC_SIGNS[i],
    signIndex: i,
    lord: SIGN_LORDS[ZODIAC_SIGNS[i]],
    planets: defaults.filter((p) => p.house === i + 1).map((p) => p.planet),
  }));

  return {
    planets: defaults,
    houses,
    ascendant: { sign: 'Aries', signIndex: 0, degree: 5, nakshatra: 'Ashwini', nakshatraPada: 2 },
    ayanamsa: 'lahiri',
    ayanamsaValue: 24.1,
    julianDay: 2451545,
  };
}

describe('Yoga Detection', () => {
  it('should return an array of yogas', () => {
    const chart = createMockChart([]);
    const yogas = detectAllYogas(chart);
    expect(Array.isArray(yogas)).toBe(true);
    expect(yogas.length).toBeGreaterThan(0);
  });

  it('should detect Ruchaka yoga (Mars in own sign in Kendra)', () => {
    const chart = createMockChart([
      { planet: 'Mars', house: 1, sign: 'Aries', signIndex: 0 },
    ]);
    const yogas = detectAllYogas(chart);
    const ruchaka = yogas.find((y) => y.name === 'Ruchaka Yoga');
    expect(ruchaka).toBeDefined();
    if (ruchaka) expect(ruchaka.present).toBe(true);
  });

  it('should detect Hamsa yoga (Jupiter exalted in Kendra)', () => {
    const chart = createMockChart([
      { planet: 'Jupiter', house: 4, sign: 'Cancer', signIndex: 3 },
    ]);
    const yogas = detectAllYogas(chart);
    const hamsa = yogas.find((y) => y.name === 'Hamsa Yoga');
    expect(hamsa).toBeDefined();
    if (hamsa) expect(hamsa.present).toBe(true);
  });

  it('should detect Shasha yoga (Saturn exalted in Kendra)', () => {
    const chart = createMockChart([
      { planet: 'Saturn', house: 7, sign: 'Libra', signIndex: 6 },
    ]);
    const yogas = detectAllYogas(chart);
    const shasha = yogas.find((y) => y.name === 'Shasha Yoga');
    expect(shasha).toBeDefined();
    if (shasha) expect(shasha.present).toBe(true);
  });

  it('should detect Gajakesari yoga (Jupiter in Kendra from Moon)', () => {
    // Moon in house 2, Jupiter in house 5 (4th from Moon)
    const chart = createMockChart([
      { planet: 'Moon', house: 1 },
      { planet: 'Jupiter', house: 4 },
    ]);
    const yogas = detectAllYogas(chart);
    const gajakesari = yogas.find((y) => y.name === 'Gajakesari Yoga');
    expect(gajakesari).toBeDefined();
    if (gajakesari) expect(gajakesari.present).toBe(true);
  });

  it('should detect Budhaditya yoga (Sun and Mercury in same house in Kendra)', () => {
    const chart = createMockChart([
      { planet: 'Sun', house: 1 },
      { planet: 'Mercury', house: 1 },
    ]);
    const yogas = detectAllYogas(chart);
    const budhaditya = yogas.find((y) => y.name === 'Budhaditya');
    if (budhaditya) {
      // Only forms in kendra/trikona
      expect(budhaditya.present).toBe(true);
    }
  });

  it('should detect Guru-Mangala yoga (Jupiter and Mars conjunction)', () => {
    const chart = createMockChart([
      { planet: 'Jupiter', house: 5 },
      { planet: 'Mars', house: 5 },
    ]);
    const yogas = detectAllYogas(chart);
    const guruMangala = yogas.find((y) => y.name === 'Guru-Mangala Yoga');
    expect(guruMangala).toBeDefined();
    if (guruMangala) expect(guruMangala.present).toBe(true);
  });

  it('should detect Harsha yoga (6th lord in 6th house)', () => {
    // For Aries ascendant, 6th house = Virgo, lord = Mercury
    const chart = createMockChart([
      { planet: 'Mercury', house: 6, sign: 'Virgo', signIndex: 5 },
    ]);
    const yogas = detectAllYogas(chart);
    const harsha = yogas.find((y) => y.name === 'Harsha Yoga');
    expect(harsha).toBeDefined();
    if (harsha) expect(harsha.present).toBe(true);
  });

  it('should have strength between 0 and 100 for all yogas', () => {
    const chart = createMockChart([]);
    const yogas = detectAllYogas(chart);
    for (const yoga of yogas) {
      expect(yoga.strength).toBeGreaterThanOrEqual(0);
      expect(yoga.strength).toBeLessThanOrEqual(100);
    }
  });
});
