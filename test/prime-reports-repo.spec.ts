import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: {
      insert: state.insert,
      select: state.select,
      update: state.update,
      transaction: state.transaction,
    },
    sqlClient,
  };
});

import {
  findPrimeReport,
  unlockPrimeReport,
} from '../src/modules/prime-reports/prime-reports.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  limit: (n: number) => Promise<unknown[]>;
}

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.insert.mockReset();
  state.select.mockReset();
  state.update.mockReset();
  state.transaction.mockReset();
});

describe('findPrimeReport — profile-scoped single-row finder', () => {
  it('filters on birth_profile_id IS NULL for the primary profile', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findPrimeReport('user-1', null, 'numerology', 'lifetime');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("prime_reports"."user_id" = $1 and "prime_reports"."birth_profile_id" is null and "prime_reports"."report_type" = $2 and "prime_reports"."period" = $3)',
    );
    expect(query.params).toEqual(['user-1', 'numerology', 'lifetime']);
  });

  it('filters on birth_profile_id = <id> for an additional profile', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findPrimeReport('user-1', 'profile-a', 'numerology', 'lifetime');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("prime_reports"."user_id" = $1 and "prime_reports"."birth_profile_id" = $2 and "prime_reports"."report_type" = $3 and "prime_reports"."period" = $4)',
    );
    expect(query.params).toEqual(['user-1', 'profile-a', 'numerology', 'lifetime']);
  });
});

describe('unlockPrimeReport — atomic debit + row creation', () => {
  function makeTx(opts: {
    existing: unknown[];
    walletUpdateResult: unknown[];
    insertResult: unknown[];
  }) {
    const existingSelect = makeSelectChain(opts.existing);
    const walletUpdateChain: { set: unknown; where: unknown; returning: () => Promise<unknown[]> } =
      {
        set: undefined,
        where: undefined,
        returning: vi.fn(() => Promise.resolve(opts.walletUpdateResult)),
      };
    walletUpdateChain.set = vi.fn(() => walletUpdateChain);
    walletUpdateChain.where = vi.fn(() => walletUpdateChain);

    const insertLedgerChain = { values: vi.fn(() => Promise.resolve(undefined)) };
    const insertReportChain: { values: unknown; returning: () => Promise<unknown[]> } = {
      values: undefined,
      returning: vi.fn(() => Promise.resolve(opts.insertResult)),
    };
    insertReportChain.values = vi.fn(() => insertReportChain);

    let insertCallCount = 0;
    const tx = {
      select: vi.fn(() => existingSelect.chain),
      update: vi.fn(() => walletUpdateChain),
      insert: vi.fn((_table: unknown) => {
        insertCallCount++;
        // First insert() call in the function body is the wallet ledger row,
        // second is the prime_reports row — matches unlockPrimeReport's call order.
        return insertCallCount === 1 ? insertLedgerChain : insertReportChain;
      }),
    };
    return tx;
  }

  it('returns undefined without charging when a report row already exists', async () => {
    const tx = makeTx({
      existing: [{ id: 'existing-row' }],
      walletUpdateResult: [],
      insertResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await unlockPrimeReport('user-1', null, 'numerology', 'lifetime', 2500);

    expect(result).toBeUndefined();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('returns undefined without inserting a report row when the wallet balance is insufficient', async () => {
    const tx = makeTx({ existing: [], walletUpdateResult: [], insertResult: [] });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await unlockPrimeReport('user-1', null, 'numerology', 'lifetime', 2500);

    expect(result).toBeUndefined();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('debits the wallet, writes a ledger row, and returns the newly created generating row', async () => {
    const tx = makeTx({
      existing: [],
      walletUpdateResult: [{ walletBalancePaise: 7500 }],
      insertResult: [{ id: 'new-row', status: 'generating', startedAt: new Date('2026-01-01') }],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await unlockPrimeReport('user-1', null, 'numerology', 'lifetime', 2500);

    expect(result).toMatchObject({ id: 'new-row', status: 'generating' });
  });
});
