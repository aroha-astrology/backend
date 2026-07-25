import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { reports, type ReportRow } from '../../db/schema.js';

/** Consider a 'generating' row abandoned (crashed mid-run) after this long — same policy/value as gemstone. */
export const REPORT_STALE_GENERATING_MS = 5 * 60_000;

/** `birthProfileId === null` filters to the primary/self profile; a non-null id filters to that additional profile. */
function profileFilter(birthProfileId: string | null): SQL {
  return birthProfileId === null ? isNull(reports.birthProfileId) : eq(reports.birthProfileId, birthProfileId);
}

/** `periodMonth === null` filters to one-time reports; a non-null value filters to that month's row. */
function periodFilter(periodMonth: string | null): SQL {
  return periodMonth === null ? isNull(reports.periodMonth) : eq(reports.periodMonth, periodMonth);
}

/**
 * Which of the four partial unique indexes (see schema.ts's doc comment on
 * the `reports` table) a given (birthProfileId, periodMonth) combination maps
 * to — the `target`/`targetWhere` pair `onConflictDoUpdate` needs to resolve
 * against a PARTIAL index (Postgres can't infer a partial index's target from
 * the column list alone; the WHERE predicate must be repeated verbatim, same
 * reasoning as claimGemstoneGeneration's targetWhere comments).
 */
function pickReportConflictTarget(birthProfileId: string | null, periodMonth: string | null) {
  if (birthProfileId === null && periodMonth === null) {
    return {
      target: [reports.userId, reports.reportKey],
      targetWhere: sql`${reports.birthProfileId} is null and ${reports.periodMonth} is null and ${reports.input} is null`,
    };
  }
  if (birthProfileId === null && periodMonth !== null) {
    return {
      target: [reports.userId, reports.reportKey, reports.periodMonth],
      targetWhere: sql`${reports.birthProfileId} is null and ${reports.periodMonth} is not null and ${reports.input} is null`,
    };
  }
  if (birthProfileId !== null && periodMonth === null) {
    return {
      target: [reports.userId, reports.birthProfileId, reports.reportKey],
      targetWhere: sql`${reports.birthProfileId} is not null and ${reports.periodMonth} is null and ${reports.input} is null`,
    };
  }
  return {
    target: [reports.userId, reports.birthProfileId, reports.reportKey, reports.periodMonth],
    targetWhere: sql`${reports.birthProfileId} is not null and ${reports.periodMonth} is not null and ${reports.input} is null`,
  };
}

/** Single row lookup scoped by the full (user, profile, key, month) identity — used for
 * everything EXCEPT kundli_milan/partner-input rows, which have no such unique identity
 * (a user can hold many kundli_milan rows for the same profile, one per partner). */
export async function findReportRow(
  userId: string,
  birthProfileId: string | null,
  reportKey: string,
  periodMonth: string | null,
): Promise<ReportRow | undefined> {
  const rows = await db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.userId, userId),
        profileFilter(birthProfileId),
        eq(reports.reportKey, reportKey),
        periodFilter(periodMonth),
        isNull(reports.input),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function findReportById(id: string): Promise<ReportRow | undefined> {
  const rows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return rows[0];
}

/** Every report row for a user's profile, most recent first — merged with the catalogue by the service layer. */
export async function listReportsForUser(
  userId: string,
  birthProfileId: string | null,
): Promise<ReportRow[]> {
  return db
    .select()
    .from(reports)
    .where(and(eq(reports.userId, userId), profileFilter(birthProfileId)))
    .orderBy(desc(reports.createdAt));
}

export interface ClaimReportInput {
  userId: string;
  birthProfileId: string | null;
  reportKey: string;
  /** First-of-month string for monthly reports, null for one-time reports. */
  periodMonth: string | null;
  /** Partner birth details — kundli_milan only, null for every other report key. */
  input: Record<string, unknown> | null;
  pricePaidPaise: number;
}

/**
 * Insert-or-claim a report row for generation, atomically. This is
 * simultaneously the purchase-time "create the row" step AND the
 * generation-time "claim" step, exactly like `claimGemstoneGeneration`
 * unifies "first-ever creation" and "reclaim a stale/failed run" into one
 * `onConflictDoUpdate` call.
 *
 * - `input !== null` (kundli_milan): there is no uniqueness constraint on
 *   partner-input rows (see the schema doc comment) — this is a plain insert
 *   that always creates a brand-new row, so repeated purchases against
 *   different partners never collide.
 * - `input === null` (every other report key): targets whichever of the
 *   four partial unique indexes matches (birthProfileId, periodMonth)'s
 *   null-ness, with a `setWhere` claimability guard identical in spirit to
 *   claimGemstoneGeneration's — the existing row is only touched if it's not
 *   already 'ready' and not an actively-running (non-stale) 'generating' row.
 *
 * Returns the claimed row (with `startedAt` as the claim token) if THIS
 * caller won the claim (fresh insert OR reclaiming a failed/stale row), or
 * `undefined` if a live/ready row already exists for that exact identity —
 * the existing row is left completely untouched in that case (no duplicate
 * is ever inserted at the DB layer), and the caller should look it up via
 * `findReportRow` to report/refund against it.
 */
export async function claimReportRow(claim: ClaimReportInput): Promise<ReportRow | undefined> {
  const now = new Date();
  const staleSeconds = REPORT_STALE_GENERATING_MS / 1000;
  const claimable = sql`(${reports.status} <> 'generating' OR ${reports.updatedAt} < now() - ${staleSeconds} * interval '1 second')`;
  const setWhere = sql`${claimable} AND ${reports.status} <> 'ready'`;

  const values = {
    userId: claim.userId,
    birthProfileId: claim.birthProfileId,
    reportKey: claim.reportKey,
    periodMonth: claim.periodMonth,
    input: claim.input,
    pricePaidPaise: claim.pricePaidPaise,
    status: 'generating' as const,
    startedAt: now,
    error: null,
  };

  if (claim.input !== null) {
    const [row] = await db.insert(reports).values(values).returning();
    return row;
  }

  const { target, targetWhere } = pickReportConflictTarget(claim.birthProfileId, claim.periodMonth);
  const [row] = await db
    .insert(reports)
    .values(values)
    .onConflictDoUpdate({
      target,
      targetWhere,
      set: {
        status: 'generating',
        startedAt: now,
        error: null,
        pricePaidPaise: claim.pricePaidPaise,
        updatedAt: now,
      },
      setWhere,
    })
    .returning();
  return row;
}

export async function markReportReady(
  id: string,
  claimedAt: Date,
  patch: { content: Record<string, unknown>; model: string },
): Promise<void> {
  await db
    .update(reports)
    // Reset cached translations whenever the underlying English content changes — otherwise a
    // regenerated report would keep serving a translation of the PREVIOUS content forever, same
    // staleness bug markGemstoneReady's reset guards against.
    .set({ ...patch, translations: {}, status: 'ready', error: null, updatedAt: new Date() })
    .where(and(eq(reports.id, id), eq(reports.status, 'generating'), eq(reports.startedAt, claimedAt)));
}

export async function markReportFailed(id: string, claimedAt: Date, error: string): Promise<void> {
  await db
    .update(reports)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date() })
    .where(and(eq(reports.id, id), eq(reports.status, 'generating'), eq(reports.startedAt, claimedAt)));
}

export async function saveReportTranslation(
  id: string,
  language: string,
  translation: Record<string, unknown>,
): Promise<void> {
  const existing = await db
    .select({ translations: reports.translations })
    .from(reports)
    .where(eq(reports.id, id))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) return;

  const translations = { ...(existing.translations ?? {}), [language]: translation };
  await db.update(reports).set({ translations }).where(eq(reports.id, id));
}
