import { and, desc, eq, like } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { walletTransactions } from '../../db/schema.js';

/** The `daily_reward:<IST-date>` reason strings this user has claimed, most recent
 * first — the ledger IS the streak store, see rewards.service.ts. 8 rows is enough
 * to reconstruct any 7-day cycle plus one lookback day. */
export async function recentDailyRewardReasons(userId: string, limit = 8): Promise<string[]> {
  const rows = await db
    .select({ reason: walletTransactions.reason })
    .from(walletTransactions)
    .where(
      and(eq(walletTransactions.userId, userId), like(walletTransactions.reason, 'daily_reward:%')),
    )
    .orderBy(desc(walletTransactions.createdAt))
    .limit(limit);
  return rows.map((r) => r.reason);
}
