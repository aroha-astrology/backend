// =============================================================================
// The Aroha Pass on an iPhone: StoreKit 2 (switch money.storekit, OFF; code only)
// =============================================================================
// Apple's rule (App Review 3.1.1): on iOS the Pass and coins are sold through the App Store.
// The app buys `aroha_pass_<tier>` with `appAccountToken` = our user id and posts the signed
// transaction here; Apple's App Store Server Notifications V2 then keep the row in step
// (renewed, renewal switched off, billing retry, grace period, expired, refunded, revoked).
// Everything is checked against Apple's own signature (billing/app-store-verify.ts); nothing a
// client says is taken on trust. Needs the iOS app build with the AppStore plugin, the products
// in App Store Connect and the notification URL set there; none of that exists yet.
// =============================================================================

import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendAlert } from '../../lib/notifications/telegram.js';
import { isFeatureOn } from '../features/features.service.js';
import {
  verifyAppleNotification,
  verifyAppleTransaction,
  type AppleJwsOptions,
  type AppleRenewalInfo,
  type AppleTransaction,
} from '../billing/app-store-verify.js';
import { tierForAppStoreProduct } from './pass.config.js';
import { syncStorePass, type StoreSnapshot, type StoreSyncResult } from './pass-store-sync.js';

export async function requireStoreKit(userId: string): Promise<void> {
  let on = false;
  try {
    on = await isFeatureOn(userId, 'money.storekit');
  } catch {
    on = false;
  }
  if (!on) throw Errors.forbidden('FEATURE_DISABLED');
}

/** What Apple says about a subscription (its latest transaction and renewal info) as a snapshot. */
export function appStoreSnapshot(
  tx: AppleTransaction,
  renewal: AppleRenewalInfo | null,
  now: Date = new Date(),
): StoreSnapshot {
  const tier = tierForAppStoreProduct(tx.productId);
  // In a billing grace period Apple keeps the subscription working until the grace ends.
  const paidEnd = Math.max(tx.expiresDate ?? 0, renewal?.gracePeriodExpiresDate ?? 0);
  const end = paidEnd > 0 ? new Date(paidEnd) : null;
  const revoked = tx.revocationDate != null;
  const live = !revoked && end !== null && end > now;
  const autoRenew = renewal ? renewal.autoRenewStatus === 1 : true;
  return {
    source: 'app_store',
    externalId: tx.originalTransactionId,
    userId: tx.appAccountToken?.toLowerCase() ?? null,
    tier,
    live,
    autoRenew: autoRenew && !revoked,
    periodStart: new Date(tx.purchaseDate),
    periodEnd: end,
    state: revoked
      ? 'revoked'
      : renewal?.isInBillingRetryPeriod
        ? 'billing_retry'
        : live
          ? 'active'
          : 'expired',
    cancelled: !autoRenew,
    // Billing retry past the end is not the end yet: Apple may still collect and renew it.
    ended: revoked || (!live && !renewal?.isInBillingRetryPeriod),
    orderId: tx.transactionId,
  };
}

/** The app bought (or restored) a Pass: check Apple's signature, that it is this user's, record it. */
export async function confirmAppStorePass(
  userId: string,
  signedTransaction: string,
  opts: AppleJwsOptions = {},
): Promise<StoreSyncResult> {
  await requireStoreKit(userId);
  const tx = verifyAppleTransaction(signedTransaction, opts);
  if (!tierForAppStoreProduct(tx.productId)) throw Errors.badRequest('NOT_A_PASS_PRODUCT');
  if (tx.appAccountToken?.toLowerCase() !== userId.toLowerCase())
    throw Errors.forbidden('APP_STORE_OTHER_ACCOUNT');
  const result = await syncStorePass(appStoreSnapshot(tx, null, opts.now), opts.now);
  if (!result.recorded) throw Errors.conflict('APP_STORE_SUBSCRIPTION_NOT_ACTIVE');
  return result;
}

/**
 * App Store Server Notifications V2. Subscription notices re-sync the Pass from the signed
 * transaction and renewal info inside them. A refunded coin pack is reported to the admin chat
 * (coins already spent can't simply be taken back; the owner decides). Throws only on a bad
 * signature (the route answers 400) or a database failure (500, Apple retries).
 */
export async function handleAppStoreNotification(
  signedPayload: string,
  opts: AppleJwsOptions = {},
): Promise<StoreSyncResult | null> {
  const n = verifyAppleNotification(signedPayload, opts);
  const tx = n.transaction;
  if (!tx) return null;
  if (tierForAppStoreProduct(tx.productId)) {
    const result = await syncStorePass(appStoreSnapshot(tx, n.renewal, opts.now), opts.now);
    if (!result.recorded) {
      logger.info(
        { type: n.notificationType, subtype: n.subtype, productId: tx.productId },
        'pass: App Store notice with nothing to record',
      );
    }
    return result;
  }
  if (n.notificationType === 'REFUND') {
    void sendAlert(
      'App Store refund',
      `${tx.productId} (transaction ${tx.transactionId}, user ${tx.appAccountToken ?? 'unknown'}) was refunded by Apple. Coins were not taken back.`,
    ).catch(() => {});
  }
  return null;
}
