import { logger } from '../../lib/logger.js';
import { generateHoroscopeSummary, type HoroscopeContext } from '../../lib/llm/horoscope.js';
import { buildDashaReading } from '../../lib/astro-tools/dasha-reading.js';
import type { DailyHoroscopeRow, KundliRow, UserRow } from '../../db/schema.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import type { HoroscopeDto, HoroscopePeriod } from './horoscope.schemas.js';
import { findHoroscope, listActiveUsersAfter, upsertHoroscope } from './horoscope.repo.js';

/** The app's reference timezone — horoscopes are dated by the IST calendar day. */
const APP_TZ = 'Asia/Kolkata';

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

/** The start date (period's `forDate`) of the period containing today, in IST. */
export function currentPeriodStart(period: HoroscopePeriod): string {
  const today = todayForApp();
  if (period === 'daily') return today;
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

async function generateForUser(
  user: UserRow,
  forDate: string,
  force: boolean,
): Promise<'generated' | 'skipped'> {
  const period: HoroscopePeriod = 'daily';
  if (!force && (await findHoroscope(user.id, period, forDate))) {
    return 'skipped';
  }
  const kundli = await findKundliByUserId(user.id);
  const context = buildHoroscopeContext(user, kundli, forDate, period);
  const { summary, model, structured } = await generateHoroscopeSummary(context);
  await upsertHoroscope({
    userId: user.id,
    forDate,
    period,
    periodKey: forDate,
    summary,
    model,
    ...(structured !== undefined ? { structured } : {}),
  });
  return 'generated';
}

/**
 * Get-or-generate for any period, including daily. Weekly/monthly/yearly are
 * never CRON-populated (too infrequent to justify a dedicated schedule) and
 * always go through this path. Daily is normally pre-populated by the nightly
 * CRON (runDailyHoroscopes) for speed/scale, but also falls back here on a
 * miss — a missed, delayed, or partially-failed CRON run no longer leaves a
 * user without a reading; they just pay a one-time generation cost on read
 * instead of waiting for the next night's run. Concurrent first-requesters
 * for the same period both generate and both upsert; the last write wins and
 * the unique index prevents duplicate rows, so no locking is needed for this
 * volume.
 */
export async function getOrGenerateHoroscope(
  user: UserRow,
  period: HoroscopePeriod,
): Promise<DailyHoroscopeRow> {
  const forDate = currentPeriodStart(period);
  const periodKey = periodKeyFor(period, forDate);
  const existing = await findHoroscope(user.id, period, periodKey);
  if (existing) return existing;

  const kundli = await findKundliByUserId(user.id);
  const context = buildHoroscopeContext(user, kundli, forDate, period);
  const { summary, model, monthlyBreakdown, structured } = await generateHoroscopeSummary(context);
  await upsertHoroscope({
    userId: user.id,
    forDate,
    period,
    periodKey,
    summary,
    model,
    ...(monthlyBreakdown !== undefined ? { monthlyBreakdown } : {}),
    ...(structured !== undefined ? { structured } : {}),
  });

  const row = await findHoroscope(user.id, period, periodKey);
  if (!row) throw new Error('Horoscope upsert did not persist — this should be unreachable');
  return row;
}

export interface DailyHoroscopeRunResult {
  forDate: string;
  processed: number;
  generated: number;
  skipped: number;
  failed: number;
}

/**
 * Generate a personalized horoscope for every active user for `forDate`
 * (default: today in IST). Paginated (keyset) and per-user fault-isolated, so
 * one user's failure never aborts the batch. Idempotent: re-running skips users
 * already done (unless `force`).
 *
 * TODO(scale): the run is synchronous within one HTTP request — fine while the
 * LLM is an instant stub. With the real NIM over N users this will exceed the
 * request timeout; move to a queue/chunked workers when the LLM lands.
 */
export async function runDailyHoroscopes(
  opts: {
    forDate?: string | undefined;
    force?: boolean | undefined;
    limit?: number | undefined;
  } = {},
): Promise<DailyHoroscopeRunResult> {
  const forDate = opts.forDate ?? todayForApp();
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
        const outcome = await generateForUser(user, forDate, force);
        if (outcome === 'generated') generated++;
        else skipped++;
      } catch (err) {
        failed++;
        logger.error({ err, userId: user.id, forDate }, 'daily horoscope failed for user');
      }
    }

    const last = batch[batch.length - 1];
    if (!last) break;
    lastId = last.id;
    if (batch.length < Math.min(PAGE, remaining)) break;
  }

  logger.info({ forDate, processed, generated, skipped, failed }, 'daily horoscope run complete');
  return { forDate, processed, generated, skipped, failed };
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
    summary: row.summary,
    monthlyBreakdown: row.monthlyBreakdown ?? undefined,
    structured: row.structured ?? undefined,
    dasha: buildDashaReading(dashaData ?? null) ?? undefined,
    model: row.model,
    generatedAt: row.updatedAt.toISOString(),
  };
}
