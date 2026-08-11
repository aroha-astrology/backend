import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

const KEY_SECRET = 'test_secret';

// Runs before the imports below, so config/env.ts parses with gateway keys present.
vi.hoisted(() => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
});
vi.mock('../src/modules/billing/billing.repo.js', () => ({
  findOrderByIdForUser: vi.fn(),
  confirmOrderAndGrantCredits: vi.fn(),
  findActiveCouponByCode: vi.fn(),
  insertOrder: vi.fn(),
  findOrdersForUser: vi.fn(),
  findDebitsForUser: vi.fn(),
  findLatestOrderForPack: vi.fn(),
  setOrderGatewayOrderId: vi.fn(),
  refundOrder: vi.fn(),
}));
vi.mock('../src/modules/users/users.repo.js', () => ({ findActiveUserById: vi.fn() }));
vi.mock('../src/lib/notifications/telegram.js', () => ({ notifyWalletTopUp: vi.fn() }));

import {
  findOrderByIdForUser,
  confirmOrderAndGrantCredits,
  refundOrder as refundOrderRepo,
} from '../src/modules/billing/billing.repo.js';
import { findActiveUserById } from '../src/modules/users/users.repo.js';
import { notifyWalletTopUp } from '../src/modules/../lib/notifications/telegram.js';
import { verifyRazorpayPayment, refundOrder } from '../src/modules/billing/billing.service.js';

const RZP_ORDER = 'order_rzp1';
const RZP_PAYMENT = 'pay_rzp1';
const sign = (orderId: string, paymentId: string) =>
  createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const baseOrder = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: 'user-1',
  packId: 'recharge_250',
  amountPaise: 25000,
  discountPaise: 0,
  finalAmountPaise: 25000,
  currency: 'INR',
  couponId: null,
  couponCode: null,
  status: 'pending' as const,
  gatewayProvider: 'razorpay',
  gatewayOrderId: RZP_ORDER,
  gatewayPaymentId: null,
  reference: 'AR-DEADBEEF',
  createdAt: new Date('2026-08-02T00:00:00Z'),
  paidAt: null,
  verifiedAt: null,
};

const goodParams = {
  orderId: baseOrder.id,
  razorpayOrderId: RZP_ORDER,
  razorpayPaymentId: RZP_PAYMENT,
  razorpaySignature: sign(RZP_ORDER, RZP_PAYMENT),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findActiveUserById).mockResolvedValue({
    phoneE164: null,
    email: null,
    walletBalancePaise: 25000,
  } as never);
  vi.mocked(notifyWalletTopUp).mockResolvedValue(undefined as never);
});

describe('verifyRazorpayPayment', () => {
  it('grants the wallet balance for a valid signature', async () => {
    vi.mocked(findOrderByIdForUser).mockResolvedValue(baseOrder);
    vi.mocked(confirmOrderAndGrantCredits).mockResolvedValue({
      order: { ...baseOrder, status: 'paid', gatewayPaymentId: RZP_PAYMENT },
      walletBalancePaise: 25000,
    });

    const result = await verifyRazorpayPayment('user-1', goodParams);

    expect(result.walletBalancePaise).toBe(25000);
    expect(confirmOrderAndGrantCredits).toHaveBeenCalledWith(baseOrder.id, 'user-1', RZP_PAYMENT);
  });

  it('refuses a forged signature without granting anything', async () => {
    vi.mocked(findOrderByIdForUser).mockResolvedValue(baseOrder);

    await expect(
      verifyRazorpayPayment('user-1', { ...goodParams, razorpaySignature: 'deadbeef' }),
    ).rejects.toThrow('Payment could not be verified');
    expect(confirmOrderAndGrantCredits).not.toHaveBeenCalled();
  });

  it('refuses a payment made against a different Razorpay order', async () => {
    vi.mocked(findOrderByIdForUser).mockResolvedValue(baseOrder);

    await expect(
      verifyRazorpayPayment('user-1', {
        ...goodParams,
        razorpayOrderId: 'order_cheap',
        razorpaySignature: sign('order_cheap', RZP_PAYMENT),
      }),
    ).rejects.toThrow('does not belong to that order');
    expect(confirmOrderAndGrantCredits).not.toHaveBeenCalled();
  });

  it('is idempotent for a replay of the same payment', async () => {
    vi.mocked(findOrderByIdForUser).mockResolvedValue({
      ...baseOrder,
      status: 'paid',
      gatewayPaymentId: RZP_PAYMENT,
    });

    const result = await verifyRazorpayPayment('user-1', goodParams);

    expect(result.walletBalancePaise).toBe(25000);
    expect(confirmOrderAndGrantCredits).not.toHaveBeenCalled();
  });
});

describe('refundOrder', () => {
  it('credits the wallet and returns the refunded order', async () => {
    vi.mocked(refundOrderRepo).mockResolvedValue({
      order: { ...baseOrder, status: 'refunded' },
      walletBalancePaise: 25000,
    });

    const result = await refundOrder(baseOrder.id, 'user-1', 'support_request');

    expect(refundOrderRepo).toHaveBeenCalledWith(baseOrder.id, 'user-1', 'support_request');
    expect(result.walletBalancePaise).toBe(25000);
    expect(result.order.status).toBe('refunded');
  });

  it('rejects an order that is not currently paid (not found, or already refunded)', async () => {
    vi.mocked(refundOrderRepo).mockResolvedValue(undefined);

    await expect(refundOrder(baseOrder.id, 'user-1', 'support_request')).rejects.toThrow(
      'not refundable',
    );
  });
});
