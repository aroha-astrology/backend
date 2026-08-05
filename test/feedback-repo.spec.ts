import { beforeEach, describe, expect, it, vi } from 'vitest';

// The one thing worth pinning about recordFeedback: the ₹50 thank-you is
// once-per-user forever, while the feedback row itself is written every time.
// Getting that backwards means paying repeatedly for the same user's ratings.
// The comment's encryption boundary (same convention as support.repo.ts) is
// covered here too, with the real AES implementation and a mocked env key.

const state = vi.hoisted(() => ({
  transaction: vi.fn(),
  fakeEnv: {
    ENCRYPTION_KEY: Buffer.from('user-feedback-test-key-32-bytes!')
      .subarray(0, 32)
      .toString('base64'),
    ENCRYPTION_HASH_KEY: undefined as string | undefined,
  },
}));

vi.mock('../src/config/env.js', () => ({
  env: state.fakeEnv,
  isProduction: false,
  isTest: true,
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient = Object.assign((..._args: unknown[]) => Promise.resolve([]), {
    end: vi.fn().mockResolvedValue(undefined),
  });
  return { db: { transaction: state.transaction }, sqlClient };
});

import { userFeedback, walletTransactions } from '../src/db/schema.js';
import { recordFeedback } from '../src/modules/feedback/feedback.repo.js';

type Values = Record<string, unknown>;

interface TxSpy {
  /** Rows the `SELECT ... FROM wallet_transactions` lookup should return. */
  priorRewardRows: unknown[];
  inserts: { table: unknown; values: Values }[];
  updates: { set: Values }[];
}

interface InsertChain {
  values: (v: Values) => InsertChain;
  returning: () => Promise<{ id: string }[]>;
  /** insert(walletTransactions).values(...) is awaited without .returning(). */
  then: Promise<undefined>['then'];
}

interface SelectChain {
  from: () => SelectChain;
  where: () => SelectChain;
  limit: () => Promise<unknown[]>;
}

interface UpdateChain {
  set: (patch: Values) => UpdateChain;
  where: () => UpdateChain;
  returning: () => Promise<{ walletBalancePaise: number }[]>;
}

/**
 * Minimal stand-in for the drizzle transaction handle, covering exactly the
 * four call shapes recordFeedback uses: insert().values().returning(),
 * execute(), select().from().where().limit(), update().set().where().returning().
 */
function makeTx(spy: TxSpy) {
  return {
    insert: (table: unknown): InsertChain => {
      const chain: InsertChain = {
        values: (values: Values) => {
          spy.inserts.push({ table, values });
          return chain;
        },
        returning: () => Promise.resolve([{ id: 'feedback-1' }]),
        then: (resolve, reject) => Promise.resolve(undefined).then(resolve, reject),
      };
      return chain;
    },
    // The `SELECT id FROM users ... FOR UPDATE` lock.
    execute: () => Promise.resolve([{ id: 'user-1' }]),
    select: (): SelectChain => {
      const chain: SelectChain = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(spy.priorRewardRows),
      };
      return chain;
    },
    update: (): UpdateChain => {
      const chain: UpdateChain = {
        set: (patch: Values) => {
          spy.updates.push({ set: patch });
          return chain;
        },
        where: () => chain,
        returning: () => Promise.resolve([{ walletBalancePaise: 55000 }]),
      };
      return chain;
    },
  };
}

type FakeTx = ReturnType<typeof makeTx>;

function runWith(priorRewardRows: unknown[]): TxSpy {
  const spy: TxSpy = { priorRewardRows, inserts: [], updates: [] };
  state.transaction.mockImplementation((fn: (tx: FakeTx) => Promise<unknown>) => fn(makeTx(spy)));
  return spy;
}

beforeEach(() => {
  state.transaction.mockReset();
});

describe('recordFeedback', () => {
  it("credits ₹50 on a user's first ever rating", async () => {
    const spy = runWith([]);

    const result = await recordFeedback({ userId: 'user-1', rating: 5, comment: 'Loved it' });

    expect(result).toEqual({ id: 'feedback-1', rewarded: true });
    const ledger = spy.inserts.find((i) => i.table === walletTransactions);
    expect(ledger?.values).toMatchObject({
      userId: 'user-1',
      delta: 5000,
      reason: 'feedback_reward',
      balanceAfter: 55000,
    });
    expect(spy.updates).toHaveLength(1);
  });

  it('stores a second rating but does NOT credit again', async () => {
    const spy = runWith([{ id: 'existing-reward-row' }]);

    const result = await recordFeedback({ userId: 'user-1', rating: 2, comment: 'Meh' });

    expect(result).toEqual({ id: 'feedback-1', rewarded: false });
    expect(spy.inserts.filter((i) => i.table === walletTransactions)).toHaveLength(0);
    expect(spy.updates).toHaveLength(0);
    // The rating itself is still recorded — only the payout is one-time.
    expect(spy.inserts.filter((i) => i.table === userFeedback)).toHaveLength(1);
  });

  it('encrypts the comment before INSERT and leaves an omitted comment null', async () => {
    const plaintext = 'The Navamsa chart reading was spot on.';
    let spy = runWith([]);
    await recordFeedback({ userId: 'user-1', rating: 4, comment: plaintext });
    const withComment = spy.inserts.find((i) => i.table === userFeedback);
    expect(withComment?.values.comment).not.toBe(plaintext);
    expect(withComment?.values.comment).toMatch(/^enc:v1:/);

    spy = runWith([]);
    await recordFeedback({ userId: 'user-1', rating: 4 });
    expect(spy.inserts.find((i) => i.table === userFeedback)?.values.comment).toBeNull();
  });
});
