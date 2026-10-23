import { describe, it, expect, vi } from 'vitest';

// Question Packs are bought on Google Play since 2026-10-23. Confirming a pack's Play order
// must add chat questions, never wallet money (and no wallet ledger row). This is the same
// function the app's confirm call, the startup replay and the RTDN webhook all go through.

const state = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  ledger: [] as Array<Record<string, unknown>>,
  userSets: [] as Array<Record<string, unknown>>,
}));

vi.mock('../src/config/db.js', async () => {
  const schema = await import('../src/db/schema.js');
  const tx = {
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        if (table === schema.users) state.userSets.push(values);
        return {
          where: () => ({
            returning: () =>
              Promise.resolve(
                table === schema.orders ? [state.order] : [{ walletBalancePaise: 7_000 }],
              ),
          }),
        };
      },
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

describe('confirmOrderAndGrantCredits for a Question Pack', () => {
  it('adds questions, leaves the wallet and its ledger alone', async () => {
    state.order = {
      id: 'order-1',
      userId: 'user-1',
      packId: 'question_pack_12',
      amountPaise: 9900,
      finalAmountPaise: 9900,
      status: 'paid',
    };
    const result = await confirmOrderAndGrantCredits('order-1', 'user-1', 'play-token');

    expect(result?.walletBalancePaise).toBe(7_000);
    expect(state.ledger).toEqual([]);
    expect(state.userSets).toHaveLength(1);
    expect(Object.keys(state.userSets[0]!)).toContain('questionCredits');
    expect(Object.keys(state.userSets[0]!)).not.toContain('walletBalancePaise');
  });

  it('a wallet top-up still credits the wallet', async () => {
    state.order = {
      id: 'order-2',
      userId: 'user-1',
      packId: 'recharge_25',
      amountPaise: 2500,
      finalAmountPaise: 2500,
      status: 'paid',
    };
    state.ledger = [];
    state.userSets = [];
    await confirmOrderAndGrantCredits('order-2', 'user-1', 'play-token');
    expect(Object.keys(state.userSets[0]!)).toContain('walletBalancePaise');
    expect(state.ledger).toEqual([
      expect.objectContaining({ delta: 2500, reason: 'purchase:recharge_25' }),
    ]);
  });
});
