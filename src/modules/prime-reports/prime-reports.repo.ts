import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { primeReports, users, walletTransactions, type PrimeReportRow } from '../../db/schema.js';
import { isUniqueViolation } from '../../lib/db-errors.js';

/** Consider a 'generating' row abandoned (crashed mid-run) after this long — same window as gemstone. */
export const PRIME_REPORT_STALE_GENERATING_MS = 5 * 60_000;

function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(primeReports.birthProfileId)
    : eq(primeReports.birthProfileId, birthProfileId);
}

export async function findPrimeReport(
  userId: string,
  birthProfileId: string | null,
  reportType: string,
  period: string,
): Promise<PrimeReportRow | undefined> {
  const rows = await db
    .select()
    .from(primeReports)
    .where(
      and(
        eq(primeReports.userId, userId),
        profileFilter(birthProfileId),
        eq(primeReports.reportType, reportType),
        eq(primeReports.period, period),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Atomically spend wallet balance AND create the unlocked report row (status
 * 'generating', startedAt as the claim token) in one transaction. Returns
 * `undefined` if a row already exists for this (user, profile, reportType,
 * period), the wallet balance is insufficient, OR a concurrent unlock
 * request wins a genuine race on the final INSERT (unique-violation on one
 * of `prime_reports_primary_unique` / `prime_reports_profile_unique` in
 * schema.ts) — so a double-click, or two truly concurrent requests, can
 * never double-charge or create a duplicate row. In the race case the whole
 * transaction (charge + ledger row + insert) rolls back before this
 * resolves, so the loser is never actually charged — see the outer catch
 * below.
 */
export async function unlockPrimeReport(
  userId: string,
  birthProfileId: string | null,
  reportType: string,
  period: string,
  pricePaise: number,
): Promise<PrimeReportRow | undefined> {
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: primeReports.id })
        .from(primeReports)
        .where(
          and(
            eq(primeReports.userId, userId),
            profileFilter(birthProfileId),
            eq(primeReports.reportType, reportType),
            eq(primeReports.period, period),
          ),
        )
        .limit(1);
      if (existing[0]) return undefined;

      const [charged] = await tx
        .update(users)
        .set({ walletBalancePaise: sql`${users.walletBalancePaise} - ${pricePaise}` })
        .where(and(eq(users.id, userId), gte(users.walletBalancePaise, pricePaise)))
        .returning({ walletBalancePaise: users.walletBalancePaise });
      if (!charged) return undefined;

      await tx.insert(walletTransactions).values({
        userId,
        delta: -pricePaise,
        reason: `prime_report_unlock:${reportType}:${period}`,
        balanceAfter: charged.walletBalancePaise,
      });

      const now = new Date();
      const [row] = await tx
        .insert(primeReports)
        .values({
          userId,
          birthProfileId,
          reportType,
          period,
          unlockedAt: now,
          status: 'generating',
          startedAt: now,
          error: null,
        })
        .returning();
      return row;
    });
  } catch (err) {
    // Non-locking existence check above means two concurrent requests can
    // both pass it (neither sees the other's not-yet-committed row), both
    // charge, and the loser's INSERT trips `prime_reports_primary_unique` /
    // `prime_reports_profile_unique`. Surface that the same way as the
    // ordinary "already unlocked" case (a clean 409 via the caller's
    // undefined-mapping) instead of letting a 500 escape — the throw already
    // rolled back the whole transaction, including the charge, before we
    // get here.
    if (isUniqueViolation(err)) return undefined;
    throw err;
  }
}

/**
 * Re-claim generation for a (user, profile, reportType, period) row that
 * already exists (created by unlockPrimeReport) — used to retry after a
 * stale/failed attempt, or to force a regen. Unlike gemstone's
 * insert-on-conflict claim, this is a plain UPDATE: the row always already
 * exists by the time generation needs to run again.
 */
export async function claimPrimeReportGeneration(
  userId: string,
  birthProfileId: string | null,
  reportType: string,
  period: string,
  opts: { force?: boolean } = {},
): Promise<PrimeReportRow | undefined> {
  const now = new Date();
  const staleSeconds = PRIME_REPORT_STALE_GENERATING_MS / 1000;
  const claimable = sql`(${primeReports.status} <> 'generating' OR ${primeReports.updatedAt} < now() - ${staleSeconds} * interval '1 second')`;
  const setWhere = opts.force ? claimable : sql`${claimable} AND ${primeReports.status} <> 'ready'`;

  const [row] = await db
    .update(primeReports)
    .set({ status: 'generating', startedAt: now, error: null, updatedAt: now })
    .where(
      and(
        eq(primeReports.userId, userId),
        profileFilter(birthProfileId),
        eq(primeReports.reportType, reportType),
        eq(primeReports.period, period),
        setWhere,
      ),
    )
    .returning();
  return row;
}

export async function markPrimeReportReady(
  userId: string,
  birthProfileId: string | null,
  reportType: string,
  period: string,
  claimedAt: Date,
  patch: { analysis: Record<string, unknown>; model: string },
): Promise<void> {
  await db
    .update(primeReports)
    .set({ ...patch, translations: null, status: 'ready', error: null, updatedAt: new Date() })
    .where(
      and(
        eq(primeReports.userId, userId),
        profileFilter(birthProfileId),
        eq(primeReports.reportType, reportType),
        eq(primeReports.period, period),
        eq(primeReports.status, 'generating'),
        eq(primeReports.startedAt, claimedAt),
      ),
    );
}

export async function markPrimeReportFailed(
  userId: string,
  birthProfileId: string | null,
  reportType: string,
  period: string,
  claimedAt: Date,
  error: string,
): Promise<void> {
  await db
    .update(primeReports)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date() })
    .where(
      and(
        eq(primeReports.userId, userId),
        profileFilter(birthProfileId),
        eq(primeReports.reportType, reportType),
        eq(primeReports.period, period),
        eq(primeReports.status, 'generating'),
        eq(primeReports.startedAt, claimedAt),
      ),
    );
}

export async function savePrimeReportTranslation(
  userId: string,
  birthProfileId: string | null,
  reportType: string,
  period: string,
  language: string,
  translation: Record<string, unknown>,
): Promise<void> {
  const existing = await db
    .select({ translations: primeReports.translations })
    .from(primeReports)
    .where(
      and(
        eq(primeReports.userId, userId),
        profileFilter(birthProfileId),
        eq(primeReports.reportType, reportType),
        eq(primeReports.period, period),
      ),
    )
    .limit(1)
    .then((r) => r[0]);
  if (!existing) return;

  const translations = existing.translations || {};
  translations[language] = translation;

  await db
    .update(primeReports)
    .set({ translations })
    .where(
      and(
        eq(primeReports.userId, userId),
        profileFilter(birthProfileId),
        eq(primeReports.reportType, reportType),
        eq(primeReports.period, period),
      ),
    );
}

/**
 * Wipe ALL prime reports (every reportType/period) for a user's ONE profile
 * — used when that profile's birth details or display name change (any
 * report type's inputs may have shifted) so every report regenerates fresh
 * on next view. Unlock state is untouched (row deletion removes the unlock
 * record too, but this is only ever called for reports whose CONTENT is now
 * stale, not to revoke a purchase — see the call site in users.service.ts,
 * which only fires on a birth/name edit, never as a refund path).
 *
 * Unlike gemstone (a boolean flag on `users`, separate from its report row),
 * a `prime_reports` row IS the unlock record — deleting it would make the
 * report look locked again and force a re-charge on next view, which is not
 * the intended behavior (the user already paid once). So instead of a
 * DELETE, this NULLS OUT the AI-generated content/translations and resets
 * `status` to `'failed'` (deliberately NOT `'generating'`) with
 * `startedAt: null`, while leaving `unlockedAt`/`reportType`/`period`/
 * `userId`/`birthProfileId` untouched so the row still reads as unlocked.
 *
 * Why `'failed'` and not `'generating'`: `isReportStale()` only ever treats
 * a `'generating'` row as stale once `startedAt` is non-null AND older than
 * `PRIME_REPORT_STALE_GENERATING_MS`. A `'generating'` row with
 * `startedAt: null` is NEVER stale by that check, so `getReportRoute`'s
 * `existing.status === 'generating' && !isReportStale(existing)` branch
 * would stay true forever — it would keep returning 202 "poll again"
 * without ever calling `requestReportGeneration`, permanently wedging the
 * row. Using `'failed'` instead makes that branch false immediately
 * (status isn't `'generating'` at all), so the route falls through to
 * `fireGeneration` on the very next GET; and `claimPrimeReportGeneration`'s
 * claim condition (`status <> 'generating' OR updatedAt < ...`) matches a
 * `'failed'` row unconditionally, so the reclaim always succeeds regardless
 * of `updatedAt`. Net effect: behaves exactly like a row whose last
 * generation attempt failed and is awaiting the existing retry-on-next-GET
 * path — no new state machine needed.
 */
export async function invalidatePrimeReportsForUser(
  userId: string,
  birthProfileId: string | null,
): Promise<void> {
  await db
    .update(primeReports)
    .set({
      analysis: null,
      translations: null,
      status: 'failed',
      startedAt: null,
      error: null,
      updatedAt: new Date(),
    })
    .where(and(eq(primeReports.userId, userId), profileFilter(birthProfileId)));
}
