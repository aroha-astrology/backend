// =============================================================================
// Harsha bala and Dwadashavargiya bala of the Varsha chart
// =============================================================================
// HARSHA BALA (M.S. Mehta, Annual Horoscope (Varshaphala), ch. V, "Harsha Bala"): four fives.
//   1. Sthana: the planet is in its house of happiness, counted from the Varsha Lagna: Sun 9th,
//      Moon 3rd, Mars 6th, Mercury 1st, Jupiter 11th, Venus 5th, Saturn 12th.
//   2. Swakshetra: it is in its own sign or its sign of exaltation.
//   3. Stri-Purusha: a male planet (Sun, Mars, Jupiter) in a male house (4, 5, 6, 10, 11, 12), or a
//      female planet (Moon, Mercury, Venus, Saturn) in a female house (1, 2, 3, 7, 8, 9).
//   4. Dina-Ratri: a male planet if the Varsha begins by day, a female planet if by night.
//   The total, 0 to 20, reads: 0 Nirbala, 5 Alpabala, 10 Madhyabala, 15 Purnabala, 20 very strong.
//
// DWADASHAVARGIYA BALA: the planet's sign in each of the twelve vargas D-1 to D-12 is looked at; it
// gains one for every varga in which that sign is its own, its exaltation sign or a friend's sign.
// The score is 0 to 12. (Mehta's Indira Gandhi exercise sorts the twelve into benefic, neutral and
// malefic and counts them.) The friendship used is JHora's own table, JHORA_DWADASHA_FRIENDS below.
//
// Result of that check (10 gold charts x 2 years x 7 planets = 140 values): Harsha 140 of 140;
// Dwadashavargiya 138 of 140 (see JHORA_DWADASHA_FRIENDS). D-2, D-5, D-6, D-8 and D-11 are drawn as JHora
// draws them (the engine's own versions of those five are different schemes).
//
// Each rule is checked against Jagannatha Hora on 10 gold charts, 2026 and 2027, in
// test/varshik-annual-balas.spec.ts; the result of that check is stated next to each constant.
// =============================================================================

import type { ChartData, Planet } from '@aroha-astrology/shared';
import {
  calculateD1, calculateD3, calculateD4, calculateD7, calculateD9, calculateD10, calculateD12,
} from '../charts/divisionalCharts.js';
import { PLANET_DEBILITATION, PLANET_EXALTATION, PLANET_OWN_SIGNS, SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';

export type BalaPlanet = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn';
export const BALA_PLANETS: BalaPlanet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

/** House (1-12 from the Varsha Lagna) in which each planet is happy. */
export const HARSHA_HOUSE: Record<BalaPlanet, number> = {
  Sun: 9, Moon: 3, Mars: 6, Mercury: 1, Jupiter: 11, Venus: 5, Saturn: 12,
};
const MALE: BalaPlanet[] = ['Sun', 'Mars', 'Jupiter'];
const MALE_HOUSES = [4, 5, 6, 10, 11, 12];
const FEMALE_HOUSES = [1, 2, 3, 7, 8, 9];

export interface HarshaBala {
  sthana: number;
  swakshetra: number;
  strIPurusha: number;
  dinaRatri: number;
  total: number;
  label: 'Nirbala' | 'Alpabala' | 'Madhyabala' | 'Purnabala' | 'Atibala';
}

const HARSHA_LABEL: HarshaBala['label'][] = ['Nirbala', 'Alpabala', 'Madhyabala', 'Purnabala', 'Atibala'];

export function harshaBala(chart: ChartData, isDay: boolean): Record<BalaPlanet, HarshaBala> {
  const out = {} as Record<BalaPlanet, HarshaBala>;
  for (const planet of BALA_PLANETS) {
    const p = chart.planets.find((x) => x.planet === planet);
    if (!p) {
      out[planet] = { sthana: 0, swakshetra: 0, strIPurusha: 0, dinaRatri: 0, total: 0, label: 'Nirbala' };
      continue;
    }
    const house = ((p.signIndex - chart.ascendant.signIndex + 12) % 12) + 1;
    const sign = ZODIAC_SIGNS[p.signIndex]!;
    const male = MALE.includes(planet);
    const sthana = house === HARSHA_HOUSE[planet] ? 5 : 0;
    const swakshetra =
      PLANET_EXALTATION[planet as Planet]?.sign === sign || PLANET_OWN_SIGNS[planet as Planet]?.includes(sign) ? 5 : 0;
    const strIPurusha = (male ? MALE_HOUSES : FEMALE_HOUSES).includes(house) ? 5 : 0;
    const dinaRatri = male === isDay ? 5 : 0;
    const total = sthana + swakshetra + strIPurusha + dinaRatri;
    out[planet] = { sthana, swakshetra, strIPurusha, dinaRatri, total, label: HARSHA_LABEL[total / 5]! };
  }
  return out;
}

/**
 * D-2, D-5, D-6, D-8 and D-11 as Jagannatha Hora / PyJHora (method 1) draw them. The engine's own
 * calculateD2, D5, D6, D8 and D11 are different schemes and agree with this on 9, 8, 7, 7 and 10
 * of 60 random longitudes; D-3, D-4, D-7, D-9, D-10 and D-12 agree on all 60. The rows are the
 * sign the division k of each sign (Aries first) falls in.
 */
const JHORA_VARGA: Record<number, number[][]> = {
  2: [[0, 1], [3, 2], [4, 5], [7, 6], [8, 9], [11, 10], [0, 1], [3, 2], [4, 5], [7, 6], [8, 9], [11, 10]],
  5: Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? [0, 10, 8, 2, 6] : [1, 5, 11, 9, 7])),
  6: Array.from({ length: 12 }, (_, i) => Array.from({ length: 6 }, (_, k) => (i % 2 === 0 ? k : 6 + k))),
  8: Array.from({ length: 12 }, (_, i) => Array.from({ length: 8 }, (_, k) => (i * 8 + k) % 12)),
  11: Array.from({ length: 12 }, (_, i) => Array.from({ length: 11 }, (_, k) => (((k - i) % 12) + 12) % 12)),
};
const tableVarga = (n: number) => (lon: number): number => {
  const sign = Math.floor(lon / 30) % 12;
  const k = Math.min(n - 1, Math.floor((lon % 30) / (30 / n)));
  return JHORA_VARGA[n]![sign]![k]!;
};

const VARGA = [
  calculateD1, tableVarga(2), calculateD3, calculateD4, tableVarga(5), tableVarga(6),
  calculateD7, tableVarga(8), calculateD9, calculateD10, tableVarga(11), calculateD12,
];

/**
 * The sign lords that count as friends of each planet in Jagannatha Hora's Dwadasa-vargeeya count (its
 * "Permanent" relationship setting; "Compound" is the other choice and "relevant varga chart" the
 * basis). Found from the 20 gold chart-years and the per-varga table of b01 2026
 * (screenshots 2026-11-09): the Sun, Mars, Jupiter, Venus and Saturn follow the usual table and the
 * Moon and Mercury do not. Moon: Sun, Mars, Jupiter (not Mercury); Mercury: Venus, Saturn (not the Sun).
 * A planet also counts its own signs and its sign of exaltation, and never its sign of fall. Result: 138 of 140 values equal JHora;
 * the two that do not are in KNOWN_DWADASHAVARGIYA_MISSES (test/varshik-annual-balas.spec.ts).
 * This is a fitted table, not a classical text: the reason JHora reads the Moon and Mercury so is not known.
 */
export const JHORA_DWADASHA_FRIENDS: Record<BalaPlanet, BalaPlanet[]> = {
  Sun: ['Moon', 'Mars', 'Jupiter'],
  Moon: ['Sun', 'Mars', 'Jupiter'],
  Mars: ['Sun', 'Moon', 'Jupiter'],
  Mercury: ['Venus', 'Saturn'],
  Jupiter: ['Sun', 'Moon', 'Mars'],
  Venus: ['Mercury', 'Saturn'],
  Saturn: ['Mercury', 'Venus'],
};

export interface DwadashavargiyaBala {
  /** 0 to 12: the vargas in which the planet is in its own, exaltation or a friend's sign. */
  score: number;
  /** The sign index of the planet in D-1 to D-12. */
  signs: number[];
}

export function dwadashavargiyaBala(chart: ChartData): Record<BalaPlanet, DwadashavargiyaBala> {
  const out = {} as Record<BalaPlanet, DwadashavargiyaBala>;
  for (const planet of BALA_PLANETS) {
    const p = chart.planets.find((x) => x.planet === planet);
    const lon = p ? ((p.longitude % 360) + 360) % 360 : 0;
    const signs = VARGA.map((fn) => fn(lon));
    const score = signs.filter((s) => {
      const sign = ZODIAC_SIGNS[s]!;
      if (PLANET_DEBILITATION[planet as Planet]?.sign === sign) return false; // the sign of fall never counts
      if (PLANET_OWN_SIGNS[planet as Planet]?.includes(sign) || PLANET_EXALTATION[planet as Planet]?.sign === sign) return true;
      return JHORA_DWADASHA_FRIENDS[planet].includes(SIGN_LORDS[sign] as BalaPlanet);
    }).length;
    out[planet] = { score, signs };
  }
  return out;
}
