import { getAllActiveTokens } from '../device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import { logger } from '../../lib/logger.js';
import {
  getOrCreateBatchRun,
  completeBatchRun,
  failBatchRun,
} from '../horoscope/horoscope.repo.js';
import {
  getDailyCopy,
  getPeriodicCopy,
  normalizeLang,
  type BroadcastPeriod,
  type LangCode,
} from './broadcast-copy.js';

/** App timezone — same as horoscope.service.ts */
const APP_TZ = 'Asia/Kolkata';

/** cron_batch_runs is a generic (jobName, period, forDate) checkpoint table, not horoscope-specific despite living in horoscope.repo.ts — reused here for the broadcast's own idempotency, same as the nightly horoscope batch uses it for its own runs. */
const BROADCAST_JOB_NAME = 'broadcast';

/** IST calendar date/weekday/month parts for `now`, independent of server-local timezone. */
function istDateParts(now: Date): { dateStr: string; day: number; month: number; weekday: number } {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [, monthStr, dayStr] = dateStr.split('-') as [string, string, string];

  const weekdayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TZ,
    weekday: 'short',
  }).format(now);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    dateStr,
    day: Number(dayStr),
    month: Number(monthStr),
    weekday: weekdayMap[weekdayStr] ?? new Date(now).getUTCDay(),
  };
}

/**
 * Whether `period`'s broadcast should fire "today" (IST). A mis-scheduled
 * crontab line is a harmless no-op against this guard rather than a
 * duplicate/wrong-day send.
 *
 * Precedence when tiers collide on the same day — yearly > monthly > weekly,
 * daily always fires — keeps the notification count capped at 2/day even
 * when Jan 1 lands on a Monday (also the 1st of the month):
 *   - yearly:  IST date is Jan 1
 *   - monthly: IST day-of-month is 1, EXCEPT Jan 1 (yearly takes that day)
 *   - weekly:  IST weekday is Monday, EXCEPT the 1st of any month (monthly/
 *              yearly takes that day — day-of-month 1 already covers Jan 1)
 */
export function shouldBroadcast(period: BroadcastPeriod, now: Date = new Date()): boolean {
  const { day, month, weekday } = istDateParts(now);
  const isJan1 = month === 1 && day === 1;
  const isFirstOfMonth = day === 1;
  const isMonday = weekday === 1;

  if (period === 'daily') return true;
  if (period === 'yearly') return isJan1;
  if (period === 'monthly') return isFirstOfMonth && !isJan1;
  return isMonday && !isFirstOfMonth; // weekly
}

export interface BroadcastPeriodReadingResult {
  period: BroadcastPeriod;
  skipped: boolean;
  reason?: string;
  tokensFound: number;
  success: number;
  failure: number;
}

/**
 * Broadcast "your reading is ready" for one period to every active
 * (unrevoked, push-enabled) device token, grouped by the device's language
 * and sent with that language's localized copy (English fallback for
 * null/unrecognized locales — see normalizeLang).
 *
 * Deliberately reaches dormant users too (unlike the nightly horoscope
 * batch): the copy is templated and reveals no generated content, so it's
 * honest whether or not a row was generated for that user tonight. Tapping
 * it opens the app, which records a fresh `lastActiveAt` heartbeat and
 * triggers on-the-fly generation for whichever period they open — the
 * closed loop that makes this safe.
 *
 * Idempotent via cron_batch_runs (jobName: 'broadcast'): a second call for
 * the same (period, IST date) is a no-op unless `force` — a broadcast is
 * unrecallable, so "already sent" must never re-send.
 *
 * `now` is injectable for tests; production callers omit it.
 */
export async function broadcastPeriodReading(
  period: BroadcastPeriod,
  opts: { force?: boolean; now?: Date } = {},
): Promise<BroadcastPeriodReadingResult> {
  const now = opts.now ?? new Date();
  const { dateStr } = istDateParts(now);

  if (!opts.force && !shouldBroadcast(period, now)) {
    logger.info({ period, dateStr }, 'broadcast:period-reading skipped — not scheduled today');
    return {
      period,
      skipped: true,
      reason: 'not-scheduled-today',
      tokensFound: 0,
      success: 0,
      failure: 0,
    };
  }

  const run = await getOrCreateBatchRun(BROADCAST_JOB_NAME, period, dateStr);
  if (!opts.force && run.status === 'completed') {
    logger.info({ period, dateStr }, 'broadcast:period-reading skipped — already sent today');
    return {
      period,
      skipped: true,
      reason: 'already-sent',
      tokensFound: 0,
      success: 0,
      failure: 0,
    };
  }

  logger.info({ period, dateStr }, 'broadcast:period-reading start');

  let tokens;
  try {
    tokens = await getAllActiveTokens();
  } catch (err) {
    logger.error({ err, period }, 'broadcast:period-reading failed to fetch tokens');
    await failBatchRun(run.id, err instanceof Error ? err.message : String(err));
    return { period, skipped: false, tokensFound: 0, success: 0, failure: 0 };
  }

  if (tokens.length === 0) {
    logger.info({ period }, 'broadcast:period-reading no active tokens — nothing to send');
    await completeBatchRun(run.id, { processed: 0, generated: 0, skipped: 0, failed: 0 });
    return { period, skipped: false, tokensFound: 0, success: 0, failure: 0 };
  }

  // Group by normalized language so each group gets its own localized copy —
  // one sendPushBatch (itself internally chunked at 500) per language present.
  const byLang = new Map<LangCode, string[]>();
  for (const t of tokens) {
    const lang = normalizeLang(t.locale);
    const list = byLang.get(lang);
    if (list) list.push(t.token);
    else byLang.set(lang, [t.token]);
  }

  const { weekday } = istDateParts(now);
  let success = 0;
  let failure = 0;
  for (const [lang, langTokens] of byLang) {
    const copy = period === 'daily' ? getDailyCopy(lang, weekday) : getPeriodicCopy(period, lang);
    const result = await sendPushBatch(langTokens, copy.title, copy.body, {
      type: `${period}_reading`,
      navigate: '/horoscope',
    });
    success += result.success;
    failure += result.failure;
  }

  await completeBatchRun(run.id, {
    processed: tokens.length,
    generated: success,
    skipped: 0,
    failed: failure,
  });

  logger.info(
    { period, dateStr, tokensFound: tokens.length, languages: byLang.size, success, failure },
    'broadcast:period-reading done',
  );

  return { period, skipped: false, tokensFound: tokens.length, success, failure };
}
