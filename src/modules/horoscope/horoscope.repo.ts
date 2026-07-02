import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { dailyHoroscopes, users, type DailyHoroscopeRow, type UserRow } from '../../db/schema.js';

/** Keyset page of active users (deletedAt IS NULL), ordered by id for stable paging. */
export async function listActiveUsersAfter(
  afterId: string | null,
  limit: number,
): Promise<UserRow[]> {
  const where = afterId
    ? and(isNull(users.deletedAt), gt(users.id, afterId))
    : isNull(users.deletedAt);
  return db.select().from(users).where(where).orderBy(asc(users.id)).limit(limit);
}

export async function findHoroscope(
  userId: string,
  forDate: string,
): Promise<DailyHoroscopeRow | undefined> {
  const rows = await db
    .select()
    .from(dailyHoroscopes)
    .where(and(eq(dailyHoroscopes.userId, userId), eq(dailyHoroscopes.forDate, forDate)))
    .limit(1);
  return rows[0];
}

/** Idempotent per (userId, forDate): re-running the day's job overwrites cleanly. */
export async function upsertHoroscope(
  userId: string,
  forDate: string,
  summary: string,
  model: string,
): Promise<void> {
  await db
    .insert(dailyHoroscopes)
    .values({ userId, forDate, summary, model })
    .onConflictDoUpdate({
      target: [dailyHoroscopes.userId, dailyHoroscopes.forDate],
      set: { summary, model, updatedAt: new Date() },
    });
}
