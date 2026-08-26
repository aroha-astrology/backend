import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// usersActiveBetween/usersCreatedBetween are DateRange-taking generalizations
// of the existing countUsersActiveSince/countNewUsersSince (used by
// admin-alerts.service.ts) — added alongside them, not replacing them, so
// admin-alerts.service.ts's existing callers are untouched.
const state = vi.hoisted(() => ({ select: vi.fn(), execute: vi.fn() }));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select, execute: state.execute }, sqlClient };
});

import {
  usersActiveBetween,
  usersCreatedBetween,
  countUsersActiveSince,
  countNewUsersSince,
} from '../src/modules/users/users.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => Promise<unknown[]>;
}

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return Promise.resolve(result);
    }),
  };
  return { chain, calls };
}

const range = { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-07-08T00:00:00Z') };

beforeEach(() => {
  state.select.mockReset();
  state.execute.mockReset();
});

describe('usersActiveBetween', () => {
  // Counts from a UNION of event tables, deliberately NOT from users.lastActiveAt — that
  // column is overwritten on every request, so a user active yesterday AND today only lands
  // in today's bucket and past windows silently shrink as people come back. See the repo
  // function's own doc comment. These assertions pin that union so a "simplification" back
  // to a single lastActiveAt predicate fails here rather than in a monthly report.
  it('counts non-deleted users active within [from, to) from the event union', async () => {
    state.execute.mockResolvedValue([{ activeCount: '12' }]);

    const result = await usersActiveBetween(range);

    const compiled = compile(state.execute.mock.calls[0]![0]);
    for (const table of ['ai_usage', 'chat_sessions', 'voice_sessions', 'orders', 'reports']) {
      expect(compiled.sql).toContain(table);
    }
    expect(compiled.sql).toMatch(/last_active_at/);
    expect(compiled.sql).toMatch(/deleted_at/);
    expect(compiled.params).toContainEqual(range.from.toISOString());
    expect(compiled.params).toContainEqual(range.to.toISOString());
    expect(result).toBe(12);
  });

  it('defaults to zero with no active users', async () => {
    state.execute.mockResolvedValue([]);
    expect(await usersActiveBetween(range)).toBe(0);
  });
});

describe('usersCreatedBetween', () => {
  it('counts non-deleted users created within [from, to)', async () => {
    const { chain, calls } = makeSelectChain([{ count: 5 }]);
    state.select.mockReturnValue(chain);

    const result = await usersCreatedBetween(range);

    const compiled = compile(calls.where);
    expect(compiled.sql).toMatch(/created_at/);
    expect(compiled.sql).toMatch(/deleted_at/);
    expect(compiled.params).toContainEqual(range.from.toISOString());
    expect(compiled.params).toContainEqual(range.to.toISOString());
    expect(result).toBe(5);
  });
});

describe('backward compatibility', () => {
  it('leaves countUsersActiveSince and countNewUsersSince untouched (admin-alerts.service.ts callers)', async () => {
    const { chain: chain1 } = makeSelectChain([{ count: 3 }]);
    state.select.mockReturnValueOnce(chain1);
    expect(await countUsersActiveSince(new Date('2026-07-01T00:00:00Z'))).toBe(3);

    const { chain: chain2 } = makeSelectChain([{ count: 9 }]);
    state.select.mockReturnValueOnce(chain2);
    expect(await countNewUsersSince(new Date('2026-07-01T00:00:00Z'))).toBe(9);
  });
});
