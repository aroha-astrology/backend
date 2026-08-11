import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// deleteHoroscopesForProfile is the invalidation hook that replaced the old
// post-kundli pre-generation (2026-08-11): nothing pre-generates horoscopes any
// more, so dropping the cached rows is the only way a birth-data correction
// reaches an already-`ready` row before its period rolls over.
//
// The whole risk of a new DELETE is its WHERE clause. These assert the compiled
// SQL is scoped to exactly one user AND one profile — an over-broad predicate
// here silently wipes other users' horoscopes with no error anywhere.

const state = vi.hoisted(() => ({ delete: vi.fn() }));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { delete: state.delete }, sqlClient };
});

import { deleteHoroscopesForProfile } from '../src/modules/horoscope/horoscope.repo.js';

const dialect = new PgDialect();

/** Runs the delete and returns the compiled WHERE clause + row count. */
async function runDelete(userId: string, birthProfileId: string | null) {
  let captured: unknown;
  const chain = {
    where: vi.fn((cond: unknown) => {
      captured = cond;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve([{ id: 'h1' }, { id: 'h2' }])),
  };
  state.delete.mockReturnValue(chain);

  const count = await deleteHoroscopesForProfile(userId, birthProfileId);
  const compiled = dialect.sqlToQuery(captured as Parameters<typeof dialect.sqlToQuery>[0]);
  return { count, sql: compiled.sql, params: compiled.params };
}

describe('deleteHoroscopesForProfile', () => {
  beforeEach(() => {
    state.delete.mockReset();
  });

  it('scopes the delete to one user and the primary profile (birth_profile_id IS NULL)', async () => {
    const { sql, params } = await runDelete('user-1', null);

    expect(sql).toContain('"user_id"');
    expect(params).toContain('user-1');
    // Primary profile must match the partial-index predicate, not equality
    // against a null (which is never true in SQL and would delete nothing).
    expect(sql).toContain('"birth_profile_id" is null');
  });

  it('scopes the delete to one user and one specific additional profile', async () => {
    const { sql, params } = await runDelete('user-1', 'profile-9');

    expect(sql).toContain('"user_id"');
    expect(sql).toContain('"birth_profile_id"');
    expect(params).toEqual(expect.arrayContaining(['user-1', 'profile-9']));
    // Must NOT fall through to the IS NULL branch — that would clear the
    // user's primary-profile horoscopes instead of this profile's.
    expect(sql).not.toContain('"birth_profile_id" is null');
  });

  it('never issues an unscoped delete', async () => {
    for (const profileId of [null, 'profile-9']) {
      const { sql } = await runDelete('user-1', profileId);
      // Both predicates always present and ANDed. `sql` here is the compiled
      // WHERE *condition* only (drizzle's .where() argument), so there is no
      // `where` keyword to assert on — an unscoped delete would show up as an
      // empty/absent condition instead.
      expect(sql.trim()).not.toBe('');
      expect(sql).toContain('"user_id"');
      expect(sql).toContain('"birth_profile_id"');
      expect(sql.toLowerCase()).toContain(' and ');
    }
  });

  it('reports how many rows it invalidated', async () => {
    const { count } = await runDelete('user-1', null);
    expect(count).toBe(2);
  });
});
