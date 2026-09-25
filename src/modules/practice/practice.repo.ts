import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { practiceLog } from '../../db/schema.js';

/** Marks an item done for a day; a second call for the same day and item is a no-op. */
export async function markPracticeDone(
  userId: string,
  practiceDate: string,
  itemId: string,
): Promise<void> {
  await db.insert(practiceLog).values({ userId, practiceDate, itemId }).onConflictDoNothing();
}

/** Every completion in [from, to], as { date, itemId } pairs. */
export async function listPracticeDone(
  userId: string,
  from: string,
  to: string,
): Promise<Array<{ date: string; itemId: string }>> {
  const rows = await db
    .select({ date: practiceLog.practiceDate, itemId: practiceLog.itemId })
    .from(practiceLog)
    .where(
      and(
        eq(practiceLog.userId, userId),
        gte(practiceLog.practiceDate, from),
        lte(practiceLog.practiceDate, to),
      ),
    );
  return rows;
}
