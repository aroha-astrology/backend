import { getAllActiveTokens } from '../device-tokens/device-tokens.repo.js';
import { notifyUsersBatch } from '../../lib/notifications/notify-user.js';
import { logger } from '../../lib/logger.js';
import {
  getOrCreateBatchRun,
  completeBatchRun,
  failBatchRun,
} from '../horoscope/horoscope.repo.js';
import { istDateString } from '../../lib/astro-tools/transit-events.js';
import { getFestivalsForDate, type HinduFestival } from '../../config/hindu-festivals.js';

/** cron_batch_runs is a generic (jobName, period, forDate) checkpoint table — reused here exactly
 * as broadcast.service.ts reuses it, just with 'festival_alert' as the job name and the target
 * festival's IST date (not "today") as forDate, so a mis-scheduled duplicate cron firing twice in
 * one day is still a harmless no-op. */
const FESTIVAL_ALERT_JOB_NAME = 'festival_alert';
const FESTIVAL_ALERT_PERIOD = 'daily';

/** "HH:mm" 24h -> "h:mm AM/PM", for human-readable push copy. */
function to12h(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Tomorrow's date in IST, independent of the server's own timezone. India has no DST, so a flat
 * +24h always lands on the correct next IST calendar day regardless of what time `now` is. */
export function tomorrowIstDate(now: Date): string {
  return istDateString(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

/** The one major festival to alert about for a given date, or null. Multiple same-day major
 * festivals (not currently in the table) would only alert on the first — acceptable, a push
 * blast isn't the place for a multi-festival digest. Minor entries (civic holidays like Republic
 * Day, or lower-profile observances) are deliberately excluded — same major/minor line the panchang
 * page's own hasMajorFestival() already draws. */
export function festivalForAlert(dateIso: string): HinduFestival | null {
  return getFestivalsForDate(dateIso).find((f) => f.importance === 'major') ?? null;
}

export function buildFestivalAlertCopy(festival: HinduFestival): { title: string; body: string } {
  const title = `${festival.emoji} ${festival.name} is tomorrow!`;
  const body = festival.muhurat
    ? `${festival.muhurat.label ?? 'Muhurat'}: ${to12h(festival.muhurat.start)} – ${to12h(festival.muhurat.end)}`
    : `Wishing you a blessed ${festival.name}.`;
  return { title, body };
}

export interface FestivalAlertResult {
  skipped: boolean;
  reason?: string;
  festivalName?: string;
  forDate: string;
  tokensFound: number;
  success: number;
  failure: number;
}

/**
 * Sends "<festival> is tomorrow, <muhurat time>" to every active device token, one day before a
 * major festival — a single static push (no LLM drafting, no per-user personalization; unlike
 * transit-alert.service.ts this needs neither, since the copy is fully known a day in advance).
 * Idempotent via cron_batch_runs (jobName: 'festival_alert', forDate: tomorrow's IST date) — a
 * second call for the same target date is a no-op unless `force`, since a push is unrecallable.
 * `now` is injectable for tests; production callers omit it.
 */
export async function sendFestivalAlert(
  opts: { force?: boolean; dryRun?: boolean; now?: Date } = {},
): Promise<FestivalAlertResult> {
  const now = opts.now ?? new Date();
  const forDate = tomorrowIstDate(now);

  const festival = festivalForAlert(forDate);
  if (!festival) {
    logger.info({ forDate }, 'festival-alert: no major festival tomorrow — nothing to send');
    return {
      skipped: true,
      reason: 'no-festival-tomorrow',
      forDate,
      tokensFound: 0,
      success: 0,
      failure: 0,
    };
  }

  const run = await getOrCreateBatchRun(FESTIVAL_ALERT_JOB_NAME, FESTIVAL_ALERT_PERIOD, forDate);
  if (!opts.force && run.status === 'completed') {
    logger.info({ forDate, festival: festival.name }, 'festival-alert: skipped — already sent');
    return {
      skipped: true,
      reason: 'already-sent',
      festivalName: festival.name,
      forDate,
      tokensFound: 0,
      success: 0,
      failure: 0,
    };
  }

  const { title, body } = buildFestivalAlertCopy(festival);

  if (opts.dryRun) {
    logger.info({ forDate, festival: festival.name, title, body }, 'festival-alert: dry run');
    return {
      skipped: true,
      reason: 'dry-run',
      festivalName: festival.name,
      forDate,
      tokensFound: 0,
      success: 0,
      failure: 0,
    };
  }

  logger.info({ forDate, festival: festival.name }, 'festival-alert: start');

  let tokens;
  try {
    tokens = await getAllActiveTokens();
  } catch (err) {
    logger.error({ err, forDate }, 'festival-alert: failed to fetch tokens');
    await failBatchRun(run.id, err instanceof Error ? err.message : String(err));
    return {
      skipped: false,
      festivalName: festival.name,
      forDate,
      tokensFound: 0,
      success: 0,
      failure: 0,
    };
  }

  if (tokens.length === 0) {
    await completeBatchRun(run.id, { processed: 0, generated: 0, skipped: 0, failed: 0 });
    return {
      skipped: false,
      festivalName: festival.name,
      forDate,
      tokensFound: 0,
      success: 0,
      failure: 0,
    };
  }

  const result = await notifyUsersBatch(
    tokens.map((t) => ({ userId: t.userId, token: t.token })),
    { title, body, type: 'festival_alert', link: '/panchang' },
  );

  await completeBatchRun(run.id, {
    processed: tokens.length,
    generated: result.success,
    skipped: 0,
    failed: result.failure,
  });

  logger.info(
    { forDate, festival: festival.name, tokensFound: tokens.length, ...result },
    'festival-alert: done',
  );

  return {
    skipped: false,
    festivalName: festival.name,
    forDate,
    tokensFound: tokens.length,
    success: result.success,
    failure: result.failure,
  };
}
