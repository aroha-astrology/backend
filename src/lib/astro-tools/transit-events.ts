// =============================================================================
// Transit Event Detection
// =============================================================================
// Finds the calendar moments when a planet changes sign (ingress) or turns
// retrograde/direct (station), computed from the bundled Swiss Ephemeris
// rather than any external transit calendar.
//
// This is deliberately NOT sourced from a downloaded/scraped list: published
// transit calendars are usually tropical, or sidereal against a different
// ayanamsa. Ours is Lahiri sidereal, so an external date would disagree with
// the app's own Kundli / Sade Sati / horoscope pages by days.
// =============================================================================

import type { PlanetPosition } from '@aroha-astrology/shared';
import { calculatePlanetPositions } from '../astro-engine/calculations/planetPositions.js';
import { SIGNS } from './transit.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransitEventType = 'ingress' | 'retrograde' | 'direct';

export interface TransitEvent {
  planet: string;
  eventType: TransitEventType;
  /** Sign the planet is leaving (ingress) or standing in (station). */
  fromSign: string;
  /** Sign the planet is entering. Null for stations — nothing is being entered. */
  toSign: string | null;
  /** The moment the event completes, to roughly the minute. */
  exactAt: Date;
  /** IST calendar date of `exactAt`, as YYYY-MM-DD. */
  forDate: string;
  /** Priority for collision resolution — see selectPushableEvents. */
  weight: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Planets whose sign changes are worth alerting on.
 *
 * The Moon is deliberately excluded: it changes sign every ~2.25 days, which
 * would be ~160 events a year on its own and would drown every other planet.
 */
export const INGRESS_PLANETS: readonly string[] = [
  'Sun',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Rahu',
  'Ketu',
];

/**
 * Planets that can station (turn retrograde or direct).
 *
 * The Sun and Moon never retrograde. Rahu/Ketu are *always* retrograde — Ketu
 * has `isRetrograde: true` hardcoded in planetPositions.core.ts and Rahu's
 * mean-node speed is permanently negative — so scanning them for a flip would
 * silently never fire. Excluded explicitly so that reads as intent, not as an
 * oversight.
 */
export const STATION_PLANETS: readonly string[] = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

/**
 * Collision priority. When several events fall close together only the
 * heaviest is pushed (see selectPushableEvents), so this ordering decides
 * which planet gets the airtime: slow, rare, life-structural planets outrank
 * fast, frequent ones.
 */
export const PLANET_WEIGHT: Record<string, number> = {
  Saturn: 100,
  Jupiter: 90,
  Rahu: 80,
  // Ketu is one point below Rahu rather than equal to it. Ketu is computed as
  // Rahu + 180°, so the two nodes *always* change sign at the same instant and
  // always collide. Making Rahu strictly heavier means the axis shift is
  // reported under one consistent name instead of depending on sort stability.
  Ketu: 79,
  Mars: 60,
  Sun: 40,
  Venus: 30,
  Mercury: 20,
};

const APP_TZ = 'Asia/Kolkata';

/** Unix epoch (1970-01-01T00:00:00Z) as a Julian Day number. */
const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_DAY = 86_400_000;

/**
 * Binary-search depth when narrowing an event to its exact moment. One day
 * halved 14 times is ~5 seconds, comfortably past the "to the minute"
 * precision the copy and scheduling need.
 */
const REFINE_ITERATIONS = 14;

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

export function jdFromDate(date: Date): number {
  return date.getTime() / MS_PER_DAY + JD_UNIX_EPOCH;
}

export function dateFromJd(jd: number): Date {
  return new Date(Math.round((jd - JD_UNIX_EPOCH) * MS_PER_DAY));
}

/** IST calendar date (YYYY-MM-DD) for an instant, independent of server TZ. */
export function istDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * The instant a transit landing on `forDate` should be pushed: two days
 * earlier at 19:00 IST (= 13:30 UTC).
 *
 * Built by subtracting whole days from the UTC midnight of the IST date
 * rather than by Date arithmetic on a local timestamp, so it is unaffected by
 * the server's own timezone. India has no DST, so the +5:30 offset is a
 * constant and this needs no zone table.
 */
export function pushAtForDate(forDate: string, daysBefore = 2): Date {
  const utcMidnight = Date.parse(`${forDate}T00:00:00Z`);
  // 19:00 IST is 13:30 UTC on the same calendar day.
  return new Date(utcMidnight - daysBefore * MS_PER_DAY + 13.5 * 3_600_000);
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function positionOf(positions: PlanetPosition[], planet: string): PlanetPosition | undefined {
  return positions.find((p) => p.planet === planet);
}

/**
 * Narrow an event to its exact moment by bisecting the one-day window it was
 * detected in. `stillBefore` answers "at this instant, has the event not
 * happened yet?" — the returned instant is the first sampled moment at which
 * it has.
 */
async function refine(
  jdLow: number,
  jdHigh: number,
  stillBefore: (positions: PlanetPosition[]) => boolean,
): Promise<number> {
  let low = jdLow;
  let high = jdHigh;
  for (let i = 0; i < REFINE_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const positions = await calculatePlanetPositions(mid);
    if (stillBefore(positions)) low = mid;
    else high = mid;
  }
  return high;
}

function buildEvent(
  planet: string,
  eventType: TransitEventType,
  fromSign: string,
  toSign: string | null,
  exactAt: Date,
): TransitEvent {
  return {
    planet,
    eventType,
    fromSign,
    toSign,
    exactAt,
    forDate: istDateString(exactAt),
    weight: PLANET_WEIGHT[planet] ?? 10,
  };
}

/**
 * Scan `[from, to)` day by day and return every ingress and station found,
 * sorted chronologically.
 *
 * Daily sampling is safe for ingress: no planet covers a whole 30° sign in a
 * day, so a sign change can never be stepped over. The one thing it can miss
 * is a planet stationing within a degree of a cusp and crossing back and forth
 * inside a single day — which is not a meaningful "transit" event anyway, and
 * would produce two contradictory alerts if it were reported.
 */
export async function findTransitEvents(from: Date, to: Date): Promise<TransitEvent[]> {
  const events: TransitEvent[] = [];

  let jdPrev = jdFromDate(from);
  let prev = await calculatePlanetPositions(jdPrev);
  const jdEnd = jdFromDate(to);

  for (let jd = jdPrev + 1; jd <= jdEnd; jd += 1) {
    const curr = await calculatePlanetPositions(jd);

    for (const planet of INGRESS_PLANETS) {
      const a = positionOf(prev, planet);
      const b = positionOf(curr, planet);
      if (!a || !b || a.signIndex === b.signIndex) continue;

      const startSignIndex = a.signIndex;
      const exactJd = await refine(
        jdPrev,
        jd,
        (positions) => positionOf(positions, planet)?.signIndex === startSignIndex,
      );
      const exactAt = dateFromJd(exactJd);
      // Read the entered sign at the refined moment rather than assuming the
      // next sign along: a planet stationing near a cusp can move backwards,
      // and the sign it lands in is what the copy will talk about.
      const entered = positionOf(await calculatePlanetPositions(exactJd), planet);
      events.push(
        buildEvent(
          planet,
          'ingress',
          SIGNS[startSignIndex] ?? 'Unknown',
          entered ? (SIGNS[entered.signIndex] ?? 'Unknown') : (SIGNS[b.signIndex] ?? 'Unknown'),
          exactAt,
        ),
      );
    }

    for (const planet of STATION_PLANETS) {
      const a = positionOf(prev, planet);
      const b = positionOf(curr, planet);
      if (!a || !b || a.isRetrograde === b.isRetrograde) continue;

      const wasRetrograde = a.isRetrograde;
      const exactJd = await refine(
        jdPrev,
        jd,
        (positions) => positionOf(positions, planet)?.isRetrograde === wasRetrograde,
      );
      const exactAt = dateFromJd(exactJd);
      events.push(
        buildEvent(
          planet,
          b.isRetrograde ? 'retrograde' : 'direct',
          SIGNS[b.signIndex] ?? 'Unknown',
          null,
          exactAt,
        ),
      );
    }

    jdPrev = jd;
    prev = curr;
  }

  events.sort((x, y) => x.exactAt.getTime() - y.exactAt.getTime());
  return events;
}

// ---------------------------------------------------------------------------
// Collision selection
// ---------------------------------------------------------------------------

export interface SelectedEvent {
  event: TransitEvent;
  selected: boolean;
  skipReason?: string;
}

/** Minimum gap between two transit pushes. */
export const MIN_PUSH_GAP_DAYS = 3;

/**
 * Decide which events actually get pushed.
 *
 * All events stay in the database — they feed the in-app transit view — but
 * delivery is capped at one push per `MIN_PUSH_GAP_DAYS`. Excluding the Moon
 * still leaves ~60 events a year, and a notification that arrives constantly
 * is one nobody screenshots; scarcity is what makes each send feel like news.
 *
 * When events collide the heavier planet wins and the lighter is skipped, even
 * if the lighter one came first — a Mercury ingress should not be able to
 * crowd out a Saturn sign change two days later.
 *
 * Pure function over an array: no clock, no database, no I/O.
 */
export function selectPushableEvents(
  events: TransitEvent[],
  gapDays: number = MIN_PUSH_GAP_DAYS,
): SelectedEvent[] {
  const gapMs = gapDays * MS_PER_DAY;

  // Heaviest first (ties broken by earliest) so a winner is chosen before any
  // of its neighbours can claim the slot.
  const ranked = [...events].sort(
    (a, b) => b.weight - a.weight || a.exactAt.getTime() - b.exactAt.getTime(),
  );

  const chosen: TransitEvent[] = [];
  const results = new Map<TransitEvent, SelectedEvent>();

  for (const event of ranked) {
    const pushAt = pushAtForDate(event.forDate).getTime();
    const clash = chosen.find((c) => Math.abs(pushAtForDate(c.forDate).getTime() - pushAt) < gapMs);
    if (clash) {
      results.set(event, {
        event,
        selected: false,
        skipReason: `collision:${clash.planet}-${clash.eventType}-${clash.forDate}`,
      });
    } else {
      chosen.push(event);
      results.set(event, { event, selected: true });
    }
  }

  // Return in the caller's original (chronological) order.
  return events.map((e) => results.get(e) ?? { event: e, selected: false, skipReason: 'unknown' });
}
