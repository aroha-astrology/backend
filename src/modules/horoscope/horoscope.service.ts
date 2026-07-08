import { logger } from '../../lib/logger.js';
import { generateHoroscopeSummary, type HoroscopeContext } from '../../lib/llm/horoscope.js';
import { buildDashaReading } from '../../lib/astro-tools/dasha-reading.js';
import type {
  DailyHoroscopeRow,
  KundliRow,
  StructuredHoroscope,
  UserRow,
} from '../../db/schema.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import type { HoroscopeDto, HoroscopePeriod } from './horoscope.schemas.js';
import {
  claimHoroscopeGeneration,
  findHoroscope,
  listActiveUsersAfter,
  markHoroscopeFailed,
  markHoroscopeReady,
  touchHoroscopeGenerating,
  STALE_GENERATING_MS,
} from './horoscope.repo.js';
import { findActiveTokensForUser } from '../device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';

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
            ashtakavarga: kundli.ashtakavargaData,
          }
        : null,
  };
}

/** A 'generating' row whose run likely crashed or was abandoned (no heartbeat in a while). */
export function isStaleGenerating(row: DailyHoroscopeRow): boolean {
  return row.status === 'generating' && Date.now() - row.updatedAt.getTime() > STALE_GENERATING_MS;
}

/**
 * Best-effort push notification once a fresh daily horoscope is ready. Never
 * throws — a push failure (expired token, FCM outage, no registered device)
 * must not affect the horoscope row, which is already durably 'ready' by the
 * time this is called. Intentionally not awaited by its caller.
 */
export async function pushDailyHoroscopeReady(
  user: UserRow,
  structured: StructuredHoroscope | undefined,
) {
  const hook = structured?.categories?.overall?.hook;
  if (!hook) return;
  try {
    const tokens = await findActiveTokensForUser(user.id);
    if (tokens.length === 0) return;
    const { success, failure } = await sendPushBatch(
      tokens.map((t) => t.token),
      'Your horoscope is ready',
      hook,
      { type: 'daily_horoscope', userId: user.id },
    );
    logger.info({ userId: user.id, success, failure }, 'horoscope:push sent');
  } catch (err) {
    logger.warn({ err, userId: user.id }, 'horoscope:push failed');
  }
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
      // Fire-and-forget: only for 'daily' (avoid pushing on every period's
      // rollover), and never awaited so a slow/failed send can't add latency
      // to the cron batch's sequential per-user loop.
      if (period === 'daily') {
        void pushDailyHoroscopeReady(user, structured);
      }
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

/** Add small delay between batch requests to avoid rate limiting. */
async function sleepBetweenBatchRequests(): Promise<void> {
  const baseDelayMs = 100;
  const jitterMs = Math.random() * 50;
  await sleep(baseDelayMs + jitterMs);
}

/**
 * Optimization: for 'daily' horoscopes, try to reuse yesterday's 'tomorrow'
 * instead of regenerating. Yesterday's 'tomorrow' is exactly today's 'daily'
 * — no need to call the LLM again, just copy the row.
 *
 * Returns true if reuse succeeded (daily now ready with yesterday's tomorrow),
 * false if reuse wasn't possible (missing, stale, or wrong period).
 */
async function tryReuseYesterdaysTomorrow(userId: string, forDate: string): Promise<boolean> {
  // Yesterday's 'tomorrow' was generated with currentPeriodStart('tomorrow') =
  // addOneDay(yesterday) = today = forDate, and periodKeyFor returns forDate
  // as-is for 'tomorrow'. So the stored periodKey is `forDate` (today), not
  // yesterday's date. Look up directly by forDate.
  const yesterdayTomorrowKey = forDate;

  try {
    const yesterdayTomorrow = await findHoroscope(userId, 'tomorrow', yesterdayTomorrowKey);

    // Only reuse if it's ready and has content
    if (!yesterdayTomorrow || yesterdayTomorrow.status !== 'ready' || !yesterdayTomorrow.summary) {
      return false;
    }

    // Found a ready tomorrow from yesterday — create/update today's daily
    // using the same content (skip LLM generation entirely)
    const todayDailyKey = periodKeyFor('daily', forDate);

    // Try to claim and immediately mark ready with copied data
    const claimed = await claimHoroscopeGeneration(userId, 'daily', todayDailyKey, forDate, {
      force: false,
    });

    if (!claimed?.startedAt) {
      // Another run already owns it or it's ready — let them handle it
      return false;
    }

    // Mark it ready with yesterday's tomorrow content
    await markHoroscopeReady(userId, 'daily', todayDailyKey, claimed.startedAt, {
      summary: yesterdayTomorrow.summary,
      model: yesterdayTomorrow.model,
      ...(yesterdayTomorrow.monthlyBreakdown !== null
        ? { monthlyBreakdown: yesterdayTomorrow.monthlyBreakdown }
        : {}),
      ...(yesterdayTomorrow.structured !== null
        ? { structured: yesterdayTomorrow.structured }
        : {}),
    });

    logger.info(
      { userId, forDate, reusedFrom: yesterdayTomorrowKey },
      "reused yesterday's tomorrow as today's daily",
    );
    return true;
  } catch (err) {
    logger.warn(
      { err, userId, forDate },
      "failed to reuse yesterday's tomorrow (will generate fresh)",
    );
    return false;
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

  // Optimization: for daily, try to reuse yesterday's tomorrow first
  if (period === 'daily' && !opts.force) {
    const reused = await tryReuseYesterdaysTomorrow(user.id, forDate);
    if (reused) return 'generated'; // Reuse counts as successful generation
  }

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
        // Small delay to avoid rate limiting the LLM API during batch runs.
        await sleepBetweenBatchRequests();
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
/**
 * Rows generated before the 2026-07-03/07-06 category-ratings work have
 * `structured` populated in the OLD flat shape — no `categories` field at
 * all (and rows from the very first category rollout have `categories`
 * without `finance`/`education`, added 07-06). Every client reads
 * `structured.categories.overall...` unconditionally now, so a stale row
 * would otherwise crash the UI until it's naturally regenerated. Backfill by
 * mirroring the legacy/available fields into every category slot — not
 * accurate per-category, but consistent with what the old single-hook UI
 * already showed, and self-heals the next time this (user, period,
 * periodKey) regenerates.
 */
function normalizeStructured(
  structured: StructuredHoroscope | null,
): StructuredHoroscope | undefined {
  if (!structured) return undefined;
  const fallback = {
    hook: structured.hook,
    description: structured.description,
    advice: structured.advice,
    quality: structured.quality,
    score: structured.score,
  };
  const categories = structured.categories ?? {
    overall: fallback,
    health: fallback,
    career: fallback,
    marriage: fallback,
    finance: fallback,
    education: fallback,
  };
  return {
    ...structured,
    categories: {
      ...categories,
      finance: categories.finance ?? fallback,
      education: categories.education ?? fallback,
    },
  };
}

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
    structured: normalizeStructured(row.structured),
    dasha: buildDashaReading(dashaData ?? null) ?? undefined,
    model: row.model,
    generatedAt: row.updatedAt.toISOString(),
  };
}
