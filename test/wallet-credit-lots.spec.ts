import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { transaction: state.transaction }, sqlClient };
});

const { consumeExpiringCredits } = await import('../src/modules/users/users.repo.js');
const { applyExpiryClawback } =
  await import('../src/modules/gift-campaigns/gift-campaigns.repo.js');

const dialect = new PgDialect();

/** Bound parameters of a drizzle SQL fragment / condition — same trick as users-repo-wallet.spec.ts. */
function params(fragment: unknown): unknown[] {
  return dialect.sqlToQuery(fragment as Parameters<typeof dialect.sqlToQuery>[0]).params;
}

/** Minimal tx double that records the `remaining_paise` decrements a drain issues. */
function makeDrainTx(lots: { id: string; remainingPaise: number }[]) {
  const takes: { id: unknown; take: unknown }[] = [];
  let pendingTake: unknown;
  const selectChain: Record<string, unknown> = {
    from: () => selectChain,
    where: () => selectChain,
    orderBy: () => Promise.resolve(lots),
  };
  const updateChain: Record<string, unknown> = {
    // The patch is `remaining_paise - $take`, so the only bound param is the take.
    set: (patch: { remainingPaise: unknown }) => {
      pendingTake = params(patch.remainingPaise)[0];
      return updateChain;
    },
    where: (cond: unknown) => {
      takes.push({ id: params(cond)[0], take: pendingTake });
      return Promise.resolve(undefined);
    },
  };
  return {
    takes,
    tx: { select: () => selectChain, update: () => updateChain } as never,
  };
}

describe('consumeExpiringCredits', () => {
  it('drains the soonest-expiring lot first and stops once the spend is covered', async () => {
    // Lots arrive already ordered by expiry (the query does the ordering).
    const { tx, takes } = makeDrainTx([
      { id: 'expires-soon', remainingPaise: 3000 },
      { id: 'expires-later', remainingPaise: 5000 },
    ]);

    await consumeExpiringCredits(tx, 'user-1', 4000);

    expect(takes).toEqual([
      { id: 'expires-soon', take: 3000 },
      { id: 'expires-later', take: 1000 },
    ]);
  });

  it('drains only what the lots hold — the surplus comes from non-expiring balance', async () => {
    const { tx, takes } = makeDrainTx([{ id: 'bonus', remainingPaise: 2000 }]);

    await consumeExpiringCredits(tx, 'user-1', 50000);

    expect(takes).toEqual([{ id: 'bonus', take: 2000 }]);
  });

  it('writes nothing when the user holds no expiring credit', async () => {
    const { tx, takes } = makeDrainTx([]);

    await consumeExpiringCredits(tx, 'user-1', 10000);

    expect(takes).toEqual([]);
  });
});

/** Records what applyExpiryClawback actually deducts, given a locked balance. */
function makeClawbackTx(balancePaise: number | null) {
  const calls = { deducted: [] as unknown[], ledger: [] as unknown[], retired: [] as unknown[] };
  const updateChain: Record<string, unknown> = {
    set: (patch: Record<string, unknown>) => {
      // Distinguish the users deduction from the grant-retiring ledger update.
      if ('walletBalancePaise' in patch) {
        calls.deducted.push(params(patch.walletBalancePaise)[0]);
      } else {
        calls.retired.push(patch);
      }
      return updateChain;
    },
    where: () => updateChain,
    returning: () => Promise.resolve([{ walletBalancePaise: 0 }]),
  };
  const tx = {
    execute: () =>
      Promise.resolve(balancePaise === null ? [] : [{ wallet_balance_paise: balancePaise }]),
    update: () => updateChain,
    insert: () => ({ values: (v: unknown) => (calls.ledger.push(v), Promise.resolve(undefined)) }),
  };
  state.transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
  return calls;
}

describe('applyExpiryClawback', () => {
  it('never takes the balance below zero', async () => {
    // Grant of Rs 50 expiring unspent, but the wallet only holds Rs 20 —
    // the missing Rs 30 must not become an overdraft.
    const calls = makeClawbackTx(2000);

    await applyExpiryClawback('grant-1', 'user-1', 5000, 'diwali_expired');

    expect(calls.deducted).toEqual([2000]);
    expect(calls.ledger).toEqual([
      { userId: 'user-1', delta: -2000, reason: 'diwali_expired', balanceAfter: 0 },
    ]);
  });

  it('retires the grant without a wallet write when the balance is empty', async () => {
    const calls = makeClawbackTx(0);

    await applyExpiryClawback('grant-1', 'user-1', 5000, 'diwali_expired');

    expect(calls.deducted).toEqual([]);
    expect(calls.ledger).toEqual([]);
    expect(calls.retired).toHaveLength(1);
    expect(calls.retired[0]).toMatchObject({ remainingPaise: 0 });
  });
});
