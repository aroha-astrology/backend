import { logger } from '../../lib/logger.js';
import { istDateString } from '../../lib/astro-tools/transit-events.js';
import { globalPayoutOf, isFeatureOnGlobally, payoutOf } from '../features/features.service.js';
import { addWalletBalance, findActiveUserById } from '../users/users.repo.js';

/**
 * The signup bonus in three stages (v7 spec, switch `money.signupDrip`):
 *   1. on signup: the opening balance, written when the account is created;
 *   2. the first daily check-in on a LATER day than signup (the Morning Ritual takes this over
 *      when it ships);
 *   3. the first extra profile the user adds.
 * Together they equal the old all-at-once bonus (101 + 50 + 50 coins = ₹201), so a user who
 * does everything ends up with the same money, just not all of it on day one.
 *
 * Only accounts created while the switch was ON carry `users.signup_drip`, so turning it on
 * later never pays stages 2 and 3 to anyone who already got the full bonus.
 */

export const STAGE_KEYS = {
  1: { key: 'money.signupFirst', fallbackPaise: 10100 },
  2: { key: 'money.signupSecond', fallbackPaise: 5000 },
  3: { key: 'money.signupThird', fallbackPaise: 5000 },
} as const;

export type SignupStage = 2 | 3;

/** The opening balance of a new account and whether it was created under the 3-stage bonus. */
export async function openingBalanceForNewUser(
  allAtOnce: () => Promise<number>,
): Promise<{ walletBalancePaise: number; signupDrip: boolean }> {
  if (await isFeatureOnGlobally('money.signupDrip')) {
    const stage = STAGE_KEYS[1];
    return {
      walletBalancePaise: await globalPayoutOf(stage.key, stage.fallbackPaise),
      signupDrip: true,
    };
  }
  return { walletBalancePaise: await allAtOnce(), signupDrip: false };
}

/**
 * Pays signup stage 2 or 3 to an account created under the 3-stage bonus, once. Safe to call on
 * every check-in and every profile creation: the ledger key `signup_stage:<n>` makes a repeat a
 * no-op. Never throws (a failed bonus must not break the action that triggered it); returns the
 * paise credited, 0 when nothing was due.
 */
export async function grantSignupStage(
  userId: string,
  stage: SignupStage,
  now: Date = new Date(),
): Promise<number> {
  try {
    const user = await findActiveUserById(userId);
    if (!user || !user.signupDrip) return 0;

    // Stage 2 needs a later calendar day than signup (IST, like the daily reward itself).
    if (stage === 2 && istDateString(user.createdAt) >= istDateString(now)) return 0;

    const { key, fallbackPaise } = STAGE_KEYS[stage];
    const amountPaise = await payoutOf(userId, key, fallbackPaise);
    if (amountPaise <= 0) return 0;

    const credited = await addWalletBalance(userId, amountPaise, `signup_stage_${stage}`, {
      idempotencyKey: `signup_stage:${stage}`,
    });
    return credited ? amountPaise : 0;
  } catch (err) {
    logger.error({ err, userId, stage }, 'signup bonus stage failed (skipped)');
    return 0;
  }
}
