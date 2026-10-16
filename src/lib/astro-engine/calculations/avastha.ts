// =============================================================================
// Baladi Avastha, Graha Yuddha and Vimsopaka Bala
// =============================================================================
// Shadbala answers "how much strength does this planet have"; these three
// answer "and is it in any condition to use it". A planet can clear its
// Shadbala minimum and still be an infant (Bala avastha), or have just lost a
// planetary war, or hold its dignity in the Rasi chart alone and collapse
// across every divisional chart. None of the three existed anywhere in this
// engine — grep for `avastha`, `yuddha` or `vimsopaka` before this file and
// there are zero hits.
//
// All three are pure functions over data the chart already carries.
// =============================================================================

import type { ChartData, Planet, ZodiacSign } from '@aroha-astrology/shared';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';

import {
  calculateD2,
  calculateD3,
  calculateD9,
  calculateD12,
  calculateD30,
} from '../charts/divisionalCharts.js';
import {
  rasiDignity,
  vargaLordDignity,
  vargaSignDignity,
  warWinner,
  type Dignity,
} from './shadbala.js';

/* -------------------------------------------------------------------------- */
/* Baladi Avastha — the five "ages" of a planet by degree within its sign      */
/* -------------------------------------------------------------------------- */

export type Avastha = 'Bala' | 'Kumara' | 'Yuva' | 'Vriddha' | 'Mrita';

/** Classical result-yielding capacity of each state, as a 0-1 multiplier. */
export const AVASTHA_POTENCY: Record<Avastha, number> = {
  Bala: 0.25, // infant — cannot yet deliver
  Kumara: 0.5, // adolescent — partial
  Yuva: 1.0, // adult — full results
  Vriddha: 0.25, // old — declining
  Mrita: 0.0, // dead — no results
};

const ODD_SEQUENCE: Avastha[] = ['Bala', 'Kumara', 'Yuva', 'Vriddha', 'Mrita'];

/**
 * The planet's Baladi avastha from its degree within its own sign.
 *
 * Each state spans 6 degrees. The sequence runs forward in odd (masculine)
 * signs and backward in even ones — so the same 3 degrees means "infant" in
 * Aries and "dead" in Taurus.
 */
export function baladiAvastha(signDegree: number, signIndex: number): Avastha {
  const step = Math.min(Math.floor(signDegree / 6), 4);
  const isOddSign = signIndex % 2 === 0; // signIndex 0 = Aries = 1st = odd
  const seq = isOddSign ? ODD_SEQUENCE : [...ODD_SEQUENCE].reverse();
  return seq[step]!;
}

/* -------------------------------------------------------------------------- */
/* Graha Yuddha — planetary war                                               */
/* -------------------------------------------------------------------------- */

/** Only the five true planets fight. Luminaries and the shadow points do not. */
const COMBATANTS = new Set(['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']);

/** Classical orb for a planetary war: within one degree of each other. */
const WAR_ORB = 1;

export interface GrahaYuddhaResult {
  winner: string;
  loser: string;
  /** Degrees between the two combatants. */
  separation: number;
}

/**
 * Planetary wars in a chart: any two of the five true planets within 1 degree.
 *
 * Winner (BPHS 79.9): Venus whichever side of the ecliptic she is on, otherwise the
 * planet further north. The Shadbala side of the war is Yuddha Bala in shadbala.ts.
 */
export function detectGrahaYuddha(
  planets: Array<{ planet: string; longitude?: number; latitude?: number }>,
): GrahaYuddhaResult[] {
  const fighters = planets.filter(
    (p) => COMBATANTS.has(p.planet) && Number.isFinite(Number(p.longitude)),
  );

  const wars: GrahaYuddhaResult[] = [];
  for (let i = 0; i < fighters.length; i++) {
    for (let j = i + 1; j < fighters.length; j++) {
      const a = fighters[i]!;
      const b = fighters[j]!;
      const diff = Math.abs(Number(a.longitude) - Number(b.longitude));
      const separation = diff > 180 ? 360 - diff : diff;
      if (separation >= WAR_ORB) continue;

      // BPHS 79.9 (register BPHS-27.20 and 79.9): Venus wins, otherwise the planet further
      // north; equal latitudes give no victor. Same rule as Yuddha Bala in Shadbala.
      const winner = warWinner(
        { planet: a.planet as never, latitude: Number(a.latitude ?? 0) },
        { planet: b.planet as never, latitude: Number(b.latitude ?? 0) },
      );
      if (!winner) continue;
      wars.push({
        winner,
        loser: winner === a.planet ? b.planet : a.planet,
        separation: Math.round(separation * 100) / 100,
      });
    }
  }
  return wars;
}

/* -------------------------------------------------------------------------- */
/* Vimsopaka Bala — twenty-point dignity across the divisions                 */
/* -------------------------------------------------------------------------- */

/**
 * BPHS 16.17-27 (register BPHS-16.17-27, audit ST1). A planet's strength in a
 * division is the division's weight (Swaviswa) times a Varga Viswa set by how the
 * planet stands to the lord of that division, over 20. Shadvarga: Rasi 6, Hora 2,
 * Drekkana 4, Navamsa 5, Dvadasamsa 2, Trimsamsa 1 (20 in all).
 */
const SHADVARGA: ReadonlyArray<{ varga: string; swaviswa: number }> = [
  { varga: 'Rasi', swaviswa: 6 },
  { varga: 'Hora', swaviswa: 2 },
  { varga: 'Drekkana', swaviswa: 4 },
  { varga: 'Navamsa', swaviswa: 5 },
  { varga: 'Dvadasamsa', swaviswa: 2 },
  { varga: 'Trimsamsa', swaviswa: 1 },
];

/** Varga Viswa: 20 in an own division, 18 great friend, 15 friend, 10 equal, 7 enemy, 5 great enemy. */
const VARGA_VISWA: Record<Dignity, number> = {
  moolatrikona: 20,
  own: 20,
  adhimitra: 18,
  mitra: 15,
  sama: 10,
  shatru: 7,
  adhishatru: 5,
};

const VIMSOPAKA_PLANETS: Planet[] = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
];

export interface VimsopakaPart {
  varga: string;
  relation: Dignity;
  swaviswa: number;
  vargaViswa: number;
  points: number;
}

export interface VimsopakaResult {
  planet: string;
  /** 0-20. BPHS 16.26-27: below 5 poor, 5-10 some good, 10-15 middling, 15 and over wholly favourable. */
  score: number;
  parts?: VimsopakaPart[];
}

/**
 * Vimsopaka Bala (Shadvarga) for the seven planets. The relation to the lord of each
 * division is the five-fold one of Shadbala (natural friendship combined with the
 * temporary one read from the sign chart). Returns an empty array if the chart
 * cannot be read.
 */
export function calculateVimsopakaBala(chartData: unknown): VimsopakaResult[] {
  const chart = chartData as ChartData | null;
  if (!chart || !Array.isArray(chart.planets) || chart.planets.length === 0) return [];

  const results: VimsopakaResult[] = [];
  for (const planet of VIMSOPAKA_PLANETS) {
    const pos = chart.planets.find((p) => p.planet === planet);
    if (!pos || !Number.isFinite(pos.longitude)) continue;
    const lon = pos.longitude;
    const planetSign = Math.floor((((lon % 360) + 360) % 360) / 30);
    const horaLord: Planet = calculateD2(lon) === 4 ? 'Sun' : 'Moon';
    const trimsamsaLord = SIGN_LORDS[ZODIAC_SIGNS[calculateD30(lon)] as ZodiacSign];

    const relations: Dignity[] = [
      rasiDignity(planet, lon, chart),
      vargaLordDignity(planet, horaLord, planetSign, chart),
      vargaSignDignity(planet, calculateD3(lon), planetSign, chart),
      vargaSignDignity(planet, calculateD9(lon), planetSign, chart),
      vargaSignDignity(planet, calculateD12(lon), planetSign, chart),
      vargaLordDignity(planet, trimsamsaLord, planetSign, chart),
    ];

    const parts: VimsopakaPart[] = SHADVARGA.map((v, i) => {
      const relation = relations[i]!;
      const vargaViswa = VARGA_VISWA[relation];
      return {
        varga: v.varga,
        relation,
        swaviswa: v.swaviswa,
        vargaViswa,
        points: (v.swaviswa * vargaViswa) / 20,
      };
    });
    const score = parts.reduce((sum, p) => sum + p.points, 0);
    results.push({ planet, score: Math.round(score * 10) / 10, parts });
  }

  return results.sort((a, b) => b.score - a.score);
}
