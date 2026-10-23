import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { ritualState, walletTransactions } from '../../db/schema.js';

/** Postgres regex for a claim row's `reason`: the date and nothing after it. The nightly
 * expiry sweep writes `daily_reward:<date>_expired` into the same ledger 30 days later;
 * matching those too (this used to be `LIKE 'daily_reward:%'`) filled the 8-row window
 * with expiry rows, so a user who came back every day stopped climbing the ladder once
 * their first claims began expiring. */
export const DAILY_REWARD_CLAIM_PATTERN = '^daily_reward:[0-9]{4}-[0-9]{2}-[0-9]{2}$';

/** The `daily_reward:<IST-date>` reason strings this user has claimed, most recent
 * first — the ledger IS the streak store, see rewards.service.ts. Callers need the
 * whole current run, not just the last 7 days: see `claimedDatesThroughGap`. */
export async function recentDailyRewardReasons(userId: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ reason: walletTransactions.reason })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.userId, userId),
        sql`${walletTransactions.reason} ~ ${DAILY_REWARD_CLAIM_PATTERN}`,
      ),
    )
    .orderBy(desc(walletTransactions.createdAt))
    .limit(limit);
  return rows.map((r) => r.reason);
}

/** Days a Morning Ritual shield covered (empty for everyone without one). The streak counts them as claimed. */
export async function shieldedDatesOf(userId: string): Promise<string[]> {
  const [row] = await db
    .select({ dates: ritualState.shieldedDates })
    .from(ritualState)
    .where(eq(ritualState.userId, userId))
    .limit(1);
  return row?.dates ?? [];
}
