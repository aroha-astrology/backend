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
      expect.objectContaining({ userId: 'user-1', delta: 25000, reason: 'recharge_bonus:recharge_500' }),
    ]);
  });

  // Owner's offer (2026-10-17): pay ₹250 get ₹350, pay ₹500 get ₹750. The
  // extra is its own ledger row so the purchase row stays what was paid.
  it.each([
    ['recharge_250', 25000, 10000],
    ['recharge_500', 50000, 25000],
  ])('%s pays %i and adds a %i bonus row after it', async (packId, paid, bonus) => {
    state.order = { id: 'order-2', userId: 'user-1', packId, amountPaise: paid, status: 'paid' };
    state.ledger = [];

    await confirmOrderAndGrantCredits('order-2', 'user-1', 'play-token');

    expect(state.ledger).toEqual([
      expect.objectContaining({ delta: paid, reason: `purchase:${packId}`, balanceAfter: 123_456 - bonus }),
      expect.objectContaining({ delta: bonus, reason: `recharge_bonus:${packId}`, balanceAfter: 123_456 }),
    ]);
  });

  it.each(['recharge_25', 'recharrge_50', '100_recharge'])('%s has no bonus row', async (packId) => {
    state.order = { id: 'order-3', userId: 'user-1', packId, amountPaise: 2500, status: 'paid' };
    state.ledger = [];

    await confirmOrderAndGrantCredits('order-3', 'user-1', 'play-token');

    expect(state.ledger).toEqual([
      expect.objectContaining({ delta: 2500, reason: `purchase:${packId}`, balanceAfter: 123_456 }),
    ]);
  });

  // v7 coin packs: the coins are credited whatever currency the buyer paid in. The order's
  // amount is then a price in cents/pence/paise of that currency, never wallet money.
  it.each([
    ['coins_100', 'INR', 9900, 10000, 0],
    ['coins_330', 'USD', 499, 30000, 3000],
    ['coins_700', 'EUR', 999, 60000, 10000],
    ['coins_1800', 'GBP', 1799, 150000, 30000],
  ])('%s paid in %s credits its coins, not its price', async (packId, currency, charged, paid, bonus) => {
    state.order = { id: 'order-4', userId: 'user-1', packId, currency, amountPaise: 29900, chargedMinor: charged, status: 'paid' };
    state.ledger = [];

    await confirmOrderAndGrantCredits('order-4', 'user-1', 'razorpay-payment');

    expect(state.ledger).toEqual(
      bonus === 0
        ? [expect.objectContaining({ delta: paid, reason: `purchase:${packId}`, balanceAfter: 123_456 })]
        : [
            expect.objectContaining({ delta: paid, reason: `purchase:${packId}`, balanceAfter: 123_456 - bonus }),
            expect.objectContaining({ delta: bonus, reason: `recharge_bonus:${packId}`, balanceAfter: 123_456 }),
          ],
    );
  });
});
