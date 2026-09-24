import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupons were switched off on 2026-09-24: Google Play is the only way to pay
// and always charges full price, so a coupon could only ever shrink the credit.

vi.mock('../src/modules/billing/billing.repo.js', () => ({
  insertOrder: vi.fn((values: Record<string, unknown>) =>
    Promise.resolve({ id: 'order-1', ...values }),
  ),
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  findActiveUserById: vi.fn(),
}));
vi.mock('../src/modules/billing/google-play-verifier.js', () => ({
  verifyGooglePlayPurchase: vi.fn(),
  consumeGooglePlayPurchase: vi.fn(),
  fetchGooglePlayPurchase: vi.fn(),
}));

import { insertOrder } from '../src/modules/billing/billing.repo.js';
import { checkout, validateCoupon } from '../src/modules/billing/billing.service.js';

beforeEach(() => {
  vi.mocked(insertOrder).mockClear();
});

describe('coupons are switched off', () => {
  it('validateCoupon always reports the coupon as unavailable', () => {
    expect(validateCoupon('SAVE20', 'recharge_500')).toMatchObject({
      valid: false,
      code: 'SAVE20',
    });
  });

  it('validateCoupon still rejects an unknown pack', () => {
    expect(() => validateCoupon('SAVE20', 'not-a-pack')).toThrow(/Unknown top-up amount/);
  });

  it('checkout ignores a coupon code: the order credits exactly what Play charges', async () => {
    await checkout('user-1', 'recharge_500', 'SAVE20');

    expect(insertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        packId: 'recharge_500',
        amountPaise: 50000,
        discountPaise: 0,
        finalAmountPaise: 50000,
        couponId: null,
        couponCode: null,
        gatewayProvider: 'mock',
      }),
    );
  });
});
