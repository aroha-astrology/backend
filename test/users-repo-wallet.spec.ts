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
/* eslint-disable @typescript-eslint/no-unused-vars -- unlockHouseForUser/unlockGemstoneForUser/
 * HOUSE_UNLOCK_COST_PAISE/GEMSTONE_UNLOCK_COST_PAISE aren't exercised by this task's tests yet;
 * later payment-history plan tasks (4-5) append describe blocks to this same file that use them. */
import {
  deductWalletBalance,
  addWalletBalance,
  unlockHouseForUser,
  unlockGemstoneForUser,
  HOUSE_UNLOCK_COST_PAISE,
  GEMSTONE_UNLOCK_COST_PAISE,
} from '../src/modules/users/users.repo.js';
/* eslint-enable @typescript-eslint/no-unused-vars */

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

function setupTransaction(updateResult: unknown[]) {
  const updateChain = makeUpdateChain(updateResult);
  const insertChain = makeInsertChain();
  const updateMock = vi.fn(() => updateChain.chain);
  const insertMock = vi.fn(() => insertChain.chain);
  state.transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb({ update: updateMock, insert: insertMock }),
  );
  return { updateChain, insertChain, updateMock, insertMock };
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
