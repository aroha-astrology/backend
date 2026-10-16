import { describe, it, expect } from 'vitest';
import type { ChartData, Planet, ZodiacSign } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';
import { calculateCharaDasha } from '../../src/lib/astro-engine/dashas/chara.js';

// =============================================================================
// Audit items D3 and JM1 (Chara Dasha), register JS-ABH-67-70 and JS-ABH-53
// =============================================================================
// K. V. Abhyankar, Jaimini Upadesa Sutras (Introduction, paras 52-53 and 67-70):
//  * "The planets Rahu and Ketu ... As they move backwards in the heavenly vault, they
//    become the rulers when their degrees in a Rasi are less than those of others."
//    Rahu and Ketu share Scorpio with Mars and Aquarius with Saturn.
//  * "For purposes of Dasas or life-periods, the years in their charge are determined by
//    calculating backwards from the sign they occupy to the sign which they rule."
//  * "the years of the dasas are to be counted in the regular order of succession from the
//    Rasi to the ruling planet ... in the case of Visama (odd) signs, while they are to be
//    taken in the reverse order in case the sign is Sama (even)."
// The engine chose the node when its degree was HIGHER, and counted a node's years by the
// odd/even rule of the sign.
// =============================================================================

const ALL: Planet[] = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
];
const MS_PER_YEAR = 365.25 * 86_400_000;

/** place[planet] = [signIndex, degree within the sign]; others sit in Aries at 15 degrees. */
function chart(asc: number, place: Partial<Record<Planet, [number, number]>>): ChartData {
  const planets = ALL.map((planet) => {
    const [signIndex, signDegree] = place[planet] ?? [0, 15];
    return {
      planet,
      signIndex,
      sign: ZODIAC_SIGNS[signIndex]!,
      signDegree,
      longitude: signIndex * 30 + signDegree,
      house: ((signIndex - asc + 12) % 12) + 1,
      latitude: 0,
      speed: 1,
      isRetrograde: false,
    };
  });
  const houses = ZODIAC_SIGNS.map((sign, i) => ({
    house: i + 1,
    sign,
    signIndex: i,
    cusp: i * 30,
    lord: SIGN_LORDS[sign],
    planets: [],
  }));
  return {
    planets,
    houses,
    ascendant: { sign: ZODIAC_SIGNS[asc], signIndex: asc, degree: 5 },
    ayanamsa: 'lahiri',
    ayanamsaValue: 24,
    julianDay: 2451545,
  } as unknown as ChartData;
}

const periods = (asc: number, c: ChartData) =>
  calculateCharaDasha(ZODIAC_SIGNS[asc] as ZodiacSign, c).signs.map((s) => ({
    sign: s.sign,
    years: (s.endDate.getTime() - s.startDate.getTime()) / MS_PER_YEAR,
  }));

const SCORPIO = 7;
const AQUARIUS = 10;
const GEMINI = 2;
const LEO = 4;
const TAURUS = 1;

describe('[JM1] Rahu and Ketu rule Scorpio and Aquarius when their degree is the lesser', () => {
  it("Scorpio: Ketu at 5 degrees against Mars at 20 -> Ketu rules; years counted backwards from Ketu's sign (Gemini) to Scorpio = 7", () => {
    const c = chart(SCORPIO, { Ketu: [GEMINI, 5], Mars: [LEO, 20] });
    expect(periods(SCORPIO, c)[0]).toMatchObject({ sign: 'Scorpio' });
    expect(periods(SCORPIO, c)[0]!.years).toBeCloseTo(7, 6);
  });

  it('Scorpio: Ketu at 25 degrees against Mars at 10 -> Mars rules; an even sign counts back from Scorpio to Mars (Leo) = 3', () => {
    const c = chart(SCORPIO, { Ketu: [GEMINI, 25], Mars: [LEO, 10] });
    expect(periods(SCORPIO, c)[0]!.years).toBeCloseTo(3, 6);
  });

  it('Aquarius: Rahu at 25 degrees against Saturn at 5 -> Saturn rules; an odd sign counts ahead from Aquarius to Saturn (Leo) = 6', () => {
    const c = chart(AQUARIUS, { Rahu: [TAURUS, 25], Saturn: [LEO, 5] });
    expect(periods(AQUARIUS, c)[0]).toMatchObject({ sign: 'Aquarius' });
    expect(periods(AQUARIUS, c)[0]!.years).toBeCloseTo(6, 6);
  });

  it("Aquarius: Rahu at 2 degrees against Saturn at 20 -> Rahu rules; counted backwards from Rahu's sign (Taurus) to Aquarius = 3", () => {
    const c = chart(AQUARIUS, { Rahu: [TAURUS, 2], Saturn: [LEO, 20] });
    expect(periods(AQUARIUS, c)[0]!.years).toBeCloseTo(3, 6);
  });
});

describe('[JM1] the years of an ordinary sign are unchanged', () => {
  it('Aries (odd): Mars in Leo -> counted ahead = 4 years', () => {
    const c = chart(0, { Mars: [LEO, 15] });
    expect(periods(0, c)[0]).toMatchObject({ sign: 'Aries' });
    expect(periods(0, c)[0]!.years).toBeCloseTo(4, 6);
  });

  it('a lord in its own sign gives 12 years', () => {
    const c = chart(0, { Mars: [0, 15] });
    expect(periods(0, c)[0]!.years).toBeCloseTo(12, 6);
  });
});
