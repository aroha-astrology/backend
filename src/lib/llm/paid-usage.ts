// =============================================================================
// Paid-tier usage counter + alerting
// =============================================================================
// The paid keys are a reserve: a normal day never touches them, so the FIRST
// time one is used is a real operational event — it means the free pool ran dry
// and the app has started billing to stay up. That is the moment ops wants to
// hear about, not a number on a dashboard nobody is looking at during an
// evening peak.
//
// Deliberately alert-only, with no ceiling: capping paid usage would convert
// "this costs money" back into "users are blocked", which is the exact failure
// the reserve tier exists to remove.

import { getRedis } from '../../config/redis.js';
import { logger } from '../logger.js';
import { alertThrottled } from '../notifications/alerts.js';
import { pacificBudgetDay } from './quota-window.js';

const REDIS_CALL_TIMEOUT_MS = 250;
// Counters are scoped to a Pacific budget day; keep them a little past that so
// a report run just after the reset can still read the day that just ended.
const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;
/** How often to re-report a running total once billing has started for the day. */
const MILESTONE_EVERY = 500;

function counterKey(day: string): string {
  return `gemini:paid:reqs:${day}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis call exceeded ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Record that a request was served from the paid reserve, and alert on the
 * first one of each budget day plus every {@link MILESTONE_EVERY} after.
 *
 * Counts key PICKS rather than billed responses — a paid key that then 429s is
 * counted but not charged. The gap is noise at the volumes this fires at, and
 * the alert's job is "we are on the paid tier now", not invoice reconciliation;
 * `ai_usage.tier` carries the per-request truth for costing.
 *
 * Never throws: callers `void` this, and telemetry must not be able to fail a
 * user's request.
 */
export async function recordPaidKeyUse(profileName: string): Promise<void> {
  const day = pacificBudgetDay();
  const key = counterKey(day);

  let count: number;
  try {
    const redis = getRedis();
    count = await withTimeout(redis.incr(key), REDIS_CALL_TIMEOUT_MS);
    // Set unconditionally rather than only on the first increment: EXPIRE is
    // idempotent and cheap, and it sidesteps the "lost the TTL in a race"
    // problem without needing a Lua script for a counter this low-volume.
    await withTimeout(redis.expire(key, COUNTER_TTL_SECONDS), REDIS_CALL_TIMEOUT_MS);
  } catch (err) {
    logger.warn({ err, profileName }, 'paid-usage: could not record paid key use');
    return;
  }

  if (count === 1) {
    void alertThrottled(
      'gemini:paid:first',
      'Gemini paid reserve activated',
      `Free key pool is exhausted — now serving from the PAID reserve (first billed ` +
        `request of the ${day} budget day, triggered by "${profileName}"). ` +
        `Users are unaffected; this is spend, not an outage. Free quota refills at ` +
        `midnight Pacific / 12:30 PM IST.`,
    );
    return;
  }

  if (count % MILESTONE_EVERY === 0) {
    void alertThrottled(
      'gemini:paid:milestone',
      'Gemini paid reserve usage',
      `${count} billed requests served from the paid reserve so far on the ${day} budget day.`,
    );
  }
}

/** Paid requests billed so far on the current Pacific budget day (0 if unknown). */
export async function paidRequestsToday(): Promise<number> {
  try {
    const redis = getRedis();
    const raw = await withTimeout(redis.get(counterKey(pacificBudgetDay())), REDIS_CALL_TIMEOUT_MS);
    return raw ? Number(raw) : 0;
  } catch (err) {
    logger.warn({ err }, 'paid-usage: could not read paid request count');
    return 0;
  }
}
