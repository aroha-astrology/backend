import { beforeEach, describe, expect, it, vi } from 'vitest';

// A wallet write that carries an idempotency key happens at most once per
// (user, key) (migration 0092): a retried charge never charges twice, and a
// second refund for the same charge pays nothing. The transaction handle is
// faked the same way test/users-repo-wallet.spec.ts does it, plus the
// "is this key already in the ledger" probe.

const state = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { transaction: state.transaction }, sqlClient };
});

import {
  deductWalletBalance,
  addWalletBalance,
  refundKeyFor,
} from '../src/modules/users/users.repo.js';

function fakeTx(opts: { priorKeyRow?: boolean; updateResult?: unknown[]; insertThrows?: unknown }) {
  const updateChain: Record<string, unknown> = {};
  updateChain.set = vi.fn(() => updateChain);
  updateChain.where = vi.fn(() => updateChain);
  updateChain.returning = vi.fn(() => Promise.resolve(opts.updateResult ?? [{ walletBalancePaise: 8000 }]));
  const update = vi.fn(() => updateChain);

  const insertValues = vi.fn(() =>
    opts.insertThrows ? Promise.reject(opts.insertThrows) : Promise.resolve(undefined),
  );
  const insert = vi.fn(() => ({ values: insertValues }));

  // select() serves both lookups: the key probe ends in .limit(), the expiring-lot read in .orderBy().
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(opts.priorKeyRow ? [{ id: 'row-1' }] : []));
    chain.orderBy = vi.fn(() => Promise.resolve([]));
    return chain;
  });

  state.transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb({ update, insert, select }));
  return { update, insert, insertValues };
}

const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });

beforeEach(() => {
  state.transaction.mockReset();
});

describe('refundKeyFor', () => {
  it('derives one refund key per charge key', () => {
    expect(refundKeyFor('chat:abc')).toBe('refund:chat:abc');
  });
});

describe('deductWalletBalance with an idempotency key', () => {
  it('charges and stores the key the first time', async () => {
    const tx = fakeTx({});
    const ok = await deductWalletBalance('u1', 2000, 'profile_creation', { idempotencyKey: 'k1' });
    expect(ok).toBe(true);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ delta: -2000, idempotencyKey: 'k1' }),
    );
  });

  it('a replay answers true and touches neither the balance nor the ledger', async () => {
    const tx = fakeTx({ priorKeyRow: true });
    const ok = await deductWalletBalance('u1', 2000, 'profile_creation', { idempotencyKey: 'k1' });
    expect(ok).toBe(true);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('a request that loses the race to the unique index also answers true', async () => {
    fakeTx({ insertThrows: uniqueViolation });
    const ok = await deductWalletBalance('u1', 2000, 'profile_creation', { idempotencyKey: 'k1' });
    expect(ok).toBe(true);
  });

  it('still refuses when the balance is too low', async () => {
    fakeTx({ updateResult: [] });
    const ok = await deductWalletBalance('u1', 2000, 'profile_creation', { idempotencyKey: 'k1' });
    expect(ok).toBe(false);
  });

  it('any other database error is not swallowed', async () => {
    fakeTx({ insertThrows: new Error('connection lost') });
    await expect(
      deductWalletBalance('u1', 2000, 'profile_creation', { idempotencyKey: 'k1' }),
    ).rejects.toThrow('connection lost');
  });

  it('without a key a unique violation is NOT treated as a replay', async () => {
    fakeTx({ insertThrows: uniqueViolation });
    await expect(deductWalletBalance('u1', 2000, 'profile_creation')).rejects.toThrow();
  });
});

describe('addWalletBalance with an idempotency key', () => {
  it('credits once and reports it', async () => {
    const tx = fakeTx({ updateResult: [{ walletBalancePaise: 10000 }] });
    const ok = await addWalletBalance('u1', 2000, 'refund:chat', { idempotencyKey: refundKeyFor('chat:1') });
    expect(ok).toBe(true);
    expect(tx.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 2000, idempotencyKey: 'refund:chat:1' }),
    );
  });

  it('a second refund for the same charge pays nothing', async () => {
    const tx = fakeTx({ priorKeyRow: true });
    const ok = await addWalletBalance('u1', 2000, 'refund:chat', { idempotencyKey: refundKeyFor('chat:1') });
    expect(ok).toBe(false);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('two refunds racing: the loser reports false and credits nothing', async () => {
    fakeTx({ insertThrows: uniqueViolation });
    const ok = await addWalletBalance('u1', 2000, 'refund:chat', { idempotencyKey: refundKeyFor('chat:1') });
    expect(ok).toBe(false);
  });

  it('an unkeyed credit behaves as before and returns true', async () => {
    fakeTx({ updateResult: [{ walletBalancePaise: 10000 }] });
    expect(await addWalletBalance('u1', 2000, 'refund:chat')).toBe(true);
  });
});
