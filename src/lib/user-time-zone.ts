/**
 * The clock a user reads dates and times on. Chat, voice and the transit
 * dates used to state everything in IST, so a user in London was told
 * India's date after their midnight and transit moments in Indian time.
 * Now they get their own zone: `users.current_timezone`, which the app fills
 * from the device when it is empty. IST only when no zone is known at all.
 */

export const INDIA_TZ = 'Asia/Kolkata';

/** The given IANA zone when the runtime knows it, else IST. */
export function userZone(timeZone: string | null | undefined): string {
  if (!timeZone) return INDIA_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return INDIA_TZ;
  }
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
