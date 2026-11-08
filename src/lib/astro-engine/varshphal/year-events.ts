// =============================================================================
// Sky events of a year: ingresses, stations, combustion in and out, and eclipses
// =============================================================================
// Composed from what the engine already has: findTransitEvents (ingresses and stations, daily
// scan refined to the minute) and eclipsesBetween (the Swiss Ephemeris global eclipse search).
// The one new piece is combustion, found by a daily scan of each planet's angular distance
// from the Sun and refined by bisection.
//
// Eclipses carry their type, magnitude and contacts (C5); the 2027 set is checked against NASA and
// drikpanchang in test/varshik-c5.spec.ts.
// =============================================================================

import type { Ayanamsa } from '@aroha-astrology/shared';
import { eclipsesBetween, type EclipseEvent } from '../panchang/eclipse.js';
import { dateFromJd, findTransitEvents, jdFromDate } from '../../astro-tools/transit-events.js';
import { calculatePlanetPositions } from '../calculations/planetPositions.js';
import { COMBUST_ORB } from './tajika-yogas.js';

export type YearEventKind =
  | 'ingress'
  | 'station-retrograde'
  | 'station-direct'
  | 'combust-in'
  | 'combust-out'
  | 'eclipse-solar'
  | 'eclipse-lunar';

export interface YearEvent {
  kind: YearEventKind;
  /** Absent for eclipses. */
  planet?: string;
  atMs: number;
  /** Ingress: the signs left and entered. Station: the sign it stands in. */
  fromSign?: string;
  toSign?: string | null;
  /** Eclipses: type, magnitude and contacts (C5). */
  eclipse?: EclipseEvent;
}

const COMBUSTIBLE = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const;

function separation(positions: Array<{ planet: string; longitude: number }>, planet: string): number {
  const sun = positions.find((p) => p.planet === 'Sun')!.longitude;
  const body = positions.find((p) => p.planet === planet)!.longitude;
  const d = Math.abs(body - sun) % 360;
  return d > 180 ? 360 - d : d;
}

/** Combustion in and out of Mercury, Venus, Mars, Jupiter and Saturn between two instants. */
export async function findCombustionEvents(
  fromMs: number,
  toMs: number,
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<YearEvent[]> {
  const out: YearEvent[] = [];
  const jdEnd = jdFromDate(new Date(toMs));
  let jdPrev = jdFromDate(new Date(fromMs));
  let prev = await calculatePlanetPositions(jdPrev, ayanamsa);

  for (let jd = jdPrev + 1; jd < jdEnd + 1; jd += 1) {
    const jdNow = Math.min(jd, jdEnd);
    const curr = await calculatePlanetPositions(jdNow, ayanamsa);
    for (const planet of COMBUSTIBLE) {
      const orb = COMBUST_ORB[planet]!;
      const was = separation(prev, planet) <= orb;
      const is = separation(curr, planet) <= orb;
      if (was === is) continue;

      // Bisect to the crossing of the orb.
      let lo = jdPrev;
      let hi = jdNow;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const inside = separation(await calculatePlanetPositions(mid, ayanamsa), planet) <= orb;
        if (inside === was) lo = mid;
        else hi = mid;
      }
      out.push({ kind: is ? 'combust-in' : 'combust-out', planet, atMs: dateFromJd(hi).getTime() });
    }
    prev = curr;
    jdPrev = jdNow;
  }
  return out;
}

/** Every sky event between two instants, in time order. */
export async function computeYearEvents(
  fromMs: number,
  toMs: number,
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<YearEvent[]> {
  const events: YearEvent[] = [];

  // findTransitEvents reads the ephemeris with the default Lahiri ayanamsa; ingress dates
  // depend on it, so a non-default ayanamsa is refused rather than answered wrongly.
  if (ayanamsa !== 'lahiri') {
    throw new Error('computeYearEvents: ingresses are only available for the Lahiri ayanamsa');
  }
  for (const e of await findTransitEvents(new Date(fromMs), new Date(toMs))) {
    events.push({
      kind: e.eventType === 'ingress' ? 'ingress' : e.eventType === 'retrograde' ? 'station-retrograde' : 'station-direct',
      planet: e.planet,
      atMs: e.exactAt.getTime(),
      fromSign: e.fromSign,
      toSign: e.toSign,
    });
  }

  events.push(...(await findCombustionEvents(fromMs, toMs, ayanamsa)));

  for (const e of await eclipsesBetween(new Date(fromMs), new Date(toMs))) {
    events.push({ kind: e.kind === 'solar' ? 'eclipse-solar' : 'eclipse-lunar', atMs: e.at.getTime(), eclipse: e });
  }

  return events.sort((a, b) => a.atMs - b.atMs);
}
