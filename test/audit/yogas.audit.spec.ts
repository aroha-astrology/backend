import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';
import { detectAllYogas } from '../../src/lib/astro-engine/yogas/index.js';

// =============================================================================
// Audit items YG1-YG3 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// Charts are built by hand with an Aries Lagna, so house n is sign n and the
// lords are: 1 Mars, 2 Venus, 3 Mercury, 4 Moon, 5 Sun, 6 Mercury, 7 Venus,
// 8 Mars, 9 Jupiter, 10 Saturn, 11 Saturn, 12 Jupiter. The expected results
// come from the yoga definitions the file itself states, worked by counting
// houses, never from running the engine.
// =============================================================================

/** Every planet parked in house 3 unless placed, mid-sign so nothing is exalted by degree. */
function ariesChart(placed: Partial<Record<Planet, number>>): ChartData {
  const all: Planet[] = [
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
  const houseOf = (p: Planet) => placed[p] ?? (p === 'Ketu' ? 9 : 3);
  const planets = all.map((planet, i) => {
    const house = houseOf(planet);
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

function yoga(chart: ChartData, name: string) {
  const found = detectAllYogas(chart).find((y) => y.name === name);
  if (!found) throw new Error(`yoga "${name}" not returned`);
  return found;
}

describe('[YG1] an aspect falls on the 7th house, not the 8th', () => {
  it('9th lord in the 1st and 10th lord in the 7th aspect each other: Dharma-Karmadhipati', () => {
    // Jupiter (9th lord) in house 1, Saturn (10th lord) in house 7: each is 7th from the other.
    const chart = ariesChart({ Jupiter: 1, Saturn: 7 });
    expect(yoga(chart, 'Dharma-Karmadhipati Yoga').present).toBe(true);
  });

  it('9th lord in the 1st and 10th lord in the 8th do not aspect each other', () => {
    // Saturn in house 8 is the 8th from Jupiter; Jupiter's aspects are the 5th, 7th and 9th.
    // From Saturn, house 1 is the 6th; Saturn's aspects are the 3rd, 7th and 10th.
    const chart = ariesChart({ Jupiter: 1, Saturn: 8 });
    expect(yoga(chart, 'Dharma-Karmadhipati Yoga').present).toBe(false);
  });
});

describe('[YG2] mutual kendra means the 1st, 4th, 7th or 10th from each other', () => {
  it('4th lord and 9th lord a 4th apart form Kahala Yoga', () => {
    // Moon (4th lord) in house 2, Jupiter (9th lord) in house 5: the 4th from the Moon.
    const chart = ariesChart({ Moon: 2, Jupiter: 5 });
    expect(yoga(chart, 'Kahala Yoga').present).toBe(true);
  });

  it('4th lord and 9th lord a 2nd apart do not', () => {
    const chart = ariesChart({ Moon: 2, Jupiter: 3 });
    expect(yoga(chart, 'Kahala Yoga').present).toBe(false);
  });
});

describe('[YG3] Shakata is the Moon in the 6th, 8th or 12th from Jupiter', () => {
  it('Moon in the 7th from Jupiter is Gajakesari, not Shakata', () => {
    const chart = ariesChart({ Jupiter: 1, Moon: 7 });
    expect(yoga(chart, 'Gajakesari Yoga').present).toBe(true);
    expect(yoga(chart, 'Shakata Yoga').present).toBe(false);
  });

  it('Moon in the 6th from Jupiter is Shakata, not Gajakesari', () => {
    const chart = ariesChart({ Jupiter: 1, Moon: 6 });
    expect(yoga(chart, 'Shakata Yoga').present).toBe(true);
    expect(yoga(chart, 'Gajakesari Yoga').present).toBe(false);
  });

  it('Moon conjunct Jupiter is Gajakesari (the 1st is a kendra), not Shakata', () => {
    const chart = ariesChart({ Jupiter: 4, Moon: 4 });
    expect(yoga(chart, 'Gajakesari Yoga').present).toBe(true);
    expect(yoga(chart, 'Shakata Yoga').present).toBe(false);
  });

  it('Sun and Saturn in the 6th/8th from each other, not opposite', () => {
    expect(yoga(ariesChart({ Sun: 1, Saturn: 6 }), 'Sun-Saturn Shadashtak').present).toBe(true);
    expect(yoga(ariesChart({ Sun: 1, Saturn: 7 }), 'Sun-Saturn Shadashtak').present).toBe(false);
  });
});
