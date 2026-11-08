// =============================================================================
// Varshik Rashifal 2027 — everything the scorer needs, gathered once
// =============================================================================
// All the ephemeris work (the two Varsha years, the 365 daily sky positions, Saham windows,
// natal Ashtakavarga and the natal dasha timeline) happens here, once, and lands in a plain
// JSON-safe `VarshikContext`. varshik-2027.ts then scores it with no I/O, so it is fast,
// repeatable, and can be run over hundreds of charts in the calibration script.
// =============================================================================

import { jdFromDate } from '../../astro-tools/transit-events.js';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { Ayanamsa, ChartData, Planet } from '@aroha-astrology/shared';
import { calculatePlanetPositions } from '../calculations/planetPositions.js';
import {
  calculateBhinnaAshtakavarga,
  calculateSarvaAshtakavarga,
} from '../calculations/ashtakavarga.js';
import { buildSubPeriods, calculateVimshottariDasha, fullSpanOf } from '../dashas/vimshottari.js';
import {
  computeCalendarYearVarshphal,
  type CalendarYearInputs,
  type CalendarYearVarshphal,
} from '../varshphal/calendar-year.js';
import { computeSahamWindows, type PositionsAt, type SahamWindow } from '../varshphal/saham-windows.js';
import { buildNakshatraTransits, type NakshatraTransitFacts } from './nakshatra-transits.js';

export interface DashaSegment {
  startMs: number;
  endMs: number;
  maha: Planet;
  antar: Planet;
  praty: Planet;
}

export interface TransitDay {
  /** Midday in the reader's zone, UT ms. */
  atMs: number;
  /** Sidereal longitude of each planet that day. */
  lon: Partial<Record<Planet, number>>;
  retro: Partial<Record<Planet, boolean>>;
}

export interface VarshikContext {
  year: number;
  timezone: string;
  /** The natal chart (Lagna, planets, signs). */
  natal: ChartData;
  birthMs: number;
  /** Natal Bhinna Ashtakavarga bindus per planet (12 signs) and the Sarva total. */
  bav: Record<string, number[]>;
  sav: number[];
  /** The two (or one) Varsha years covering the calendar year. */
  calendar: CalendarYearVarshphal;
  /** One entry per calendar day of the year, from 1 January. */
  days: TransitDay[];
  /** Start of each day (reader's zone), UT ms; days[i] is sampled at its middle. */
  dayStartMs: number[];
  /** Calendar month (0-11) of each day in the reader's zone. */
  monthOfDay: number[];
  /** Natal Maha / Antar / Pratyantar lord over the year, as flat segments. */
  natalDasha: DashaSegment[];
  /**
   * Daily midday positions of the four slow planets from 18+ months before the year to the end of
   * year + 2 (for relief timelines, which look back and ahead). Not used by the daily scorer.
   */
  slowSky: Array<{ atMs: number; lon: Partial<Record<Planet, number>> }>;
  sahamWindows: SahamWindow[];
  /**
   * C1/C3: the dated star events of the year (star segments, sensitive crossings, Moorti, the Moon's stars). The daily rows are
   * not stored (they are worked out from `days` by dailyStarRows). Absent in contexts built before C3.
   */
  stars?: Omit<NakshatraTransitFacts, 'daily'>;
}

const MS_PER_DAY = 86_400_000;
/** About 24 months, so an 18-month look-back always has sky data behind it. */
const SLOW_LOOKBACK_DAYS = 730;

/** The instant 00:00 on a calendar date in `timezone`. */
function zonedDateStartMs(
  y: number,
  m: number,
  d: number,
  zoneOffset: (ms: number) => number,
): number {
  const wall = Date.UTC(y, m - 1, d);
  let guess = wall - zoneOffset(wall);
  guess = wall - zoneOffset(guess);
  return guess;
}

export interface BuildVarshikArgs {
  inputs: CalendarYearInputs;
  /** The natal chart, as the rest of the app holds it. */
  natal: ChartData;
  year: number;
  /** Injectable for tests; defaults to the ephemeris. */
  positionsAt?: PositionsAt;
  ayanamsa?: Ayanamsa;
}

/** Natal Maha / Antar / Pratyantar lords as flat segments covering [fromMs, toMs]. */
function natalDashaSegments(
  moonLongitude: number,
  birthMs: number,
  fromMs: number,
  toMs: number,
): DashaSegment[] {
  const birth = new Date(birthMs);
  const tree = calculateVimshottariDasha(moonLongitude, birth, new Date(fromMs));
  const out: DashaSegment[] = [];
  for (const maha of tree.mahadashas) {
    if (maha.endDate.getTime() <= fromMs || maha.startDate.getTime() >= toMs) continue;
    const span = fullSpanOf(maha);
    // Antar and Pratyantar for this Maha, cut from its full length (the birth period began before birth).
    const antars = buildSubPeriods(maha.planet, span.start, span.years, 1, new Date(fromMs), 2, true);
    for (const antar of antars) {
      for (const praty of antar.subPeriods) {
        const startMs = Math.max(praty.startDate.getTime(), maha.startDate.getTime());
        const endMs = Math.min(praty.endDate.getTime(), maha.endDate.getTime());
        if (endMs <= fromMs || startMs >= toMs || endMs <= startMs) continue;
        out.push({ startMs, endMs, maha: maha.planet, antar: antar.planet, praty: praty.planet });
      }
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

export async function buildVarshikContext(args: BuildVarshikArgs): Promise<VarshikContext> {
  const { inputs, natal, year } = args;
  const ayanamsa = args.ayanamsa ?? inputs.ayanamsa ?? 'lahiri';
  const tz = inputs.timezone;

  const calendar = await computeCalendarYearVarshphal(inputs, year);

  // Day boundaries in the reader's zone: DST makes a day 23 or 25 hours, so each is cut on its own.
  const zoneOffset = (ms: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return (
      Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) -
      Math.floor(ms / 1000) * 1000
    );
  };

  const dayStartMs: number[] = [];
  const monthOfDay: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const dim = new Date(Date.UTC(year, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) {
      dayStartMs.push(zonedDateStartMs(year, m, d, zoneOffset));
      monthOfDay.push(m - 1);
    }
  }
  dayStartMs.push(calendar.windowEndMs);

  const positionsAt: PositionsAt =
    args.positionsAt ??
    (async (jd) => {
      const positions = await calculatePlanetPositions(jd, ayanamsa);
      return Object.fromEntries(positions.map((p) => [p.planet, p.longitude]));
    });

  const days: TransitDay[] = [];
  for (let i = 0; i < dayStartMs.length - 1; i++) {
    const atMs = Math.round((dayStartMs[i]! + dayStartMs[i + 1]!) / 2);
    const jd = jdFromDate(new Date(atMs));
    if (args.positionsAt) {
      days.push({ atMs, lon: (await positionsAt(jd)), retro: {} });
    } else {
      const positions = await calculatePlanetPositions(jd, ayanamsa);
      days.push({
        atMs,
        lon: Object.fromEntries(positions.map((p) => [p.planet, p.longitude])),
        retro: Object.fromEntries(positions.map((p) => [p.planet, p.isRetrograde])),
      });
    }
  }

  // Saham windows for each Varsha year, over the part of it inside the calendar year.
  const sahamWindows: SahamWindow[] = [];
  for (const slice of calendar.varshaYears) {
    sahamWindows.push(
      ...(await computeSahamWindows({
        sahams: slice.varshphal.sahams,
        yearLord: slice.varshphal.varsheshwara.varsheshwara,
        munthaLord: munthaLordOf(slice.varshphal.muntha.signIndex),
        fromMs: slice.clippedStartMs,
        toMs: slice.clippedEndMs,
        positionsAt: args.positionsAt,
        ayanamsa,
      })),
    );
  }

  const bhinna = calculateBhinnaAshtakavarga(natal);
  const sarva = calculateSarvaAshtakavarga(bhinna);
  const bav: Record<string, number[]> = {};
  for (const b of bhinna) bav[b.planet] = b.bindus;

  const moon = natal.planets.find((p) => p.planet === 'Moon')!;

  // The look-back and look-ahead: from SLOW_LOOKBACK_DAYS before the year to the end of year + 2.
  const slowFromMs = Date.UTC(year, 0, 1, 12) - SLOW_LOOKBACK_DAYS * MS_PER_DAY;
  const slowToMs = Date.UTC(year + 2, 11, 31, 12);
  const slowSky: VarshikContext['slowSky'] = [];
  for (let t = slowFromMs; t <= slowToMs; t += MS_PER_DAY) {
    const positions = await calculatePlanetPositions(jdFromDate(new Date(t)), ayanamsa);
    const lon: Partial<Record<Planet, number>> = {};
    for (const p of positions) {
      if (p.planet === 'Saturn' || p.planet === 'Jupiter' || p.planet === 'Rahu' || p.planet === 'Ketu') {
        lon[p.planet] = p.longitude;
      }
    }
    slowSky.push({ atMs: t, lon });
  }

  const ctx: VarshikContext = {
    year,
    timezone: tz,
    natal,
    birthMs: inputs.birthDate.getTime(),
    bav,
    sav: sarva.bindus,
    calendar,
    days,
    dayStartMs,
    monthOfDay,
    natalDasha: natalDashaSegments(
      moon.longitude,
      inputs.birthDate.getTime(),
      slowFromMs,
      slowToMs,
    ),
    slowSky,
    sahamWindows,
  };
  // The dated star events need the finished context (natal chart, day boundaries) and the ephemeris once more.
  if (!args.positionsAt) {
    const { daily: _daily, ...stars } = await buildNakshatraTransits(ctx);
    ctx.stars = stars;
  }
  return ctx;
}

/** The lord of a sign by index. */
export function munthaLordOf(signIndex: number): string {
  return SIGN_LORDS[ZODIAC_SIGNS[((signIndex % 12) + 12) % 12]!] ?? 'Sun';
}

export { MS_PER_DAY };
