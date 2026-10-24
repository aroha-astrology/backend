// =============================================================================
// Aroha Pass on Google Play — the only way to get the Pass (ships off)
// =============================================================================
// The Android app buys the `aroha_pass_monthly` subscription (one base plan
// per tier) and posts the purchase token here; we check it with Google
// (purchases.subscriptionsv2), acknowledge it — a subscription must be
// acknowledged within 3 days or Google refunds it; it is never "consumed"
// like a top-up — and keep a user_subscriptions row in step. After that the
// row follows Google (Google's subscription lifecycle docs):
//   - renewal: a NEW successful order (latestSuccessfulOrderId) starts the
//     next period with a fresh allowance. A later expiry alone is not a
//     renewal: during a grace period Google keeps moving the expiry forward
//     while nothing has been paid.
//   - grace period: the Pass keeps working to Google's (moving) expiry and the
//     user is told to fix their payment method.
//   - account hold / paused / expired / revoked: the Pass stops; on hold the
//     user is told why. Recovery (same token) starts a new period.
//   - cancelled: stops renewing but runs to the end of the paid period.
//   - plan change or resubscribe: a new token with linkedPurchaseToken; the
//     old row ends and the new one keeps the current billing period (what was
//     used this period stays used).
// Real-time Developer Notifications (billing.routes.ts) move the row along;
// because Google sends no notice while it extends a grace period, and a
// notice can be lost, the hourly reconcile (reconcilePlayPasses) and an
// on-demand check (refreshLapsedPlayPass) ask Google again for any Pass that
// is at or past its end.
// =============================================================================

import {
  getAndroidPublisher,
  GOOGLE_PLAY_PACKAGE_NAME,
  isGooglePlayConfigured,
} from '../../config/google-play.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { notifyPassPurchase, sendAlert } from '../../lib/notifications/telegram.js';
import type { UserSubscriptionRow } from '../../db/schema.js';
import { PASS_PLAY_PRODUCT_ID, PASS_TIERS } from './pass.config.js';
import { passNoticeCopy, type PassNotice } from './pass-notices.js';
import {
  findLapsedPlayPass,
  findPassByExternalId,
  insertPass,
  listPlayPassesToReconcile,
  listRenewingPlayPasses,
  renewPass,
  updatePlayPass,
} from './pass.repo.js';
import { findActiveUserById } from '../users/users.repo.js';
import { grantPassMonthlyCoins } from './pass-coins.js';

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

export const PLAY_STATE = {
  active: 'SUBSCRIPTION_STATE_ACTIVE',
  grace: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  hold: 'SUBSCRIPTION_STATE_ON_HOLD',
  paused: 'SUBSCRIPTION_STATE_PAUSED',
  canceled: 'SUBSCRIPTION_STATE_CANCELED',
  expired: 'SUBSCRIPTION_STATE_EXPIRED',
  pending: 'SUBSCRIPTION_STATE_PENDING',
} as const;

/** The user has the Pass's benefits in these states. */
const LIVE_STATES = new Set<string>([PLAY_STATE.active, PLAY_STATE.grace]);
/** States in which a new successful order is a real, paid renewal (a cancelled sub may have renewed just before). */
const PAID_STATES = new Set<string>([PLAY_STATE.active, PLAY_STATE.canceled]);
/** Back from a pause or an account hold after this long: Google moves the renewal date, so the period starts now. */
const LONG_GAP_MS = 3 * MS_PER_DAY;
/** A plan change keeps the billing period when the new expiry falls within one period of the old start. */
const ONE_PERIOD_MS = 32 * MS_PER_DAY;
/** How long the on-demand check waits before asking Google about the same Pass again. */
const REFRESH_EVERY_MS = 10 * MS_PER_MINUTE;

export interface PlaySubscription {
  state: string;
  productId: string | null;
  basePlanId: string | null;
  expiry: Date | null;
  autoRenew: boolean;
  acknowledged: boolean;
  /** obfuscatedExternalAccountId: our user id, set by the app when it buys. */
  accountId: string | null;
  linkedPurchaseToken: string | null;
  /** The latest SUCCESSFUL order; null when Google doesn't say. */
  latestOrderId: string | null;
  /**
   * A resubscribe bought in the Play Store (not in the app) carries no account id of its own;
   * Google names the account and token of the subscription it replaces instead.
   */
  expiredAccountId: string | null;
  expiredPurchaseToken: string | null;
}

export async function fetchPlaySubscription(purchaseToken: string): Promise<PlaySubscription> {
  const client = getAndroidPublisher();
  const { data } = await client.purchases.subscriptionsv2.get({
    packageName: GOOGLE_PLAY_PACKAGE_NAME,
    token: purchaseToken,
  });
  const item = data.lineItems?.[0];
  const outOfApp = data.outOfAppPurchaseContext;
  return {
    state: data.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED',
    productId: item?.productId ?? null,
    basePlanId: item?.offerDetails?.basePlanId ?? null,
    expiry: item?.expiryTime ? new Date(item.expiryTime) : null,
    autoRenew: item?.autoRenewingPlan?.autoRenewEnabled === true,
    acknowledged: data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    accountId: data.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    linkedPurchaseToken: data.linkedPurchaseToken ?? null,
    // Not the top-level latestOrderId: that one also names declined renewal orders.
    latestOrderId: item?.latestSuccessfulOrderId ?? null,
    expiredAccountId:
      outOfApp?.expiredExternalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    expiredPurchaseToken: outOfApp?.expiredPurchaseToken ?? null,
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

function tierOf(basePlanId: string | null) {
  return PASS_TIERS.find((t) => t.playBasePlan === basePlanId) ?? null;
}

/** The HTTP status of a Google API error (gaxios), or null for anything else. */
function googleStatus(err: unknown): number | null {
  const e = err as { response?: { status?: unknown }; code?: unknown } | null;
  if (typeof e?.response?.status === 'number') return e.response.status;
  return typeof e?.code === 'number' ? e.code : null;
}

/** Google no longer knows this purchase token (404 / 410): there is nothing left to keep in step. */
export function isGoneToken(err: unknown): boolean {
  const status = googleStatus(err);
  return status === 404 || status === 410;
}

/**
 * True for an error a retry will not fix: Google rejecting the token itself (400 / 404 / 410)
 * or a Postgres constraint violation. Anything else is worth another try — the network, Google
 * 5xx/429, the database down, and also Google 401/403 or Play not being configured here, which
 * are our own setup to fix, never a reason to drop or end a Pass.
 */
export function isPermanentPlayError(err: unknown): boolean {
  const status = googleStatus(err);
  if (status !== null) return status === 400 || isGoneToken(err);
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^23\d{3}$/.test(code);
}

/** Is this sync of an existing row a renewal: a new paid order, not just a later expiry? */
function isRenewal(existing: UserSubscriptionRow, sub: PlaySubscription): boolean {
  if (!PAID_STATES.has(sub.state) || !sub.expiry) return false;
  if (sub.latestOrderId && existing.latestOrderId)
    return sub.latestOrderId !== existing.latestOrderId;
  // A row from before order ids were kept: a jump of over a day, in a paid state.
  return sub.expiry.getTime() > (existing.periodEnd?.getTime() ?? 0) + MS_PER_DAY;
}

/** Where a renewed period starts: where the last one ended, or now after a pause or an account hold. */
function renewalStart(existing: UserSubscriptionRow, now: Date): Date {
  const prevEnd = existing.periodEnd ?? now;
  if (now.getTime() - prevEnd.getTime() > LONG_GAP_MS) return now;
  return prevEnd.getTime() < now.getTime() ? prevEnd : now;
}

export interface PlaySyncResult {
  /** A row now stands for this token. */
  recorded: boolean;
  /** This sync created that row (a new purchase). */
  inserted: boolean;
  /** This sync started a new paid period. */
  renewed: boolean;
  /** Google's state on the row before this sync (null for a new row or one from before 0099). */
  prevState: string | null;
  /** Whose Pass it is. */
  userId: string | null;
}

const NOT_RECORDED: PlaySyncResult = {
  recorded: false,
  inserted: false,
  renewed: false,
  prevState: null,
  userId: null,
};

/**
 * Brings our row for `purchaseToken` in line with Google's view, creating it
 * for `userId` when it doesn't exist yet (falling back to the account Google
 * names for a Play Store resubscribe, or the owner of the subscription it
 * replaces). Returns what changed; `recorded` is false when there's nothing
 * live to record and no row to update.
 */
export async function syncPlayPass(
  purchaseToken: string,
  sub: PlaySubscription,
  userId: string | null,
  now: Date = new Date(),
): Promise<PlaySyncResult> {
  const live = LIVE_STATES.has(sub.state) && sub.expiry !== null;
  const existing = await findPassByExternalId(purchaseToken);

  // An upgrade, downgrade or resubscribe replaces an older token: that one stops here.
  const linked = sub.linkedPurchaseToken
    ? await findPassByExternalId(sub.linkedPurchaseToken)
    : null;
  if (linked && linked.status === 'active')
    await updatePlayPass(linked.id, { status: 'expired', autoRenew: false });

  if (existing) {
    const renewed = isRenewal(existing, sub);
    if (renewed) {
      const start = renewalStart(existing, now);
      await renewPass(existing.id, { start, end: sub.expiry! });
      // The new period's coin gift (money.passCoins), once per period.
      await grantPassMonthlyCoins(existing.userId, existing.priceVariant, existing.id, start);
    }
    await updatePlayPass(existing.id, {
      // A cancelled Pass runs to the end of what was paid (its periodEnd).
      status: live || sub.state === PLAY_STATE.canceled ? 'active' : 'expired',
      autoRenew: sub.autoRenew,
      ...(sub.expiry ? { periodEnd: sub.expiry, expiresAt: sub.expiry } : {}),
      ...(sub.state === PLAY_STATE.canceled && !existing.cancelledAt ? { cancelledAt: now } : {}),
      // Renewal switched back on before the end: no longer cancelled.
      ...(sub.state === PLAY_STATE.active && existing.cancelledAt ? { cancelledAt: null } : {}),
      ...(sub.latestOrderId ? { latestOrderId: sub.latestOrderId } : {}),
      playState: sub.state,
      playSyncedAt: now,
    });
    return {
      recorded: true,
      inserted: false,
      renewed,
      prevState: existing.playState ?? null,
      userId: existing.userId,
    };
  }

  if (!live) return NOT_RECORDED;
  const replaced =
    !linked && sub.expiredPurchaseToken
      ? await findPassByExternalId(sub.expiredPurchaseToken)
      : null;
  const owner = userId ?? sub.expiredAccountId ?? linked?.userId ?? replaced?.userId ?? null;
  if (!owner) return NOT_RECORDED;

  // A plan change keeps the billing period (Play's CHARGE_PRORATED_PRICE leaves the renewal
  // date alone), so this period's use carries over instead of the allowance starting again.
  const carry =
    linked &&
    linked.userId === owner &&
    linked.periodStart &&
    sub.expiry!.getTime() - linked.periodStart.getTime() <= ONE_PERIOD_MS
      ? linked
      : null;
  const tier = tierOf(sub.basePlanId);
  let created;
  try {
    created = await insertPass({
      userId: owner,
      source: 'google_play',
      externalId: purchaseToken,
      priceVariant: tier?.variant ?? null,
      pricePaise: tier?.fallbackPaise ?? 0,
      autoRenew: sub.autoRenew,
      periodStart: carry?.periodStart ?? now,
      periodEnd: sub.expiry!,
      questionsUsed: carry?.questionsUsed ?? 0,
      playState: sub.state,
      latestOrderId: sub.latestOrderId,
      playSyncedAt: now,
    });
  } catch (err) {
    // The app's confirm and Google's notice raced and the other one wrote the row first.
    if (isUniqueViolation(err)) return syncPlayPass(purchaseToken, sub, userId, now);
    throw err;
  }
  // The first period's coin gift (money.passCoins). A plan change inside a period (carry) got
  // this period's gift on the row it replaces, so the new tier's gift starts at its renewal.
  if (!carry)
    await grantPassMonthlyCoins(owner, tier?.variant ?? null, created.id, created.periodStart ?? now);
  return { recorded: true, inserted: true, renewed: false, prevState: null, userId: owner };
}

/** The notice a state change calls for, if any: a payment failed, the Pass went on hold, or it came back. */
export function noticeFor(prevState: string | null, state: string): PassNotice | null {
  if (prevState === state) return null;
  if (state === PLAY_STATE.grace) return 'grace';
  if (state === PLAY_STATE.hold) return 'hold';
  if (
    state === PLAY_STATE.active &&
    (prevState === PLAY_STATE.grace || prevState === PLAY_STATE.hold)
  )
    return 'recovered';
  return null;
}

/**
 * After a sync: tells the user about a payment problem (or its end) and the admin chat about
 * a new or renewed Pass. Each happens once — on the state change, the new row or the new order.
 * Never throws.
 */
async function announce(result: PlaySyncResult, sub: PlaySubscription): Promise<void> {
  if (!result.recorded || !result.userId) return;
  try {
    const notice = result.inserted ? null : noticeFor(result.prevState, sub.state);
    if (!notice && !result.inserted && !result.renewed) return;
    const user = await findActiveUserById(result.userId).catch(() => null);
    if (notice) {
      await notifyUser(result.userId, {
        ...passNoticeCopy(notice, user?.locale),
        type: 'aroha_pass',
        link: '/pass',
      });
    }
    if (result.inserted || result.renewed) {
      const tier = tierOf(sub.basePlanId);
      void notifyPassPurchase({
        userId: result.userId,
        contact: user?.phoneE164 ?? user?.email ?? null,
        tier: tier?.tier ?? sub.basePlanId,
        amountPaise: tier?.fallbackPaise ?? 0,
        periodEnd: sub.expiry,
        isRenewal: result.renewed,
      }).catch(() => {});
    }
  } catch (err) {
    logger.warn({ err, userId: result.userId }, 'pass: notice after a Play sync failed');
  }
}

/** Fetches, syncs, acknowledges a live unacknowledged purchase, and announces the change. */
async function fetchAndSync(
  purchaseToken: string,
  userId: string | null,
  now: Date = new Date(),
): Promise<{ sub: PlaySubscription; result: PlaySyncResult }> {
  const sub = await fetchPlaySubscription(purchaseToken);
  const result = await syncPlayPass(purchaseToken, sub, userId ?? sub.accountId, now);
  if (result.recorded && !sub.acknowledged && LIVE_STATES.has(sub.state))
    await acknowledge(purchaseToken);
  await announce(result, sub);
  return { sub, result };
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
  const existing = await findPassByExternalId(body.purchaseToken);
  if (existing && existing.userId !== userId)
    throw Errors.forbidden('PLAY_SUBSCRIPTION_OTHER_ACCOUNT');
  // Paid by a slow method (some UPI and cash options): the Pass starts when Google confirms
  // the payment, through its SUBSCRIPTION_PURCHASED notice.
  if (sub.state === PLAY_STATE.pending) throw Errors.conflict('PLAY_SUBSCRIPTION_PENDING');

  const result = await syncPlayPass(body.purchaseToken, sub, userId);
  if (!result.recorded) throw Errors.conflict('PLAY_SUBSCRIPTION_NOT_ACTIVE');
  if (!sub.acknowledged && LIVE_STATES.has(sub.state)) await acknowledge(body.purchaseToken);
  await announce(result, sub);
}

/**
 * RTDN `subscriptionNotification` handler. Re-reads the subscription from
 * Google rather than trusting the notification type, so out-of-order
 * notifications can't move a row backwards. Throws only when a retry could
 * help (Google or the database unreachable), so the webhook answers 500 and
 * Pub/Sub sends the notice again; anything else is logged and dropped.
 */
export async function handlePlaySubscriptionNotification(n: {
  notificationType: number;
  purchaseToken: string;
  subscriptionId: string;
}): Promise<void> {
  if (n.subscriptionId !== PASS_PLAY_PRODUCT_ID) return;
  try {
    const { sub, result } = await fetchAndSync(n.purchaseToken, null);
    if (!result.recorded) {
      logger.warn(
        { type: n.notificationType, tokenSuffix: n.purchaseToken.slice(-8), state: sub.state },
        'pass: RTDN for a Play Pass we could not record (no account id or not live)',
      );
    }
  } catch (err) {
    const permanent = isPermanentPlayError(err);
    logger.error(
      { err, permanent, tokenSuffix: n.purchaseToken.slice(-8) },
      'pass: RTDN subscription sync failed',
    );
    if (!permanent) throw err;
  }
}

/**
 * Asks Google about the user's Play Pass when it has just reached its end without word from
 * Google: the renewal notice may not have arrived yet, or Google is extending a grace period
 * (it sends nothing for that). At most once every 10 minutes per Pass. True when the user has a
 * live Pass afterwards. Never throws.
 */
export async function refreshLapsedPlayPass(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isGooglePlayConfigured()) return false;
  let row: UserSubscriptionRow | null = null;
  try {
    row = await findLapsedPlayPass(userId, now, new Date(now.getTime() - REFRESH_EVERY_MS));
    if (!row?.externalId) return false;
    const { sub } = await fetchAndSync(row.externalId, row.userId, now);
    return LIVE_STATES.has(sub.state) && sub.expiry !== null && sub.expiry > now;
  } catch (err) {
    logger.warn({ err, userId }, 'pass: on-demand Play check failed');
    // Don't ask again on every request while Google is unreachable; the hourly reconcile retries.
    if (row) await updatePlayPass(row.id, { playSyncedAt: now }).catch(() => {});
    return false;
  }
}

export interface PlayReconcileRun {
  checked: number;
  renewed: number;
  /** Rows Google says are no longer live (or no longer knows). */
  ended: number;
  failed: number;
}

/**
 * The hourly safety net: asks Google about every Play Pass at or past its end, in a grace
 * period, on hold or paused, and syncs it — so a lost notice never ends a Pass someone paid
 * for, and a grace period keeps the Pass working while Google retries the payment.
 */
export async function reconcilePlayPasses(
  now: Date = new Date(),
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<PlayReconcileRun> {
  const run: PlayReconcileRun = { checked: 0, renewed: 0, ended: 0, failed: 0 };
  // Without Play credentials there is no one to ask; never end a Pass for that.
  if (!isGooglePlayConfigured()) return run;
  const rows = await listPlayPassesToReconcile(now, opts.limit ?? 500);
  for (const row of rows) {
    if (!row.externalId) continue;
    run.checked += 1;
    if (opts.dryRun) continue;
    try {
      const { sub, result } = await fetchAndSync(row.externalId, row.userId, now);
      if (result.renewed) run.renewed += 1;
      if (
        !LIVE_STATES.has(sub.state) &&
        row.status === 'active' &&
        sub.state !== PLAY_STATE.canceled
      )
        run.ended += 1;
    } catch (err) {
      if (isGoneToken(err)) {
        // Google no longer knows the token: nothing to keep in step.
        await updatePlayPass(row.id, { status: 'expired', playSyncedAt: now }).catch(() => {});
        run.ended += 1;
      } else {
        run.failed += 1;
      }
      logger.warn({ err, rowId: row.id }, 'pass: reconcile of a Play Pass failed');
    }
  }
  return run;
}

/**
 * Account deletion: stops every Play Pass of the user from renewing (Google would otherwise
 * keep charging someone whose account is gone). The paid period is not refunded. A failure
 * never blocks the deletion: the admin chat is told which Pass to cancel by hand.
 */
export async function cancelPlayPassesForDeletedUser(userId: string): Promise<void> {
  let rows: UserSubscriptionRow[] = [];
  try {
    rows = await listRenewingPlayPasses(userId);
  } catch (err) {
    logger.error({ err, userId }, 'pass: could not list Play Passes to cancel on deletion');
    void sendAlert(
      'Pass not cancelled on account deletion',
      `User ${userId}: could not read their Play Passes. Check Play Console and cancel any live one.`,
    ).catch(() => {});
    return;
  }
  for (const row of rows) {
    if (!row.externalId) continue;
    try {
      await getAndroidPublisher().purchases.subscriptions.cancel({
        packageName: GOOGLE_PLAY_PACKAGE_NAME,
        subscriptionId: PASS_PLAY_PRODUCT_ID,
        token: row.externalId,
      });
      await updatePlayPass(row.id, { autoRenew: false, cancelledAt: new Date() });
    } catch (err) {
      logger.error({ err, userId, rowId: row.id }, 'pass: Play cancel on account deletion failed');
      void sendAlert(
        'Pass not cancelled on account deletion',
        `User ${userId}: Google Play refused to cancel their Pass (token …${row.externalId.slice(-8)}). Cancel it in Play Console → Order management.`,
      ).catch(() => {});
    }
  }
}
