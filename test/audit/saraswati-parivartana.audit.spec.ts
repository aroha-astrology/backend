import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';
import { detectAllYogas } from '../../src/lib/astro-engine/yogas/index.js';

// =============================================================================
// Audit item YG6 (Saraswati, Parivartana), register PD-6.26-27 and PD-6.32-33
// =============================================================================
// Phaladeepika 6.26: "If Venus, Jupiter and Mercury occupy a Kendra, a Trikona or
// the second house, and Jupiter be also in his exaltation, his own or a friendly
// house and possess strength, the resulting Yoga is termed Saraswati." The engine
// accepted only an exalted or own sign for Jupiter. ("Possess strength" has no
// number and is not applied.)
//
// Phaladeepika 6.32: when the lords of two houses exchange places it is Parivartana,
// 66 pairs in all. Thirty are caused by the lords of the 6th, 8th and 12th: Dainya.
// Eight are caused by the lord of the 3rd (the others from the 6th, 8th, 12th
// being counted already): Khala. The remaining 28, among the houses 1, 2, 4, 5, 7,
// 9, 10, 11: Maha. Results (6.33): Dainya, a fool, reviled, tormented; Khala,
// sometimes prosperity and sometimes distress; Maha, wealth, honour and power.
//
// Aries Lagna: house n = sign n. Lords: 1 Mars, 2 Venus, 3 Mercury, 4 Moon, 5 Sun,
// 6 Mercury, 7 Venus, 8 Mars, 9 Jupiter, 10 Saturn, 11 Saturn, 12 Jupiter.
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

function chart(placed: Partial<Record<Planet, number>>): ChartData {
  const planets = ALL.map((planet, i) => {
    const house = placed[planet] ?? 3;
    const signIndex = house - 1;
    return {
      planet,
      house,
      signIndex,
      sign: ZODIAC_SIGNS[signIndex]!,
      signDegree: 14 + i,
      longitude: signIndex * 30 + 14 + i,
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
    planets: planets.filter((p) => p.house === i + 1).map((p) => p.planet),
  }));
  return {
    planets,
    houses,
    ascendant: { sign: 'Aries', signIndex: 0, degree: 10 },
    ayanamsa: 'lahiri',
    ayanamsaValue: 24,
    julianDay: 2451545,
  } as unknown as ChartData;
}

const saraswati = (c: ChartData) =>
  detectAllYogas(c).find((y) => y.name === 'Saraswati Yoga')!.present;
const parivartana = (c: ChartData, a: number, b: number) =>
  detectAllYogas(c).find((y) => y.name === `Parivartana Yoga (${a}-${b})`);

describe('[YG6] Saraswati: Jupiter in an exalted, own or friendly sign', () => {
  it('Jupiter in Leo (a friend, the Sun) in the 5th, Venus in the 2nd, Mercury in the 1st: formed', () => {
    expect(saraswati(chart({ Jupiter: 5, Venus: 2, Mercury: 1 }))).toBe(true);
  });

  it('Jupiter exalted in the 4th, Venus in the 10th, Mercury in the 9th: formed', () => {
    expect(saraswati(chart({ Jupiter: 4, Venus: 10, Mercury: 9 }))).toBe(true);
  });

  it("Jupiter in Libra (Venus's sign, an enemy) is not enough", () => {
    expect(saraswati(chart({ Jupiter: 7, Venus: 2, Mercury: 1 }))).toBe(false);
  });

  it('a planet outside the 1st, 2nd, 4th, 5th, 7th, 9th, 10th stops it', () => {
    expect(saraswati(chart({ Jupiter: 5, Venus: 2, Mercury: 6 }))).toBe(false);
  });
});

describe('[YG6] Parivartana: Dainya, Khala and Maha by the houses involved', () => {
  it('Maha: the lords of the 2nd and the 11th exchange (both outside 3, 6, 8, 12)', () => {
    // Venus (2nd lord) in house 11, Saturn (11th lord) in house 2.
    const y = parivartana(chart({ Venus: 11, Saturn: 2 }), 2, 11)!;
    expect(y.present).toBe(true);
    expect(y.type).toBe('raja');
    expect(y.description).toMatch(/Maha/);
  });

  it('Dainya: the lords of the 6th and the 8th exchange, with no gain claimed', () => {
    // Mercury (6th lord) in house 8, Mars (8th lord) in house 6.
    const y = parivartana(chart({ Mercury: 8, Mars: 6 }), 6, 8)!;
    expect(y.type).toBe('dosha');
    expect(y.description).toMatch(/Dainya/);
    expect(y.description).not.toMatch(/gains/i);
  });

  it('Dainya: any exchange with the 12th lord, even with the 1st', () => {
    const y = parivartana(chart({ Mars: 12, Jupiter: 1 }), 1, 12)!;
    expect(y.type).toBe('dosha');
    expect(y.description).toMatch(/Dainya/);
  });

  it('Dainya, not Khala: the 3rd lord with the 8th lord (the 8th is counted first)', () => {
    // Mercury (3rd lord) in house 8, Mars (8th lord) in house 3.
    const y = parivartana(chart({ Mercury: 8, Mars: 3 }), 3, 8)!;
    expect(y.description).toMatch(/Dainya/);
  });

  it('Khala: the lords of the 3rd and the 4th exchange', () => {
    // Mercury (3rd lord) in house 4, Moon (4th lord) in house 3.
    const y = parivartana(chart({ Mercury: 4, Moon: 3 }), 3, 4)!;
    expect(y.description).toMatch(/Khala/);
    expect(y.description).toMatch(/mixed|sometimes/i);
  });

  it('Maha: the 4th and the 9th (both outside 3, 6, 8, 12)', () => {
    const y = parivartana(chart({ Moon: 9, Jupiter: 4 }), 4, 9)!;
    expect(y.type).toBe('raja');
  });
});
