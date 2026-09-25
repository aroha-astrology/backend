// =============================================================================
// Aroha Pass on Google Play (paid.arohaPassPlay, ships off)
// =============================================================================
// The Android app buys the `aroha_pass_monthly` subscription (base plan per
// price variant) and posts the purchase token here; we check it with Google
// (purchases.subscriptionsv2), acknowledge it — a subscription must be
// acknowledged within 3 days or Google refunds it; it is never "consumed"
// like a top-up — and keep a user_subscriptions row in step. After that,
// Real-time Developer Notifications (billing.routes.ts's RTDN webhook) move
// the row along: renewed → next period with a fresh question quota; grace
// period stays active; on hold / expired / revoked → ends; cancelled → stops
// renewing but runs to the end of the paid period.
// =============================================================================

import { getAndroidPublisher, GOOGLE_PLAY_PACKAGE_NAME } from '../../config/google-play.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { PASS_PLAY_PRODUCT_ID, PASS_VARIANTS } from './pass.config.js';
import { findPassByExternalId, insertPass, renewPass, updatePlayPass } from './pass.repo.js';

const MS_PER_DAY = 86_400_000;
const LIVE_STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);

export interface PlaySubscription {
  state: string;
  productId: string | null;
  basePlanId: string | null;
  expiry: Date | null;
  autoRenew: boolean;
  acknowledged: boolean;
  accountId: string | null;
  linkedPurchaseToken: string | null;
}

export async function fetchPlaySubscription(purchaseToken: string): Promise<PlaySubscription> {
  const client = getAndroidPublisher();
  const { data } = await client.purchases.subscriptionsv2.get({
    packageName: GOOGLE_PLAY_PACKAGE_NAME,
    token: purchaseToken,
  });
  const item = data.lineItems?.[0];
  return {
    state: data.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED',
    productId: item?.productId ?? null,
    basePlanId: item?.offerDetails?.basePlanId ?? null,
    expiry: item?.expiryTime ? new Date(item.expiryTime) : null,
    autoRenew: item?.autoRenewingPlan?.autoRenewEnabled === true,
    acknowledged: data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    accountId: data.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    linkedPurchaseToken: data.linkedPurchaseToken ?? null,
  };
}

async function acknowledge(purchaseToken: string): Promise<void> {
  await getAndroidPublisher().purchases.subscriptions.acknowledge({
    packageName: GOOGLE_PLAY_PACKAGE_NAME,
    subscriptionId: PASS_PLAY_PRODUCT_ID,
    token: purchaseToken,
    requestBody: {},
  });
}

function variantOf(basePlanId: string | null) {
  return PASS_VARIANTS.find((v) => v.playBasePlan === basePlanId) ?? null;
}

/**
 * Brings our row for `purchaseToken` in line with Google's view, creating it
 * for `userId` when it doesn't exist yet. Returns false when there's nothing
 * live to record (and no row to update).
 */
export async function syncPlayPass(
  purchaseToken: string,
  sub: PlaySubscription,
  userId: string | null,
): Promise<boolean> {
  const live = LIVE_STATES.has(sub.state) && sub.expiry !== null;
  const existing = await findPassByExternalId(purchaseToken);

  // An upgrade/resubscribe replaces an older token: that one stops here.
  if (sub.linkedPurchaseToken) {
    const old = await findPassByExternalId(sub.linkedPurchaseToken);
    if (old && old.status === 'active')
      await updatePlayPass(old.id, { status: 'expired', autoRenew: false });
  }

  if (existing) {
    const prevEnd = existing.periodEnd?.getTime() ?? 0;
    if (live && sub.expiry!.getTime() > prevEnd + MS_PER_DAY) {
      // A renewal: the next period starts where the last one ended, with a fresh quota.
      await renewPass(existing.id, { start: existing.periodEnd ?? new Date(), end: sub.expiry! });
    }
    await updatePlayPass(existing.id, {
      status: live ? 'active' : sub.state === 'SUBSCRIPTION_STATE_CANCELED' ? 'active' : 'expired',
      autoRenew: sub.autoRenew,
      ...(sub.expiry ? { periodEnd: sub.expiry, expiresAt: sub.expiry } : {}),
      ...(sub.state === 'SUBSCRIPTION_STATE_CANCELED' && !existing.cancelledAt
        ? { cancelledAt: new Date() }
        : {}),
    });
    return true;
  }

  if (!live || !userId) return false;
  const variant = variantOf(sub.basePlanId);
  await insertPass({
    userId,
    source: 'google_play',
    externalId: purchaseToken,
    priceVariant: variant?.variant ?? null,
    pricePaise: variant?.fallbackPaise ?? 0,
    autoRenew: sub.autoRenew,
    periodStart: new Date(),
    periodEnd: sub.expiry!,
  });
  return true;
}

/** The app bought a Play Pass: verify it's this user's live subscription, record it, acknowledge it. */
export async function confirmPlayPass(
  userId: string,
  body: { productId: string; purchaseToken: string },
): Promise<void> {
  if (body.productId !== PASS_PLAY_PRODUCT_ID) throw Errors.badRequest('NOT_A_PASS_PRODUCT');
  const sub = await fetchPlaySubscription(body.purchaseToken);
  if (sub.accountId && sub.accountId !== userId)
    throw Errors.forbidden('PLAY_SUBSCRIPTION_OTHER_ACCOUNT');
  const recorded = await syncPlayPass(body.purchaseToken, sub, userId);
  if (!recorded) throw Errors.conflict('PLAY_SUBSCRIPTION_NOT_ACTIVE');
  if (!sub.acknowledged) await acknowledge(body.purchaseToken);
}

/**
 * RTDN `subscriptionNotification` handler. Re-reads the subscription from
 * Google rather than trusting the notification type, so out-of-order
 * notifications can't move a row backwards. Never throws — the webhook acks
 * every authenticated push.
 */
export async function handlePlaySubscriptionNotification(n: {
  notificationType: number;
  purchaseToken: string;
  subscriptionId: string;
}): Promise<void> {
  if (n.subscriptionId !== PASS_PLAY_PRODUCT_ID) return;
  try {
    const sub = await fetchPlaySubscription(n.purchaseToken);
    const recorded = await syncPlayPass(n.purchaseToken, sub, sub.accountId);
    if (recorded && !sub.acknowledged && LIVE_STATES.has(sub.state))
      await acknowledge(n.purchaseToken);
    if (!recorded) {
      logger.warn(
        { type: n.notificationType, tokenSuffix: n.purchaseToken.slice(-8), state: sub.state },
        'pass: RTDN for a Play Pass we could not record (no account id or not live)',
      );
    }
  } catch (err) {
    logger.error(
      { err, tokenSuffix: n.purchaseToken.slice(-8) },
      'pass: RTDN subscription sync failed',
    );
  }
}
