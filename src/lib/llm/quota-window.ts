// =============================================================================
// Gemini free-tier quota window
// =============================================================================
// Google resets free-tier daily request quota at midnight America/Los_Angeles,
// which is 12:30 PM IST (11:30 AM during US daylight saving). That is the worst
// possible alignment with an Indian 8–11 PM peak: a pool drained at 10 PM stays
// drained through the whole next morning. Two things need to know where that
// boundary is — the key pool (how long to cool a day-exhausted key) and the
// paid-spend counter (which budget day a request belongs to) — so it lives here
// rather than being derived twice.
//
// Intl is used deliberately instead of a hardcoded IST offset or a date
// library: the Pacific/IST gap SHIFTS by an hour twice a year with US daylight
// saving, so any fixed "+12:30" would be wrong for roughly four months.

const PACIFIC_TZ = 'America/Los_Angeles';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Milliseconds from `now` until the next Pacific midnight, i.e. until free-tier
 * daily quota refills.
 *
 * ponytail: measures the remaining wall-clock day rather than resolving an
 * exact UTC instant, so on the two DST transition days per year it can be off
 * by an hour. Harmless for a cooldown — an hour early just earns one more 429
 * and re-cools; an hour late costs one hour of an already-exhausted key.
 * Resolve the true instant only if this is ever used for billing boundaries.
 */
export function msUntilNextPacificMidnight(now: number = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(now));

  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsedMs = part('hour') * 3_600_000 + part('minute') * 60_000 + part('second') * 1000;

  return DAY_MS - elapsedMs;
}

/**
 * The Pacific calendar date (YYYY-MM-DD) `now` falls in — i.e. which free-tier
 * budget day it is charged against. Used to scope daily counters so they roll
 * over with Google's quota, not with IST midnight.
 */
export function pacificBudgetDay(now: number = Date.now()): string {
  // en-CA formats as YYYY-MM-DD, which sorts correctly and needs no assembly.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}
