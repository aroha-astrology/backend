import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { calculateShadbala } from '../../src/lib/astro-engine/calculations/shadbala.js';
import type { DayContext } from '../../src/lib/astro-engine/rules/day.js';

// =============================================================================
// Audit item S5 (Yuddha Bala), register BPHS-27.20 and BPHS-79.9
// =============================================================================
// BPHS 27.20 (tr. Santhanam): "Should there be a war between the starry planets
// (Mars to Saturn), the difference between the Shadbalas of the two should be
// added to the victor's Shadbala and deducted from the Shadbala of the
// vanquished."
// BPHS 79.9: "There is planetary war if Mars, Mercury, Jupiter, Venus and
// Saturn are together (within one degree of each other). Venus is the conqueror
// whether he is in the north or south, but amongst the other four only the one
// who is in the north is the conqueror and the one in the south is defeated."
// The Sun and the Moon do not fight (27.20 names Mars to Saturn).
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

function chart(
  lon: Partial<Record<Planet, number>>,
  lat: Partial<Record<Planet, number>> = {},
): ChartData {
  const planets = ALL.map((planet, i) => {
    const longitude = (((lon[planet] ?? 150 + i * 13) % 360) + 360) % 360;
    const signIndex = Math.floor(longitude / 30);
    return {
      planet,
      house: signIndex + 1,
      signIndex,
      sign: ZODIAC_SIGNS[signIndex]!,
      signDegree: longitude - signIndex * 30,
      longitude,
      latitude: lat[planet] ?? 0,
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
    ascendant: { sign: 'Aries', signIndex: 0, degree: 0 },
    ayanamsa: 'lahiri',
    ayanamsaValue: 24,
    julianDay: 2451545,
  } as unknown as ChartData;
}

const day: DayContext = {
  isDay: true,
  fraction: 0.5,
  weekday: 0,
  hoursSinceSunrise: 6,
  hoursFromSolarNoon: 0,
  civilDate: { year: 2000, month: 1, day: 1 },
  basis: 'ephemeris',
};

const run = (c: ChartData) => {
  const out = calculateShadbala(c, day);
  return (p: Planet) => out.find((r) => r.planet === p)!;
};
const yb = (r: { yuddhaBala?: number }) => r.yuddhaBala ?? 0;
// The Shadbala before the war, read back from the result.
const before = (r: { totalVirupas: number; yuddhaBala?: number }) => r.totalVirupas - yb(r);

describe('[S5] Yuddha Bala: the difference of the two Shadbalas, to the victor from the vanquished', () => {
  it('the planet in the north wins: Jupiter at +2 over Mars at -1, 0.5 degree apart', () => {
    const r = run(chart({ Mars: 100, Jupiter: 100.5 }, { Mars: -1, Jupiter: 2 }));
    const diff = Math.abs(before(r('Jupiter')) - before(r('Mars')));
    expect(yb(r('Jupiter'))).toBeCloseTo(diff, 1);
    expect(yb(r('Mars'))).toBeCloseTo(-diff, 1);
    expect(diff).toBeGreaterThan(0);
  });

  it('Venus wins whether in the north or the south: Venus at -3 against Saturn at +1', () => {
    const r = run(chart({ Venus: 200, Saturn: 200.4 }, { Venus: -3, Saturn: 1 }));
    expect(yb(r('Venus'))).toBeGreaterThan(0);
    expect(yb(r('Saturn'))).toBeLessThan(0);
    expect(yb(r('Venus'))).toBeCloseTo(-yb(r('Saturn')), 6);
  });

  it('the war moves the total by exactly the difference', () => {
    const r = run(chart({ Mercury: 60, Saturn: 60.9 }, { Mercury: 1, Saturn: -2 }));
    expect(r('Mercury').totalVirupas).toBeCloseTo(before(r('Mercury')) + yb(r('Mercury')), 6);
    expect(Math.abs(yb(r('Mercury')))).toBeGreaterThan(0);
  });

  it('planets 1.5 degrees apart are not at war', () => {
    const r = run(chart({ Mars: 100, Jupiter: 101.5 }, { Mars: -1, Jupiter: 2 }));
    expect(yb(r('Mars'))).toBe(0);
    expect(yb(r('Jupiter'))).toBe(0);
  });

  it('the Sun and the Moon never go to war', () => {
    const r = run(
      chart({ Sun: 100, Mars: 100.3, Moon: 250, Jupiter: 250.3 }, { Mars: 1, Jupiter: 1 }),
    );
    for (const p of ['Sun', 'Moon', 'Mars', 'Jupiter'] as Planet[]) expect(yb(r(p)), p).toBe(0);
  });

  it('equal latitudes give no victor and no change', () => {
    const r = run(chart({ Mars: 100, Mercury: 100.2 }, { Mars: 1, Mercury: 1 }));
    expect(yb(r('Mars'))).toBe(0);
    expect(yb(r('Mercury'))).toBe(0);
  });

  it('isStrong follows the total after the war', () => {
    const r = run(chart({ Mars: 100, Jupiter: 100.5 }, { Mars: -1, Jupiter: 2 }));
    expect(r('Mars').isStrong).toBe(r('Mars').totalVirupas >= r('Mars').requiredVirupas);
  });
});
