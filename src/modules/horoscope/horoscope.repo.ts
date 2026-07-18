import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
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
  period: HoroscopePeriod,
  periodKey: string,
  language: string,
  translation: {
    summary?: string;
    monthlyBreakdown?: MonthlyBreakdownEntry[];
    structured?: StructuredHoroscope;
    dasha?: { hook?: string; meaning?: string };
  },
  birthProfileId: string | null,
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
