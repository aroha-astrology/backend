import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';
import { detectAllYogas } from '../../src/lib/astro-engine/yogas/index.js';

// =============================================================================
// Audit item YG3 follow-up, register PD-6.14
// =============================================================================
// Phaladeepika 6.14: "The Moon in the 12th, 8th or 6th house from Jupiter causes
// Shakata. But if the Moon be in a Kendra house from the Lagna, there is no
// Shakata." The engine kept Shakata and only lowered its strength in that case.
// Aries Lagna, house n = sign n; unplaced planets sit in house 3.
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

const shakata = (c: ChartData) => detectAllYogas(c).find((y) => y.name === 'Shakata Yoga')!.present;

describe('[YG3] Shakata and its exception', () => {
  it('the Moon 6th from Jupiter, outside the kendras: formed', () => {
    // Jupiter in house 3, Moon in house 8 (3 to 8 is the 6th).
    expect(shakata(chart({ Jupiter: 3, Moon: 8 }))).toBe(true);
  });

  it('the Moon 6th from Jupiter but in a kendra from the Lagna: no Shakata', () => {
    // Jupiter in house 5, Moon in house 10 (5 to 10 is the 6th; house 10 is a kendra).
    expect(shakata(chart({ Jupiter: 5, Moon: 10 }))).toBe(false);
  });

  it('the Moon 8th and 12th from Jupiter follow the same rule', () => {
    expect(shakata(chart({ Jupiter: 3, Moon: 10 }))).toBe(false); // 8th from 3, kendra 10
    expect(shakata(chart({ Jupiter: 3, Moon: 2 }))).toBe(true); // 12th from 3
    expect(shakata(chart({ Jupiter: 5, Moon: 4 }))).toBe(false); // 12th from 5, kendra 4
  });

  it('the Moon elsewhere from Jupiter: not formed', () => {
    expect(shakata(chart({ Jupiter: 3, Moon: 6 }))).toBe(false);
  });
});
