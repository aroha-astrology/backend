import { Errors } from '../../lib/errors.js';
import type { OrderRow, WalletTransactionRow } from '../../db/schema.js';
import {
  findActiveCouponByCode,
  insertOrder,
  findOrderByIdForUser,
  findOrdersForUser,
  findDebitsForUser,
  findLatestOrderForPack,
  confirmOrderAndGrantCredits,
} from './billing.repo.js';
import { findActiveUserById } from '../users/users.repo.js';
import { logger } from '../../lib/logger.js';
import { verifyGooglePlayPurchase, consumeGooglePlayPurchase } from './google-play-verifier.js';
import { notifyWalletTopUp } from '../../lib/notifications/telegram.js';

/**
 * Fixed top-up catalog. Each entry is a 1:1 top-up (pay this amount, wallet
 * gets exactly this amount) — the `id`s here MUST match real one-time
 * product IDs configured in the Google Play Console with the same price,
 * since Play Billing products are fixed-price (see Task D1 in the rollout
 * plan). Small and rarely-changing enough to keep as code rather than a DB
 * table — bump amounts here, no migration needed (but DOES need a matching
 * Play Console product edit).
 */
export const TOP_UP_AMOUNTS = [
  { id: 'topup_50', amountPaise: 5000, currency: 'INR', label: '₹50' },
  { id: 'topup_100', amountPaise: 10000, currency: 'INR', label: '₹100' },
  { id: 'topup_200', amountPaise: 20000, currency: 'INR', label: '₹200', popular: true },
  { id: 'topup_500', amountPaise: 50000, currency: 'INR', label: '₹500' },
  { id: 'topup_1000', amountPaise: 100000, currency: 'INR', label: '₹1000' },
] as const;

export function getTopUpAmounts() {
  return TOP_UP_AMOUNTS;
}

function findTopUpAmount(id: string) {
  const amount = TOP_UP_AMOUNTS.find((a) => a.id === id);
  if (!amount) throw Errors.badRequest(`Unknown top-up amount "${id}"`);
  return amount;
}

/** Discount amount in paise a coupon would apply to a given order amount, 0 if inapplicable. */
function computeDiscountPaise(
  coupon: { discountType: string; discountValue: number },
  amountPaise: number,
): number {
  if (coupon.discountType === 'percent') {
    return Math.round((amountPaise * coupon.discountValue) / 100);
  }
  return Math.min(coupon.discountValue, amountPaise);
}

async function resolveCoupon(code: string, amountPaise: number) {
  const coupon = await findActiveCouponByCode(code);
  if (!coupon) return { coupon: null, error: 'Invalid coupon code' as const };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return { coupon: null, error: 'This coupon has expired' as const };
  }
  if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { coupon: null, error: 'This coupon has reached its redemption limit' as const };
  }
  if (coupon.minAmountPaise != null && amountPaise < coupon.minAmountPaise) {
    const minRupees = (coupon.minAmountPaise / 100).toFixed(0);
    return { coupon: null, error: `This coupon needs a minimum order of ₹${minRupees}` as const };
  }
  return { coupon, error: null };
}

export async function validateCoupon(code: string, packId: string) {
  const amount = findTopUpAmount(packId);
  const { coupon, error } = await resolveCoupon(code, amount.amountPaise);
  if (!coupon) {
    return { valid: false, code, message: error ?? 'Invalid coupon code' };
  }
  const discountPaise = computeDiscountPaise(coupon, amount.amountPaise);
  return {
    valid: true,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountPaise,
    finalAmountPaise: Math.max(amount.amountPaise - discountPaise, 0),
  };
}

export async function checkout(userId: string, packId: string, couponCode: string | undefined) {
  const amount = findTopUpAmount(packId);
  let discountPaise = 0;
  let couponId: string | null = null;
  let resolvedCouponCode: string | null = null;

  if (couponCode) {
    const { coupon, error } = await resolveCoupon(couponCode, amount.amountPaise);
    if (!coupon) throw Errors.badRequest(error ?? 'Invalid coupon code');
    discountPaise = computeDiscountPaise(coupon, amount.amountPaise);
    couponId = coupon.id;
    resolvedCouponCode = coupon.code;
  }

  const order = await insertOrder({
    userId,
    packId: amount.id,
    amountPaise: amount.amountPaise,
    discountPaise,
    finalAmountPaise: Math.max(amount.amountPaise - discountPaise, 0),
    currency: amount.currency,
    couponId,
    couponCode: resolvedCouponCode,
    status: 'pending',
    gatewayProvider: 'mock',
  });

  return order;
}

/**
 * No real payment gateway (Razorpay/Stripe) is wired up yet — this used to be
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
    logger.warn({ err, purchaseToken, productId }, 'Failed to consume Google Play purchase');
  }

  // Fresh grant only (not the idempotent-replay/already-paid branches above) —
  // avoids sending a duplicate admin notification if this call gets retried.
  const buyer = await findActiveUserById(userId);
  notifyWalletTopUp({
    userId,
    contact: buyer?.phoneE164 ?? buyer?.email ?? null,
    amountPaise: order.finalAmountPaise,
    newBalancePaise: result.walletBalancePaise,
  }).catch((err) =>
    logger.warn({ err, userId }, 'Failed to send wallet top-up Telegram notification'),
  );

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
  | 'house_unlock';

/**
 * Maps a wallet_transactions `reason` string to its display kind. A leading
 * `refund:` is stripped and reported separately via `isRefund` — the UI
 * shows one generic "Refund" treatment regardless of what was refunded.
 * `:profile:<id>` suffixes (owned-profile unlocks) are recognized but not
 * surfaced — the UI shows the same label whichever profile it was for.
 */
export function parseReason(reason: string): {
  kind: TransactionKind;
  houseNumber?: number;
  isRefund: boolean;
} {
  const isRefund = reason.startsWith('refund:');
  const base = isRefund ? reason.slice('refund:'.length) : reason;

  if (base === 'chat_message') return { kind: 'chat', isRefund };
  if (base === 'vastu_report') return { kind: 'vastu_report', isRefund };
  if (base === 'profile_creation') return { kind: 'profile_creation', isRefund };
  if (base === 'gemstone_unlock' || base.startsWith('gemstone_unlock:profile:')) {
    return { kind: 'gemstone_unlock', isRefund };
  }
  const houseMatch = base.match(/^house_unlock:(\d+)(?::profile:.+)?$/);
  if (houseMatch) {
    return { kind: 'house_unlock', houseNumber: Number(houseMatch[1]), isRefund };
  }
  throw new Error(`unrecognized wallet_transactions reason: ${reason}`);
}

interface RechargeTransaction {
  id: string;
  kind: 'recharge';
  createdAt: string;
  amountPaise: number;
  status: OrderRow['status'];
}

interface DebitTransaction {
  id: string;
  kind: Exclude<TransactionKind, 'house_unlock'>;
  createdAt: string;
  amountPaise: number;
  balanceAfterPaise: number;
  isRefund: boolean;
}

interface HouseUnlockTransaction {
  id: string;
  kind: 'house_unlock';
  createdAt: string;
  amountPaise: number;
  balanceAfterPaise: number;
  isRefund: boolean;
  houseNumber: number;
}

export type Transaction = RechargeTransaction | DebitTransaction | HouseUnlockTransaction;

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
  const { kind, houseNumber, isRefund } = parseReason(row.reason);
  const base = {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    amountPaise: Math.abs(row.delta),
    balanceAfterPaise: row.balanceAfter,
    isRefund,
  };
  if (kind === 'house_unlock') {
    return { ...base, kind, houseNumber: houseNumber as number };
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
    couponCode: order.couponCode,
    status: order.status,
    gatewayProvider: order.gatewayProvider,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
  };
}
