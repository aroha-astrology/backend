// =============================================================================
// Calendar-year Varshphal — January to December in the reader's own time zone
// =============================================================================
// A calendar year is covered by two Varsha years (the one that began at last year's solar
// return and the one that begins at this year's), occasionally by one. This module finds the
// solar returns around the year, builds the Varsha chart and the Mudda dasha of each Varsha
// year that overlaps the window, and records the part of each that falls inside it.
//
// Every solar return is computed ONCE (findSolarReturnJd) and that one millisecond value is
// used both as the end of one Varsha year and the start of the next, so the Mudda seam is an
// exact equality. computeVarshphal is reused as it is and not rewritten.
// =============================================================================

import { dateFromJd } from '../../astro-tools/transit-events.js';
import type { Ayanamsa, HouseSystem } from '@aroha-astrology/shared';
import { computeVarshphal, type VarshphalResult } from './index.js';
import { findSolarReturnJd } from './solarReturn.js';
import { computeMuddaDasha, type MuddaPeriod } from './mudda-dasha.js';

export interface CalendarYearInputs {
  natalSunLongitude: number;
  natalAscSignIndex: number;
  /** The birth instant (UT). */
  birthDate: Date;
  /** The Moon's birth nakshatra, 0 (Ashwini) to 26 (Revati). */
  birthNakshatraIndex: number;
  latitude: number;
  longitude: number;
  /** IANA zone the calendar year is cut in, e.g. 'Asia/Kolkata'. */
  timezone: string;
  ayanamsa?: Ayanamsa;
  houseSystem?: HouseSystem;
}

export interface VarshaYearSlice {
  /** The calendar year the solar return that opens this Varsha year falls in (UT). */
  targetYear: number;
  completedYears: number;
  /** The exact solar returns that bound the Varsha year. */
  startMs: number;
  endMs: number;
  /** The part inside the calendar-year window. */
  clippedStartMs: number;
  clippedEndMs: number;
  varshphal: VarshphalResult;
  mudda: MuddaPeriod[];
}

export interface CalendarYearVarshphal {
  year: number;
  timezone: string;
  windowStartMs: number;
  windowEndMs: number;
  varshaYears: VarshaYearSlice[];
}

/** Offset of `timezone` from UT at `ms`, in ms (positive east). */
export function zoneOffsetMs(ms: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant 00:00 on 1 January of `year` in `timezone`, in ms. */
export function zonedYearStartMs(year: number, timezone: string): number {
  const wall = Date.UTC(year, 0, 1);
  let guess = wall - zoneOffsetMs(wall, timezone);
  // A second pass settles the zones whose offset at the guess differs from the offset at `wall`.
  guess = wall - zoneOffsetMs(guess, timezone);
  return guess;
}

/**
 * Varshphal for the calendar `year` (e.g. 2027): the Varsha chart and Mudda dasha of every
 * Varsha year that overlaps January to December in the reader's time zone.
 */
export async function computeCalendarYearVarshphal(
  inputs: CalendarYearInputs,
  year: number,
): Promise<CalendarYearVarshphal> {
  const { birthDate, birthNakshatraIndex, timezone } = inputs;
  const windowStartMs = zonedYearStartMs(year, timezone);
  const windowEndMs = zonedYearStartMs(year + 1, timezone);

  // One solar return per target year, year-2 .. year+2, each found once.
  const first = year - 2;
  const last = year + 2;
  const returnMs = new Map<number, number>();
  for (let t = first; t <= last; t++) {
    const jd = await findSolarReturnJd(
      inputs.natalSunLongitude,
      birthDate,
      t,
      inputs.ayanamsa ?? 'lahiri',
    );
    returnMs.set(t, dateFromJd(jd).getTime());
  }

  const varshaYears: VarshaYearSlice[] = [];
  for (let t = first; t < last; t++) {
    const startMs = returnMs.get(t)!;
    const endMs = returnMs.get(t + 1)!;
    if (!(startMs < windowEndMs && endMs > windowStartMs)) continue;

    const varshphal = await computeVarshphal({
      natalSunLongitude: inputs.natalSunLongitude,
      natalAscSignIndex: inputs.natalAscSignIndex,
      birthDate,
      targetYear: t,
      latitude: inputs.latitude,
      longitude: inputs.longitude,
      ayanamsa: inputs.ayanamsa,
      houseSystem: inputs.houseSystem,
    });

    const mudda = computeMuddaDasha({
      nakshatraNumber: birthNakshatraIndex + 1,
      completedYears: varshphal.completedYearsOfAge,
      solarReturnMs: startMs,
      nextSolarReturnMs: endMs,
    });

    varshaYears.push({
      targetYear: t,
      completedYears: varshphal.completedYearsOfAge,
      startMs,
      endMs,
      clippedStartMs: Math.max(startMs, windowStartMs),
      clippedEndMs: Math.min(endMs, windowEndMs),
      varshphal,
      mudda,
    });
  }

  return { year, timezone, windowStartMs, windowEndMs, varshaYears };
}
