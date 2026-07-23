import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { primeReports, users, walletTransactions, type PrimeReportRow } from '../../db/schema.js';

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
 * period) OR the wallet balance is insufficient — so a double-click can
 * never double-charge or create a duplicate row.
 */
export async function unlockPrimeReport(
  userId: string,
  birthProfileId: string | null,
  reportType: string,
  period: string,
  pricePaise: number,
): Promise<PrimeReportRow | undefined> {
  return db.transaction(async (tx) => {
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
