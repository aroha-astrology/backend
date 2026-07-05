import { logger } from '../../lib/logger.js';
import { generateHoroscopeSummary, type HoroscopeContext } from '../../lib/llm/horoscope.js';
import { buildDashaReading } from '../../lib/astro-tools/dasha-reading.js';
import type { DailyHoroscopeRow, KundliRow, UserRow } from '../../db/schema.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import type { HoroscopeDto, HoroscopePeriod } from './horoscope.schemas.js';
import {
  claimHoroscopeGeneration,
  listActiveUsersAfter,
  markHoroscopeFailed,
  markHoroscopeReady,
  touchHoroscopeGenerating,
  STALE_GENERATING_MS,
} from './horoscope.repo.js';

/** The app's reference timezone — horoscopes are dated by the IST calendar day. */
const APP_TZ = 'Asia/Kolkata';

/** How long to wait between retry-forever attempts against a failing LLM. */
const RETRY_FOREVER_INTERVAL_MS = 5_000;

export const HOROSCOPE_PERIODS: readonly HoroscopePeriod[] = [
  'daily',
  'tomorrow',
  'weekly',
  'monthly',
  'yearly',
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calendar date (YYYY-MM-DD) for an instant, in the given tz. */
export function dateInTz(d: Date, tz: string = APP_TZ): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Today's date in the app timezone. The CRON fires at 18:31 UTC = 00:01 IST. */
export function todayForApp(): string {
  return dateInTz(new Date(), APP_TZ);
}

/**
 * The period's key within itself: daily/weekly both key on the period's own
 * start date (already unique per period), monthly/yearly truncate it.
 */
export function periodKeyFor(period: HoroscopePeriod, forDate: string): string {
  if (period === 'monthly') return forDate.slice(0, 7);
  if (period === 'yearly') return forDate.slice(0, 4);
  return forDate;
}

/** Monday (ISO week start) of the week containing `forDate`, as YYYY-MM-DD. */
function mondayOf(forDate: string): string {
  const [y, m, d] = forDate.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return dt.toISOString().slice(0, 10);
}

/** YYYY-MM-DD for the calendar day after `forDate`. */
function addOneDay(forDate: string): string {
  const [y, m, d] = forDate.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/** The start date (period's `forDate`) of the period containing today, in IST. */
export function currentPeriodStart(period: HoroscopePeriod): string {
  const today = todayForApp();
  if (period === 'daily') return today;
  if (period === 'tomorrow') return addOneDay(today);
  if (period === 'weekly') return mondayOf(today);
  if (period === 'monthly') return `${today.slice(0, 7)}-01`;
  return `${today.slice(0, 4)}-01-01`; // yearly
}

/** Assemble everything we know about the user for the LLM to personalize from. */
function buildHoroscopeContext(
  user: UserRow,
  kundli: KundliRow | undefined,
  forDate: string,
  period: HoroscopePeriod,
): HoroscopeContext {
  return {
    userId: user.id,
    forDate,
    period,
    profile: {
      displayName: user.displayName,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      timeOfBirth: user.timeOfBirth,
      birthTimeAccuracy: user.birthTimeAccuracy,
      placeOfBirth: user.placeOfBirth,
      currentLocation: user.currentLocation,
      currentTimezone: user.currentTimezone,
      locale: user.locale,
      contentLanguage: user.contentLanguage,
      relationshipStatus: user.relationshipStatus,
      interestAreas: user.interestAreas,
    },
    preferences: {
      preferredSystem: user.preferredSystem,
      preferredAyanamsa: user.preferredAyanamsa,
      preferredHouseSystem: user.preferredHouseSystem,
      preferredChartStyle: user.preferredChartStyle,
      preferredDashaSystem: user.preferredDashaSystem,
    },
    // Attach the natal kundli when it's ready; never SKIP a user for lacking one.
    kundli:
      kundli && kundli.status === 'ready'
        ? {
            chart: kundli.chartData,
            dasha: kundli.dashaData,
            yogas: kundli.yogaData,
            doshas: kundli.doshaData,
          }
        : null,
  };
}

/** A 'generating' row whose run likely crashed or was abandoned (no heartbeat in a while). */
export function isStaleGenerating(row: DailyHoroscopeRow): boolean {
  return row.status === 'generating' && Date.now() - row.updatedAt.getTime() > STALE_GENERATING_MS;
}

async function runHoroscopeGeneration(
  user: UserRow,
  period: HoroscopePeriod,
  periodKey: string,
  forDate: string,
  claimedAt: Date,
  retryForever: boolean,
): Promise<'generated' | 'failed'> {
  for (;;) {
    try {
      const kundli = await findKundliByUserId(user.id);
      const context = buildHoroscopeContext(user, kundli, forDate, period);
      const { summary, model, monthlyBreakdown, structured } =
        await generateHoroscopeSummary(context);
      await markHoroscopeReady(user.id, period, periodKey, claimedAt, {
        summary,
        model,
        ...(monthlyBreakdown !== undefined ? { monthlyBreakdown } : {}),
        ...(structured !== undefined ? { structured } : {}),
      });
      return 'generated';
    } catch (err) {
      logger.error(
        { err, userId: user.id, period, periodKey },
        'horoscope generation attempt failed',
      );
      if (!retryForever) {
        await markHoroscopeFailed(
          user.id,
          period,
          periodKey,
          claimedAt,
          err instanceof Error ? err.message : String(err),
        );
        return 'failed';
      }
      // Heartbeat before sleeping so the staleness check never mistakes this
      // live retry loop for an abandoned run and lets a second claim in.
      await touchHoroscopeGenerating(user.id, period, periodKey, claimedAt);
      await sleep(RETRY_FOREVER_INTERVAL_MS);
    }
  }
}

/**
 * Fire-and-forget entry point used by the GET route (cache miss), the
 * onboarding/kundli-ready hook, and the nightly cron batch alike — `forDate`/
 * `force`/`retryForever` let one code path serve all three.
 *
 * `retryForever` is for single-user, nothing-else-blocked-on-it contexts
 * (a live user's request, the onboarding trigger): on failure it keeps
 * retrying every few seconds until the LLM recovers, rather than giving up.
 * The cron batch must NOT use this — it awaits each user sequentially, so an
 * unbounded retry on one stuck user would starve every other user's run that
 * night. Left `false` (bounded — one attempt, using the LLM client's own
 * internal retries/timeout), a cron failure just gets swept up again on the
 * next nightly run instead.
 */
export async function requestHoroscopeGeneration(
  user: UserRow,
  period: HoroscopePeriod,
  opts: { forDate?: string; force?: boolean; retryForever?: boolean } = {},
): Promise<'generated' | 'skipped' | 'failed'> {
  const forDate = opts.forDate ?? currentPeriodStart(period);
  const periodKey = periodKeyFor(period, forDate);
  const claimed = await claimHoroscopeGeneration(
    user.id,
    period,
    periodKey,
    forDate,
    opts.force !== undefined ? { force: opts.force } : {},
  );
  if (!claimed?.startedAt) return 'skipped'; // another run owns it, or already ready
  return runHoroscopeGeneration(
    user,
    period,
    periodKey,
    forDate,
    claimed.startedAt,
    opts.retryForever ?? false,
  );
}

export interface HoroscopeRunResult {
  period: HoroscopePeriod;
  forDate: string;
  processed: number;
  generated: number;
  skipped: number;
  failed: number;
}

/**
 * Generate a personalized horoscope for every active user for one period's
 * current periodKey. Paginated (keyset) and per-user fault-isolated, so one
 * user's failure never aborts the batch. Idempotent: re-running skips users
 * already done (unless `force`).
 */
export async function runHoroscopeBatch(
  period: HoroscopePeriod,
  opts: {
    forDate?: string | undefined;
    force?: boolean | undefined;
    limit?: number | undefined;
  } = {},
): Promise<HoroscopeRunResult> {
  const forDate = opts.forDate ?? currentPeriodStart(period);
  const force = opts.force ?? false;
  const PAGE = 200;

  let lastId: string | null = null;
  let processed = 0;
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (;;) {
    const remaining = opts.limit ? opts.limit - processed : PAGE;
    if (remaining <= 0) break;
    const batch = await listActiveUsersAfter(lastId, Math.min(PAGE, remaining));
    if (batch.length === 0) break;

    for (const user of batch) {
      processed++;
      try {
        const outcome = await requestHoroscopeGeneration(user, period, { forDate, force });
        if (outcome === 'generated') generated++;
        else if (outcome === 'failed') failed++;
        else skipped++;
      } catch (err) {
        failed++;
        logger.error({ err, userId: user.id, period, forDate }, 'horoscope batch failed for user');
      }
    }

    const last = batch[batch.length - 1];
    if (!last) break;
    lastId = last.id;
    if (batch.length < Math.min(PAGE, remaining)) break;
  }

  logger.info(
    { period, forDate, processed, generated, skipped, failed },
    'horoscope batch run complete',
  );
  return { period, forDate, processed, generated, skipped, failed };
}

/**
 * Sweep all 4 periods every night rather than only on each period's own
 * rollover day: on non-rollover nights a period's claim is a near-instant
 * no-op (row already `ready`), and this doubles as a <=24h self-heal for any
 * stuck/failed row — valuable for `yearly`, which would otherwise wait up to
 * a year for its next natural rollover. One period crashing can't block the
 * others.
 */
export async function runAllHoroscopeBatches(
  opts: { force?: boolean | undefined; limit?: number | undefined } = {},
): Promise<HoroscopeRunResult[]> {
  const results: HoroscopeRunResult[] = [];
  for (const period of HOROSCOPE_PERIODS) {
    try {
      results.push(await runHoroscopeBatch(period, opts));
    } catch (err) {
      logger.error({ err, period }, 'horoscope batch crashed for period');
      results.push({ period, forDate: '', processed: 0, generated: 0, skipped: 0, failed: 0 });
    }
  }
  return results;
}

/**
 * `dashaData` is `kundli.dashaData` (not stored on the horoscope row itself —
 * a Mahadasha/Antardasha spans months to years, far outliving any horoscope
 * cache period, so it's recomputed fresh from the kundli each time rather
 * than risking a stale copy in the cached row).
 */
export function toHoroscopeDto(
  row: DailyHoroscopeRow,
  dashaData?: Record<string, unknown> | null,
): HoroscopeDto {
  return {
    forDate: row.forDate,
    period: row.period,
    periodKey: row.periodKey,
    // Only ever called on a `status === 'ready'` row, which always has a summary.
    summary: row.summary ?? '',
    monthlyBreakdown: row.monthlyBreakdown ?? undefined,
    structured: row.structured ?? undefined,
    dasha: buildDashaReading(dashaData ?? null) ?? undefined,
    model: row.model,
    generatedAt: row.updatedAt.toISOString(),
  };
}
