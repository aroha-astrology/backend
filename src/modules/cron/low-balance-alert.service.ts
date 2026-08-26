// =============================================================================
// Low-balance share nudge — one push per dip below ₹100
// =============================================================================
// Polls users.wallet_balance_paise directly rather than hooking every credit/
// debit call site (deductWalletBalance plus half a dozen raw-SQL credit
// paths — see users.repo.ts) — the column is the single authoritative value
// no matter which path last touched it. Fires once per dip below the
// threshold; rearms only once the balance recovers back to >= threshold
// (recharge, referral bonus, etc.), so a user sitting below ₹100 for weeks
// gets exactly one nudge, not one per cron tick.
// =============================================================================

import { notifyUser } from '../../lib/notifications/notify-user.js';
import {
  rearmRecoveredLowBalanceUsers,
  findUnalertedLowBalanceUserIds,
  markLowBalanceAlerted,
} from '../users/users.repo.js';
import { logger } from '../../lib/logger.js';

/** Wallet level below which the share-prompt fires. Not a price or a payout — nothing is
 * charged or paid at this number — so it stays a constant rather than a FEATURE_REGISTRY key. */
export const DEFAULT_LOW_BALANCE_THRESHOLD_PAISE = 10000; // ₹100
export const LOW_BALANCE_NOTIFICATION_TYPE = 'low_balance_share';

const TITLE = 'Running low on balance?';
const BODY =
  "Share Aroha Astrology with friends and family! You'll earn ₹100 in wallet credit for every person who downloads the app and signs up using your referral code.";

export interface LowBalanceAlertResult {
  rearmed: number;
  alerted: number;
}

export async function runLowBalanceAlert(): Promise<LowBalanceAlertResult> {
  const rearmed = await rearmRecoveredLowBalanceUsers(DEFAULT_LOW_BALANCE_THRESHOLD_PAISE);
  const userIds = await findUnalertedLowBalanceUserIds(DEFAULT_LOW_BALANCE_THRESHOLD_PAISE);

  let alerted = 0;
  for (const userId of userIds) {
    try {
      await notifyUser(userId, { title: TITLE, body: BODY, type: LOW_BALANCE_NOTIFICATION_TYPE });
      await markLowBalanceAlerted(userId);
      alerted++;
    } catch (err) {
      logger.warn({ err, userId }, 'low-balance-alert: failed to notify/mark user');
    }
  }

  return { rearmed, alerted };
}
