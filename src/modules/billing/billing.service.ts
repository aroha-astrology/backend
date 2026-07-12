import { Errors } from '../../lib/errors.js';
import type { OrderRow } from '../../db/schema.js';
import { findActiveCouponByCode, insertOrder, findOrderByIdForUser } from './billing.repo.js';

/**
 * Fixed credit-pack catalog. Small and rarely-changing enough to keep as code
 * rather than a DB table — bump prices/credits here, no migration needed.
 */
export const CREDIT_PACKS = [
  { id: 'starter', credits: 60, priceInPaise: 4900, currency: 'INR', label: 'Starter' },
  {
    id: 'popular',
    credits: 200,
    priceInPaise: 14900,
    currency: 'INR',
    label: 'Popular',
    popular: true,
  },
  { id: 'value', credits: 550, priceInPaise: 34900, currency: 'INR', label: 'Value' },
  { id: 'mega', credits: 1200, priceInPaise: 69900, currency: 'INR', label: 'Mega' },
] as const;

export function getCreditPacks() {
  return CREDIT_PACKS;
}

function findPack(packId: string) {
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) throw Errors.badRequest(`Unknown pack "${packId}"`);
  return pack;
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
  const pack = findPack(packId);
  const { coupon, error } = await resolveCoupon(code, pack.priceInPaise);
  if (!coupon) {
    return { valid: false, code, message: error ?? 'Invalid coupon code' };
  }
  const discountPaise = computeDiscountPaise(coupon, pack.priceInPaise);
  return {
    valid: true,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountPaise,
    finalAmountPaise: Math.max(pack.priceInPaise - discountPaise, 0),
  };
}

export async function checkout(userId: string, packId: string, couponCode: string | undefined) {
  const pack = findPack(packId);
  let discountPaise = 0;
  let couponId: string | null = null;
  let resolvedCouponCode: string | null = null;

  if (couponCode) {
    const { coupon, error } = await resolveCoupon(couponCode, pack.priceInPaise);
    if (!coupon) throw Errors.badRequest(error ?? 'Invalid coupon code');
    discountPaise = computeDiscountPaise(coupon, pack.priceInPaise);
    couponId = coupon.id;
    resolvedCouponCode = coupon.code;
  }

  const order = await insertOrder({
    userId,
    packId: pack.id,
    credits: pack.credits,
    amountPaise: pack.priceInPaise,
    discountPaise,
    finalAmountPaise: Math.max(pack.priceInPaise - discountPaise, 0),
    currency: pack.currency,
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
): Promise<{ order: OrderRow; credits: number }> {
  const order = await findOrderByIdForUser(orderId, userId);
  if (!order) throw Errors.notFound('Order not found');
  throw Errors.forbidden('Online payments are not live yet.');
}

export function toOrderDto(order: OrderRow) {
  return {
    id: order.id,
    packId: order.packId,
    credits: order.credits,
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
