// =============================================================================
// Moon sign and nakshatra changes
// =============================================================================
// transit-events.ts deliberately leaves the Moon out (too frequent for push
// alerts). The daily Astro Weather and the Calendar need exactly those
// moments — "Moon changes sign at 6:18 PM" — so they live here, found the same
// way: sample, then bisect to the minute against the bundled Swiss Ephemeris
// (Lahiri sidereal, same as every other screen).
// =============================================================================

import type { PlanetPosition } from '@aroha-astrology/shared';
import { calculatePlanetPositions } from '../astro-engine/calculations/planetPositions.js';
import { dateFromJd, istDateString, jdFromDate, refine } from './transit-events.js';

export type MoonChangeKind = 'sign' | 'nakshatra';

export interface MoonChange {
  kind: MoonChangeKind;
  /** Sign or nakshatra name the Moon is leaving. */
  from: string;
  /** Sign or nakshatra name the Moon is entering. */
  to: string;
  /** 0-based index of `to` (0-11 for signs, 0-26 for nakshatras). */
  toIndex: number;
  /** The moment of the change, to roughly the minute. */
  exactAt: Date;
  /** IST calendar date of `exactAt`, as YYYY-MM-DD. */
  forDate: string;
}

/**
 * Sampling step, in days. The Moon moves at most ~15.4° a day, so 6 hours is
 * under 4° — well inside one nakshatra (13°20′), so no change can be skipped.
 */
const STEP_DAYS = 0.25;

function moonOf(positions: PlanetPosition[]): PlanetPosition {
  const moon = positions.find((p) => p.planet === 'Moon');
  if (!moon) throw new Error('Moon missing from planet positions');
  return moon;
}

/**
 * Every Moon sign change and/or nakshatra change in `[from, to)`, in
 * chronological order.
 */
export async function findMoonChanges(
  from: Date,
  to: Date,
  kinds: readonly MoonChangeKind[] = ['sign', 'nakshatra'],
): Promise<MoonChange[]> {
  const wantSign = kinds.includes('sign');
  const wantNakshatra = kinds.includes('nakshatra');
  const events: MoonChange[] = [];

  const jdEnd = jdFromDate(to);
  let jdPrev = jdFromDate(from);
  let prev = moonOf(await calculatePlanetPositions(jdPrev));

  while (jdPrev < jdEnd) {
    const jdNext = Math.min(jdPrev + STEP_DAYS, jdEnd);
    const next = moonOf(await calculatePlanetPositions(jdNext));

    if (wantSign && next.signIndex !== prev.signIndex) {
      const prevSign = prev.signIndex;
      const jd = await refine(jdPrev, jdNext, (p) => moonOf(p).signIndex === prevSign);
      const exactAt = dateFromJd(jd);
      events.push({
        kind: 'sign',
        from: prev.sign,
        to: next.sign,
        toIndex: next.signIndex,
        exactAt,
        forDate: istDateString(exactAt),
      });
    }
    if (wantNakshatra && next.nakshatraIndex !== prev.nakshatraIndex) {
      const prevNak = prev.nakshatraIndex;
      const jd = await refine(jdPrev, jdNext, (p) => moonOf(p).nakshatraIndex === prevNak);
      const exactAt = dateFromJd(jd);
      events.push({
        kind: 'nakshatra',
        from: prev.nakshatra,
        to: next.nakshatra,
        toIndex: next.nakshatraIndex,
        exactAt,
        forDate: istDateString(exactAt),
      });
    }

    prev = next;
    jdPrev = jdNext;
  }

  return events.sort((a, b) => a.exactAt.getTime() - b.exactAt.getTime());
}
