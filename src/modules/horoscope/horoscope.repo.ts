import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  cronBatchRuns,
  dailyHoroscopes,
  users,
  type DailyHoroscopeRow,
  type MonthlyBreakdownEntry,
  type StructuredHoroscope,
  type UserRow,
} from '../../db/schema.js';
import type { HoroscopePeriod } from './horoscope.schemas.js';
import { decryptUserRow } from '../users/users.repo.js';

/** Consider a 'generating' row abandoned (crashed mid-run, no heartbeat) after this long. */
export const STALE_GENERATING_MS = 5 * 60_000;

/** `birthProfileId === null` filters to the primary/self profile; a non-null id filters to that additional profile. */
function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(dailyHoroscopes.birthProfileId)
    : eq(dailyHoroscopes.birthProfileId, birthProfileId);
}

/** Keyset page of active users (deletedAt IS NULL), ordered by id for stable paging. */
export async function listActiveUsersAfter(
  afterId: string | null,
  limit: number,
): Promise<UserRow[]> {
  const where = afterId
    ? and(isNull(users.deletedAt), gt(users.id, afterId))
    : isNull(users.deletedAt);
  const rows = await db.select().from(users).where(where).orderBy(asc(users.id)).limit(limit);
  // users.dateOfBirth/timeOfBirth/placeOfBirth are encrypted at rest — this
  // cron reads them to compute chart facts, so decrypt before returning.
  return rows.map(decryptUserRow);
}

export async function findHoroscope(
  userId: string,
  birthProfileId: string | null,
  period: HoroscopePeriod,
  periodKey: string,
): Promise<DailyHoroscopeRow | undefined> {
  const rows = await db
    .select()
    .from(dailyHoroscopes)
    .where(
      and(
        eq(dailyHoroscopes.userId, userId),
        profileFilter(birthProfileId),
        eq(dailyHoroscopes.period, period),
        eq(dailyHoroscopes.periodKey, periodKey),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Atomically claim generation for a (userId, birthProfileId, period,
 * periodKey). Returns the claimed row (with the fresh `startedAt` as the
 * claim token) if THIS caller won, or `undefined` if there's nothing to do —
 * another run already owns it (and isn't stale), or it's already `ready`
 * (unless `force`).
 *
 * Unlike kundli (always exactly one row per user), a row for a brand-new
 * periodKey usually doesn't exist yet — the plain INSERT branch handles that
 * case; `setWhere` only matters on the (far rarer) conflict branch, exactly
 * the same primitive kundli uses, just hit less often per-row here.
 */
export async function claimHoroscopeGeneration(
  userId: string,
  birthProfileId: string | null,
  period: HoroscopePeriod,
  periodKey: string,
  forDate: string,
  opts: { force?: boolean } = {},
): Promise<DailyHoroscopeRow | undefined> {
  const now = new Date();
  const staleSeconds = STALE_GENERATING_MS / 1000;
  const claimable = sql`(${dailyHoroscopes.status} <> 'generating' OR ${dailyHoroscopes.updatedAt} < now() - ${staleSeconds} * interval '1 second')`;
  const setWhere = opts.force
    ? claimable
    : sql`${claimable} AND ${dailyHoroscopes.status} <> 'ready'`;

  const [row] =
    birthProfileId === null
      ? await db
          .insert(dailyHoroscopes)
          .values({
            userId,
            birthProfileId: null,
            forDate,
            period,
            periodKey,
            status: 'generating',
            startedAt: now,
            error: null,
          })
          .onConflictDoUpdate({
            target: [dailyHoroscopes.userId, dailyHoroscopes.period, dailyHoroscopes.periodKey],
            // Must exactly match the partial `daily_horoscopes_user_period_key_primary_unique`
            // index's predicate — Postgres only infers a bare `ON CONFLICT (cols)`
            // target against a NON-partial unique index/constraint; a partial index
            // needs its WHERE repeated here or the conflict target fails to resolve.
            targetWhere: sql`${dailyHoroscopes.birthProfileId} is null`,
            set: { status: 'generating', startedAt: now, error: null, updatedAt: now },
            setWhere,
          })
          .returning()
      : await db
          .insert(dailyHoroscopes)
          .values({
            userId,
            birthProfileId,
            forDate,
            period,
            periodKey,
            status: 'generating',
            startedAt: now,
            error: null,
          })
          .onConflictDoUpdate({
            // Matches the `daily_horoscopes_user_period_key_profile_unique`
            // index's column set — (userId, period, periodKey, birthProfileId)
            // — for the non-null (additional-profile) side.
            target: [
              dailyHoroscopes.userId,
              dailyHoroscopes.period,
              dailyHoroscopes.periodKey,
              dailyHoroscopes.birthProfileId,
            ],
            // Must exactly match that index's partial predicate, same reasoning
            // as the primary-profile branch above.
            targetWhere: sql`${dailyHoroscopes.birthProfileId} is not null`,
            set: { status: 'generating', startedAt: now, error: null, updatedAt: now },
            setWhere,
          })
          .returning();

  return row;
}

/** Heartbeat for a live retry-forever run — refreshes `updatedAt` without disturbing the `startedAt` claim token, so the staleness check never mistakes an active retry loop for an abandoned one. */
export async function touchHoroscopeGenerating(
  userId: string,
  birthProfileId: string | null,
  period: HoroscopePeriod,
  periodKey: string,
  claimedAt: Date,
): Promise<void> {
  await db
    .update(dailyHoroscopes)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(dailyHoroscopes.userId, userId),
        profileFilter(birthProfileId),
        eq(dailyHoroscopes.period, period),
        eq(dailyHoroscopes.periodKey, periodKey),
        eq(dailyHoroscopes.status, 'generating'),
        eq(dailyHoroscopes.startedAt, claimedAt),
      ),
    );
}

export async function markHoroscopeReady(
  userId: string,
  birthProfileId: string | null,
  period: HoroscopePeriod,
  periodKey: string,
  claimedAt: Date,
  patch: {
    summary: string;
    model: string;
    monthlyBreakdown?: MonthlyBreakdownEntry[];
    structured?: StructuredHoroscope;
  },
): Promise<void> {
  // Fence on the claim token: if a newer claim superseded this one, this
  // write matches 0 rows and is correctly lost.
  await db
    .update(dailyHoroscopes)
    .set({ ...patch, status: 'ready', error: null, updatedAt: new Date() })
    .where(
      and(
        eq(dailyHoroscopes.userId, userId),
        profileFilter(birthProfileId),
        eq(dailyHoroscopes.period, period),
        eq(dailyHoroscopes.periodKey, periodKey),
        eq(dailyHoroscopes.status, 'generating'),
        eq(dailyHoroscopes.startedAt, claimedAt),
      ),
    );
}

export async function markHoroscopeFailed(
  userId: string,
  birthProfileId: string | null,
  period: HoroscopePeriod,
  periodKey: string,
  claimedAt: Date,
  error: string,
): Promise<void> {
  await db
    .update(dailyHoroscopes)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date() })
    .where(
      and(
        eq(dailyHoroscopes.userId, userId),
        profileFilter(birthProfileId),
        eq(dailyHoroscopes.period, period),
        eq(dailyHoroscopes.periodKey, periodKey),
        eq(dailyHoroscopes.status, 'generating'),
        eq(dailyHoroscopes.startedAt, claimedAt),
      ),
    );
}

export async function saveHoroscopeTranslation(
  userId: string,
  birthProfileId: string | null,
  period: HoroscopePeriod,
  periodKey: string,
  language: string,
  translation: {
    summary?: string;
    monthlyBreakdown?: MonthlyBreakdownEntry[];
    structured?: StructuredHoroscope;
    dasha?: { hook?: string; meaning?: string };
  },
): Promise<void> {
  const existing = await db
    .select({ translations: dailyHoroscopes.translations })
    .from(dailyHoroscopes)
    .where(
      and(
        eq(dailyHoroscopes.userId, userId),
        profileFilter(birthProfileId),
        eq(dailyHoroscopes.period, period),
        eq(dailyHoroscopes.periodKey, periodKey),
      ),
    )
    .limit(1)
    .then((r) => r[0]);

  if (!existing) return; // if it was deleted, do nothing

  const translations = existing.translations || {};
  translations[language] = translation;

  await db
    .update(dailyHoroscopes)
    .set({ translations })
    .where(
      and(
        eq(dailyHoroscopes.userId, userId),
        profileFilter(birthProfileId),
        eq(dailyHoroscopes.period, period),
        eq(dailyHoroscopes.periodKey, periodKey),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* cron_batch_runs — resumable pagination checkpoint for the nightly cron     */
/* batch (implemented elsewhere); this file only owns the DB layer.          */
/* -------------------------------------------------------------------------- */

export interface CronBatchRunRow {
  id: string;
  status: 'running' | 'completed' | 'failed';
  lastId: string | null;
  processed: number;
  generated: number;
  skipped: number;
  failed: number;
}

function toCronBatchRunRow(row: {
  id: string;
  status: 'running' | 'completed' | 'failed';
  lastId: string | null;
  processed: number;
  generated: number;
  skipped: number;
  failed: number;
}): CronBatchRunRow {
  return {
    id: row.id,
    status: row.status,
    lastId: row.lastId,
    processed: row.processed,
    generated: row.generated,
    skipped: row.skipped,
    failed: row.failed,
  };
}

function batchRunKey(jobName: string, period: string, forDate: string) {
  return and(
    eq(cronBatchRuns.jobName, jobName),
    eq(cronBatchRuns.period, period),
    eq(cronBatchRuns.forDate, forDate),
  );
}

/**
 * Upsert-or-fetch: creates a fresh 'running' row if none exists for this
 * (jobName, period, forDate); otherwise returns the existing row unchanged
 * (does NOT reset an existing row's progress).
 *
 * Race-safety: `onConflictDoNothing` on the unique (jobName, period, forDate)
 * index means at most one caller's INSERT wins; the follow-up SELECT then
 * reads back whichever row exists — the just-inserted one, or a pre-existing
 * one from an earlier/concurrent caller. This cron runs once nightly plus
 * rare manual triggers, so this is deliberately not more heavily locked than
 * that.
 */
export async function getOrCreateBatchRun(
  jobName: string,
  period: string,
  forDate: string,
): Promise<CronBatchRunRow> {
  await db
    .insert(cronBatchRuns)
    .values({ jobName, period, forDate, status: 'running' })
    .onConflictDoNothing({
      target: [cronBatchRuns.jobName, cronBatchRuns.period, cronBatchRuns.forDate],
    });

  const [row] = await db
    .select()
    .from(cronBatchRuns)
    .where(batchRunKey(jobName, period, forDate))
    .limit(1);

  if (!row) {
    // Should be unreachable: the insert above either created the row or lost
    // a race to another caller who did — either way a row must now exist.
    throw new Error(
      `getOrCreateBatchRun: no row found for ${jobName}/${period}/${forDate} after upsert`,
    );
  }

  return toCronBatchRunRow(row);
}

/** Called once per page (not per user) to persist pagination progress. Bumps updatedAt. */
export async function checkpointBatchRun(
  id: string,
  counts: {
    lastId: string | null;
    processed: number;
    generated: number;
    skipped: number;
    failed: number;
  },
): Promise<void> {
  await db
    .update(cronBatchRuns)
    .set({ ...counts, updatedAt: new Date() })
    .where(eq(cronBatchRuns.id, id));
}

/** Terminal: marks the row 'completed', sets completedAt. */
export async function completeBatchRun(
  id: string,
  counts: { processed: number; generated: number; skipped: number; failed: number },
): Promise<void> {
  const now = new Date();
  await db
    .update(cronBatchRuns)
    .set({ ...counts, status: 'completed', completedAt: now, updatedAt: now })
    .where(eq(cronBatchRuns.id, id));
}

/** Terminal: marks the row 'failed', sets completedAt and the error message. */
export async function failBatchRun(id: string, error: string): Promise<void> {
  const now = new Date();
  await db
    .update(cronBatchRuns)
    .set({ status: 'failed', error: error.slice(0, 1000), completedAt: now, updatedAt: now })
    .where(eq(cronBatchRuns.id, id));
}

/**
 * Resets an existing row back to a fresh 'running' state with null
 * cursor/zeroed counts — used when the caller passes `force: true` and wants
 * to ignore any prior progress for this (jobName, period, forDate).
 */
export async function resetBatchRun(
  jobName: string,
  period: string,
  forDate: string,
): Promise<CronBatchRunRow> {
  const now = new Date();
  const [row] = await db
    .insert(cronBatchRuns)
    .values({ jobName, period, forDate, status: 'running', startedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [cronBatchRuns.jobName, cronBatchRuns.period, cronBatchRuns.forDate],
      set: {
        status: 'running',
        lastId: null,
        processed: 0,
        generated: 0,
        skipped: 0,
        failed: 0,
        error: null,
        startedAt: now,
        updatedAt: now,
        completedAt: null,
      },
    })
    .returning();

  if (!row) {
    // Unreachable: an upsert with .returning() always yields the affected row.
    throw new Error(`resetBatchRun: no row returned for ${jobName}/${period}/${forDate}`);
  }

  return toCronBatchRunRow(row);
}
