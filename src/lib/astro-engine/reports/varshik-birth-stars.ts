// =============================================================================
// Varshik C1: the birth-chart nakshatra layer ("Your birth stars")
// =============================================================================
// For each natal planet and the Lagna: nakshatra, pada, star lord (with the house it holds and rules),
// the pada's navamsa sign, gana, the star's deity / symbol / nature / shakti (NAKSHATRA_INFO), the KP star
// and sub lord (kpLordsFor), Gandanta (the same rule as the Gandanta dosha), and its Tara from the birth
// star. Then the natal Navatara (planets sitting in weakening or emphasising taras), and the stars of the
// lords that run in 2027: the natal Maha / Antar / Pratyantar lords and the Mudda lords.
//
// Every output is a structured fact. Prose is written later (C3) from these facts only.
// No death wording: Vadha is "a hard, draining star"; Gandanta is "a sensitive junction point".
// =============================================================================

import { NAKSHATRA_GANA, NAKSHATRA_INFO, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { ChartData } from '@aroha-astrology/shared';
import { VARSHIK_NAKSHATRA as N } from '../../../config/varshik-weights.js';
import { kpLordsFor, type KpLords } from '../calculations/kp-sublord.js';
import { nakshatraGandantaAt } from '../doshas/gandanta.js';
import {
  birthStarOf,
  houseFromSign,
  specialTaraOf,
  starAt,
  starLordRole,
  taraFromBirth,
  type SpecialTara,
  type StarLordRole,
  type TaraRow,
} from './nakshatra-transits.js';
import type { VarshikContext } from './varshik-context.js';

export const BIRTH_STAR_POINTS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu', 'Lagna'] as const;
export type BirthStarPoint = (typeof BIRTH_STAR_POINTS)[number];

export interface BirthStarRow {
  point: BirthStarPoint;
  longitude: number;
  sign: string;
  /** Natal house (whole sign from the Lagna); 1 for the Lagna itself. */
  house: number;
  nak: number;
  nakName: string;
  pada: number;
  starLord: string;
  starLordRole: StarLordRole;
  /** Sign of the pada's navamsa. */
  navamsaSign: string;
  gana: string;
  deity: string;
  symbol: string;
  nature: string;
  shakti: { name: string; meaning: string };
  kp: KpLords;
  /** The KP sub lord's natal house, so "star lord + sub lord" can be read together. */
  subLordHouse: number;
  gandanta: { present: boolean; part: 'start' | 'end' | null; degreesFromJunction: number | null; abhuktaMoola: boolean };
  /** Tara of this point's star from the birth star (the Moon's own row is Janma by definition). */
  tara: TaraRow;
  special: SpecialTara | null;
}

function lonOf(natal: ChartData, point: BirthStarPoint): number {
  if (point === 'Lagna') return natal.ascendant.signIndex * 30 + natal.ascendant.degree;
  const p = natal.planets.find((x) => x.planet === point);
  if (!p) throw new Error(`birthStarTable: the chart has no ${point}`);
  return p.longitude;
}

/** The 10-row table: 9 planets and the Lagna. */
export function birthStarTable(natal: ChartData): BirthStarRow[] {
  const birth = birthStarOf(natal);
  const lagna = natal.ascendant.signIndex;
  return BIRTH_STAR_POINTS.map((point): BirthStarRow => {
    const lon = lonOf(natal, point);
    const s = starAt(lon);
    const info = NAKSHATRA_INFO[s.index]!;
    const kp = kpLordsFor(lon);
    const sign = Math.floor((((lon % 360) + 360) % 360) / 30);
    const subLordPlanet = natal.planets.find((p) => p.planet === kp.subLord);
    const g = nakshatraGandantaAt(lon);
    return {
      point,
      longitude: lon,
      sign: ZODIAC_SIGNS[sign]!,
      house: houseFromSign(lagna, sign),
      nak: s.index,
      nakName: s.name,
      pada: s.pada,
      starLord: s.lord,
      starLordRole: starLordRole(natal, s.lord),
      navamsaSign: ZODIAC_SIGNS[s.navamsaSign]!,
      gana: NAKSHATRA_GANA[s.index]!,
      deity: info.deity,
      symbol: info.symbol,
      nature: info.nature,
      shakti: info.shakti,
      kp,
      subLordHouse: subLordPlanet ? houseFromSign(lagna, subLordPlanet.signIndex) : 0,
      gandanta: {
        present: g.present,
        part: g.part,
        degreesFromJunction: g.degreesFromJunction,
        abhuktaMoola: g.abhuktaMoola,
      },
      tara: taraFromBirth(birth.index, s.index),
      special: specialTaraOf(birth.longitude, lon),
    };
  });
}

// -----------------------------------------------------------------------------
// Natal Navatara
// -----------------------------------------------------------------------------

export interface NatalNavatara {
  /** Planets (not the Moon, which is the birth star itself, and not the Lagna) in a weakening tara: Vipat 3, Pratyari 5, Vadha 7. */
  weakened: Array<{ planet: string; tara: TaraRow }>;
  /** Planets and the Lagna in an emphasised star: Janma 1, Karma 10, Sanghatika 16 on the 28-star ring. */
  emphasised: Array<{ point: string; special: SpecialTara }>;
}

export function natalNavatara(rows: BirthStarRow[]): NatalNavatara {
  const weakened: NatalNavatara['weakened'] = [];
  const emphasised: NatalNavatara['emphasised'] = [];
  for (const r of rows) {
    if (r.point === 'Moon') continue; // the Moon is the birth star: Janma by definition
    if (r.point !== 'Lagna' && N.natalNavatara.weakened.includes(r.tara.n)) {
      weakened.push({ planet: r.point, tara: r.tara });
    }
    if (r.special && N.natalNavatara.emphasisedSpecial.includes(r.special.n)) {
      emphasised.push({ point: r.point, special: r.special });
    }
  }
  return { weakened, emphasised };
}

// -----------------------------------------------------------------------------
// Planet-in-star facts
// -----------------------------------------------------------------------------

export interface PlanetInStarFact {
  planet: string;
  nakName: string;
  pada: number;
  /** The planet gives its own matters, coloured by the star lord's house and role. */
  starLord: string;
  starLordHouse: number;
  starLordRules: number[];
  /** The planet is its own star lord (it stands in a star it rules). */
  inOwnStar: boolean;
  subLord: string;
  subLordHouse: number;
  gandanta: boolean;
}

export function planetInStarFacts(rows: BirthStarRow[]): PlanetInStarFact[] {
  return rows
    .filter((r) => r.point !== 'Lagna')
    .map((r) => ({
      planet: r.point,
      nakName: r.nakName,
      pada: r.pada,
      starLord: r.starLord,
      starLordHouse: r.starLordRole.house,
      starLordRules: r.starLordRole.rules,
      inOwnStar: r.starLord === r.point,
      subLord: r.kp.subLord,
      subLordHouse: r.subLordHouse,
      gandanta: r.gandanta.present,
    }));
}

// -----------------------------------------------------------------------------
// The 2027 dasha lords and their stars
// -----------------------------------------------------------------------------

export interface DashaLordStar {
  planet: string;
  /** Which roles it plays in the calendar year. */
  roles: Array<'maha' | 'antar' | 'pratyantar' | 'mudda'>;
  nakName: string;
  pada: number;
  starLord: string;
  starLordHouse: number;
  starLordRules: number[];
  subLord: string;
  subLordHouse: number;
  gandanta: boolean;
}

/** Natal Maha / Antar / Pratyantar lords and Mudda main lords that run at any time in the year. */
export function dashaLordStars(ctx: VarshikContext): DashaLordStar[] {
  const yearStart = ctx.dayStartMs[0]!;
  const yearEnd = ctx.dayStartMs[ctx.dayStartMs.length - 1]!;
  const roles = new Map<string, Set<DashaLordStar['roles'][number]>>();
  const add = (planet: string, role: DashaLordStar['roles'][number]) => {
    if (!roles.has(planet)) roles.set(planet, new Set());
    roles.get(planet)!.add(role);
  };
  for (const seg of ctx.natalDasha) {
    if (seg.endMs <= yearStart || seg.startMs >= yearEnd) continue;
    add(seg.maha, 'maha');
    add(seg.antar, 'antar');
    add(seg.praty, 'pratyantar');
  }
  for (const slice of ctx.calendar.varshaYears) {
    for (const m of slice.mudda) {
      if (m.endMs <= yearStart || m.startMs >= yearEnd) continue;
      add(m.lord, 'mudda');
    }
  }
  const rows = birthStarTable(ctx.natal);
  const order = ['maha', 'antar', 'pratyantar', 'mudda'] as const;
  return [...roles.keys()]
    .map((planet): DashaLordStar | null => {
      const r = rows.find((x) => x.point === planet);
      if (!r) return null;
      return {
        planet,
        roles: order.filter((o) => roles.get(planet)!.has(o)),
        nakName: r.nakName,
        pada: r.pada,
        starLord: r.starLord,
        starLordHouse: r.starLordRole.house,
        starLordRules: r.starLordRole.rules,
        subLord: r.kp.subLord,
        subLordHouse: r.subLordHouse,
        gandanta: r.gandanta.present,
      };
    })
    .filter((x): x is DashaLordStar => x !== null)
    .sort((a, b) => a.planet.localeCompare(b.planet));
}

export interface BirthStarFacts {
  rows: BirthStarRow[];
  navatara: NatalNavatara;
  planetInStar: PlanetInStarFact[];
  dashaLords: DashaLordStar[];
}

export function buildBirthStarFacts(ctx: VarshikContext): BirthStarFacts {
  const rows = birthStarTable(ctx.natal);
  return {
    rows,
    navatara: natalNavatara(rows),
    planetInStar: planetInStarFacts(rows),
    dashaLords: dashaLordStars(ctx),
  };
}
