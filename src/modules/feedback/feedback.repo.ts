import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { userFeedback, users, walletTransactions } from '../../db/schema.js';
import { encryptField } from '../../lib/crypto/field-encryption.js';

/** Fail-open fallback only — the paid amount is the admin-set `referral.feedbackReward`, passed in by the caller. */
export const FEEDBACK_REWARD_FALLBACK_PAISE = 5000;
const FEEDBACK_REWARD_REASON = 'feedback_reward';

/**
 * Whether this user has ever rated us, from any device. Surfaced on the user
 * DTO so the app's automatic rating prompt can stay quiet for someone who
 * already answered it — localStorage alone forgets on reinstall or a new
 * phone, and re-asking a user who already rated is exactly what the prompt is
 * supposed to avoid. Covered by `user_feedback_user_id_idx`.
 */
export async function hasGivenFeedback(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: userFeedback.id })
    .from(userFeedback)
    .where(eq(userFeedback.userId, userId))
    .limit(1);
  return row !== undefined;
}

/**
 * Store a rating (+ optional comment, encrypted at rest like support tickets'
 * message) and, the first time only, credit the reward.
 *
 * Deliberately triggered by OUR feedback sheet and nothing else. The Google
 * Play review card never reaches this path — it reports no outcome back — so
 * nobody is ever paid for a Play Store review, which Play policy prohibits.
 *
 * One transaction: the reward is decided from the ledger and written alongside
 * the feedback row, so two concurrent submissions cannot both see "no prior
 * reward" and double-pay.
 */
export async function recordFeedback(input: {
  userId: string;
  rating: number;
  comment?: string;
  /** Admin-resolved reward, from `referral.feedbackReward`. 0 pays nothing. */
  rewardPaise: number;
}): Promise<{ id: string; rewarded: boolean }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(userFeedback)
      .values({
        userId: input.userId,
        rating: input.rating,
        comment: input.comment ? (encryptField(input.comment) as string) : null,
      })
      .returning({ id: userFeedback.id });
    if (!row) throw new Error('recordFeedback: insert returned no row');

    // Lock the user row first so a concurrent submission serialises behind this
    // one instead of racing the ledger check below.
    const [locked] = await tx.execute<{ id: string }>(sql`
      SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE;
    `);
    if (!locked) return { id: row.id, rewarded: false };

    const [prior] = await tx
      .select({ id: walletTransactions.id })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.userId, input.userId),
          eq(walletTransactions.reason, FEEDBACK_REWARD_REASON),
        ),
      )
      .limit(1);
    if (prior) return { id: row.id, rewarded: false };
    if (input.rewardPaise <= 0) return { id: row.id, rewarded: false };

    const [updated] = await tx
      .update(users)
      .set({ walletBalancePaise: sql`${users.walletBalancePaise} + ${input.rewardPaise}` })
      .where(eq(users.id, input.userId))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!updated) return { id: row.id, rewarded: false };

    await tx.insert(walletTransactions).values({
      userId: input.userId,
      delta: input.rewardPaise,
      reason: FEEDBACK_REWARD_REASON,
      balanceAfter: updated.walletBalancePaise,
    });

    return { id: row.id, rewarded: true };
  });
}
