import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select }, sqlClient };
});

import { listHoroscopesByUserId } from '../src/modules/horoscope/horoscope.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  orderBy: (ord: unknown) => Promise<unknown[]>;
}
function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown; orderBy?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn((ord: unknown) => {
      calls.orderBy = ord;
      return Promise.resolve(result);
    }),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.select.mockReset();
});

describe('listHoroscopesByUserId', () => {
  it('selects every horoscope row for the user, newest first', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'h1' }, { id: 'h2' }]);
    state.select.mockReturnValue(chain);

    const rows = await listHoroscopesByUserId('user-1');

    expect(rows).toEqual([{ id: 'h1' }, { id: 'h2' }]);
    const whereQuery = compile(calls.where);
    expect(whereQuery.sql).toBe('"daily_horoscopes"."user_id" = $1');
    expect(whereQuery.params).toEqual(['user-1']);
    const orderQuery = compile(calls.orderBy);
    expect(orderQuery.sql).toBe('"daily_horoscopes"."updated_at" desc');
  });
});
