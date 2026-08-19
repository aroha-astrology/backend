import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const state: { lastSql: unknown; rows: unknown[] } = { lastSql: null, rows: [] };

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: {
      execute: (q: unknown) => {
        state.lastSql = q;
        return Promise.resolve(state.rows);
      },
    },
    sqlClient,
  };
});

import { usersActiveBetween } from '../src/modules/users/users.repo.js';

const range = {
  from: new Date('2026-08-17T18:30:00.000Z'), // 2026-08-18 IST midnight
  to: new Date('2026-08-18T18:30:00.000Z'),
};

function compiled() {
  const dialect = new PgDialect();
  const q = dialect.sqlToQuery(state.lastSql as Parameters<typeof dialect.sqlToQuery>[0]);
  return { sql: q.sql.toLowerCase(), params: q.params };
}

describe('usersActiveBetween', () => {
  beforeEach(() => {
    state.lastSql = null;
    state.rows = [{ activeCount: '21' }];
  });

  it('counts from the event union, not just users.last_active_at', async () => {
    await usersActiveBetween(range);
    const { sql } = compiled();
    // The bug this guards: counting only `users.last_active_at` makes a past
    // window shrink as users come back, because that column is overwritten.
    for (const table of ['ai_usage', 'chat_sessions', 'voice_sessions', 'orders', 'reports']) {
      expect(sql).toContain(table);
    }
    expect(sql).toContain('count(distinct');
  });

  it('bounds the window half-open [from, to) on the ISO strings', async () => {
    await usersActiveBetween(range);
    const { sql, params } = compiled();
    expect(sql).toMatch(/>=\s*\$\d+/);
    expect(sql).toMatch(/<\s*\$\d+/);
    expect(sql).not.toContain('<=');
    expect(params).toContain(range.from.toISOString());
    expect(params).toContain(range.to.toISOString());
  });

  it('excludes soft-deleted users', async () => {
    await usersActiveBetween(range);
    expect(compiled().sql).toContain('deleted_at is null');
  });

  it('returns a number, defaulting to 0 on an empty result', async () => {
    expect(await usersActiveBetween(range)).toBe(21);
    state.rows = [];
    expect(await usersActiveBetween(range)).toBe(0);
  });
});
