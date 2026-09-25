// =============================================================================
// KP (Krishnamurti Paddhati) core — significators, cuspal sub lords, promise
// =============================================================================
// Pure and synchronous: everything here works on longitudes that were already
// computed (KP ayanamsa, Placidus cusps — see kp-chart.ts for the ephemeris
// side). Kept free of swisseph so the rules can be unit-tested with plain
// numbers, and so a report read can recompute the whole judgement without an
// LLM or a database.
//
// The rule set follows K. S. Krishnamurti's Reader III as summarised in
// docs/superpowers (the Aroha KP engine spec):
//   planet     = the channel of the result
//   star lord  = the nature of what is delivered
//   sub lord   = the decider — does the matter succeed or not
// and the four classical significator grades for a house H:
//   L1  planets in the star of an occupant of H   (strongest)
//   L2  occupants of H
//   L3  planets in the star of the owner of H
//   L4  the owner of H
// Everything is versioned (KP_RULESET_VERSION) so a later rule change can be
// told apart from a chart change.
// =============================================================================

import { kpLordsFor } from '../calculations/kp-sublord.js';

export const KP_RULESET_VERSION = 'kp-classical-2026.09';

export const KP_PLANETS = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
] as const;

export const ZODIAC = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
] as const;

export const SIGN_LORD: Record<string, string> = {
  Aries: 'Mars',
  Taurus: 'Venus',
  Gemini: 'Mercury',
  Cancer: 'Moon',
  Leo: 'Sun',
  Virgo: 'Mercury',
  Libra: 'Venus',
  Scorpio: 'Mars',
  Sagittarius: 'Jupiter',
  Capricorn: 'Saturn',
  Aquarius: 'Saturn',
  Pisces: 'Jupiter',
};

export const NAKSHATRA_NAMES = [
  'Ashwini',
  'Bharani',
  'Krittika',
  'Rohini',
  'Mrigashira',
  'Ardra',
  'Punarvasu',
  'Pushya',
  'Ashlesha',
  'Magha',
  'Purva Phalguni',
  'Uttara Phalguni',
  'Hasta',
  'Chitra',
  'Swati',
  'Vishakha',
  'Anuradha',
  'Jyeshtha',
  'Mula',
  'Purva Ashadha',
  'Uttara Ashadha',
  'Shravana',
  'Dhanishtha',
  'Shatabhisha',
  'Purva Bhadrapada',
  'Uttara Bhadrapada',
  'Revati',
];

const NAKSHATRA_SPAN = 360 / 27;

export function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function signOf(longitude: number): string {
  return ZODIAC[Math.floor(norm360(longitude) / 30) % 12]!;
}

/** The full sign → star → sub → sub-sub chain for one point. */
export interface KpPoint {
  longitude: number;
  sign: string;
  signLord: string;
  nakshatra: string;
  starLord: string;
  subLord: string;
  subSubLord: string;
}

export function kpPoint(longitude: number): KpPoint {
  const lon = norm360(longitude);
  const lords = kpLordsFor(lon);
  const sign = signOf(lon);
  return {
    longitude: Math.round(lon * 10000) / 10000,
    sign,
    signLord: SIGN_LORD[sign]!,
    nakshatra: NAKSHATRA_NAMES[lords.nakshatraIndex]!,
    starLord: lords.starLord,
    subLord: lords.subLord,
    subSubLord: lords.subSubLord,
  };
}

/**
 * Arc (degrees) from `longitude` to the nearest KP sub boundary. Used to flag a
 * cusp whose sub lord would flip with a few minutes' change in birth time — a
 * trust signal, never hidden from the reader.
 */
export function distanceToSubBoundary(longitude: number): number {
  const lon = norm360(longitude);
  const nakIndex = Math.min(Math.floor(lon / NAKSHATRA_SPAN), 26);
  const offset = lon - nakIndex * NAKSHATRA_SPAN;
  const order = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
  const years: Record<string, number> = {
    Ketu: 7,
    Venus: 20,
    Sun: 6,
    Moon: 10,
    Mars: 7,
    Rahu: 18,
    Jupiter: 16,
    Saturn: 19,
    Mercury: 17,
  };
  const start = nakIndex % 9;
  let cursor = 0;
  let best = Infinity;
  for (let i = 0; i <= 9; i++) {
    best = Math.min(best, Math.abs(offset - cursor));
    if (i === 9) break;
    cursor += (years[order[(start + i) % 9]!]! / 120) * NAKSHATRA_SPAN;
  }
  return best;
}

/** 10 arc-minutes — the cusps move about that much in 40 seconds of birth time. */
export const SUB_BOUNDARY_NEAR_DEG = 1 / 6;

export interface KpPlanetInput {
  planet: string;
  longitude: number;
  speed?: number;
}

export interface KpNatalPlanet extends KpPoint {
  planet: string;
  house: number;
  retrograde: boolean;
}

export interface KpCusp extends KpPoint {
  house: number;
  nearSubBoundary: boolean;
}

/** Which house (1-12) a longitude falls in, given the 12 cusp longitudes. */
export function houseOf(longitude: number, cusps: number[]): number {
  const lon = norm360(longitude);
  for (let i = 0; i < 12; i++) {
    const start = norm360(cusps[i]!);
    const end = norm360(cusps[(i + 1) % 12]!);
    const inHouse = start <= end ? lon >= start && lon < end : lon >= start || lon < end;
    if (inHouse) return i + 1;
  }
  return 1;
}

export interface KpNatalChart {
  planets: KpNatalPlanet[];
  cusps: KpCusp[];
}

export function buildKpNatal(planets: KpPlanetInput[], cuspLongitudes: number[]): KpNatalChart {
  const cusps: KpCusp[] = cuspLongitudes.slice(0, 12).map((lon, i) => ({
    house: i + 1,
    ...kpPoint(lon),
    nearSubBoundary: distanceToSubBoundary(lon) < SUB_BOUNDARY_NEAR_DEG,
  }));
  const out: KpNatalPlanet[] = [];
  for (const p of planets) {
    if (!(KP_PLANETS as readonly string[]).includes(p.planet)) continue;
    if (!Number.isFinite(p.longitude)) continue;
    out.push({
      planet: p.planet,
      ...kpPoint(p.longitude),
      house: houseOf(p.longitude, cuspLongitudes),
      // Rahu/Ketu are always retrograde in the mean-node model; KP treats that as their nature,
      // not a condition worth flagging, so only the seven visible planets report it.
      retrograde:
        p.planet !== 'Rahu' && p.planet !== 'Ketu' && typeof p.speed === 'number' && p.speed < 0,
    });
  }
  return { planets: out, cusps };
}

/** Houses owned by a planet (by the sign on each cusp — Placidus can give a planet 0-4). */
export function housesOwnedBy(planet: string, chart: KpNatalChart): number[] {
  return chart.cusps.filter((c) => c.signLord === planet).map((c) => c.house);
}

function housesOccupiedBy(planet: string, chart: KpNatalChart): number[] {
  const p = chart.planets.find((x) => x.planet === planet);
  return p ? [p.house] : [];
}

/**
 * The houses a planet signifies, graded. `strong` is what KP leans on for a
 * judgement — the star lord's occupation/ownership plus the planet's own
 * occupation. `weak` adds the planet's own ownership. Nodes additionally carry
 * their sign dispositor's houses (the classical "a node gives the results of
 * the planet it represents"), recorded under `nodeAgent` so the reason is never
 * lost.
 */
export interface Signification {
  planet: string;
  starLord: string;
  /** L1 + L3 + L2 — star lord's occupied and owned houses, and the planet's own house. */
  strong: number[];
  /** Everything in `strong` plus the planet's own ownership (L4) and node agency. */
  all: number[];
  nodeAgent: string | null;
}

function uniqSorted(xs: number[]): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}

export function significationOf(planet: string, chart: KpNatalChart): Signification {
  const p = chart.planets.find((x) => x.planet === planet);
  if (!p) return { planet, starLord: '', strong: [], all: [], nodeAgent: null };
  const star = p.starLord;
  const strong = uniqSorted([
    ...housesOccupiedBy(star, chart),
    ...housesOwnedBy(star, chart),
    p.house,
  ]);
  let nodeAgent: string | null = null;
  const extra: number[] = [...housesOwnedBy(planet, chart)];
  if (planet === 'Rahu' || planet === 'Ketu') {
    nodeAgent = p.signLord;
    extra.push(...housesOccupiedBy(nodeAgent, chart), ...housesOwnedBy(nodeAgent, chart));
    // Conjunction agency: a node within 8° of a planet also carries that planet.
    for (const other of chart.planets) {
      if (other.planet === planet || other.planet === 'Rahu' || other.planet === 'Ketu') continue;
      const d = Math.abs(norm360(other.longitude - p.longitude));
      if (Math.min(d, 360 - d) <= 8) {
        extra.push(...housesOccupiedBy(other.planet, chart), ...housesOwnedBy(other.planet, chart));
      }
    }
  }
  return { planet, starLord: star, strong, all: uniqSorted([...strong, ...extra]), nodeAgent };
}

export interface HouseSignificators {
  house: number;
  level1: string[];
  level2: string[];
  level3: string[];
  level4: string[];
}

export function houseSignificators(house: number, chart: KpNatalChart): HouseSignificators {
  const occupants = chart.planets.filter((p) => p.house === house).map((p) => p.planet);
  const cusp = chart.cusps.find((c) => c.house === house);
  const owner = cusp?.signLord ?? '';
  return {
    house,
    level1: chart.planets.filter((p) => occupants.includes(p.starLord)).map((p) => p.planet),
    level2: occupants,
    level3: chart.planets.filter((p) => p.starLord === owner).map((p) => p.planet),
    level4: owner ? [owner] : [],
  };
}

// -----------------------------------------------------------------------------
// Event registry — versioned, source-noted. Houses per Reader III worked examples
// where one exists; the rest are the standard KP groupings and are marked so.
// Deliberately contains no longevity/8th-house life-span rule: Aroha never
// judges death, and the health area is read only through the recovery houses.
// -----------------------------------------------------------------------------

export type KpAreaKey =
  | 'career'
  | 'money'
  | 'love'
  | 'health'
  | 'home'
  | 'travel'
  | 'learning'
  | 'family';

export interface KpAreaRule {
  key: KpAreaKey;
  houses: number[];
  /** Houses that pull the other way — a sub lord tied mostly to these slows the matter. */
  opposing: number[];
  principalCusp: number;
  source: 'KSK_READER_III' | 'KP_STANDARD';
}

export const KP_AREA_RULES: readonly KpAreaRule[] = [
  {
    key: 'career',
    houses: [2, 6, 10],
    opposing: [5, 9, 12],
    principalCusp: 10,
    source: 'KSK_READER_III',
  },
  {
    key: 'money',
    houses: [2, 6, 11],
    opposing: [5, 8, 12],
    principalCusp: 11,
    source: 'KP_STANDARD',
  },
  {
    key: 'love',
    houses: [2, 7, 11],
    opposing: [1, 6, 10],
    principalCusp: 7,
    source: 'KSK_READER_III',
  },
  {
    key: 'health',
    houses: [1, 5, 11],
    opposing: [6, 8, 12],
    principalCusp: 1,
    source: 'KP_STANDARD',
  },
  {
    key: 'home',
    houses: [4, 11, 12],
    opposing: [3, 5, 10],
    principalCusp: 4,
    source: 'KP_STANDARD',
  },
  {
    key: 'travel',
    houses: [3, 9, 12],
    opposing: [2, 4, 11],
    principalCusp: 12,
    source: 'KSK_READER_III',
  },
  {
    key: 'learning',
    houses: [4, 9, 11],
    opposing: [3, 8, 12],
    principalCusp: 9,
    source: 'KP_STANDARD',
  },
  {
    key: 'family',
    houses: [2, 5, 11],
    opposing: [1, 4, 10],
    principalCusp: 5,
    source: 'KP_STANDARD',
  },
] as const;

/** Plain-words promise level — never a number. */
export type KpPromise = 'strong' | 'steady' | 'slow';

export interface KpAreaPromise {
  key: KpAreaKey;
  houses: number[];
  principalCusp: number;
  cuspSubLord: string;
  cuspSubLordStar: string;
  cuspSubLordSignifies: number[];
  matchedHouses: number[];
  promise: KpPromise;
  cuspNearBoundary: boolean;
  source: KpAreaRule['source'];
}

/**
 * The promise layer: does the principal cusp's sub lord connect to the houses
 * this matter needs? KP judges this before any timing — a period can only
 * deliver what the chart promises.
 */
export function areaPromise(rule: KpAreaRule, chart: KpNatalChart): KpAreaPromise {
  const cusp = chart.cusps.find((c) => c.house === rule.principalCusp)!;
  const sig = significationOf(cusp.subLord, chart);
  const matched = rule.houses.filter((h) => sig.strong.includes(h));
  const matchedAll = rule.houses.filter((h) => sig.all.includes(h));
  const opposed = rule.opposing.filter((h) => sig.strong.includes(h));
  let promise: KpPromise;
  if (matched.length >= 2 && opposed.length < matched.length) promise = 'strong';
  else if (matched.length >= 1 || matchedAll.length >= 2) promise = 'steady';
  else promise = 'slow';
  return {
    key: rule.key,
    houses: rule.houses,
    principalCusp: rule.principalCusp,
    cuspSubLord: cusp.subLord,
    cuspSubLordStar: sig.starLord,
    cuspSubLordSignifies: sig.strong,
    matchedHouses: matched,
    promise,
    cuspNearBoundary: cusp.nearSubBoundary,
    source: rule.source,
  };
}

// -----------------------------------------------------------------------------
// Ruling Planets — classical five-role core, roles retained on repetition.
// -----------------------------------------------------------------------------

const DAY_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

export interface RulingPlanet {
  planet: string;
  role: 'DAY_LORD' | 'MOON_STAR_LORD' | 'MOON_SIGN_LORD' | 'ASC_SIGN_LORD' | 'ASC_STAR_LORD';
}

export function rulingPlanets(
  weekday: number,
  moonLongitude: number,
  ascLongitude: number,
): RulingPlanet[] {
  const moon = kpPoint(moonLongitude);
  const asc = kpPoint(ascLongitude);
  return [
    { planet: DAY_LORDS[weekday % 7]!, role: 'DAY_LORD' },
    { planet: moon.starLord, role: 'MOON_STAR_LORD' },
    { planet: moon.signLord, role: 'MOON_SIGN_LORD' },
    { planet: asc.signLord, role: 'ASC_SIGN_LORD' },
    { planet: asc.starLord, role: 'ASC_STAR_LORD' },
  ];
}
