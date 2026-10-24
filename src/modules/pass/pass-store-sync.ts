// =============================================================================
// Store Passes other than Google Play: one row per store subscription
// =============================================================================
// The website's Razorpay Subscription (pass-razorpay.service.ts) and the iPhone's App Store
// subscription (pass-appstore.service.ts) both end up here as a StoreSnapshot: what the store
// says right now, already read back from the store (never trusted from a client or a webhook
// body alone). syncStorePass keeps the user_subscriptions row in step, the same way
// pass-play.service.ts does for Google Play: a new row on the first live sight, a renewal (new
// period, fresh quota, the month's coin gift) when the paid period moves on, and the end when
// the store ends it. One Pass entitlement whatever the store: findActivePass reads them all.
// =============================================================================

import type { UserSubscriptionRow } from '../../db/schema.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { logger } from '../../lib/logger.js';
import { notifyPassPurchase } from '../../lib/notifications/telegram.js';
import { findActiveUserById } from '../users/users.repo.js';
import { grantPassMonthlyCoins } from './pass-coins.js';
import type { PassTierDef } from './pass.config.js';
import { findPassByExternalId, insertPass, renewPass, updateStorePass } from './pass.repo.js';

const MS_PER_DAY = 86_400_000;

export interface StoreSnapshot {
  source: 'razorpay' | 'app_store';
  /** The store's id for the whole subscription (Razorpay sub_..., Apple originalTransactionId). */
  externalId: string;
  /** Our user, as the store echoes it (Razorpay notes.user_id, Apple appAccountToken). */
  userId: string | null;
  tier: PassTierDef | null;
  /** A paid period is running now. */
  live: boolean;
  /** The store will charge again at the period end. */
  autoRenew: boolean;
  periodStart: Date | null;
  periodEnd: Date | null;
  /** The store's own status word, kept in play_state for support. */
  state: string;
  /** The member switched renewal off (the Pass still runs to its end). */
  cancelled: boolean;
  /** The store has ended it: stop now (payment retries gave up, refund, revoke, expired). */
  ended: boolean;
  /** The latest payment / transaction id, a new one marks a renewal. */
  orderId?: string | null;
}

export interface StoreSyncResult {
  recorded: boolean;
  inserted: boolean;
  renewed: boolean;
  userId: string | null;
}

const NOT_RECORDED: StoreSyncResult = { recorded: false, inserted: false, renewed: false, userId: null };

/** A later paid period than the row has (a day of slack: stores move the end by minutes). */
export function isStoreRenewal(row: UserSubscriptionRow, snap: StoreSnapshot): boolean {
  if (!snap.live || !snap.periodEnd) return false;
  return snap.periodEnd.getTime() > (row.periodEnd?.getTime() ?? 0) + MS_PER_DAY;
}

export async function syncStorePass(
  snap: StoreSnapshot,
  now: Date = new Date(),
  retried = false,
): Promise<StoreSyncResult> {
  const existing = await findPassByExternalId(snap.externalId);

  if (existing) {
    if (snap.userId && snap.userId !== existing.userId) {
      // A subscription never changes hands here; the first owner keeps it.
      logger.warn(
        { source: snap.source, rowUser: existing.userId, storeUser: snap.userId },
        'pass: store names another user for a recorded subscription (ignored)',
      );
    }
    const renewed = isStoreRenewal(existing, snap);
    if (renewed) {
      const start = snap.periodStart && snap.periodStart > (existing.periodEnd ?? new Date(0))
        ? snap.periodStart
        : (existing.periodEnd ?? now);
      await renewPass(existing.id, { start, end: snap.periodEnd! });
      await grantPassMonthlyCoins(
        existing.userId,
        snap.tier?.variant ?? existing.priceVariant,
        existing.id,
        start,
      );
    }
    await updateStorePass(existing.id, {
      status: snap.ended ? 'expired' : 'active',
      autoRenew: snap.autoRenew && !snap.ended,
      ...(snap.live && snap.periodEnd ? { periodEnd: snap.periodEnd, expiresAt: snap.periodEnd } : {}),
      ...(snap.cancelled && !existing.cancelledAt ? { cancelledAt: now } : {}),
      ...(!snap.cancelled && snap.autoRenew && existing.cancelledAt ? { cancelledAt: null } : {}),
      // An App Store upgrade or downgrade keeps the subscription id and changes the product.
      ...(snap.tier && snap.tier.variant !== existing.priceVariant
        ? { priceVariant: snap.tier.variant, pricePaise: snap.tier.fallbackPaise }
        : {}),
      ...(snap.orderId ? { latestOrderId: snap.orderId } : {}),
      playState: snap.state,
      playSyncedAt: now,
    });
    const result = { recorded: true, inserted: false, renewed, userId: existing.userId };
    if (renewed) announcePurchase(result, snap);
    return result;
  }

  if (!snap.live || snap.ended || !snap.userId || !snap.periodEnd) return NOT_RECORDED;
  let created: UserSubscriptionRow;
  try {
    created = await insertPass({
      userId: snap.userId,
      source: snap.source,
      externalId: snap.externalId,
      priceVariant: snap.tier?.variant ?? null,
      pricePaise: snap.tier?.fallbackPaise ?? 0,
      autoRenew: snap.autoRenew,
      periodStart: snap.periodStart ?? now,
      periodEnd: snap.periodEnd,
      playState: snap.state,
      latestOrderId: snap.orderId ?? null,
      playSyncedAt: now,
    });
  } catch (err) {
    // The checkout's confirm and the store's notice raced and the other one wrote the row first.
    if (isUniqueViolation(err) && !retried) return syncStorePass(snap, now, true);
    throw err;
  }
  await grantPassMonthlyCoins(
    snap.userId,
    snap.tier?.variant ?? null,
    created.id,
    created.periodStart ?? now,
  );
  const result = { recorded: true, inserted: true, renewed: false, userId: snap.userId };
  announcePurchase(result, snap);
  return result;
}

/** Tells the admin chat about a new or renewed store Pass. Never throws, never waits. */
function announcePurchase(result: StoreSyncResult, snap: StoreSnapshot): void {
  if (!result.userId) return;
  void (async () => {
    const user = await findActiveUserById(result.userId!).catch(() => null);
    await notifyPassPurchase({
      userId: result.userId!,
      contact: user?.phoneE164 ?? user?.email ?? null,
      tier: snap.tier ? `${snap.tier.tier} (${snap.source === 'razorpay' ? 'web' : 'App Store'})` : null,
      amountPaise: snap.tier?.fallbackPaise ?? 0,
      periodEnd: snap.periodEnd,
      isRenewal: result.renewed,
    });
  })().catch(() => {});
}
