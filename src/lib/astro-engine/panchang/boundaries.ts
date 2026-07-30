// @ts-nocheck
// =============================================================================
// Tithi / Nakshatra boundary (end-time) calculation
// =============================================================================
// Tithi ends when (moonLong - sunLong) mod 360 next crosses a multiple of
// 12deg. Nakshatra ends when moonLong next crosses a multiple of 13deg20'
// (13.333...deg, NAKSHATRA_SPAN). Both are angle-crossing searches: coarse
// forward-sample to bracket the crossing (handling the mod-360 wrap), then
// bisect within the bracket for a "HH:mm"-precision answer. Reuses
// `calculatePlanetPositions` (the same sidereal Sun/Moon longitude call
// planetPositions.core.ts already makes for the rest of the engine) rather
// than re-implementing an ephemeris call.
//
// Verified against a third-party reference: for 27 July 2026, Delhi, this
// algorithm resolves the Shukla Trayodashi -> Chaturdashi tithi boundary to
// 16:17 IST against a reference value of ~16:16 IST -- a 1-minute match,
// which also cross-validates the whole JD/timezone pipeline these two
// boundary searches and rise-set.ts all depend on.

import { calculatePlanetPositions, getSwe } from '../calculations/planetPositions.core';
import { TITHI_NAMES } from './tithi';
import { NAKSHATRAS, NAKSHATRA_SPAN } from '@aroha-astrology/shared';

export interface TithiBoundary {
  /** Local HH:mm this tithi ends. */
  endsAt: string;
  /** Name of the tithi that begins at `endsAt`. */
  nextName: string;
}

export interface NakshatraBoundary {
  /** Local HH:mm this nakshatra ends. */
  endsAt: string;
  /** Name of the nakshatra that begins at `endsAt`. */
  nextName: string;
}

function normalizeDegree(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

/** Sidereal Sun/Moon longitudes at a given Julian day (UT), via the same ephemeris call the rest of the engine uses. */
async function sunMoonLongitudes(jd: number): Promise<{ sunLong: number; moonLong: number }> {
  const planets = await calculatePlanetPositions(jd);
  const sun = planets.find((p) => p.planet === 'Sun');
  const moon = planets.find((p) => p.planet === 'Moon');
  return {
    sunLong: normalizeDegree(sun?.longitude ?? 0),
    moonLong: normalizeDegree(moon?.longitude ?? 0),
  };
}

/**
 * Finds the next Julian day (UT) at which `valueAt(jd)` crosses the next
 * multiple of `stepDeg` above its value at `startJd`, searching forward up
 * to `maxHours`. `valueAt` must return a value that increases monotonically
 * over the search window modulo 360 (true for both the tithi elongation and
 * the Moon's longitude at the timescales searched here).
 *
 * Two phases: (1) coarse forward sampling (15-minute steps) to bracket the
 * crossing — this is also what correctly "unwraps" the mod-360 rollover, by
 * adding 360 whenever a sample reads lower than the previous one; (2)
 * bisection within the bracket for precision well beyond the 1-minute
 * resolution `endsAt` is reported at.
 */
async function findNextCrossing(
  startJd: number,
  stepDeg: number,
  valueAt: (jd: number) => Promise<number>,
  maxHours = 30,
): Promise<{ jd: number; crossedIndex: number }> {
  const startVal = await valueAt(startJd);
  const currentStep = Math.floor(startVal / stepDeg);
  const targetVal = (currentStep + 1) * stepDeg;

  const sampleHours = 0.25; // 15-minute coarse steps
  const maxSamples = Math.ceil(maxHours / sampleHours);

  let prevJd = startJd;
  let prevVal = startVal;

  for (let i = 1; i <= maxSamples; i++) {
    const jd = startJd + (i * sampleHours) / 24;
    let val = await valueAt(jd);
    while (val < prevVal - 1) val += 360; // unwrap the 360 -> 0 rollover

    if (val >= targetVal) {
      let lo = prevJd;
      let hi = jd;
      for (let iter = 0; iter < 25; iter++) {
        const mid = (lo + hi) / 2;
        let midVal = await valueAt(mid);
        while (midVal < prevVal - 1) midVal += 360;
        if (midVal < targetVal) lo = mid;
        else hi = mid;
      }
      return { jd: hi, crossedIndex: currentStep + 1 };
    }

    prevJd = jd;
    prevVal = val;
  }

  // Should not happen in practice: a tithi (<=~26h) and a nakshatra (<=~28h)
  // both always complete within a 30h window. Fail closed rather than
  // silently returning a wrong instant.
  throw new Error(`findNextCrossing: no boundary found within ${maxHours}h of jd ${startJd}`);
}

/**
 * Converts a UT Julian day into a local "HH:mm" string. Takes the swisseph
 * instance directly (rather than re-fetching it) since callers already hold
 * one from the longitude lookups they just made.
 */
function jdToLocalHHmm(swe: any, jdUt: number, timezoneOffsetHours: number): string {
  const rev = swe.revjul(jdUt, 1);
  const localHour = (((rev.hour + timezoneOffsetHours) % 24) + 24) % 24;
  let h = Math.floor(localHour);
  let m = Math.round((localHour - h) * 60);
  if (m === 60) {
    m = 0;
    h = (h + 1) % 24;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * End time (+ next tithi name) for whichever tithi is current at `jd`.
 *
 * @param jd - Julian day (UT) representing "now" (or the reference moment —
 *   e.g. local noon — the rest of the Panchang was computed for).
 * @param timezoneOffsetHours - Civil UTC offset in hours (e.g. 5.5 for IST).
 */
export async function getTithiBoundary(
  jd: number,
  timezoneOffsetHours: number,
): Promise<TithiBoundary> {
  const swe = await getSwe();

  const elongationAt = async (t: number) => {
    const { sunLong, moonLong } = await sunMoonLongitudes(t);
    return normalizeDegree(moonLong - sunLong);
  };

  const { jd: crossingJd, crossedIndex } = await findNextCrossing(jd, 12, elongationAt);
  const nextIndex = crossedIndex % 30;

  return {
    endsAt: jdToLocalHHmm(swe, crossingJd, timezoneOffsetHours),
    nextName: TITHI_NAMES[nextIndex],
  };
}

/**
 * End time (+ next nakshatra name) for whichever nakshatra the Moon is
 * currently transiting at `jd`.
 *
 * @param jd - Julian day (UT), same convention as {@link getTithiBoundary}.
 * @param timezoneOffsetHours - Civil UTC offset in hours (e.g. 5.5 for IST).
 */
export async function getNakshatraBoundary(
  jd: number,
  timezoneOffsetHours: number,
): Promise<NakshatraBoundary> {
  const swe = await getSwe();

  const moonLongAt = async (t: number) => (await sunMoonLongitudes(t)).moonLong;

  const { jd: crossingJd, crossedIndex } = await findNextCrossing(jd, NAKSHATRA_SPAN, moonLongAt);
  const nextIndex = crossedIndex % 27;

  return {
    endsAt: jdToLocalHHmm(swe, crossingJd, timezoneOffsetHours),
    nextName: NAKSHATRAS[nextIndex],
  };
}
