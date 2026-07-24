import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { insert: state.insert, select: state.select }, sqlClient };
});

import { shagunClickEvents } from '../src/db/schema.js';
import {
  findActiveShagunProductById,
  insertShagunClickEvent,
  listActiveShagunProducts,
} from '../src/modules/shagun/shagun.repo.js';

const dialect = new PgDialect();
/** Compiles a captured Drizzle SQL fragment to the SQL string + params Postgres would actually receive. */
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  orderBy: (...cols: unknown[]) => Promise<unknown[]>;
  limit: (n: number) => Promise<unknown[]>;
}

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown; orderBy?: unknown[] } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn((...cols: unknown[]) => {
      calls.orderBy = cols;
      return Promise.resolve(result);
    }),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

function makeInsertNoReturningChain() {
  const calls: { values?: unknown } = {};
  const chain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return Promise.resolve(undefined);
    }),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.insert.mockReset();
  state.select.mockReset();
});

describe('listActiveShagunProducts', () => {
  it('filters to isActive = true and orders by sortOrder ascending when no category given', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listActiveShagunProducts();

    const query = compile(calls.where);
    expect(query.sql).toBe('"shagun_products"."is_active" = $1');
    expect(query.params).toEqual([true]);
    expect(calls.orderBy).toBeDefined();
  });

  it('filters to isActive = true AND category = <category> when a category is given', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listActiveShagunProducts('gemstone');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("shagun_products"."is_active" = $1 and "shagun_products"."category" = $2)',
    );
    expect(query.params).toEqual([true, 'gemstone']);
  });

  it('returns the rows from the query', async () => {
    const rows = [{ id: 'p1' }, { id: 'p2' }];
    const { chain } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await listActiveShagunProducts();

    expect(result).toBe(rows);
  });
});

describe('findActiveShagunProductById', () => {
  it('filters to id = <id> AND isActive = true', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findActiveShagunProductById('product-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('("shagun_products"."id" = $1 and "shagun_products"."is_active" = $2)');
    expect(query.params).toEqual(['product-1', true]);
  });

  it('returns the found row', async () => {
    const row = { id: 'product-1', affiliateUrl: 'https://example.com/p1' };
    const { chain } = makeSelectChain([row]);
    state.select.mockReturnValue(chain);

    const result = await findActiveShagunProductById('product-1');

    expect(result).toBe(row);
  });

  it('returns undefined when nothing matches', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const result = await findActiveShagunProductById('missing');

    expect(result).toBeUndefined();
  });
});

describe('insertShagunClickEvent', () => {
  it('inserts a click event row with the given productId and userId', async () => {
    const { chain, calls } = makeInsertNoReturningChain();
    state.insert.mockReturnValue(chain);

    await insertShagunClickEvent('product-1', 'user-1');

    expect(state.insert).toHaveBeenCalledWith(shagunClickEvents);
    expect(calls.values).toEqual({ productId: 'product-1', userId: 'user-1' });
  });
});
