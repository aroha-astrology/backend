import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { ritualCompletions, ritualState } from '../../db/schema.js';
import { MAX_SHIELDS } from './ritual-rules.js';

export type RitualCompletionRow = typeof ritualCompletions.$inferSelect;
export type RitualStateRow = typeof ritualState.$inferSelect;

export async function findCompletion(
  userId: string,
  localDate: string,
): Promise<RitualCompletionRow | undefined> {
  const [row] = await db
    .select()
    .from(ritualCompletions)
    .where(and(eq(ritualCompletions.userId, userId), eq(ritualCompletions.localDate, localDate)))
    .limit(1);
  return row;
}

/** Inserts today's completion; undefined when a row for the day already exists (a double tap or a second device). */
export async function insertCompletion(
  values: typeof ritualCompletions.$inferInsert,
): Promise<RitualCompletionRow | undefined> {
  const [row] = await db
    .insert(ritualCompletions)
    .values(values)
    .onConflictDoNothing({ target: [ritualCompletions.userId, ritualCompletions.localDate] })
    .returning();
  return row;
}

export async function getState(userId: string): Promise<RitualStateRow> {
  const [row] = await db.select().from(ritualState).where(eq(ritualState.userId, userId)).limit(1);
  return row ?? { userId, shields: 0, cosmicKeys: 0, shieldedDates: [], updatedAt: new Date() };
}

/**
 * Spends one shield on `date`. True when a shield was spent; false when there is none left or
 * the date is already covered, so two devices cannot spend two shields on one gap.
 */
export async function spendShield(userId: string, date: string): Promise<boolean> {
  const rows = await db
    .update(ritualState)
    .set({
      shields: sql`${ritualState.shields} - 1`,
      shieldedDates: sql`array_append(${ritualState.shieldedDates}, ${date})`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(ritualState.userId, userId),
        sql`${ritualState.shields} > 0`,
        sql`NOT (${date} = ANY(${ritualState.shieldedDates}))`,
      ),
    )
    .returning({ userId: ritualState.userId });
  return rows.length > 0;
}

/** Adds one shield (capped) and/or one Cosmic Key, creating the row on first use. */
export async function addPerks(
  userId: string,
  perks: { shield?: boolean; key?: boolean },
): Promise<RitualStateRow> {
  const shield = perks.shield ? 1 : 0;
  const key = perks.key ? 1 : 0;
  const [row] = await db
    .insert(ritualState)
    .values({ userId, shields: Math.min(shield, MAX_SHIELDS), cosmicKeys: key })
    .onConflictDoUpdate({
      target: ritualState.userId,
      set: {
        shields: sql`LEAST(${ritualState.shields} + ${shield}, ${MAX_SHIELDS})`,
        cosmicKeys: sql`${ritualState.cosmicKeys} + ${key}`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return row!;
}
