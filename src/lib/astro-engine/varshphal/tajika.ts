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
import { PLANET_DEBILITATION, PLANET_EXALTATION, SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';

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
  // Mehta ch. V ("Navamsa bala"): a planet in exaltation or its own sign scores the full 5; his Nehru
  // table gives the Moon, whose navamsa falls in Taurus, 5. (Owner decision 2026-11-08.)
  const exaltedInNavamsa = (PLANET_EXALTATION as Record<string, { sign: string } | undefined>)[planet]?.sign === ZODIAC_SIGNS[navamsaSign];
  const navamsa = exaltedInNavamsa ? 5 : divisionBala(chart, seven, SIGN_LORDS[ZODIAC_SIGNS[navamsaSign]!], 5);
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

/** What the choice needs to know about the Varsha chart beyond the five officers. */
export interface VarsheshwaraContext {
  /** Sign index of the Varsha Lagna, and of the Moon in the Varsha chart. */
  ascSign: number;
  moonSign: number;
  isDay: boolean;
  /** The planet in Ithasala with the Moon, if any (used only when the Moon alone looks at the Lagna). */
  moonIthasalaPartner: Planet | null;
  /** The lord of the sign the Moon is in. */
  moonSignLord: Planet;
}

/**
 * The lord of the year among the five officers (M.S. Mehta, Annual Horoscope (Varshaphala), ch. VII;
 * the first five clauses were adopted by the owner on 2026-11-08 after the C2 evidence, see
 * test/fixtures/jhora/README.md).
 *  1. Of the planets that look at the Varsha Lagna, the strongest by Panchavargiya bala. A planet that
 *     holds more than one of the five roles is ONE planet, and wins a tie of strength by holding more
 *     roles ("the greater number of portfolios"); a tie that remains goes to the one that looks harder,
 *     then to the Muntha lord.
 *  2. If none looks at the Lagna, the Muntha lord.
 *  3. The Moon is passed over, except when the Varsha Lagna is Cancer with the Moon in it, or the
 *     return is by night, the Moon is the Tri-Rashi lord and it looks at the Lagna, and in both cases it
 *     is the strongest of the five.
 *  4. If the Moon is the only one that looks, the planet in Ithasala with the Moon, else the lord of the
 *     Moon's sign.
 * (Mehta's own V.P. Singh 1989 example has the Moon as lord of the year; the book is not consistent.)
 */
export function chooseVarsheshwara(
  contenders: Contender[],
  ctx: VarsheshwaraContext,
): { planet: Planet; wonByMunthaTiebreak: boolean } {
  const munthesh = contenders.find((c) => c.role === 'Munthesh')!;
  const byMuntha = { planet: munthesh.planet, wonByMunthaTiebreak: true };

  // One entry per planet: its best strength and aspect, and how many roles it holds.
  const planets = new Map<Planet, { strength: number; aspectKala: number; roles: number; triRashi: boolean }>();
  for (const c of contenders) {
    const cur = planets.get(c.planet);
    planets.set(c.planet, {
      strength: Math.max(cur?.strength ?? 0, c.strength),
      aspectKala: Math.max(cur?.aspectKala ?? 0, c.aspectKala),
      roles: (cur?.roles ?? 0) + 1,
      triRashi: (cur?.triRashi ?? false) || c.role === 'Tri-Rashi Pati',
    });
  }
  const looking = [...planets.entries()].filter(([, v]) => v.aspectKala > 0);
  if (looking.length === 0) return byMuntha;

  const topAll = Math.max(...[...planets.values()].map((v) => v.strength));
  const moon = planets.get('Moon' as Planet);
  const moonAllowed =
    !!moon &&
    moon.strength === topAll &&
    ((ctx.ascSign === 3 && ctx.moonSign === 3) || (!ctx.isDay && moon.triRashi && moon.aspectKala > 0));
  const eligible = looking.filter(([p]) => p !== ('Moon' as Planet) || moonAllowed);

  if (eligible.length === 0) {
    return { planet: ctx.moonIthasalaPartner ?? ctx.moonSignLord, wonByMunthaTiebreak: false };
  }
  const top = Math.max(...eligible.map(([, v]) => v.strength));
  let best = eligible.filter(([, v]) => v.strength === top);
  if (best.length > 1) {
    const roles = Math.max(...best.map(([, v]) => v.roles));
    best = best.filter(([, v]) => v.roles === roles);
  }
  if (best.length > 1) {
    const harder = Math.max(...best.map(([, v]) => v.aspectKala));
    best = best.filter(([, v]) => v.aspectKala === harder);
  }
  if (best.length === 1) {
    const planet = best[0]![0];
    return { planet, wonByMunthaTiebreak: false };
  }
  return byMuntha;
}
