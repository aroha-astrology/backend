import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Coverage for the new self-heal repo query: listFailedOrStaleHoroscopes must
// return only 'failed' rows or 'generating' rows stuck past
// STALE_GENERATING_MS, keyset-paged by id — same style as
// listRecentlyActiveUsersAfter (see horoscope-active-window.spec.ts), but
// scanning daily_horoscopes rows directly instead of the users table.

const state = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select }, sqlClient };
});

import {
  listFailedOrStaleHoroscopes,
  STALE_GENERATING_MS,
} from '../src/modules/horoscope/horoscope.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  orderBy: (...cols: unknown[]) => FakeSelectChain;
  limit: (n: number) => Promise<unknown[]>;
}

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown; limit?: number } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn(() => chain),
    limit: vi.fn((n: number) => {
      calls.limit = n;
      return Promise.resolve(result);
    }),
  };
  return { chain, calls };
}

describe('listFailedOrStaleHoroscopes', () => {
  beforeEach(() => {
    state.select.mockReset();
  });

  it('filters on status = failed OR (status = generating AND stale updatedAt)', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listFailedOrStaleHoroscopes(null, 200);

    const sql = compile(calls.where).sql;
    expect(sql).toMatch(/failed/);
    expect(sql).toMatch(/generating/);
    expect(sql).toMatch(/updated_at/);
    expect(sql).toMatch(/interval/i);
  });

  it('uses STALE_GENERATING_MS (in seconds) as the staleness threshold, not a hardcoded value', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listFailedOrStaleHoroscopes(null, 200);

    const { params } = compile(calls.where);
    expect(params).toContain(STALE_GENERATING_MS / 1000);
  });

  it('applies keyset pagination on id when afterId is given', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listFailedOrStaleHoroscopes('horoscope-50', 200);

    const query = compile(calls.where);
    expect(query.sql).toMatch(/"id"/);
    expect(query.sql).toMatch(/>/);
    expect(query.params).toContain('horoscope-50');
  });

  it('omits the id-cursor condition entirely when afterId is null', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listFailedOrStaleHoroscopes(null, 50);

    const { params } = compile(calls.where);
    expect(params).not.toContain(null);
  });

  it('orders by id ascending and passes the limit through', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listFailedOrStaleHoroscopes(null, 42);

    expect(chain.orderBy).toHaveBeenCalled();
    expect(calls.limit).toBe(42);
  });

  it('returns the rows resolved by the query', async () => {
    const rows = [{ id: 'h-1', status: 'failed' }];
    const { chain } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await listFailedOrStaleHoroscopes(null, 200);
    expect(result).toEqual(rows);
  });
});
