import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Coverage for the dormant-user exclusion filter on the nightly horoscope
// batch: `listRecentlyActiveUsersAfter` must only pull users active within
// HOROSCOPE_ACTIVE_WINDOW_DAYS (lastActiveAt, falling back to createdAt for
// rows predating the heartbeat/brand-new signups), unless `includeDormant`
// is explicitly requested (admin backfills).

const fakeEnv = vi.hoisted(() => ({ HOROSCOPE_ACTIVE_WINDOW_DAYS: 7 }));
vi.mock('../src/config/env.js', () => ({ env: fakeEnv }));

const state = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select }, sqlClient };
});

vi.mock('../src/modules/users/users.repo.js', () => ({
  decryptUserRow: (row: unknown) => row,
}));

import { listRecentlyActiveUsersAfter } from '../src/modules/horoscope/horoscope.repo.js';

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
  const calls: { where?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

describe('listRecentlyActiveUsersAfter', () => {
  beforeEach(() => {
    state.select.mockReset();
    fakeEnv.HOROSCOPE_ACTIVE_WINDOW_DAYS = 7;
  });

  it('filters on COALESCE(last_active_at, created_at) within the active window', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listRecentlyActiveUsersAfter(null, 200);

    const sql = compile(calls.where).sql;
    expect(sql).toMatch(/coalesce/i);
    expect(sql).toMatch(/last_active_at/);
    expect(sql).toMatch(/created_at/);
    expect(sql).toMatch(/interval/i);
  });

  it('still applies the deletedAt-is-null and keyset-pagination filters', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listRecentlyActiveUsersAfter('user-50', 200);

    const sql = compile(calls.where).sql;
    expect(sql).toMatch(/deleted_at/);
    expect(sql).toMatch(/is null/i);
    expect(sql).toMatch(/id/);
  });

  it('omits the activity filter entirely when includeDormant is true', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listRecentlyActiveUsersAfter(null, 200, { includeDormant: true });

    const sql = compile(calls.where).sql;
    expect(sql).not.toMatch(/coalesce/i);
    expect(sql).not.toMatch(/last_active_at/);
  });

  it('reads the window size from HOROSCOPE_ACTIVE_WINDOW_DAYS, not a hardcoded 7', async () => {
    fakeEnv.HOROSCOPE_ACTIVE_WINDOW_DAYS = 14;
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listRecentlyActiveUsersAfter(null, 200);

    const compiled = compile(calls.where);
    expect(compiled.params).toContain(14);
  });
});
