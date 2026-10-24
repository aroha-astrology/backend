import { Errors } from '../../lib/errors.js';
import type { OrderRow, WalletTransactionRow } from '../../db/schema.js';
import {
  insertOrder,
  findOrderByIdForUser,
  findOrdersForUser,
  findDebitsForUser,
  findLatestOrderForPack,
  setOrderGatewayOrderId,
  findStalePendingRazorpayOrders,
  confirmOrderAndGrantCredits,
  findAppStoreOrder,
  refundOrder as refundOrderRepo,
} from './billing.repo.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { verifyAppleTransaction, type AppleJwsOptions } from './app-store-verify.js';
import { requireStoreKit } from '../pass/pass-appstore.service.js';
import { findActiveUserById } from '../users/users.repo.js';
import { logger } from '../../lib/logger.js';
import {
  verifyGooglePlayPurchase,
  consumeGooglePlayPurchase,
  fetchGooglePlayPurchase,
} from './google-play-verifier.js';
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  verifyRazorpaySignature,
  fetchRazorpayOrderPayments,
} from './razorpay.js';
import { notifyQuestionPackBought, notifyWalletTopUp } from '../../lib/notifications/telegram.js';
import { TOP_UP_AMOUNTS } from './top-up-amounts.js';
import {
  COIN_CURRENCIES,
  COIN_PACKS,
  coinPackById,
  coinPackCreditPaise,
  currencyForCountry,
  formatPackPrice,
  isCoinCurrency,
  type CoinCurrency,
} from '../../config/coin-packs.js';
import { isFeatureOn } from '../features/features.service.js';
import { questionPackForProduct } from '../pass/pass.config.js';

export { TOP_UP_AMOUNTS };

export function getTopUpAmounts() {
  return TOP_UP_AMOUNTS;
}

/**
 * What one purchase is: an old top-up amount or a v7 coin pack. `amountPaise` is always the rupee
 * figure the admin revenue sums add; `chargedMinor` is what the buyer is actually charged in
 * `currency` (set only for a coin pack).
 */
export interface Sellable {
  id: string;
  amountPaise: number;
  currency: string;
  chargedMinor: number | null;
}

/**
 * The currency a web (Razorpay) buyer is quoted and charged in. With money.razorpayIntl off every
 * order is in rupees, as before. With it on: the currency the app asked for, else the one for the
 * buyer's country.
 */
export async function resolveChargeCurrency(
  userId: string,
  country: string | null | undefined,
  requested?: string,
): Promise<CoinCurrency> {
  if (!(await isFeatureOn(userId, 'money.razorpayIntl'))) return 'INR';
  return isCoinCurrency(requested) ? requested : currencyForCountry(country);
}

/**
 * Finds what a pack id sells. An old top-up id always resolves (an app build from before the coin
 * packs, or an order already in flight). A coin-pack id resolves only while money.coinPacks is on
 * for this user, so nobody can start a coin-pack order through the API while the offer is off.
 */
async function findSellable(
  userId: string,
  id: string,
  currency: CoinCurrency = 'INR',
): Promise<Sellable> {
  const old = TOP_UP_AMOUNTS.find((a) => a.id === id);
  if (old) {
    return { id: old.id, amountPaise: old.amountPaise, currency: old.currency, chargedMinor: null };
  }
  const pack = coinPackById(id);
  if (pack && (await isFeatureOn(userId, 'money.coinPacks'))) {
    return {
      id: pack.id,
      amountPaise: pack.prices.INR,
      currency,
      chargedMinor: pack.prices[currency],
    };
  }
  throw Errors.badRequest(`Unknown top-up amount "${id}"`);
}

/** The rows of `GET /billing/top-up-amounts`, in the shape of the old top-up list. */
export interface TopUpListing {
  amounts: Array<{
    id: string;
    amountPaise: number;
    currency: string;
    label: string;
    bonusPaise?: number;
    popular?: boolean;
    coins?: number;
    name?: string;
  }>;
  /** True when the list is the coin packs. */
  coinPacks: boolean;
  /** The currency the labels are quoted in (always INR for the old list). */
  currency: CoinCurrency;
  /** Currencies the website can charge in right now. */
  currencies: CoinCurrency[];
}

/**
 * The packs to show this user. With money.coinPacks off, the old top-up amounts exactly as before.
 * With it on, the four coin packs priced in the buyer's currency (rupees unless money.razorpayIntl
 * is on). Play shows its own local price when the app opens its sheet.
 */
export async function listTopUps(
  userId: string,
  country: string | null | undefined,
  requestedCurrency?: string,
): Promise<TopUpListing> {
  if (!(await isFeatureOn(userId, 'money.coinPacks'))) {
    return {
      amounts: TOP_UP_AMOUNTS.map((a) => ({ ...a })),
      coinPacks: false,
      currency: 'INR',
      currencies: ['INR'],
    };
  }
  const currency = await resolveChargeCurrency(userId, country, requestedCurrency);
  const intl = await isFeatureOn(userId, 'money.razorpayIntl');
  return {
    amounts: COIN_PACKS.map((pack) => ({
      id: pack.id,
      amountPaise: pack.prices[currency],
      currency,
      label: formatPackPrice(pack.prices[currency], currency),
      bonusPaise: coinPackCreditPaise(pack).bonus,
      ...(pack.popular ? { popular: true } : {}),
      coins: pack.purchasedCoins + pack.bonusCoins,
      name: pack.name,
    })),
    coinPacks: true,
    currency,
    currencies: intl ? [...COIN_CURRENCIES] : ['INR'],
  };
}

/**
 * Coupons are switched off (2026-09-24). Google Play is now the only way to
 * pay, and Play always charges a product's fixed price — a coupon could only
 * ever shrink the wallet credit for the same payment, which is what it was
 * silently doing. Kept as an endpoint so older app builds that still show a
 * coupon box get a clean "not available" instead of an error.
 */
export function validateCoupon(code: string, packId: string) {
  if (!TOP_UP_AMOUNTS.some((a) => a.id === packId) && !coinPackById(packId)) {
    throw Errors.badRequest(`Unknown top-up amount "${packId}"`);
  }
  return { valid: false, code, message: 'Coupons are not available right now' };
}

/**
 * Records the pending order a Google Play purchase is matched against (see
 * confirmGooglePlayPurchase). `couponCode` is accepted for older clients and
 * ignored: the order always credits exactly what Play charges.
 */
export async function checkout(userId: string, packId: string, _couponCode?: string) {
  // Play charges its own local price, so the order is recorded at the rupee list price.
  const amount = await findSellable(userId, packId);
  return insertOrder({
    userId,
    packId: amount.id,
    amountPaise: amount.amountPaise,
    discountPaise: 0,
    finalAmountPaise: amount.amountPaise,
    currency: amount.currency,
    chargedMinor: null,
    couponId: null,
    couponCode: null,
    status: 'pending',
    gatewayProvider: 'mock',
  });
}

/**
 * Creates our pending order AND its Razorpay counterpart for the web checkout.
 * Coupons are off, so the charge and the wallet credit are both the pack's full
 * price. Only the publishable key id leaves the server.
 */
export async function startRazorpayCheckout(
  userId: string,
  packId: string,
  opts: { country?: string | null; currency?: string } = {},
): Promise<{ order: OrderRow; razorpayOrderId: string; razorpayKeyId: string }> {
  const razorpayKeyId = getRazorpayKeyId();
  const currency = await resolveChargeCurrency(userId, opts.country, opts.currency);
  const amount = await findSellable(userId, packId, currency);
  const order = await insertOrder({
    userId,
    packId: amount.id,
    amountPaise: amount.amountPaise,
    discountPaise: 0,
    finalAmountPaise: amount.amountPaise,
    currency: amount.currency,
    chargedMinor: amount.chargedMinor,
    couponId: null,
    couponCode: null,
    status: 'pending',
    gatewayProvider: 'razorpay',
  });
  const razorpayOrderId = await createRazorpayOrder({
    // What the buyer is charged, in the minor unit of the order's currency.
    amountPaise: order.chargedMinor ?? order.amountPaise,
    currency: order.currency,
    receipt: order.id,
  });
  await setOrderGatewayOrderId(order.id, razorpayOrderId);
  return { order: { ...order, gatewayOrderId: razorpayOrderId }, razorpayOrderId, razorpayKeyId };
}

/**
 * Confirms a Razorpay payment and grants its wallet balance. Trusts nothing from
 * the client except the ids: the amount comes from OUR stored order, and the
 * payment is accepted only if Razorpay's signature over (their order id | payment
 * id) checks out AND their order id is the one we created for this order.
 */
export async function verifyRazorpayPayment(
  userId: string,
  params: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  },
): Promise<{ order: OrderRow; walletBalancePaise: number }> {
  const order = await findOrderByIdForUser(params.orderId, userId);
  if (!order) throw Errors.notFound('Order not found');
  if (order.gatewayOrderId !== params.razorpayOrderId) {
    throw Errors.badRequest('This payment does not belong to that order');
  }
  if (
    !verifyRazorpaySignature({
      razorpayOrderId: params.razorpayOrderId,
      razorpayPaymentId: params.razorpayPaymentId,
      signature: params.razorpaySignature,
    })
  ) {
    logger.warn({ userId, orderId: order.id }, 'Razorpay signature verification failed');
    throw Errors.badRequest('Payment could not be verified');
  }

  // Idempotent replay (double-submit, or a retry after a dropped response).
  if (order.status === 'paid') {
    if (order.gatewayPaymentId === params.razorpayPaymentId) {
      return { order, walletBalancePaise: await currentWalletBalance(userId) };
    }
    throw Errors.conflict('Order already confirmed with a different payment');
  }
  if (order.status !== 'pending') throw Errors.conflict(`Order is ${order.status}, not payable`);

  const result = await confirmOrderAndGrantCredits(order.id, userId, params.razorpayPaymentId);
  if (!result) {
    // Lost a race with a concurrent confirm of the same order.
    const nowPaid = await findOrderByIdForUser(order.id, userId);
    if (!nowPaid || nowPaid.status !== 'paid') throw Errors.internal('Failed to confirm order');
    return { order: nowPaid, walletBalancePaise: await currentWalletBalance(userId) };
  }

  await notifyTopUp(userId, order.amountPaise, result.walletBalancePaise);
  return result;
}

async function currentWalletBalance(userId: string): Promise<number> {
  const user = await findActiveUserById(userId);
  return user?.walletBalancePaise ?? 0;
}

/**
 * Grants credits for orders Razorpay captured but the browser never confirmed.
 * Only acts on an actually `captured` payment; an abandoned or failed checkout
 * stays pending. Run every ~10 minutes via POST /cron/billing-razorpay-reconcile.
 */
export async function reconcileStaleRazorpayOrders(): Promise<{
  checked: number;
  reconciled: number;
}> {
  const stale = await findStalePendingRazorpayOrders();
  let reconciled = 0;

  for (const order of stale) {
    if (!order.gatewayOrderId) continue;
    try {
      const payments = await fetchRazorpayOrderPayments(order.gatewayOrderId);
      const captured = payments.find((p) => p.status === 'captured');
      if (!captured) continue;

      const result = await confirmOrderAndGrantCredits(order.id, order.userId, captured.id);
      if (!result) continue; // a concurrent path confirmed it first

      logger.warn(
        { orderId: order.id, userId: order.userId, razorpayPaymentId: captured.id },
        'billing: reconciled an order whose client-side verify call never arrived',
      );
      await notifyTopUp(order.userId, order.amountPaise, result.walletBalancePaise);
      reconciled++;
    } catch (err) {
      logger.error({ err, orderId: order.id }, 'billing: reconcile failed for order');
    }
  }

  return { checked: stale.length, reconciled };
}

/**
 * No real payment gateway backs this endpoint — this used to be
 * a MOCK that always "succeeded" and granted credits for any pending order,
 * which meant any signed-in user could get free credits by hitting this
 * endpoint with no actual payment involved. Refuse until a real gateway's
 * webhook/signature verification replaces this call site;
 * `confirmOrderAndGrantCredits` (the credit-ledger side) is unchanged and
 * ready to be wired to that verification once it exists.
 */
export async function confirmPayment(
  orderId: string,
  userId: string,
): Promise<{ order: OrderRow; walletBalancePaise: number }> {
  const order = await findOrderByIdForUser(orderId, userId);
  if (!order) throw Errors.notFound('Order not found');
  throw Errors.forbidden('Online payments are not live yet.');
}

/** Fire-and-forget admin Telegram ping for a successful top-up (never blocks the payment). */
async function notifyTopUp(userId: string, amountPaise: number, newBalancePaise: number) {
  const buyer = await findActiveUserById(userId);
  notifyWalletTopUp({
    userId,
    contact: buyer?.phoneE164 ?? buyer?.email ?? null,
    amountPaise,
    newBalancePaise,
  }).catch((err) =>
    logger.warn({ err, userId }, 'Failed to send wallet top-up Telegram notification'),
  );
}

/** Fire-and-forget admin Telegram ping for a Question Pack bought on Play. */
async function notifyPackBought(userId: string, amountPaise: number, questions: number) {
  const buyer = await findActiveUserById(userId);
  notifyQuestionPackBought({
    userId,
    contact: buyer?.phoneE164 ?? buyer?.email ?? null,
    amountPaise,
    questions,
  }).catch((err) =>
    logger.warn({ err, userId }, 'Failed to send Question Pack Telegram notification'),
  );
}

async function getUserWalletBalance(userId: string): Promise<number> {
  const user = await findActiveUserById(userId);
  if (!user) throw Errors.notFound('User not found');
  return user.walletBalancePaise;
}

/**
 * Confirms a Google Play purchase and grants its credits. Deliberately takes
 * no order ID — the client can't reliably remember one across a process
 * kill between purchase and confirm, so this looks up the order itself by
 * (userId, productId). Safe to call more than once for the same purchase
 * (crash-recovery reconciliation replays this on every app start).
 */
export async function confirmGooglePlayPurchase(
  userId: string,
  { purchaseToken, productId }: { purchaseToken: string; productId: string },
): Promise<{ order: OrderRow; walletBalancePaise: number }> {
  const order = await findLatestOrderForPack(userId, productId);
  if (!order) throw Errors.notFound('No matching order found for this purchase');

  if (order.status === 'paid') {
    if (order.gatewayPaymentId === purchaseToken) {
      try {
        await consumeGooglePlayPurchase({ productId, purchaseToken });
      } catch (err) {
        logger.warn(
          { err, purchaseToken, productId },
          'Failed to consume Google Play purchase on idempotent replay',
        );
      }
      const walletBalancePaise = await getUserWalletBalance(userId);
      return { order, walletBalancePaise };
    }
    throw Errors.conflict('Order already confirmed with a different purchase');
  }
  if (order.status !== 'pending') {
    throw Errors.conflict(`Order is ${order.status}, not payable`);
  }

  const verified = await verifyGooglePlayPurchase({ productId, purchaseToken });
  if (!verified) throw Errors.badRequest('Purchase is not in a completed state');

  const result = await confirmOrderAndGrantCredits(order.id, userId, purchaseToken);
  if (!result) {
    const nowPaid = await findLatestOrderForPack(userId, productId);
    if (!nowPaid || nowPaid.status !== 'paid') {
      throw Errors.internal('Failed to confirm order');
    }
    const walletBalancePaise = await getUserWalletBalance(userId);
    return { order: nowPaid, walletBalancePaise };
  }

  try {
    await consumeGooglePlayPurchase({ productId, purchaseToken });
  } catch (err) {
    // Truncated, not the raw token — same convention as fcm.ts's deviceToken.slice(-8). Enough
    // to correlate a specific purchase in a support investigation without writing a live Google
    // Play bearer credential to disk (the logger's own `redact` would blank a `purchaseToken`
    // key entirely, which is safe but loses that correlation value).
    logger.warn(
      { err, purchaseTokenSuffix: purchaseToken.slice(-8), productId },
      'Failed to consume Google Play purchase',
    );
  }

  // Fresh grant only (not the idempotent-replay/already-paid branches above) —
  // avoids sending a duplicate admin notification if this call gets retried.
  const pack = questionPackForProduct(productId);
  if (pack) await notifyPackBought(userId, order.amountPaise, pack.questions);
  else await notifyTopUp(userId, order.amountPaise, result.walletBalancePaise);

  return result;
}

/**
 * A coin pack bought on an iPhone (money.storekit). The app buys the pack's product
 * (`coins_100`...) with `appAccountToken` = our user id and posts StoreKit's signed transaction.
 * Apple's signature, this app, this user and a consumable coin pack are all checked; then one
 * order per transaction id (a unique index) is recorded and paid in the same step as the
 * coins. A replay of the same transaction returns the balance without crediting again.
 */
export async function confirmAppStoreCoins(
  userId: string,
  signedTransaction: string,
  opts: AppleJwsOptions = {},
): Promise<{ order: OrderRow; walletBalancePaise: number }> {
  await requireStoreKit(userId);
  const tx = verifyAppleTransaction(signedTransaction, opts);
  const pack = coinPackById(tx.productId);
  if (!pack || tx.type !== 'Consumable') throw Errors.badRequest('NOT_A_COIN_PACK');
  if (tx.appAccountToken?.toLowerCase() !== userId.toLowerCase())
    throw Errors.forbidden('APP_STORE_OTHER_ACCOUNT');
  if (tx.revocationDate != null) throw Errors.conflict('APP_STORE_REFUNDED');

  let order = await findAppStoreOrder(tx.transactionId);
  if (order && order.userId !== userId) throw Errors.forbidden('APP_STORE_OTHER_ACCOUNT');
  if (!order) {
    try {
      order = await insertOrder({
        userId,
        packId: pack.id,
        amountPaise: pack.prices.INR,
        discountPaise: 0,
        finalAmountPaise: pack.prices.INR,
        // Apple's price is in milli-units of the buyer's currency; kept for the record only.
        currency: tx.currency ?? 'INR',
        chargedMinor: tx.price != null ? Math.round(tx.price / 10) : null,
        couponId: null,
        couponCode: null,
        status: 'pending',
        gatewayProvider: 'app_store',
        gatewayOrderId: tx.transactionId,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      order = await findAppStoreOrder(tx.transactionId);
      if (!order || order.userId !== userId) throw Errors.forbidden('APP_STORE_OTHER_ACCOUNT');
    }
  }
  if (order.status === 'paid') {
    return { order, walletBalancePaise: await getUserWalletBalance(userId) };
  }
  const result = await confirmOrderAndGrantCredits(order.id, userId, tx.transactionId);
  if (!result) {
    const nowPaid = await findAppStoreOrder(tx.transactionId);
    if (!nowPaid || nowPaid.status !== 'paid') throw Errors.internal('Failed to confirm order');
    return { order: nowPaid, walletBalancePaise: await getUserWalletBalance(userId) };
  }
  await notifyTopUp(userId, order.amountPaise, result.walletBalancePaise);
  return result;
}

/** RTDN's `oneTimeProductNotification.notificationType` values that matter here — the rest
 * (expired, etc.) don't apply to one-time consumable top-ups. */
const ONE_TIME_PRODUCT_PURCHASED = 1;

/**
 * Reconciles a Google Play Real-time Developer Notification for a one-time product purchase —
 * the server-side backstop `confirmGooglePlayPurchase` never had. That function only ever runs
 * when the app itself calls us after a purchase; if the app is killed, crashes, or the user
 * never reopens it again, Google has the money and we never find out. RTDN pushes us a
 * notification the instant the purchase happens, independent of the app.
 *
 * The notification itself only carries the purchase token + product id, not who bought it, so
 * this fetches the full purchase from Google first — which echoes back `obfuscatedAccountId`
 * (set by PlayBillingPlugin.purchaseProduct when the purchase was launched) as
 * `obfuscatedExternalAccountId`. Purchases made before that field existed on the client have no
 * account id and can't be reconciled this way; they still fall back to the existing client-side
 * reconciler (GooglePlayPurchaseReconciler) or a manual admin fix.
 *
 * Deliberately swallows errors rather than throwing — the route handler acks every notification
 * it's authenticated regardless of outcome, so Google doesn't retry-storm us over a purchase we
 * can't resolve (missing account id, order already actioned, etc.). Failures are logged for
 * follow-up rather than thrown.
 */
export async function reconcileGooglePlayNotification(notification: {
  notificationType: number;
  purchaseToken: string;
  sku: string;
}): Promise<void> {
  if (notification.notificationType !== ONE_TIME_PRODUCT_PURCHASED) return;

  const productId = notification.sku;
  const { purchaseToken } = notification;

  try {
    const purchase = await fetchGooglePlayPurchase({ productId, purchaseToken });
    if (purchase.purchaseState !== 0) return; // canceled/pending — nothing to confirm yet.

    const userId = purchase.obfuscatedExternalAccountId;
    if (!userId) {
      logger.warn(
        { purchaseTokenSuffix: purchaseToken.slice(-8), productId },
        'billing: RTDN purchase has no obfuscatedAccountId, cannot reconcile server-side',
      );
      return;
    }

    await confirmGooglePlayPurchase(userId, { purchaseToken, productId });
    logger.warn(
      { userId, productId },
      'billing: RTDN reconciled a Google Play purchase the app never confirmed',
    );
  } catch (err) {
    logger.error(
      { err, purchaseTokenSuffix: purchaseToken.slice(-8), productId },
      'billing: RTDN-triggered reconcile failed',
    );
  }
}

/**
 * Refunds a paid top-up order back to the user's wallet. Thin wrapper over
 * the repo's atomic guarded transition (billing.repo.ts's refundOrder) — the
 * service-layer primitive for the admin refund tooling and Phase 8's
 * refund-rate metric this codebase doesn't have yet.
 */
export async function refundOrder(
  orderId: string,
  userId: string,
  reason: string,
): Promise<{ order: OrderRow; walletBalancePaise: number }> {
  const result = await refundOrderRepo(orderId, userId, reason);
  if (!result) {
    throw Errors.conflict('Order is not refundable (not found, or not currently paid)');
  }
  return result;
}

/** A user's own recharge/order history, most recent first. */
export async function listOrders(userId: string) {
  const rows = await findOrdersForUser(userId);
  return rows.map(toOrderDto);
}

type TransactionKind =
  | 'chat'
  | 'vastu_report'
  | 'gemstone_unlock'
  | 'profile_creation'
  | 'house_unlock'
  | 'referral_bonus'
  | 'admin_adjustment'
  | 'report_unlock'
  | 'daily_reward'
  | 'palm_reading'
  | 'voice_call'
  | 'birth_time_check'
  | 'life_timeline'
  | 'decision_window'
  | 'find_my_date'
  | 'bond_insight'
  | 'question_pack'
  | 'aroha_pass'
  | 'digital_yantra'
  | 'relocation';

const REPORT_UNLOCK_RE = /^report_unlock:([a-z_]+)(?::(\d{4}-\d{2}))?(?::bundle:(\d+))?$/;

/**
 * Maps a wallet_transactions `reason` string to its display kind. A leading
 * `refund:` is stripped and reported separately via `isRefund` — the UI
 * shows one generic "Refund" treatment regardless of what was refunded.
 * `:profile:<id>` suffixes (owned-profile unlocks) are recognized but not
 * surfaced — the UI shows the same label whichever profile it was for.
 *
 * Never throws on an unrecognized reason — this used to throw, which meant
 * GET /v1/billing/transactions 500'd for any user who'd ever received a
 * Telegram /money admin grant/deduction (those reasons weren't recognized
 * here at all). An unknown reason now falls back to 'admin_adjustment'
 * (the closest "generic ledger entry" bucket) rather than crashing the
 * whole transaction list over one unparseable row.
 */
export function parseReason(reason: string): {
  kind: TransactionKind;
  houseNumber?: number;
  reportKey?: string;
  periodMonth?: string;
  bundleMonths?: number;
  isRefund: boolean;
} {
  const isRefund = reason.startsWith('refund:');
  const base = isRefund ? reason.slice('refund:'.length) : reason;

  if (base === 'referral_bonus') return { kind: 'referral_bonus', isRefund: false };
  if (base.startsWith('daily_reward:')) return { kind: 'daily_reward', isRefund };
  if (base === 'chat_message') return { kind: 'chat', isRefund };
  if (base === 'vastu_report') return { kind: 'vastu_report', isRefund };
  if (base === 'profile_creation') return { kind: 'profile_creation', isRefund };
  if (base === 'palm_unlock') return { kind: 'palm_reading', isRefund };
  if (base === 'voice_minute') return { kind: 'voice_call', isRefund };
  if (base === 'birth_time_rectify') return { kind: 'birth_time_check', isRefund };
  if (base === 'life_timeline_full') return { kind: 'life_timeline', isRefund };
  if (base === 'decision_window') return { kind: 'decision_window', isRefund };
  if (base === 'find_my_date') return { kind: 'find_my_date', isRefund };
  if (base === 'bond_insight') return { kind: 'bond_insight', isRefund };
  if (base.startsWith('question_pack:')) return { kind: 'question_pack', isRefund };
  if (base === 'aroha_pass' || base === 'aroha_pass_renewal')
    return { kind: 'aroha_pass', isRefund };
  if (base === 'digital_yantra' || base === 'digital_wallpaper') {
    return { kind: 'digital_yantra', isRefund };
  }
  if (base === 'relocation') return { kind: 'relocation', isRefund };
  if (base === 'gemstone_unlock' || base.startsWith('gemstone_unlock:profile:')) {
    return { kind: 'gemstone_unlock', isRefund };
  }
  const houseMatch = base.match(/^house_unlock:(\d+)(?::profile:.+)?$/);
  if (houseMatch) {
    return { kind: 'house_unlock', houseNumber: Number(houseMatch[1]), isRefund };
  }
  // The extra money on a ₹250/₹500 recharge. It shows as a "Bonus" credit row
  // (admin_adjustment with a positive delta), which every app build already
  // labels, next to the recharge row for what was paid.
  if (base === 'admin_grant' || base === 'admin_deduction' || base.startsWith('recharge_bonus:')) {
    return { kind: 'admin_adjustment', isRefund };
  }
  const reportMatch = base.match(REPORT_UNLOCK_RE);
  if (reportMatch) {
    // Group 1 (the report key) is mandatory in REPORT_UNLOCK_RE, so it's
    // always present once the overall match succeeds — the `!` just works
    // around noUncheckedIndexedAccess not knowing that. Groups 2/3 (period
    // month, bundle months) ARE optional, hence the undefined checks below.
    const reportKey = reportMatch[1]!;
    const periodMonth = reportMatch[2];
    const bundleMonths = reportMatch[3];
    return {
      kind: 'report_unlock',
      isRefund,
      reportKey,
      ...(periodMonth !== undefined ? { periodMonth } : {}),
      ...(bundleMonths !== undefined ? { bundleMonths: Number(bundleMonths) } : {}),
    };
  }
  // Fallback for anything else unrecognized (e.g. a future reason shape
  // added elsewhere before this parser is updated) — see doc comment above.
  return { kind: 'admin_adjustment', isRefund };
}

interface RechargeTransaction {
  id: string;
  kind: 'recharge';
  createdAt: string;
  amountPaise: number;
  status: OrderRow['status'];
}

/**
 * Despite the name, not every row here is a debit — `admin_adjustment` covers
 * both Telegram /money grants and campaign-bonus claims (positive delta) as
 * well as deductions and expiry clawbacks (negative delta). `isCredit` is the
 * authoritative sign, read straight off the ledger's `delta` rather than
 * guessed from `kind` — see `isCredit()` in app/profile/orders/page.tsx,
 * which used to whitelist 3 kinds and silently mis-rendered every campaign
 * claim as a debit with a blank label.
 */
interface DebitTransaction {
  id: string;
  kind: Exclude<TransactionKind, 'house_unlock' | 'report_unlock'>;
  createdAt: string;
  amountPaise: number;
  balanceAfterPaise: number;
  isRefund: boolean;
  isCredit: boolean;
  /** ISO timestamp — set only when this credit itself expires (and gets clawed back) if unused. */
  expiresAt?: string;
}

interface HouseUnlockTransaction {
  id: string;
  kind: 'house_unlock';
  createdAt: string;
  amountPaise: number;
  balanceAfterPaise: number;
  isRefund: boolean;
  isCredit: boolean;
  expiresAt?: string;
  houseNumber: number;
}

interface ReportUnlockTransaction {
  id: string;
  kind: 'report_unlock';
  createdAt: string;
  amountPaise: number;
  balanceAfterPaise: number;
  isRefund: boolean;
  isCredit: boolean;
  expiresAt?: string;
  reportKey: string;
  periodMonth?: string;
  bundleMonths?: number;
}

export type Transaction =
  | RechargeTransaction
  | DebitTransaction
  | HouseUnlockTransaction
  | ReportUnlockTransaction;

function toTransactionDto(row: OrderRow | WalletTransactionRow): Transaction {
  if ('packId' in row) {
    return {
      id: row.id,
      kind: 'recharge',
      createdAt: row.createdAt.toISOString(),
      amountPaise: row.finalAmountPaise,
      status: row.status,
    };
  }
  const { kind, houseNumber, reportKey, periodMonth, bundleMonths, isRefund } = parseReason(
    row.reason,
  );
  const base = {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    amountPaise: Math.abs(row.delta),
    balanceAfterPaise: row.balanceAfter,
    isRefund,
    isCredit: row.delta > 0,
    // Only surface a still-live expiry — expiredAt gets set the moment the sweep claws a row
    // back, and a past expiresAt on an unclawed row is just the cron's polling lag.
    // `remainingPaise === 0` means the user already spent this grant (spends drain expiring
    // lots first, see consumeExpiringCredits), so there is nothing left for the sweep to take
    // and telling them it expires would be a warning about money they can no longer lose.
    ...(row.expiresAt &&
    !row.expiredAt &&
    row.remainingPaise !== 0 &&
    row.expiresAt.getTime() > Date.now()
      ? { expiresAt: row.expiresAt.toISOString() }
      : {}),
  };
  if (kind === 'house_unlock') {
    return { ...base, kind, houseNumber: houseNumber as number };
  }
  if (kind === 'report_unlock') {
    return {
      ...base,
      kind,
      reportKey: reportKey as string,
      ...(periodMonth !== undefined ? { periodMonth } : {}),
      ...(bundleMonths !== undefined ? { bundleMonths } : {}),
    };
  }
  return { ...base, kind };
}

/** A user's full payment history — recharges plus every spend and refund — most recent first. */
export async function listTransactions(userId: string, limit = 50): Promise<Transaction[]> {
  const [orderRows, debitRows] = await Promise.all([
    findOrdersForUser(userId, limit),
    findDebitsForUser(userId, limit),
  ]);
  return [...orderRows, ...debitRows]
    .map(toTransactionDto)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export function toOrderDto(order: OrderRow) {
  return {
    id: order.id,
    packId: order.packId,
    amountPaise: order.amountPaise,
    discountPaise: order.discountPaise,
    finalAmountPaise: order.finalAmountPaise,
    currency: order.currency,
    // What the buyer is charged in `currency`'s minor unit; null on an order from before coin packs,
    // where finalAmountPaise (rupees) was the charge.
    chargedMinor: order.chargedMinor ?? null,
    couponCode: order.couponCode,
    status: order.status,
    gatewayProvider: order.gatewayProvider,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
  };
}
