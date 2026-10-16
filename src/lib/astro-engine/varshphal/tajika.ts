// =============================================================================
// Tajika Neelakanthi, chapter 1: the strength and the choice of the lord of the year
// =============================================================================
// Source: Tajika Neelakanthi, chapter 1, Sanskrit with the Gudharthaprakashika Hindi
// commentary of Sitaram Jha (register TN-1.30-40, TN-1.60-67, TN-1.77-78; audit items
// T2 and TJ5). Verse numbers are those of that edition.
//
//  30      the sign lords and the three drekkana lists
//  31-32   the exaltation points; the strength is the arc from the deep debilitation
//          point, folded to 180 degrees, over 9
//  33-38   the hadda (term) lords of each sign
//  39-40   the Panchavargi Bala: own sign 30, exaltation 20, hadda 15, drekkana 10, navamsa 5;
//          three quarters of that in a friend's division, a half in an equal's, a quarter in an
//          enemy's; a quarter of the sum is the strength out of 20 (under 5 weak, over 10 strong)
//  41      friendship in the Varsha chart: 3rd, 5th, 9th, 11th friend; 2nd, 6th, 8th, 12th
//          equal; 1st, 4th, 7th, 10th enemy
//  60      the Tri-Rashi lords (kept in varsheshwara.ts)
//  64-67   who is the lord of the year
//  77-78   the aspects: 5th and 9th three quarters, 3rd two thirds, 11th a sixth, 4th and
//          10th a quarter, 1st and 7th full
// =============================================================================

import type { ChartData, Planet } from '@aroha-astrology/shared';
import { PLANET_DEBILITATION, SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';

import { calculateD9 } from '../charts/divisionalCharts.js';

type Seven = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn';

/** Verse 33-38: the hadda lords of each sign, Aries first, each with its width in degrees. */
export const HADDA_TABLE: ReadonlyArray<ReadonlyArray<{ planet: Seven; width: number }>> = [
  // Aries
  [
    { planet: 'Jupiter', width: 6 },
    { planet: 'Venus', width: 6 },
    { planet: 'Mercury', width: 8 },
    { planet: 'Mars', width: 5 },
    { planet: 'Saturn', width: 5 },
  ],
  // Taurus
  [
    { planet: 'Venus', width: 8 },
    { planet: 'Mercury', width: 6 },
    { planet: 'Jupiter', width: 8 },
    { planet: 'Saturn', width: 5 },
    { planet: 'Mars', width: 3 },
  ],
  // Gemini
  [
    { planet: 'Mercury', width: 6 },
    { planet: 'Venus', width: 6 },
    { planet: 'Jupiter', width: 5 },
    { planet: 'Mars', width: 7 },
    { planet: 'Saturn', width: 6 },
  ],
  // Cancer
  [
    { planet: 'Mars', width: 7 },
    { planet: 'Venus', width: 6 },
    { planet: 'Mercury', width: 6 },
    { planet: 'Jupiter', width: 7 },
    { planet: 'Saturn', width: 4 },
  ],
  // Leo
  [
    { planet: 'Jupiter', width: 6 },
    { planet: 'Venus', width: 5 },
    { planet: 'Saturn', width: 7 },
    { planet: 'Mercury', width: 6 },
    { planet: 'Mars', width: 6 },
  ],
  // Virgo
  [
    { planet: 'Mercury', width: 7 },
    { planet: 'Venus', width: 10 },
    { planet: 'Jupiter', width: 4 },
    { planet: 'Mars', width: 7 },
    { planet: 'Saturn', width: 2 },
  ],
  // Libra
  [
    { planet: 'Saturn', width: 6 },
    { planet: 'Mercury', width: 8 },
    { planet: 'Jupiter', width: 7 },
    { planet: 'Venus', width: 7 },
    { planet: 'Mars', width: 2 },
  ],
  // Scorpio
  [
    { planet: 'Mars', width: 7 },
    { planet: 'Venus', width: 4 },
    { planet: 'Mercury', width: 8 },
    { planet: 'Jupiter', width: 5 },
    { planet: 'Saturn', width: 6 },
  ],
  // Sagittarius
  [
    { planet: 'Jupiter', width: 12 },
    { planet: 'Venus', width: 5 },
    { planet: 'Mercury', width: 4 },
    { planet: 'Mars', width: 5 },
    { planet: 'Saturn', width: 4 },
  ],
  // Capricorn
  [
    { planet: 'Mercury', width: 7 },
    { planet: 'Jupiter', width: 7 },
    { planet: 'Venus', width: 8 },
    { planet: 'Saturn', width: 4 },
    { planet: 'Mars', width: 4 },
  ],
  // Aquarius
  [
    { planet: 'Venus', width: 7 },
    { planet: 'Mercury', width: 6 },
    { planet: 'Jupiter', width: 7 },
    { planet: 'Mars', width: 5 },
    { planet: 'Saturn', width: 5 },
  ],
  // Pisces
  [
    { planet: 'Venus', width: 12 },
    { planet: 'Jupiter', width: 4 },
    { planet: 'Mercury', width: 3 },
    { planet: 'Mars', width: 9 },
    { planet: 'Saturn', width: 2 },
  ],
];

/** The planets in week order, which the drekkana lists of verse 30 run through. */
const WEEK_ORDER: Seven[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

/**
 * Verse 30: the lord of the drekkana a longitude falls in, for the Panchavargi Bala. The
 * first drekkanas of Aries to Pisces run through the planets in week order from Mars, the
 * second from the Sun, the third from Venus (the book's example puts the Sun, in the second
 * drekkana of Pisces, with Jupiter).
 */
export function tajikaDrekkanaLord(signIndex: number, degreeInSign: number): Seven {
  const part = Math.min(2, Math.floor(degreeInSign / 10));
  const start = ['Mars', 'Sun', 'Venus'][part] as Seven;
  return WEEK_ORDER[(WEEK_ORDER.indexOf(start) + signIndex) % 7]!;
}

function haddaLord(signIndex: number, degreeInSign: number): Seven {
  let edge = 0;
  for (const part of HADDA_TABLE[signIndex]!) {
    edge += part.width;
    if (degreeInSign < edge) return part.planet;
  }
  return HADDA_TABLE[signIndex]![HADDA_TABLE[signIndex]!.length - 1]!.planet;
}

export type TajikaRelation = 'friend' | 'equal' | 'enemy';

/**
 * Friendship of `other` towards `planet` in the Varsha chart (verse 41): counted from `planet`,
 * `other` in the 3rd, 5th, 9th or 11th place is a friend, the 2nd, 6th, 8th or 12th an equal,
 * the 1st, 4th, 7th or 10th an enemy.
 */
export function tajikaRelation(chart: ChartData, planet: Planet, other: Planet): TajikaRelation {
  const a = chart.planets.find((p) => p.planet === planet);
  const b = chart.planets.find((p) => p.planet === other);
  if (!a || !b) return 'equal';
  const place = ((b.signIndex - a.signIndex + 12) % 12) + 1;
  if ([3, 5, 9, 11].includes(place)) return 'friend';
  if ([2, 6, 8, 12].includes(place)) return 'equal';
  return 'enemy';
}

const FRACTION: Record<TajikaRelation, number> = { friend: 0.75, equal: 0.5, enemy: 0.25 };

export interface PanchavargiBala {
  griha: number;
  hadda: number;
  drekkana: number;
  navamsa: number;
  uchcha: number;
  total: number;
  /** A quarter of the total: the strength out of 20 (verse 40). */
  vimsopaka: number;
}

/** Verse 39-40: the strength a planet has in a division whose lord is `lord`. */
function divisionBala(chart: ChartData, planet: Seven, lord: Planet, fullAmount: number): number {
  if (lord === planet) return fullAmount;
  return fullAmount * FRACTION[tajikaRelation(chart, planet, lord)];
}

/** Verse 31-32: the arc from the deep debilitation point, folded to 180 degrees, over 9. */
function uchchaBala(planet: Seven, longitude: number): number {
  const debil = PLANET_DEBILITATION[planet];
  if (!debil) return 0;
  const point = ZODIAC_SIGNS.indexOf(debil.sign) * 30 + debil.degree;
  let arc = (((longitude - point) % 360) + 360) % 360;
  if (arc > 180) arc = 360 - arc;
  return arc / 9;
}

/** The Panchavargi Bala of one of the seven planets in the Varsha chart (Tajika Neelakanthi 1.39-40). */
export function panchavargiBala(planet: Planet, chart: ChartData): PanchavargiBala {
  const pos = chart.planets.find((p) => p.planet === planet);
  const seven = planet as Seven;
  if (!pos || !WEEK_ORDER.includes(seven)) {
    return { griha: 0, hadda: 0, drekkana: 0, navamsa: 0, uchcha: 0, total: 0, vimsopaka: 0 };
  }
  const longitude = ((pos.longitude % 360) + 360) % 360;
  const signIndex = Math.floor(longitude / 30);
  const degree = longitude - signIndex * 30;

  const griha = divisionBala(chart, seven, SIGN_LORDS[ZODIAC_SIGNS[signIndex]!], 30);
  const hadda = divisionBala(chart, seven, haddaLord(signIndex, degree), 15);
  const drekkana = divisionBala(chart, seven, tajikaDrekkanaLord(signIndex, degree), 10);
  const navamsaSign = calculateD9(longitude);
  const navamsa = divisionBala(chart, seven, SIGN_LORDS[ZODIAC_SIGNS[navamsaSign]!], 5);
  const uchcha = uchchaBala(seven, longitude);

  const total = griha + hadda + drekkana + navamsa + uchcha;
  return { griha, hadda, drekkana, navamsa, uchcha, total, vimsopaka: total / 4 };
}

/**
 * Verses 77-78: how hard a planet looks at a house, in kalas out of 60, by the place of that
 * house counted from the planet. The 1st (the same sign) and 7th are full, the 5th and 9th
 * three quarters, the 3rd two thirds, the 11th a sixth, the 4th and 10th a quarter; the 2nd,
 * 6th, 8th and 12th not at all.
 */
export function tajikaAspectKala(placeFromPlanet: number): number {
  switch (placeFromPlanet) {
    case 1:
    case 7:
      return 60;
    case 5:
    case 9:
      return 45;
    case 3:
      return 40;
    case 4:
    case 10:
      return 15;
    case 11:
      return 10;
    default:
      return 0;
  }
}

/** One of the five officers of the year, with the two numbers the choice reads. */
export interface Contender {
  role: 'Janma Lagnesha' | 'Munthesh' | 'Varsha Lagnesha' | 'Dina-Ratri Pati' | 'Tri-Rashi Pati';
  planet: Planet;
  /** The Panchavargi strength out of 20. */
  strength: number;
  /** How hard it looks at the Varsha lagna, in kalas (0 = not at all). */
  aspectKala: number;
}

const WEAK_BELOW = 5;

/**
 * Verses 64-67: the lord of the year among the five officers.
 *  - Of those that look at the Varsha lagna, the strongest; if equal, the one that looks harder;
 *    if equal again, or if all five are weak (under 5), the Muntha lord.
 *  - If none looks at the lagna, the strongest of the five; if equal, the lord of the Sun's
 *    sign by day or of the Moon's sign by night (the first of the two views the verse reports;
 *    the author's own, the one the Moon has an ithasala with, is not built).
 */
export function chooseVarsheshwara(contenders: Contender[]): {
  planet: Planet;
  wonByMunthaTiebreak: boolean;
} {
  const munthesh = contenders.find((c) => c.role === 'Munthesh')!;
  const dinaRatri = contenders.find((c) => c.role === 'Dina-Ratri Pati')!;
  const byMuntha = { planet: munthesh.planet, wonByMunthaTiebreak: true };

  if (contenders.every((c) => c.strength < WEAK_BELOW)) return byMuntha;

  const looking = contenders.filter((c) => c.aspectKala > 0);
  if (looking.length > 0) {
    const top = Math.max(...looking.map((c) => c.strength));
    const strongest = looking.filter((c) => c.strength === top);
    if (strongest.length === 1) return { planet: strongest[0]!.planet, wonByMunthaTiebreak: false };
    const harder = Math.max(...strongest.map((c) => c.aspectKala));
    const winners = strongest.filter((c) => c.aspectKala === harder);
    if (winners.length === 1) return { planet: winners[0]!.planet, wonByMunthaTiebreak: false };
    return byMuntha;
  }

  const top = Math.max(...contenders.map((c) => c.strength));
  const strongest = contenders.filter((c) => c.strength === top);
  if (strongest.length === 1) return { planet: strongest[0]!.planet, wonByMunthaTiebreak: false };
  return { planet: dinaRatri.planet, wonByMunthaTiebreak: false };
}
