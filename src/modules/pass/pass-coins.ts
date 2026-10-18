import { logger } from '../../lib/logger.js';
import { isFeatureOn } from '../features/features.service.js';
import { addWalletBalance } from '../users/users.repo.js';
import { PASS_TIERS } from './pass.config.js';

/**
 * The Pass's monthly coin gift (v7 spec, switch `money.passCoins`): Gold gets 100 coins and
 * Platinum 200 at the start of every Pass period. The gift does not expire and is not tied to
 * spending (the owner's spec says "+100 coins a month" and nothing about expiry).
 *
 * Paid once per (subscription, period start): the ledger key makes a repeated renewal
 * notification, or a sync that runs twice, a no-op. Never throws: a failed gift must not stop the
 * Pass itself from being recorded or renewed.
 *
 * @param variant `user_subscriptions.price_variant`: 'A' silver, 'B' gold, 'C' platinum, or null for a
 *   Pass from before the tiers (no gift).
 * @returns the paise credited; 0 when nothing was due.
 */
export async function grantPassMonthlyCoins(
  userId: string,
  variant: string | null,
  subscriptionId: string,
  periodStart: Date,
): Promise<number> {
  try {
    const tier = PASS_TIERS.find((t) => t.variant === variant);
    if (!tier || tier.monthlyCoins <= 0) return 0;
    if (!(await isFeatureOn(userId, 'money.passCoins'))) return 0;

    const paise = tier.monthlyCoins * 100;
    const credited = await addWalletBalance(userId, paise, `pass_monthly_coins:${tier.tier}`, {
      idempotencyKey: `pass_coins:${subscriptionId}:${periodStart.toISOString().slice(0, 10)}`,
    });
    return credited ? paise : 0;
  } catch (err) {
    logger.error({ err, userId, subscriptionId }, 'pass monthly coin gift failed (skipped)');
    return 0;
  }
}
