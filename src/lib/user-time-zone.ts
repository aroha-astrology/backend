/**
 * The clock a user reads dates and times on. Chat, voice and the transit
 * dates used to state everything in IST, so a user in London was told
 * India's date after their midnight and transit moments in Indian time.
 * Now they get their own zone: `users.current_timezone`, which the app fills
 * from the device when it is empty. IST only when no zone is known at all.
 */

import { z } from '@hono/zod-openapi';

export const INDIA_TZ = 'Asia/Kolkata';

/** The `tz` query a route takes: the device's IANA zone, read with `readerZone`. */
export const ReaderTzQuery = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .openapi({ param: { name: 'tz', in: 'query' }, example: 'Europe/London' });

function isKnownZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The given IANA zone when the runtime knows it, else IST. */
export function userZone(timeZone: string | null | undefined): string {
  return timeZone && isKnownZone(timeZone) ? timeZone : INDIA_TZ;
}

/**
 * The zone a reader's "today" is read on: the device's (the app sends it as
 * `tz`) when known, else the one saved on the account, else IST.
 */
export function readerZone(
  requested: string | null | undefined,
  saved: string | null | undefined,
): string {
  return requested && isKnownZone(requested) ? requested : userZone(saved);
}

/** "IST" for India; otherwise the zone's short name at that moment ("BST", "GMT-4"). */
export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  if (timeZone === INDIA_TZ) return 'IST';
  const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

/** YYYY-MM-DD in the zone (`en-CA` formats that way). */
export function dateInZone(at: Date, timeZone: string): string {
  return at.toLocaleDateString('en-CA', { timeZone });
}

/** The zone's UTC offset (ms) at instant `at`, read off its wall clock. */
function offsetMsAt(at: number, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(at))
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<string, number>;
  const wall = Date.UTC(p.year!, p.month! - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(at / 1000) * 1000;
}

/**
 * The instant `date` (YYYY-MM-DD) begins in the zone. The offset is read at a
 * first guess and again at the result, so a daylight-saving change that day
 * still lands on the right hour.
 */
export function midnightInZone(date: string, timeZone: string): Date {
  const wall = Date.parse(`${date}T00:00:00Z`);
  const guess = wall - offsetMsAt(wall, timeZone);
  return new Date(wall - offsetMsAt(guess, timeZone));
}

/** Noon of `date` on the zone's clock: the moment a day's sky is read at. */
export function noonInZone(date: string, timeZone: string): Date {
  return new Date(midnightInZone(date, timeZone).getTime() + 12 * 3_600_000);
}
