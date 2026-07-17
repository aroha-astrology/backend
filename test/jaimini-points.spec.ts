import { describe, expect, it } from 'vitest';
import {
  calculateArudhaLagna,
  calculateUpapadaLagna,
  calculateAtmakaraka,
  calculateKarakamshaSignIndex,
} from '../src/lib/astro-engine/charts/jaiminiPoints.js';
import { calculateD9 } from '../src/lib/astro-engine/charts/divisionalCharts.js';

const SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

/** Minimal planet set with everything except the planet(s) under test parked
 * somewhere irrelevant to the case being checked. */
function basePlanets(overrides: Record<string, number>) {
  const defaults: Record<string, number> = {
    Sun: 0,
    Moon: 30,
    Mars: 60,
    Mercury: 90,
    Jupiter: 120,
    Venus: 150,
    Saturn: 180,
    Rahu: 210,
    Ketu: 30,
  };
  const merged = { ...defaults, ...overrides };
  return Object.entries(merged).map(([planet, longitude]) => ({ planet, longitude }));
}

describe('calculateArudhaLagna', () => {
  it("Leo Lagna, Sun (Leo's lord) also in Leo: raw Arudha lands in 1st-from-house -> displaced to 10th (Taurus)", () => {
    // Published worked example: Leo Lagna, Sun in Leo -> AL displaces to
    // Taurus (the 1st/7th-from-house exception, verified by hand before
    // writing jaiminiPoints.ts — see that file's calculateArudhaPada doc).
    const planets = basePlanets({ Sun: 4 * 30 + 15 }); // Leo, 15deg
    const result = calculateArudhaLagna(4, planets); // Ascendant = Leo (idx 4)
    expect(SIGNS[result]).toBe('Taurus');
  });

  it('Leo Lagna, Sun in Taurus: raw Arudha lands in 7th-from-house -> displaced to 4th (Scorpio)', () => {
    // Reverse-engineered companion case to the published "moves to 4th from
    // Leo" example: lord (Sun) in Taurus makes the raw double-count land on
    // Aquarius (7th from Leo), which the exception displaces to Scorpio.
    const planets = basePlanets({ Sun: 1 * 30 + 10 }); // Taurus, 10deg
    const result = calculateArudhaLagna(4, planets);
    expect(SIGNS[result]).toBe('Scorpio');
  });

  it('no exception case: raw Arudha stands when it does not land in 1st or 7th from house', () => {
    // Aries Lagna (lord Mars); Mars in Gemini (idx 2). distance = 2, raw =
    // (2+2)%12 = 4 = Leo. offsetFromHouse = 4, not 0 or 6 -> no displacement.
    const planets = basePlanets({ Mars: 2 * 30 + 5 }); // Gemini
    const result = calculateArudhaLagna(0, planets); // Ascendant = Aries (idx 0)
    expect(SIGNS[result]).toBe('Leo');
  });

  it('applies the Jaimini Scorpio duality rule (Mars vs. Ketu, higher degree wins)', () => {
    // Ascendant Scorpio (idx 7). Mars parked in Cancer (idx 3), Ketu parked
    // in Gemini (idx 2) -- different signs, so whichever wins the degree
    // comparison actually changes the result (a same-sign setup would let
    // both choices degenerate to the same answer without proving anything).
    const ketuHigher = basePlanets({ Mars: 3 * 30 + 5, Ketu: 2 * 30 + 25 });
    const marsHigher = basePlanets({ Mars: 3 * 30 + 25, Ketu: 2 * 30 + 5 });

    // ketuHigher: lord=Ketu at Gemini(idx2); distance=((2-7)%12+12)%12=7; raw=(2+7)%12=9=Capricorn; offset=2 -> no exception.
    expect(SIGNS[calculateArudhaLagna(7, ketuHigher)]).toBe('Capricorn');
    // marsHigher: lord=Mars at Cancer(idx3); distance=((3-7)%12+12)%12=8; raw=(3+8)%12=11=Pisces; offset=4 -> no exception.
    expect(SIGNS[calculateArudhaLagna(7, marsHigher)]).toBe('Pisces');
  });
});

describe('calculateUpapadaLagna', () => {
  it('matches a published worked example: Aries Lagna, 12th lord Jupiter in Cancer -> Scorpio', () => {
    const planets = basePlanets({ Jupiter: 3 * 30 + 12 }); // Cancer
    const result = calculateUpapadaLagna(0, planets); // Ascendant = Aries (idx 0)
    expect(SIGNS[result]).toBe('Scorpio');
  });
});

describe('calculateAtmakaraka / calculateKarakamshaSignIndex', () => {
  it('picks the planet with the highest degree within its own sign', () => {
    const planets = basePlanets({
      Sun: 0 * 30 + 5,
      Moon: 1 * 30 + 10,
      Mars: 2 * 30 + 3,
      Mercury: 3 * 30 + 18,
      Jupiter: 4 * 30 + 2,
      Venus: 6 * 30 + 29.2, // highest: 29.2 degrees
      Saturn: 9 * 30 + 20,
    });
    expect(calculateAtmakaraka(planets)).toBe('Venus');
  });

  it('excludes Rahu/Ketu from Atmakaraka candidacy even if they have a higher degree', () => {
    const planets = basePlanets({
      Sun: 0 * 30 + 5,
      Rahu: 10 * 30 + 29.9, // would win if Rahu/Ketu were eligible
      Ketu: 4 * 30 + 29.9,
    });
    expect(calculateAtmakaraka(planets)).toBe('Sun');
  });

  it("returns the Atmakaraka's D9 (Navamsa) sign as Karakamsha", () => {
    const venusLongitude = 6 * 30 + 29.2;
    const planets = basePlanets({ Venus: venusLongitude });
    const atmakaraka = calculateAtmakaraka(planets);
    expect(atmakaraka).toBe('Venus');
    const karakamsha = calculateKarakamshaSignIndex(planets);
    expect(karakamsha).toBe(calculateD9(venusLongitude));
  });

  it('returns null when no classical Chara Karaka candidates are present', () => {
    expect(calculateAtmakaraka([{ planet: 'Rahu', longitude: 10 }])).toBeNull();
    expect(calculateKarakamshaSignIndex([{ planet: 'Rahu', longitude: 10 }])).toBeNull();
  });
});
