import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import {
  HADDA_TABLE,
  chooseVarsheshwara,
  panchavargiBala,
  tajikaAspectKala,
  tajikaDrekkanaLord,
  tajikaRelation,
  type Contender,
} from '../../src/lib/astro-engine/varshphal/tajika.js';
import { selectVarsheshwara } from '../../src/lib/astro-engine/varshphal/varsheshwara.js';

// =============================================================================
// Audit items T2 and TJ5 (Tajika Varsha lord), register TN-1.30-40 and TN-1.60-67
// =============================================================================
// Tajika Neelakanthi chapter 1 (Sanskrit with the Gudharthaprakashika Hindi commentary of
// Sitaram Jha). The Panchavargi Bala (verses 31-40) of each of the five officers (verse 64)
// chooses the lord of the year; the engine had ranked them by Shadbala and read their aspect
// on the Varsha lagna with Parashari aspects.
//
//  * Own sign 30, own exaltation 20, own hadda 15, own drekkana 10, own navamsa 5; in a
//    friend division three quarters of that, in an equal one a half, in an enemy one a
//    quarter; the sum over 4 is the vimsopaka strength (verses 39-40). Under 5 weak, 5 to 10
//    middling, over 10 strong.
//  * The exaltation strength is the arc from the planet deep debilitation point (folded
//    to 180) divided by 9 (verse 32).
//  * In the Varsha chart a planet in the 3rd, 5th, 9th or 11th from another is its friend,
//    in the 2nd, 6th, 8th or 12th its equal, in the 1st, 4th, 7th or 10th its enemy.
//  * Aspects (verses 77-78): 5th and 9th three quarters, 3rd two thirds, 11th a sixth, 4th and
//    10th a quarter, 1st and 7th full: 45, 40, 10, 15 and 60 kalas of 60.
//  * The worked example: the Sun at Pisces 12 deg 22 min 17 sec: griha 7.5, hadda 3.75,
//    drekkana 2.5, navamsa 2.5, exaltation 16 deg 55 min, sum 33 deg 10 min, strength 8 deg 17 min.
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

function chart(place: Partial<Record<Planet, number>>, ascSign = 0): ChartData {
  const planets = ALL.map((planet, i) => {
    const longitude = place[planet] ?? (15 + i * 30) % 360;
    const signIndex = Math.floor(longitude / 30);
    return {
      planet,
      signIndex,
      sign: ZODIAC_SIGNS[signIndex]!,
      signDegree: longitude - signIndex * 30,
      longitude,
      house: ((signIndex - ascSign + 12) % 12) + 1,
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
    ascendant: { sign: ZODIAC_SIGNS[ascSign], signIndex: ascSign, degree: 5 },
    ayanamsa: 'lahiri',
    ayanamsaValue: 24,
    julianDay: 2451545,
  } as unknown as ChartData;
}

describe('[T2] the book example for the Sun: Panchavargi Bala 8 deg 17 min', () => {
  // The Sun at 11 signs 12 deg 22 min 17 sec; Jupiter (lord of Pisces) in the 10th from it, so
  // an enemy; Venus (lord of the 4th navamsa) in the 2nd from it, so an equal.
  const sun = 11 * 30 + 12 + 22 / 60 + 17 / 3600;
  const c = chart({ Sun: sun, Jupiter: 8 * 30 + 10, Venus: 0 * 30 + 10 });
  const sunBala = panchavargiBala('Sun', c);

  it('griha 7.5: Pisces belongs to Jupiter, an enemy, so a quarter of 30', () => {
    expect(sunBala.griha).toBeCloseTo(7.5, 6);
  });
  it('hadda 3.75: Pisces 12-16 is the hadda of Jupiter, an enemy, so a quarter of 15', () => {
    expect(sunBala.hadda).toBeCloseTo(3.75, 6);
  });
  it('drekkana 2.5: the 2nd drekkana of Pisces is Jupiter, a quarter of 10', () => {
    expect(sunBala.drekkana).toBeCloseTo(2.5, 6);
  });
  it('navamsa 2.5: the 4th navamsa of Pisces is Libra, Venus, an equal, a half of 5', () => {
    expect(sunBala.navamsa).toBeCloseTo(2.5, 6);
  });
  it('exaltation 16 deg 55 min: the arc from Libra 10 degrees, over 9', () => {
    expect(sunBala.uchcha).toBeCloseTo(152.3714 / 9, 3);
    expect(sunBala.uchcha).toBeCloseTo(16 + 55 / 60, 1);
  });
  it('the sum is 33 deg 10 min and the strength a quarter of it, 8 deg 17 min', () => {
    expect(sunBala.total).toBeCloseTo(33 + 10 / 60, 1);
    expect(sunBala.vimsopaka).toBeCloseTo(8 + 17 / 60, 1);
  });
});

describe('[T2] the tables decoded from the verses', () => {
  it('the hadda parts of every sign add to 30 degrees', () => {
    for (const parts of HADDA_TABLE) expect(parts.reduce((s, p) => s + p.width, 0)).toBe(30);
  });

  it('Aries, Gemini, Aquarius and Pisces (the signs where Tajika differs or the book checks them)', () => {
    const fmt = (i: number) => HADDA_TABLE[i]!.map((p) => `${p.planet}${p.width}`).join(' ');
    expect(fmt(0)).toBe('Jupiter6 Venus6 Mercury8 Mars5 Saturn5');
    expect(fmt(2)).toBe('Mercury6 Venus6 Jupiter5 Mars7 Saturn6');
    expect(fmt(10)).toBe('Venus7 Mercury6 Jupiter7 Mars5 Saturn5');
    expect(fmt(11)).toBe('Venus12 Jupiter4 Mercury3 Mars9 Saturn2');
  });

  it('drekkana lords: Mars, Sun and Venus begin the three lists, each running through the planets in week order', () => {
    expect(tajikaDrekkanaLord(0, 5)).toBe('Mars'); // Aries, 1st
    expect(tajikaDrekkanaLord(0, 15)).toBe('Sun'); // Aries, 2nd
    expect(tajikaDrekkanaLord(0, 25)).toBe('Venus'); // Aries, 3rd
    expect(tajikaDrekkanaLord(11, 15)).toBe('Jupiter'); // Pisces, 2nd: the book example
    expect(tajikaDrekkanaLord(1, 5)).toBe('Mercury'); // Taurus, 1st
    expect(tajikaDrekkanaLord(1, 15)).toBe('Moon'); // Taurus, 2nd
  });

  it('friend, equal and enemy by place in the Varsha chart', () => {
    const rel = (a: number, b: number) =>
      tajikaRelation(chart({ Sun: a * 30, Moon: b * 30 }), 'Sun', 'Moon');
    expect(rel(0, 2)).toBe('friend'); // Moon 3rd from the Sun
    expect(rel(0, 4)).toBe('friend'); // 5th
    expect(rel(0, 8)).toBe('friend'); // 9th
    expect(rel(0, 10)).toBe('friend'); // 11th
    expect(rel(0, 1)).toBe('equal'); // 2nd
    expect(rel(0, 5)).toBe('equal'); // 6th
    expect(rel(0, 0)).toBe('enemy'); // 1st
    expect(rel(0, 3)).toBe('enemy'); // 4th
    expect(rel(0, 6)).toBe('enemy'); // 7th
  });
});

describe('[TJ5] Tajika aspects (verses 77-78)', () => {
  it.each([
    [1, 60],
    [7, 60],
    [5, 45],
    [9, 45],
    [3, 40],
    [11, 10],
    [4, 15],
    [10, 15],
    [2, 0],
    [6, 0],
    [8, 0],
    [12, 0],
  ])('the lagna %sth from the planet: %s kalas', (distance, kalas) => {
    expect(tajikaAspectKala(distance)).toBe(kalas);
  });
});

describe('[T2] choosing the lord of the year (verses 64-67)', () => {
  const c = (
    role: Contender['role'],
    planet: Planet,
    strength: number,
    aspect: number,
  ): Contender => ({
    role,
    planet,
    strength,
    aspectKala: aspect,
  });

  it('the strongest of those that look at the lagna', () => {
    const r = chooseVarsheshwara([
      c('Janma Lagnesha', 'Mars', 9, 60),
      c('Varsha Lagnesha', 'Venus', 12, 45),
      c('Munthesh', 'Saturn', 7, 0),
      c('Dina-Ratri Pati', 'Sun', 15, 0),
      c('Tri-Rashi Pati', 'Moon', 8, 10),
    ]);
    expect(r.planet).toBe('Venus'); // 15 for the Sun is stronger but does not look at the lagna
  });

  it('equal strength: the one that looks harder at the lagna', () => {
    const r = chooseVarsheshwara([
      c('Janma Lagnesha', 'Mars', 11, 45),
      c('Varsha Lagnesha', 'Venus', 11, 60),
      c('Munthesh', 'Saturn', 3, 0),
      c('Dina-Ratri Pati', 'Sun', 4, 0),
      c('Tri-Rashi Pati', 'Moon', 4, 0),
    ]);
    expect(r.planet).toBe('Venus');
  });

  it('equal in strength and in aspect: the Muntha lord', () => {
    const r = chooseVarsheshwara([
      c('Janma Lagnesha', 'Mars', 11, 60),
      c('Varsha Lagnesha', 'Venus', 11, 60),
      c('Munthesh', 'Saturn', 3, 0),
      c('Dina-Ratri Pati', 'Sun', 4, 0),
      c('Tri-Rashi Pati', 'Moon', 4, 0),
    ]);
    expect(r.planet).toBe('Saturn');
    expect(r.wonByMunthaTiebreak).toBe(true);
  });

  it('all five weak (under 5): the Muntha lord', () => {
    const r = chooseVarsheshwara([
      c('Janma Lagnesha', 'Mars', 4, 60),
      c('Varsha Lagnesha', 'Venus', 3, 45),
      c('Munthesh', 'Saturn', 2, 0),
      c('Dina-Ratri Pati', 'Sun', 4.9, 15),
      c('Tri-Rashi Pati', 'Moon', 1, 0),
    ]);
    expect(r.planet).toBe('Saturn');
  });

  it('none looks at the lagna: the strongest', () => {
    const r = chooseVarsheshwara([
      c('Janma Lagnesha', 'Mars', 6, 0),
      c('Varsha Lagnesha', 'Venus', 9, 0),
      c('Munthesh', 'Saturn', 7, 0),
      c('Dina-Ratri Pati', 'Sun', 5, 0),
      c('Tri-Rashi Pati', 'Moon', 8, 0),
    ]);
    expect(r.planet).toBe('Venus');
  });

  it('none looks at the lagna and the strongest are equal: the lord of the Sun sign by day, the Moon sign by night', () => {
    const r = chooseVarsheshwara([
      c('Janma Lagnesha', 'Mars', 9, 0),
      c('Varsha Lagnesha', 'Venus', 9, 0),
      c('Munthesh', 'Saturn', 7, 0),
      c('Dina-Ratri Pati', 'Sun', 9, 0),
      c('Tri-Rashi Pati', 'Moon', 2, 0),
    ]);
    expect(r.planet).toBe('Sun');
  });
});

describe('[T2] the selector uses all of it', () => {
  it('returns the five officers, each with a Panchavargi strength and an aspect flag', () => {
    const c0 = chart({
      Sun: 100,
      Moon: 220,
      Mars: 10,
      Mercury: 90,
      Jupiter: 250,
      Venus: 60,
      Saturn: 300,
    });
    const r = selectVarsheshwara(0, 3, c0, true);
    expect(r.candidates).toHaveLength(5);
    for (const cand of r.candidates) {
      expect(cand.strength).toBeGreaterThanOrEqual(0);
      expect(cand.strength).toBeLessThanOrEqual(20);
      expect(typeof cand.aspectsVarshaAscendant).toBe('boolean');
    }
  });
});
