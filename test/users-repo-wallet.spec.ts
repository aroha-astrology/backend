import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { transaction: state.transaction }, sqlClient };
});

import { walletTransactions } from '../src/db/schema.js';
import {
  deductWalletBalance,
  addWalletBalance,
  unlockHouseForUser,
  unlockGemstoneForUser,
  HOUSE_UNLOCK_FALLBACK_PAISE,
  GEMSTONE_UNLOCK_FALLBACK_PAISE,
} from '../src/modules/users/users.repo.js';

const dialect = new PgDialect();

interface FakeUpdateChain {
  set: (patch: unknown) => FakeUpdateChain;
  where: (cond: unknown) => FakeUpdateChain;
  returning: () => Promise<unknown[]>;
}

function makeUpdateChain(returningResult: unknown[]) {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain: FakeUpdateChain = {
    set: vi.fn((patch: unknown) => {
      calls.set = patch;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(returningResult)),
  };
  return { chain, calls };
}

function makeInsertChain() {
  const calls: { values?: unknown } = {};
  const chain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return Promise.resolve(undefined);
    }),
  };
  return { chain, calls };
}

function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

/**
 * The expiring-credit lot lookup `consumeExpiringCredits` runs after every
 * debit. Returns no lots by default, so the debit assertions below see only
 * the balance UPDATE they care about.
 */
function makeSelectChain(lots: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'orderBy']) {
    chain[method] = vi.fn(() => chain);
  }
  // `orderBy` is the last call in the builder chain, so it must resolve.
  chain.orderBy = vi.fn(() => Promise.resolve(lots));
  return chain;
}

function setupTransaction(updateResult: unknown[], lots: unknown[] = []) {
  const updateChain = makeUpdateChain(updateResult);
  const insertChain = makeInsertChain();
  const updateMock = vi.fn(() => updateChain.chain);
  const insertMock = vi.fn(() => insertChain.chain);
  const selectMock = vi.fn(() => makeSelectChain(lots));
  state.transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb({ update: updateMock, insert: insertMock, select: selectMock }),
  );
  return { updateChain, insertChain, updateMock, insertMock, selectMock };
}

beforeEach(() => {
  state.transaction.mockReset();
});

describe('deductWalletBalance', () => {
  it('guards on sufficient balance, decrements, and logs a negative ledger row', async () => {
    const { updateChain, insertMock, insertChain } = setupTransaction([
      { walletBalancePaise: 8000 },
    ]);

    const result = await deductWalletBalance('user-1', 2000, 'chat_message');

    expect(result).toBe(true);
    const query = compile(updateChain.calls.where);
    expect(query.sql).toBe('("users"."id" = $1 and "users"."wallet_balance_paise" >= $2)');
    expect(query.params).toEqual(['user-1', 2000]);
    expect(insertMock).toHaveBeenCalledWith(walletTransactions);
    expect(insertChain.calls.values).toEqual({
      userId: 'user-1',
      delta: -2000,
      reason: 'chat_message',
      balanceAfter: 8000,
    });
  });

  it('returns false and writes no ledger row when the balance is insufficient', async () => {
    const { insertMock } = setupTransaction([]);

    const result = await deductWalletBalance('user-1', 2000, 'chat_message');

    expect(result).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('drains the expiring credit lot so the spend comes out of the bonus, not paid balance', async () => {
    const { updateMock } = setupTransaction(
      [{ walletBalancePaise: 8000 }],
      [{ id: 'bonus-lot', remainingPaise: 2000 }],
    );

    await deductWalletBalance('user-1', 2000, 'chat_message');

    // Two UPDATEs: the balance debit, then the lot's remaining_paise.
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it('skips the lot UPDATE entirely when the balance guard refuses the spend', async () => {
    const { updateMock } = setupTransaction([], [{ id: 'bonus-lot', remainingPaise: 2000 }]);

    await deductWalletBalance('user-1', 2000, 'chat_message');

    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

describe('addWalletBalance', () => {
  it('increments the balance and logs a positive ledger row', async () => {
    const { updateChain, insertChain } = setupTransaction([{ walletBalancePaise: 10000 }]);

    await addWalletBalance('user-1', 2000, 'refund:chat_message');

    const query = compile(updateChain.calls.where);
    expect(query.params).toEqual(['user-1']);
    expect(insertChain.calls.values).toEqual({
      userId: 'user-1',
      delta: 2000,
      reason: 'refund:chat_message',
      balanceAfter: 10000,
    });
  });
});

describe('unlockHouseForUser', () => {
  it('charges, appends the house, and logs a house_unlock ledger row', async () => {
    const { updateChain, insertChain } = setupTransaction([{ walletBalancePaise: 45000 }]);

    const result = await unlockHouseForUser('user-1', 7, HOUSE_UNLOCK_FALLBACK_PAISE);

    expect(result).toBe(true);
    const query = compile(updateChain.calls.where);
    expect(query.params).toEqual(['user-1', HOUSE_UNLOCK_FALLBACK_PAISE, 7]);
    expect(insertChain.calls.values).toEqual({
      userId: 'user-1',
      delta: -HOUSE_UNLOCK_FALLBACK_PAISE,
      reason: 'house_unlock:7',
      balanceAfter: 45000,
    });
  });

  it('returns false and writes no ledger row when the guard fails', async () => {
    const { insertMock } = setupTransaction([]);

    const result = await unlockHouseForUser('user-1', 7, HOUSE_UNLOCK_FALLBACK_PAISE);

    expect(result).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('unlockGemstoneForUser', () => {
  it('charges, flips the flag, and logs a gemstone_unlock ledger row', async () => {
    const { insertChain } = setupTransaction([{ walletBalancePaise: 90000 }]);

    const result = await unlockGemstoneForUser('user-1', null, GEMSTONE_UNLOCK_FALLBACK_PAISE);

    expect(result).toBe(true);
    expect(insertChain.calls.values).toEqual({
      userId: 'user-1',
      delta: -GEMSTONE_UNLOCK_FALLBACK_PAISE,
      reason: 'gemstone_unlock',
      balanceAfter: 90000,
    });
  });

  it('does not set gemstoneWeightKg on the update patch when no weight is given', async () => {
    const { updateChain } = setupTransaction([{ walletBalancePaise: 90000 }]);

    await unlockGemstoneForUser('user-1', null, GEMSTONE_UNLOCK_FALLBACK_PAISE);

    expect(updateChain.calls.set).not.toHaveProperty('gemstoneWeightKg');
  });

  it('sets gemstoneWeightKg on the update patch when a weight is given', async () => {
    const { updateChain } = setupTransaction([{ walletBalancePaise: 90000 }]);

    await unlockGemstoneForUser('user-1', 68);

    expect(updateChain.calls.set).toMatchObject({ gemstoneWeightKg: 68 });
  });
});
