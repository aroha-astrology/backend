import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { purchasePlans, type NewPurchasePlanRow, type PurchasePlanRow } from '../../db/schema.js';
import { SUPPORTED_LANGS } from '../cron/broadcast-copy.js';

/** Same self-heal window as REPORT_STALE_GENERATING_MS / VASTU_STALE_PROCESSING_MS. */
export const PURCHASE_PLAN_STALE_PROCESSING_MS = 5 * 60_000;

export async function insertPendingPlan(row: NewPurchasePlanRow): Promise<PurchasePlanRow> {
  const [inserted] = await db.insert(purchasePlans).values(row).returning();
  if (!inserted) throw new Error('Failed to insert purchase plan');
  return inserted;
}

export async function listPlansForUser(userId: string, limit = 10): Promise<PurchasePlanRow[]> {
  return db
    .select()
    .from(purchasePlans)
    .where(eq(purchasePlans.userId, userId))
    .orderBy(desc(purchasePlans.createdAt))
    .limit(limit);
}

export async function findPlanForUser(
  id: string,
  userId: string,
): Promise<PurchasePlanRow | undefined> {
  const rows = await db
    .select()
    .from(purchasePlans)
    .where(and(eq(purchasePlans.id, id), eq(purchasePlans.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function countRecentPlansForUser(
  userId: string,
  sinceHoursAgo: number,
): Promise<number> {
  const since = new Date(Date.now() - sinceHoursAgo * 60 * 60 * 1000);
  const rows = await db
    .select({ id: purchasePlans.id })
    .from(purchasePlans)
    .where(and(eq(purchasePlans.userId, userId), gte(purchasePlans.createdAt, since)));
  return rows.length;
}

export async function markProcessing(id: string): Promise<void> {
  await db
    .update(purchasePlans)
    .set({ status: 'processing', startedAt: new Date() })
    .where(eq(purchasePlans.id, id));
}

/** Rows abandoned mid-run because the process that claimed them died before reaching
 *  markDone/markError. This feature is free (no wallet charge), so unlike the vastu/reports/
 *  palm reapers there is nothing to refund — reaping here just unsticks the row and frees the
 *  slot it was silently holding against DAILY_PLAN_LIMIT (countRecentPlansForUser counts every
 *  row regardless of status). */
export async function findStaleProcessingPlans(): Promise<PurchasePlanRow[]> {
  const cutoff = new Date(Date.now() - PURCHASE_PLAN_STALE_PROCESSING_MS);
  return db
    .select()
    .from(purchasePlans)
    .where(and(eq(purchasePlans.status, 'processing'), lt(purchasePlans.startedAt, cutoff)));
}

export async function markDone(id: string, analysis: Record<string, unknown>): Promise<void> {
  await db
    .update(purchasePlans)
    .set({ status: 'done', analysis, completedAt: new Date() })
    .where(eq(purchasePlans.id, id));
}

export async function markError(id: string, errorMessage: string): Promise<void> {
  await db
    .update(purchasePlans)
    .set({ status: 'error', errorMessage, completedAt: new Date() })
    .where(eq(purchasePlans.id, id));
}

export async function deletePlanForUser(id: string, userId: string): Promise<void> {
  await db
    .delete(purchasePlans)
    .where(and(eq(purchasePlans.id, id), eq(purchasePlans.userId, userId)));
}

export async function savePurchasePlanTranslation(
  id: string,
  language: string,
  translation: Record<string, unknown>,
): Promise<void> {
  // Guard against an unvalidated language writing an arbitrary/multi-segment jsonb path —
  // parameterized, so never an injection risk, just a data-shape one.
  if (!SUPPORTED_LANGS.includes(language as (typeof SUPPORTED_LANGS)[number])) {
    throw new Error(`savePurchasePlanTranslation: unsupported language "${language}"`);
  }
  // Use jsonb_set to inject the translation at {translations, [language]}
  // without clobbering other languages in the same row.
  await db.execute(sql`
    UPDATE ${purchasePlans}
    SET translations = jsonb_set(
      COALESCE(translations, '{}'::jsonb),
      ${`{${language}}`},
      ${JSON.stringify(translation)}::jsonb,
      true
    )
    WHERE id = ${id}
  `);
}
