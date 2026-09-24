import { describe, it, expect, vi } from 'vitest';

// confirmOrderAndGrantCredits used to credit `finalAmountPaise` (price minus a
// coupon discount). On Google Play — now the only way to pay — the user is
// always charged the full price, so a ₹500 top-up with a 20% coupon credited
// only ₹400. It must credit the full pack amount, including for a coupon order
// still pending from before coupons were switched off.

const state = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  ledger: [] as Array<Record<string, unknown>>,
}));

vi.mock('../src/config/db.js', async () => {
  const schema = await import('../src/db/schema.js');
  const tx = {
    update: (table: unknown) => ({
      set: () => ({
        where: () => ({
          returning: () =>
            Promise.resolve(
              table === schema.orders ? [state.order] : [{ walletBalancePaise: 123_456 }],
            ),
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        state.ledger.push(values);
        return Promise.resolve();
      },
    }),
  };
  return { db: { transaction: (fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx)) } };
});

import { confirmOrderAndGrantCredits } from '../src/modules/billing/billing.repo.js';

describe('confirmOrderAndGrantCredits', () => {
  it('credits the full pack amount even when an old pending order carries a coupon discount', async () => {
    state.order = {
      id: 'order-1',
      userId: 'user-1',
      packId: 'recharge_500',
      amountPaise: 50000,
      discountPaise: 10000,
      finalAmountPaise: 40000,
      couponId: 'coupon-1',
      couponCode: 'SAVE20',
      status: 'paid',
    };
    state.ledger = [];

    const result = await confirmOrderAndGrantCredits('order-1', 'user-1', 'play-token');

    expect(result?.walletBalancePaise).toBe(123_456);
    expect(state.ledger).toEqual([
      expect.objectContaining({ userId: 'user-1', delta: 50000, reason: 'purchase:recharge_500' }),
    ]);
  });
});
