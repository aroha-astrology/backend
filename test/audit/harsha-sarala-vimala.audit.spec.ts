import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';
import { detectAllYogas } from '../../src/lib/astro-engine/yogas/index.js';

// =============================================================================
// Audit item YG5 (docs/engine-audit/C-critical-corrections.md), register PD-6.57
// =============================================================================
// Phaladeepika 6.57 (Mantreswara, tr. V. Subrahmanya Sastri): "If the lords of
// the several Bhavas from the Lagna onwards occupy the 6th, 8th or 12th, ...
// 12 kinds of Yogas are declared to arise for the 12 Bhavas from the Lagna."
// The sixth is Harsha, the eighth Sarala, the twelfth Vimala (a good result in
// each case). So: Harsha = the 6th lord in the 6th, 8th or 12th; Sarala = the
// 8th lord there; Vimala = the 12th lord there. The engine asked for the lord
// to be in its OWN house (the 6th lord in the 6th, and so on).
//
// Aries Lagna: house n is sign n; lords: 6th Mercury (Virgo), 8th Mars
// (Scorpio), 12th Jupiter (Pisces). Unplaced planets sit in house 3.
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
    const house = placed[planet] ?? (planet === 'Ketu' ? 9 : 3);
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

const present = (c: ChartData, name: string) =>
  detectAllYogas(c).find((y) => y.name === name)!.present;

describe.each([
  ['Harsha Yoga', 'Mercury'],
  ['Sarala Yoga', 'Mars'],
  ['Vimala Yoga', 'Jupiter'],
])('[YG5] %s: the lord in the 6th, 8th or 12th', (name, lord) => {
  it.each([6, 8, 12])('is formed with %s in house', (house) => {
    expect(present(chart({ [lord]: house }), name)).toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 7, 9, 10, 11])('is not formed with the lord in house %s', (house) => {
    expect(present(chart({ [lord]: house }), name)).toBe(false);
  });
});

describe('[YG5] each yoga belongs to its own lord', () => {
  it('the 6th lord in a dusthana forms Harsha only', () => {
    const c = chart({ Mercury: 8 });
    expect(present(c, 'Harsha Yoga')).toBe(true);
    expect(present(c, 'Sarala Yoga')).toBe(false);
    expect(present(c, 'Vimala Yoga')).toBe(false);
  });

  it('the yoga names the lord and the house it stands in', () => {
    const y = detectAllYogas(chart({ Mars: 12 })).find((x) => x.name === 'Sarala Yoga')!;
    expect(y.planets).toEqual(['Mars']);
    expect(y.houses).toEqual([12]);
  });
});
