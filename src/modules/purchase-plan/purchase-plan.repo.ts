import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { purchasePlans, type NewPurchasePlanRow, type PurchasePlanRow } from '../../db/schema.js';

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
  await db.update(purchasePlans).set({ status: 'processing' }).where(eq(purchasePlans.id, id));
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
