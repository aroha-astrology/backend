import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { vastuPlans, type NewVastuPlanRow, type VastuPlanRow } from '../../db/schema.js';
import { SUPPORTED_LANGS } from '../cron/broadcast-copy.js';

/** Same self-heal window as REPORT_STALE_GENERATING_MS / PALM_STALE_GENERATING_MS. */
export const VASTU_STALE_PROCESSING_MS = 5 * 60_000;

/** `birthProfileId === null` filters to the primary/self profile; a non-null id filters to that additional profile. */
function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(vastuPlans.birthProfileId)
    : eq(vastuPlans.birthProfileId, birthProfileId);
}

export async function insertPendingPlan(row: NewVastuPlanRow): Promise<VastuPlanRow> {
  const [inserted] = await db.insert(vastuPlans).values(row).returning();
  if (!inserted) throw new Error('Failed to insert vastu plan');
  return inserted;
}

export async function listPlansForUser(
  userId: string,
  birthProfileId: string | null,
  limit = 10,
): Promise<VastuPlanRow[]> {
  return db
    .select()
    .from(vastuPlans)
    .where(and(eq(vastuPlans.userId, userId), profileFilter(birthProfileId)))
    .orderBy(desc(vastuPlans.createdAt))
    .limit(limit);
}

export async function findPlanForUser(
  id: string,
  userId: string,
): Promise<VastuPlanRow | undefined> {
  const rows = await db
    .select()
    .from(vastuPlans)
    .where(and(eq(vastuPlans.id, id), eq(vastuPlans.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function countRecentPlansForUser(
  userId: string,
  sinceHoursAgo: number,
): Promise<number> {
  const since = new Date(Date.now() - sinceHoursAgo * 60 * 60 * 1000);
  const rows = await db
    .select({ id: vastuPlans.id })
    .from(vastuPlans)
    .where(and(eq(vastuPlans.userId, userId), gte(vastuPlans.createdAt, since)));
  return rows.length;
}

export async function markProcessing(id: string): Promise<void> {
  await db
    .update(vastuPlans)
    .set({ status: 'processing', startedAt: new Date() })
    .where(eq(vastuPlans.id, id));
}

/** Rows abandoned mid-run because the process that claimed them died before reaching
 *  markDone/markError — same self-heal as reports.repo.ts's findStaleGeneratingReports. */
export async function findStaleProcessingPlans(): Promise<VastuPlanRow[]> {
  const cutoff = new Date(Date.now() - VASTU_STALE_PROCESSING_MS);
  return db
    .select()
    .from(vastuPlans)
    .where(and(eq(vastuPlans.status, 'processing'), lt(vastuPlans.startedAt, cutoff)));
}

export async function markDone(id: string, analysis: Record<string, unknown>): Promise<void> {
  await db
    .update(vastuPlans)
    .set({ status: 'done', analysis, completedAt: new Date() })
    .where(eq(vastuPlans.id, id));
}

export async function markError(id: string, errorMessage: string): Promise<void> {
  await db
    .update(vastuPlans)
    .set({ status: 'error', errorMessage, completedAt: new Date() })
    .where(eq(vastuPlans.id, id));
}

export async function deletePlanForUser(id: string, userId: string): Promise<void> {
  await db.delete(vastuPlans).where(and(eq(vastuPlans.id, id), eq(vastuPlans.userId, userId)));
}

/**
 * Persist the single follow-up Q&A into analysis.followUp (jsonb_set) — but only if no
 * follow-up is stored yet. The guard lives in the WHERE clause, not a prior read: two
 * concurrent requests (double-tap, retry after a slow response) can both pass the caller's
 * `ALREADY_ASKED` check, but only one of them can win this UPDATE, so a paid-for duplicate
 * LLM answer can never silently overwrite the one the user already saw. Returns false if
 * someone else's follow-up already won.
 */
export async function saveFollowUpIfAbsent(
  id: string,
  followUp: { question: string; answer: string },
): Promise<boolean> {
  // Also resets `translations` to force a fresh (now-complete, including
  // this followUp) translation on the next non-English read — a cached
  // translation from before this follow-up was asked has no `followUp`
  // field at all, and would otherwise silently omit it forever.
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE ${vastuPlans}
    SET analysis = jsonb_set(
      COALESCE(analysis, '{}'::jsonb),
      '{followUp}',
      ${JSON.stringify(followUp)}::jsonb,
      true
    ),
    translations = '{}'::jsonb
    WHERE id = ${id} AND NOT (COALESCE(analysis, '{}'::jsonb) ? 'followUp')
    RETURNING id
  `);
  return rows.length > 0;
}

export async function saveVastuTranslation(
  id: string,
  language: string,
  translation: Record<string, unknown>,
): Promise<void> {
  // Guard against an unvalidated language writing an arbitrary/multi-segment jsonb path —
  // parameterized, so never an injection risk, just a data-shape one.
  if (!SUPPORTED_LANGS.includes(language as (typeof SUPPORTED_LANGS)[number])) {
    throw new Error(`saveVastuTranslation: unsupported language "${language}"`);
  }
  await db.execute(sql`
    UPDATE ${vastuPlans}
    SET translations = jsonb_set(
      COALESCE(translations, '{}'::jsonb),
      ${`{${language}}`},
      ${JSON.stringify(translation)}::jsonb,
      true
    )
    WHERE id = ${id}
  `);
}
