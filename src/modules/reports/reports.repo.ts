import { and, count, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { reports, type ReportRow, type NewReportRow } from '../../db/schema.js';
import type { ReportSection } from './report-generator.types.js';

/** Deterministic identity for partner/compatibility input — same JSON.stringify-based
 * approach as kundli.service.ts's birthHash (not a canonicalized/sorted-keys hash): input is
 * always freshly parsed from the request body on each purchase, so identical resubmissions
 * produce identical key order. Exported so callers can look up the same identity
 * claimReportRow just inserted/conflicted against (see findReportRowByInputHash). */
export function hashReportInput(input: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

/** Consider a 'generating' row abandoned (crashed mid-run) after this long — same policy/value as gemstone. */
export const REPORT_STALE_GENERATING_MS = 5 * 60_000;

/** `birthProfileId === null` filters to the primary/self profile; a non-null id filters to that additional profile. */
function profileFilter(birthProfileId: string | null): SQL {
  return birthProfileId === null
    ? isNull(reports.birthProfileId)
    : eq(reports.birthProfileId, birthProfileId);
}

/** `periodMonth === null` filters to one-time reports; a non-null value filters to that month's row. */
function periodFilter(periodMonth: string | null): SQL {
  return periodMonth === null ? isNull(reports.periodMonth) : eq(reports.periodMonth, periodMonth);
}

/**
 * Which of the six partial unique indexes (see schema.ts's doc comment on
 * the `reports` table) a given claim maps to — the `target`/`targetWhere`
 * pair `onConflictDoUpdate` needs to resolve against a PARTIAL index
 * (Postgres can't infer a partial index's target from the column list alone;
 * the WHERE predicate must be repeated verbatim, same reasoning as
 * claimGemstoneGeneration's targetWhere comments).
 *
 * `hasInput` picks the input-hash pair (partner/compatibility reports,
 * deduped on identical input rather than on periodMonth — no report key is
 * both partner-requiring and monthly today); otherwise the original
 * (birthProfileId, periodMonth) 2x2 cross.
 */
function pickReportConflictTarget(
  birthProfileId: string | null,
  periodMonth: string | null,
  hasInput: boolean,
) {
  if (hasInput) {
    if (birthProfileId === null) {
      return {
        target: [reports.userId, reports.reportKey, reports.inputHash],
        targetWhere: sql`${reports.birthProfileId} is null and ${reports.input} is not null`,
      };
    }
    return {
      target: [reports.userId, reports.birthProfileId, reports.reportKey, reports.inputHash],
      targetWhere: sql`${reports.birthProfileId} is not null and ${reports.input} is not null`,
    };
  }
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
 * everything EXCEPT kundli_milan/partner-input rows, which dedupe on input hash instead
 * (see findReportRowByInputHash). */
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

/** Same role as findReportRow but for partner/compatibility reports (input IS NOT NULL),
 * which have no periodMonth dimension and dedupe on input hash instead — see the
 * uniqInputHash* indexes claimReportRow conflicts against. */
export async function findReportRowByInputHash(
  userId: string,
  birthProfileId: string | null,
  reportKey: string,
  inputHash: string,
): Promise<ReportRow | undefined> {
  const rows = await db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.userId, userId),
        profileFilter(birthProfileId),
        eq(reports.reportKey, reportKey),
        eq(reports.inputHash, inputHash),
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
  /** True for a free preview claim (see previewReport in reports.service.ts), false for a real
   * purchase claim. Written on EVERY claim (insert and reclaim-on-conflict alike) — a real
   * purchase claim always passes false, which is what flips a preview row to non-preview when
   * the purchase reclaims it (still 'generating', or stale) via the onConflictDoUpdate below. The
   * other collision case — the preview already finished ('ready', so onConflictDoUpdate's
   * setWhere can't reclaim it) — is handled by purchaseReport calling upgradePreviewToPurchased
   * directly instead of going through this function again. */
  isPreview: boolean;
}

/**
 * Insert-or-claim a report row for generation, atomically. This is
 * simultaneously the purchase-time "create the row" step AND the
 * generation-time "claim" step, exactly like `claimGemstoneGeneration`
 * unifies "first-ever creation" and "reclaim a stale/failed run" into one
 * `onConflictDoUpdate` call.
 *
 * - `input !== null` (kundli_milan/partner/compatibility): targets whichever
 *   of the two input-hash partial indexes matches birthProfileId's
 *   null-ness, keyed on sha256(input) — see hashReportInput. Previously this
 *   was an unconditional plain insert with no conflict target at all, so a
 *   repeated purchase against the SAME partner details always created a
 *   fresh row and charged twice; different partners still never collide,
 *   same as before, since their hashes differ.
 * - `input === null` (every other report key): targets whichever of the
 *   four partial unique indexes matches (birthProfileId, periodMonth)'s
 *   null-ness.
 * - Either way, a `setWhere` claimability guard identical in spirit to
 *   claimGemstoneGeneration's applies — the existing row is only touched if
 *   it's not already 'ready' and not an actively-running (non-stale)
 *   'generating' row.
 *
 * Returns the claimed row (with `startedAt` as the claim token) if THIS
 * caller won the claim (fresh insert OR reclaiming a failed/stale row), or
 * `undefined` if a live/ready row already exists for that exact identity —
 * the existing row is left completely untouched in that case (no duplicate
 * is ever inserted at the DB layer), and the caller should look it up via
 * `findReportRow` (or `findReportRowByInputHash` for partner reports) to
 * report/refund against it.
 */
export async function claimReportRow(claim: ClaimReportInput): Promise<ReportRow | undefined> {
  const now = new Date();
  const staleSeconds = REPORT_STALE_GENERATING_MS / 1000;
  const claimable = sql`(${reports.status} <> 'generating' OR ${reports.updatedAt} < now() - ${staleSeconds} * interval '1 second')`;
  const setWhere = sql`${claimable} AND ${reports.status} <> 'ready'`;
  const inputHash = claim.input !== null ? hashReportInput(claim.input) : null;

  const values = {
    userId: claim.userId,
    birthProfileId: claim.birthProfileId,
    reportKey: claim.reportKey,
    periodMonth: claim.periodMonth,
    input: claim.input,
    inputHash,
    pricePaidPaise: claim.pricePaidPaise,
    isPreview: claim.isPreview,
    status: 'generating' as const,
    startedAt: now,
    error: null,
  };

  const { target, targetWhere } = pickReportConflictTarget(
    claim.birthProfileId,
    claim.periodMonth,
    claim.input !== null,
  );
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
        isPreview: claim.isPreview,
        updatedAt: now,
      },
      setWhere,
    })
    .returning();
  return row;
}

/**
 * All rows currently stuck in 'generating' whose claim is older than
 * REPORT_STALE_GENERATING_MS — i.e. abandoned mid-run because the process
 * that claimed them crashed or was killed before reaching
 * markReportReady/markReportFailed. Used by the periodic reaper cron
 * (POST /cron/reports-reap-stale, see reapStaleReports in
 * reports.service.ts) to self-heal rows that would otherwise sit at
 * 'generating' forever — unlike claimReportRow's staleness check, which only
 * reclaims a row when the SAME (user, profile, key, month) identity is
 * purchased again, this is an active sweep with no such trigger required.
 */
export async function findStaleGeneratingReports(): Promise<ReportRow[]> {
  const staleSeconds = REPORT_STALE_GENERATING_MS / 1000;
  return db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.status, 'generating'),
        sql`${reports.startedAt} < now() - ${staleSeconds} * interval '1 second'`,
      ),
    );
}

export async function markReportReady(
  id: string,
  claimedAt: Date,
  patch: Pick<
    NewReportRow,
    | 'content'
    | 'model'
    | 'chartSnapshot'
    | 'calculationVersion'
    | 'ephemerisVersion'
    | 'ayanamsa'
    | 'houseSystem'
    | 'nodeType'
    | 'promptVersion'
    | 'language'
  >,
): Promise<void> {
  await db
    .update(reports)
    // Reset cached translations whenever the underlying English content changes — otherwise a
    // regenerated report would keep serving a translation of the PREVIOUS content forever, same
    // staleness bug markGemstoneReady's reset guards against. generationAttempts also resets —
    // it only bounds the REAPER's automatic retry budget for the CURRENT failure streak.
    .set({
      ...patch,
      translations: {},
      status: 'ready',
      error: null,
      generationAttempts: 0,
      updatedAt: new Date(),
    })
    .where(
      and(eq(reports.id, id), eq(reports.status, 'generating'), eq(reports.startedAt, claimedAt)),
    );
}

/**
 * Overwrites an already-`ready` report's cached content in place — the bulk-admin counterpart to
 * `markReportReady` above, used by scripts/regenerate-all-report-content.ts to refresh existing
 * customers' already-purchased reports after a narrative/prompt fix, without touching their
 * purchase record (price paid, purchase date) or requiring a re-purchase. Deliberately NOT
 * claim-fenced by `startedAt` like `markReportReady` — this targets a row that's already sitting
 * in `ready`, not one freshly claimed out of `generating` — but still scoped to `status = 'ready'`
 * so it can never clobber a row that's mid-generation or already failed/refunded. Resets
 * `translations` for the same staleness reason `markReportReady` does.
 */
export async function overwriteReadyReportContent(
  id: string,
  patch: { content: Record<string, unknown>; model: string },
): Promise<void> {
  await db
    .update(reports)
    .set({ ...patch, translations: {}, error: null, updatedAt: new Date() })
    .where(and(eq(reports.id, id), eq(reports.status, 'ready')));
}

/** Every currently-`ready` report row, across all users — the enumeration side of the bulk-admin
 * content refresh above (see `overwriteReadyReportContent`). */
export async function findReadyReportRows(): Promise<ReportRow[]> {
  return db.select().from(reports).where(eq(reports.status, 'ready'));
}

/**
 * Flips a free preview row into a real purchase in place, without touching its
 * content/status — used by purchaseReport when a buyer's claimReportRow call
 * collides with a preview row that's already `ready` (so claimReportRow's own
 * onConflictDoUpdate couldn't reclaim it; see claimReportRow's setWhere guard).
 * The row keeps its existing generated content and status (almost always
 * 'ready' already, so the buyer gets it instantly), only `isPreview` and
 * `pricePaidPaise` change. Unconditional by id — the caller has already
 * confirmed via findReportRow that this row is `isPreview === true` before
 * calling this.
 */
export async function upgradePreviewToPurchased(id: string, pricePaidPaise: number): Promise<void> {
  await db
    .update(reports)
    .set({ isPreview: false, pricePaidPaise, updatedAt: new Date() })
    .where(eq(reports.id, id));
}

export async function markReportFailed(id: string, claimedAt: Date, error: string): Promise<void> {
  await db
    .update(reports)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date() })
    .where(
      and(eq(reports.id, id), eq(reports.status, 'generating'), eq(reports.startedAt, claimedAt)),
    );
}

/**
 * Persists incrementally-generated section groups WHILE generation is still in progress
 * (`status` stays 'generating') — the checkpoint a later retry resumes from if this attempt
 * fails or the process crashes before finishing. Claim-fenced like markReportReady/
 * markReportFailed, so a checkpoint write from an attempt that has since been superseded
 * (reclaimed by a newer attempt) can never land after the fact. Deliberately a wholesale
 * `content` replace, not a merge — nothing else is ever written to `content` mid-generation,
 * only the final markReportReady call writes the real shape ({sections, contentVersion, ...}),
 * which naturally drops this scratch data on success.
 */
export async function saveReportProgress(
  id: string,
  claimedAt: Date,
  sectionGroups: ReportSection[][],
): Promise<void> {
  await db
    .update(reports)
    .set({ content: { sectionGroups }, updatedAt: new Date() })
    .where(
      and(eq(reports.id, id), eq(reports.status, 'generating'), eq(reports.startedAt, claimedAt)),
    );
}

/**
 * Reclaims a row the stale-reaper found abandoned (crashed mid-run) for an automatic retry —
 * same claim-fencing shape as claimReportRow's reclaim path (id + status='generating' + the
 * PREVIOUS startedAt token), but reached directly by id since the reaper already has the row
 * rather than re-deriving its purchase identity. Bumps `generationAttempts` (the reaper's
 * retry budget) and stamps a fresh `startedAt` claim token; `content` (and any checkpointed
 * sectionGroups in it) is left untouched, so a resumable generator picks up where it left off.
 * Returns undefined if someone else already reclaimed or finished this row (lost the race) —
 * same "empty RETURNING means lost the race" convention as every other guarded transition in
 * this codebase.
 */
export async function reclaimStaleReportForRetry(
  id: string,
  previousStartedAt: Date,
): Promise<ReportRow | undefined> {
  const now = new Date();
  const [row] = await db
    .update(reports)
    .set({
      startedAt: now,
      generationAttempts: sql`${reports.generationAttempts} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(reports.id, id),
        eq(reports.status, 'generating'),
        eq(reports.startedAt, previousStartedAt),
      ),
    )
    .returning();
  return row;
}

/**
 * Merges into `translations[language]` rather than replacing it wholesale —
 * `saveReportScoresTranslation` below may independently write a `scoresProse`
 * sub-key into the same per-language slot (translated on its own trigger,
 * possibly in the same request); a wholesale replace here would silently
 * discard it.
 */
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

  const forLanguage = existing.translations?.[language] ?? {};
  const translations = {
    ...(existing.translations ?? {}),
    [language]: { ...forLanguage, ...translation },
  };
  await db.update(reports).set({ translations }).where(eq(reports.id, id));
}

/**
 * Read-merges into `translations[language]` — unlike `saveReportTranslation`
 * above (which replaces `translations[language]` wholesale), this only
 * touches the `scoresProse` sub-key, preserving whatever `sections` value is
 * already cached there. `sections` and `scoresProse` translate on independent
 * triggers (sections translate lazily once; scoresProse re-translates
 * whenever its content hash changes), so a wholesale replace here would let
 * whichever one saves second silently clobber the other.
 */
export async function saveReportScoresTranslation(
  id: string,
  language: string,
  scoresProse: { hash: string; values: string[] },
): Promise<void> {
  const existing = await db
    .select({ translations: reports.translations })
    .from(reports)
    .where(eq(reports.id, id))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) return;

  const translations = { ...(existing.translations ?? {}) };
  const forLanguage = translations[language] ?? {};
  translations[language] = { ...forLanguage, scoresProse };
  await db.update(reports).set({ translations }).where(eq(reports.id, id));
}

/**
 * Ready, real-purchase (non-preview) report counts grouped by report key,
 * across ALL users — the public social-proof number ("1,926 reports
 * generated"). Deliberately excludes preview rows (isPreview = true) and
 * anything not yet `ready` — see previewReport/GET /reports/stats. The
 * service layer caches this (see reports.service.ts) rather than calling it
 * on every page load.
 */
export async function countReadyReportsByKey(): Promise<{ reportKey: string; count: number }[]> {
  const rows = await db
    .select({ reportKey: reports.reportKey, count: count() })
    .from(reports)
    .where(and(eq(reports.status, 'ready'), eq(reports.isPreview, false)))
    .groupBy(reports.reportKey);
  return rows.map((row) => ({ reportKey: row.reportKey, count: row.count }));
}
