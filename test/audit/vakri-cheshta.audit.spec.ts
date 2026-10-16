import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { analyzeVakriPlanet } from '../../src/lib/astro-engine/calculations/vakri.js';
import { calculateShadbala } from '../../src/lib/astro-engine/calculations/shadbala.js';

// =============================================================================
// Audit item VK2, register BPHS-27.21-25
// =============================================================================
// BPHS 27.24-25: a planet's motional strength (Cheshta Bala, Mars to Saturn) is the
// Cheshta Kendra, from the mean and true longitudes and the Seeghrocha, folded and
// divided by 3. The eight motions of 27.21-23 (vakra 60, anuvakra 30, vikala 15,
// manda 30, mandatara 15, sama 7.5, chara 45, atichara 30) are a classification the
// verse lists; the number is the Cheshta Kendra one. Shadbala already computes it.
// `vakri.ts` had a second Cheshta Bala (60 for any retrograde planet, 15 to 45 by
// speed ratio otherwise, 30 for the Sun and Moon) that disagreed with it.
// The Vakri analysis now reports the Shadbala figure.
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

function chart(lon: Partial<Record<Planet, number>>, retro: Planet[]): ChartData {
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
      latitude: 0,
      speed: retro.includes(planet) ? -0.3 : 1,
      isRetrograde: retro.includes(planet),
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

describe('[VK2] the Vakri analysis reports the Shadbala Cheshta Bala', () => {
  it.each(['Mars', 'Jupiter', 'Saturn'] as Planet[])(
    '%s: the same figure as Shadbala',
    (planet) => {
      const c = chart({ Sun: 40, [planet]: 100 }, [planet]);
      const pos = c.planets.find((p) => p.planet === planet)!;
      const vakri = analyzeVakriPlanet(pos, c)!;
      const shadbala = calculateShadbala(c, null).find((r) => r.planet === planet)!;
      expect(vakri.cheshtaBala.score).toBeCloseTo(shadbala.cheshtaBala, 1);
    },
  );

  it('is no longer a flat 60 for every retrograde planet', () => {
    const scores = (['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'] as Planet[]).map((planet) => {
      const c = chart({ Sun: 40, [planet]: 250 }, [planet]);
      return analyzeVakriPlanet(c.planets.find((p) => p.planet === planet)!, c)!.cheshtaBala.score;
    });
    expect(new Set(scores).size).toBeGreaterThan(1);
  });

  it('says where the figure comes from', () => {
    const c = chart({ Sun: 40, Mars: 100 }, ['Mars']);
    const vakri = analyzeVakriPlanet(c.planets.find((p) => p.planet === 'Mars')!, c)!;
    expect(vakri.cheshtaBala.description).toMatch(/Cheshta Kendra/);
  });
});
