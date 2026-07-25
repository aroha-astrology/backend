import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { vastuPlans, type NewVastuPlanRow, type VastuPlanRow } from '../../db/schema.js';

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
  await db.update(vastuPlans).set({ status: 'processing' }).where(eq(vastuPlans.id, id));
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

/** Persist the single follow-up Q&A into analysis.followUp (jsonb_set). */
export async function saveFollowUp(
  id: string,
  followUp: { question: string; answer: string },
): Promise<void> {
  await db.execute(sql`
    UPDATE ${vastuPlans}
    SET analysis = jsonb_set(
      COALESCE(analysis, '{}'::jsonb),
      '{followUp}',
      ${JSON.stringify(followUp)}::jsonb,
      true
    )
    WHERE id = ${id}
  `);
}

export async function saveVastuTranslation(
  id: string,
  language: string,
  translation: Record<string, unknown>,
): Promise<void> {
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
