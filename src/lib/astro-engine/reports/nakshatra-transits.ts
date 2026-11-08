// =============================================================================
// Varshik C1: the transit layer read through the stars (nakshatras) and from the natal Moon
// =============================================================================
// What this file answers, for every planet, every day of the calendar year:
//   - which nakshatra and pada it stands in, and when it changes nakshatra (to the minute)
//   - its Tara from the reader's birth star, and whether the star is one of the special (sensitive) taras
//   - which natal planet's star it is crossing
//   - the house it holds from the natal Moon, the good-house table, vedha and vipreet vedha
//   - its Ashtakavarga bindus in the sign (BAV) and whether the kakshya lord gave a bindu
//   - the Moorti at each sign change
//   - the star lord's natal role (the house it holds and rules)
//
// Almost nothing here is new code. It calls the engine's own tools: findNakshatraChanges, findMoonChanges,
// findTransitEvents, calculateTaraBala, checkVedha, checkKakshyaBindu, calculateBhinnaAshtakavargaDetailed.
// The pure functions take plain numbers so tests run without the ephemeris; only buildNakshatraTransits
// (the last function) touches it. Constants: config/varshik-weights.ts (VARSHIK_NAKSHATRA), with sources.
// Sarvatobhadra is not here: the owner declined it on 2026-11-08 (SBC_ENABLED = false).
// No death wording in any output string.
// =============================================================================

import {
  ABHIJIT_END_DEG,
  ABHIJIT_START_DEG,
  NAKSHATRAS,
  NAKSHATRA_LORDS,
  SIGN_LORDS,
  ZODIAC_SIGNS,
} from '@aroha-astrology/shared';
import type { ChartData } from '@aroha-astrology/shared';
import { VARSHIK_NAKSHATRA as N } from '../../../config/varshik-weights.js';
import { calculateBhinnaAshtakavargaDetailed } from '../calculations/ashtakavarga.js';
import { calculatePlanetPositions } from '../calculations/planetPositions.js';
import { checkKakshyaBindu, type DetailedBhinnaAshtakavarga } from '../../astro-tools/kakshya.js';
import { findMoonChanges } from '../../astro-tools/moon-events.js';
import { calculateTaraBala } from '../../astro-tools/tara-bala.js';
import {
  findNakshatraChanges,
  findTransitEvents,
  jdFromDate,
  type NakshatraChange,
} from '../../astro-tools/transit-events.js';
import { AUSPICIOUS_HOUSES, checkVedha, checkVipreetVedha } from '../../astro-tools/vedha.js';
import type { VarshikContext } from './varshik-context.js';

const NAK_SPAN = 360 / 27;
const PADA_SPAN = NAK_SPAN / 4;
const norm360 = (d: number) => ((d % 360) + 360) % 360;
export const signIndexOf = (lon: number): number => Math.floor(norm360(lon) / 30);
/** Whole-sign house of `sign` counted from `from` (both 0-11). */
export const houseFromSign = (from: number, sign: number): number => (((sign - from) % 12) + 12) % 12 + 1;

// -----------------------------------------------------------------------------
// Star of a longitude
// -----------------------------------------------------------------------------

export interface StarPlace {
  /** 0-26. */
  index: number;
  name: string;
  /** 1-4. */
  pada: number;
  lord: string;
  /** Degrees into the nakshatra. */
  degInto: number;
  /** Sign of the pada's navamsa (0-11): the pada's own navamsa sign. */
  navamsaSign: number;
}

export function starAt(longitude: number): StarPlace {
  const lon = norm360(longitude);
  const index = Math.min(Math.floor(lon / NAK_SPAN), 26);
  const degInto = lon - index * NAK_SPAN;
  const pada = Math.min(Math.floor(degInto / PADA_SPAN) + 1, 4);
  return {
    index,
    name: NAKSHATRAS[index]!,
    pada,
    lord: NAKSHATRA_LORDS[index]!,
    degInto,
    navamsaSign: (index * 4 + pada - 1) % 12,
  };
}

/**
 * Position (0-27) of a longitude on the 28-star ring, which has Abhijit between Uttara Ashadha (20) and
 * Shravana (21). Used only for counting the special taras [SF]; every other count uses the 27 stars.
 */
export function ring28Position(longitude: number): number {
  const lon = norm360(longitude);
  if (lon >= ABHIJIT_START_DEG && lon < ABHIJIT_END_DEG) return 21;
  const idx = starAt(lon).index;
  return idx <= 20 ? idx : idx + 1;
}

// -----------------------------------------------------------------------------
// Tara and special taras
// -----------------------------------------------------------------------------

export interface TaraRow {
  /** 1-9. */
  n: number;
  name: string;
  good: boolean;
  plain: string;
  /** Which of the three cycles of nine (1-3). */
  cycle: number;
}

/** Tara of the transit star from the birth star: calculateTaraBala's count, with this report's own words. */
export function taraFromBirth(birthStar: number, transitStar: number): TaraRow {
  const t = calculateTaraBala(birthStar, transitStar);
  const row = N.tara[t.taraNumber]!;
  return { n: t.taraNumber, name: row.name, good: row.good, plain: row.plain, cycle: t.paryaya };
}

export interface SpecialTara {
  /** Count on the 28-star ring, 1-28. */
  n: number;
  name: string;
  plain: string;
}

/** The special (sensitive) tara a longitude holds from the birth longitude, or null. */
export function specialTaraOf(birthLon: number, transitLon: number): SpecialTara | null {
  const n = ((ring28Position(transitLon) - ring28Position(birthLon) + 28) % 28) + 1;
  const row = N.specialTaras[n];
  return row ? { n, name: row.name, plain: row.plain } : null;
}

// -----------------------------------------------------------------------------
// Gochar from the natal Moon: good houses, vedha, vipreet vedha
// -----------------------------------------------------------------------------

export type GocharVerdict = 'good' | 'blocked' | 'relieved' | 'hard' | 'none';

export interface GocharRow {
  /** House (1-12) counted from the natal Moon sign. */
  house: number;
  /** The house is one of the planet's good houses [PD]. */
  goodHouse: boolean;
  /** Planets standing in the vedha point of a good house, so cancelling its good result. */
  blockedBy: string[];
  /** In an unfavourable vedha point, but another planet in the paired good house cancels it (vipreet vedha). */
  relievedBy: string[];
  /**
   * good = good house, no vedha; blocked = good house, vedha; relieved = unfavourable house with
   * vipreet vedha; hard = unfavourable house, nothing cancels it; none = the Moon itself.
   */
  verdict: GocharVerdict;
}

/** `signs`: sign index (0-11) of every planet on the day, including the Moon. */
export function gocharFromMoon(
  planet: string,
  signs: Record<string, number>,
  natalMoonSign: number,
): GocharRow {
  const opts = { nodesCauseVedha: N.nodesCauseVedha };
  const v = checkVedha(planet, signs, natalMoonSign, opts);
  if (planet === 'Moon') {
    return { house: v.transitHouse, goodHouse: v.isAuspiciousHouse, blockedBy: [], relievedBy: [], verdict: 'none' };
  }
  const vip = checkVipreetVedha(planet, signs, natalMoonSign, opts);
  const blockedBy = v.obstructions.map((o) => o.obstructingPlanet);
  const relievedBy = vip.cancelledBy.map((o) => o.obstructingPlanet);
  const verdict: GocharVerdict = v.isAuspiciousHouse
    ? blockedBy.length > 0
      ? 'blocked'
      : 'good'
    : relievedBy.length > 0
      ? 'relieved'
      : 'hard';
  return { house: v.transitHouse, goodHouse: v.isAuspiciousHouse, blockedBy, relievedBy, verdict };
}

export function isGoodHouse(planet: string, house: number): boolean {
  return (AUSPICIOUS_HOUSES[planet] ?? []).includes(house);
}

// -----------------------------------------------------------------------------
// Moorti nirnaya [VJ2]
// -----------------------------------------------------------------------------

export type MoortiName = 'swarna' | 'rajata' | 'tamra' | 'loha';

export function moortiOf(moonHouseFromNatalMoon: number): { name: MoortiName; metal: string; quality: string } {
  for (const name of Object.keys(N.moorti) as MoortiName[]) {
    if (N.moorti[name].houses.includes(moonHouseFromNatalMoon)) {
      return { name, metal: N.moorti[name].metal, quality: N.moorti[name].quality };
    }
  }
  throw new Error(`moortiOf: house ${moonHouseFromNatalMoon} is not 1-12`);
}

// -----------------------------------------------------------------------------
// The star lord's natal role
// -----------------------------------------------------------------------------

export interface StarLordRole {
  planet: string;
  /** Natal house (1-12, whole sign from the Lagna) the star lord holds. */
  house: number;
  /** Natal houses it rules (empty for Rahu and Ketu). */
  rules: number[];
}

export function starLordRole(natal: ChartData, lord: string): StarLordRole {
  const lagna = natal.ascendant.signIndex;
  const p = natal.planets.find((x) => x.planet === lord);
  const rules: number[] = [];
  for (let s = 0; s < 12; s++) {
    if (SIGN_LORDS[ZODIAC_SIGNS[s]!] === lord) rules.push(houseFromSign(lagna, s));
  }
  return {
    planet: lord,
    house: p ? houseFromSign(lagna, p.signIndex) : 0,
    rules: rules.sort((a, b) => a - b),
  };
}

// -----------------------------------------------------------------------------
// The natal points whose stars a crossing is a trigger for
// -----------------------------------------------------------------------------

export function natalStarMap(natal: ChartData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of natal.planets) {
    if (N.natalStarPoints.includes(p.planet)) out[p.planet] = starAt(p.longitude).index;
  }
  const asc = natal.ascendant;
  out.Lagna = starAt(asc.signIndex * 30 + asc.degree).index;
  return out;
}

// -----------------------------------------------------------------------------
// Daily rows
// -----------------------------------------------------------------------------

/** One planet over the days of the year, as parallel arrays (index = day). */
export interface DailyStarRow {
  nak: number[];
  pada: number[];
  /** Tara number 1-9 from the birth star. */
  tara: number[];
  /** Special-tara count (1-28) when the day is one of the special taras, else 0. */
  special: number[];
  /** House from the natal Moon. */
  house: number[];
  /** 'g' good, 'b' blocked, 'r' relieved, 'h' hard, '-' for the Moon. */
  verdict: string[];
  /** Natal BAV bindus of the planet in the sign it stands in; -1 for Rahu, Ketu and the Moon's own row. */
  bav: number[];
  /** 1 if the kakshya lord gave the planet a bindu there, 0 if not, -1 when there is no BAV. */
  kakshya: number[];
  /** The kakshya lord ('Saturn', ..., 'Asc'); '' when there is no BAV. */
  kakshyaLord: string[];
}

const VERDICT_CODE: Record<GocharVerdict, string> = { good: 'g', blocked: 'b', relieved: 'r', hard: 'h', none: '-' };

export interface BirthStar {
  longitude: number;
  index: number;
  name: string;
  pada: number;
  lord: string;
  moonSign: number;
}

export function birthStarOf(natal: ChartData): BirthStar {
  const moon = natal.planets.find((p) => p.planet === 'Moon');
  if (!moon) throw new Error('birthStarOf: the chart has no Moon');
  const s = starAt(moon.longitude);
  return { longitude: moon.longitude, index: s.index, name: s.name, pada: s.pada, lord: s.lord, moonSign: moon.signIndex };
}

/** Daily star / tara / gochar / bindu rows for the nine planets, from the context's midday sky. */
export function dailyStarRows(ctx: VarshikContext): Record<string, DailyStarRow> {
  const birth = birthStarOf(ctx.natal);
  const detailed: DetailedBhinnaAshtakavarga[] = calculateBhinnaAshtakavargaDetailed(ctx.natal) as never;
  const planets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  const rows: Record<string, DailyStarRow> = {};
  for (const p of planets) {
    rows[p] = { nak: [], pada: [], tara: [], special: [], house: [], verdict: [], bav: [], kakshya: [], kakshyaLord: [] };
  }
  for (const day of ctx.days) {
    const signs: Record<string, number> = {};
    for (const p of planets) {
      const lon = day.lon[p as keyof typeof day.lon];
      if (lon !== undefined) signs[p] = signIndexOf(lon);
    }
    for (const p of planets) {
      const lon = day.lon[p as keyof typeof day.lon];
      const r = rows[p]!;
      if (lon === undefined) throw new Error(`dailyStarRows: no ${p} longitude on a day`);
      const s = starAt(lon);
      const g = gocharFromMoon(p, signs, birth.moonSign);
      r.nak.push(s.index);
      r.pada.push(s.pada);
      r.tara.push(taraFromBirth(birth.index, s.index).n);
      r.special.push(specialTaraOf(birth.longitude, lon)?.n ?? 0);
      r.house.push(g.house);
      r.verdict.push(VERDICT_CODE[g.verdict]);
      const bavRow = ctx.bav[p];
      if (bavRow) {
        r.bav.push(bavRow[signs[p]!]!);
        const k = checkKakshyaBindu(p, lon, detailed);
        r.kakshya.push(k.kakshyaLordHasBindu ? 1 : 0);
        r.kakshyaLord.push(k.kakshya.kakshyaLord);
      } else {
        r.bav.push(-1);
        r.kakshya.push(-1);
        r.kakshyaLord.push('');
      }
    }
  }
  return rows;
}

// -----------------------------------------------------------------------------
// Dated events: segments, crossings, Moorti
// -----------------------------------------------------------------------------

export interface StarSegment {
  planet: string;
  fromMs: number;
  toMs: number;
  nak: number;
  nakName: string;
  /** The planet is retrograde when it enters the star. */
  retroAtEntry: boolean;
  starLord: string;
  starLordRole: StarLordRole;
  tara: TaraRow;
  special: SpecialTara | null;
  /** Natal points that sit in this very star ("Sun crossing your natal Jupiter's star"). */
  natalPointsHere: string[];
}

export interface MoonStarSegment {
  fromMs: number;
  toMs: number;
  nak: number;
  nakName: string;
  tara: TaraRow;
  special: SpecialTara | null;
  /** Moon's house from the natal Moon (the Chandra bala house) at the start of the stretch. */
  houseFromNatalMoon: number;
}

export interface MoortiRow {
  planet: string;
  atMs: number;
  fromSign: string;
  toSign: string;
  /** The transit Moon's house from the natal Moon at that moment. */
  moonHouse: number;
  moorti: MoortiName;
  metal: string;
  quality: string;
}

export interface SensitiveCrossing {
  planet: string;
  fromMs: number;
  toMs: number;
  nak: number;
  nakName: string;
  special: SpecialTara | null;
  natalPointsHere: string[];
}

export interface NakshatraTransitFacts {
  year: number;
  birthStar: BirthStar;
  daily: Record<string, DailyStarRow>;
  segments: StarSegment[];
  moonStars: MoonStarSegment[];
  /** Segments of the non-Moon planets that are a special tara, or sit in a natal planet's star. */
  sensitive: SensitiveCrossing[];
  moorti: MoortiRow[];
  /** Sign changes of the Moon, kept so Moorti and Chandra bala can be re-derived. */
  moonSignChanges: Array<{ atMs: number; toSign: string }>;
  sources: Record<string, string>;
}

/** Cut one planet's star changes into dated segments covering [fromMs, toMs]. Pure. */
export function segmentsFromChanges(
  planet: string,
  startNak: number,
  startRetro: boolean,
  changes: Array<{ atMs: number; nak: number; retro: boolean }>,
  fromMs: number,
  toMs: number,
): Array<{ planet: string; fromMs: number; toMs: number; nak: number; retroAtEntry: boolean }> {
  const out: Array<{ planet: string; fromMs: number; toMs: number; nak: number; retroAtEntry: boolean }> = [];
  let cur = { planet, fromMs, nak: startNak, retroAtEntry: startRetro };
  for (const c of [...changes].sort((a, b) => a.atMs - b.atMs)) {
    if (c.atMs <= fromMs || c.atMs >= toMs) continue;
    out.push({ ...cur, toMs: c.atMs });
    cur = { planet, fromMs: c.atMs, nak: c.nak, retroAtEntry: c.retro };
  }
  out.push({ ...cur, toMs });
  return out;
}

const nakIndexByName = (name: string): number => NAKSHATRAS.indexOf(name as never);

/**
 * Everything the ephemeris is needed for: the star changes of the eight planets, the Moon's star and sign
 * changes, and the Moon's house at each planet's sign change. `ctx` supplies the natal chart and the year's
 * day boundaries; positions at the window ends come from the ephemeris.
 */
export async function buildNakshatraTransits(ctx: VarshikContext): Promise<NakshatraTransitFacts> {
  const natal = ctx.natal;
  const birth = birthStarOf(natal);
  const fromMs = ctx.dayStartMs[0]!;
  const toMs = ctx.dayStartMs[ctx.dayStartMs.length - 1]!;
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const natalStars = natalStarMap(natal);
  const natalPointsIn = (nak: number) => Object.keys(natalStars).filter((k) => natalStars[k] === nak);

  const startPos = await calculatePlanetPositions(jdFromDate(from));
  const at = (planet: string) => startPos.find((p) => p.planet === planet)!;

  const changes: NakshatraChange[] = await findNakshatraChanges(from, to, N.starPlanets);
  const segments: StarSegment[] = [];
  for (const planet of N.starPlanets) {
    const p0 = at(planet);
    const mine = changes
      .filter((c) => c.planet === planet)
      .map((c) => ({ atMs: c.exactAt.getTime(), nak: nakIndexByName(c.toNakshatra), retro: c.isRetrograde }));
    for (const seg of segmentsFromChanges(planet, p0.nakshatraIndex, p0.isRetrograde, mine, fromMs, toMs)) {
      // Longitude at the middle of the stretch is not needed: the star's centre stands for it in the
      // special-tara count, which only depends on the star (the ring position of its middle).
      const mid = seg.nak * NAK_SPAN + NAK_SPAN / 2;
      const lord = NAKSHATRA_LORDS[seg.nak]!;
      segments.push({
        planet,
        fromMs: seg.fromMs,
        toMs: seg.toMs,
        nak: seg.nak,
        nakName: NAKSHATRAS[seg.nak]!,
        retroAtEntry: seg.retroAtEntry,
        starLord: lord,
        starLordRole: starLordRole(natal, lord),
        tara: taraFromBirth(birth.index, seg.nak),
        special: specialTaraOf(birth.longitude, mid),
        natalPointsHere: natalPointsIn(seg.nak),
      });
    }
  }
  segments.sort((a, b) => a.fromMs - b.fromMs || a.planet.localeCompare(b.planet));

  // Moon: star and sign changes. The Moon's stretches come from its own change list.
  const moonChanges = await findMoonChanges(from, to);
  const moon0 = at('Moon');
  const moonStarChanges = moonChanges.filter((c) => c.kind === 'nakshatra');
  const moonSignChanges = moonChanges.filter((c) => c.kind === 'sign');
  const moonSegs = segmentsFromChanges(
    'Moon',
    moon0.nakshatraIndex,
    false,
    moonStarChanges.map((c) => ({ atMs: c.exactAt.getTime(), nak: c.toIndex, retro: false })),
    fromMs,
    toMs,
  );
  const signAtMs = (ms: number, startSign: number): number => {
    let s = startSign;
    for (const c of moonSignChanges) {
      if (c.exactAt.getTime() <= ms) s = c.toIndex;
      else break;
    }
    return s;
  };
  const moonStars: MoonStarSegment[] = moonSegs.map((s) => ({
    fromMs: s.fromMs,
    toMs: s.toMs,
    nak: s.nak,
    nakName: NAKSHATRAS[s.nak]!,
    tara: taraFromBirth(birth.index, s.nak),
    special: specialTaraOf(birth.longitude, s.nak * NAK_SPAN + NAK_SPAN / 2),
    houseFromNatalMoon: houseFromSign(birth.moonSign, signAtMs(s.fromMs, moon0.signIndex)),
  }));

  // Moorti at each sign change of a planet: the transit Moon's house from the natal Moon at that moment.
  const ingress = (await findTransitEvents(from, to)).filter((e) => e.eventType === 'ingress');
  const moorti: MoortiRow[] = [];
  for (const e of ingress) {
    const moonSign = signAtMs(e.exactAt.getTime(), moon0.signIndex);
    const moonHouse = houseFromSign(birth.moonSign, moonSign);
    const m = moortiOf(moonHouse);
    moorti.push({
      planet: e.planet,
      atMs: e.exactAt.getTime(),
      fromSign: e.fromSign,
      toSign: e.toSign ?? '',
      moonHouse,
      moorti: m.name,
      metal: m.metal,
      quality: m.quality,
    });
  }

  const sensitive: SensitiveCrossing[] = segments
    .filter((s) => s.special !== null || s.natalPointsHere.length > 0)
    .map((s) => ({
      planet: s.planet,
      fromMs: s.fromMs,
      toMs: s.toMs,
      nak: s.nak,
      nakName: s.nakName,
      special: s.special,
      natalPointsHere: s.natalPointsHere,
    }));

  return {
    year: ctx.year,
    birthStar: birth,
    daily: dailyStarRows(ctx),
    segments,
    moonStars,
    sensitive,
    moorti,
    moonSignChanges: moonSignChanges.map((c) => ({ atMs: c.exactAt.getTime(), toSign: c.to })),
    sources: {
      goodHousesAndVedha: 'Phaladeepika ch. 26, v. 3-8 (siva.sh/phaladeepika/26)',
      vipreetVedha: 'Gochara and Vedha, Vedic Astrology Blog (blog.indianastrologysoftware.com/?p=210)',
      tara: 'vijayalur.com/2011/10/02/tarabala/',
      specialTaras: 'shrifreedom.org/vedic-astrology/navatara-chakra/',
      moorti: 'vijayalur.com/2011/04/22/moorti-nirnaya/',
      kakshya: 'astro-tools/kakshya.ts (compartment lords Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon, Lagna)',
    },
  };
}
