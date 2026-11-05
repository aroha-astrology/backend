import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Audit Sprint 5, M16: after a birth-detail edit rebuilds a profile's chart, that profile's bought
// reports must be rebuilt free on next open (their text was written from the old chart while their
// numbers are recomputed from the new one). markReportsStaleForProfile marks them old the way a
// content-version bump does; the existing rebuild-on-open does the rest. The risk of a new UPDATE
// is its WHERE: it must be one user, one profile, ready rows only.

const state = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { update: state.update }, sqlClient };
});

const { markReportsStaleForProfile } = await import('../src/modules/reports/reports.repo.js');

const dialect = new PgDialect();

async function run(userId: string, profileId: string | null) {
  let where: unknown;
  let set: Record<string, unknown> = {};
  const chain = {
    set: vi.fn((v: Record<string, unknown>) => {
      set = v;
      return chain;
    }),
    where: vi.fn((c: unknown) => {
      where = c;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve([{ id: 'r1' }, { id: 'r2' }])),
  };
  state.update.mockReturnValue(chain);
  const count = await markReportsStaleForProfile(userId, profileId);
  const compiled = dialect.sqlToQuery(where as Parameters<typeof dialect.sqlToQuery>[0]);
  const setSql = dialect.sqlToQuery(set.content as Parameters<typeof dialect.sqlToQuery>[0]);
  return { count, sql: compiled.sql, params: compiled.params, set, setSql: setSql.sql };
}

describe('markReportsStaleForProfile', () => {
  beforeEach(() => state.update.mockReset());

  it('scopes to one user and one additional profile, ready reports only', async () => {
    const { sql, params } = await run('user-1', 'profile-9');
    expect(params).toEqual(expect.arrayContaining(['user-1', 'profile-9']));
    expect(sql).toContain('"user_id"');
    expect(sql).toContain('"birth_profile_id"');
    expect(sql).toContain('"status"');
    expect(sql).not.toContain('"birth_profile_id" is null');
  });

  it('for the owner’s own profile matches birth_profile_id IS NULL, never another profile', async () => {
    const { sql, params } = await run('user-1', null);
    expect(sql).toContain('"birth_profile_id" is null');
    expect(params).toContain('user-1');
  });

  it('marks them old (contentVersion 0) and gives the rebuild its tries back', async () => {
    const { set, setSql } = await run('user-1', 'profile-9');
    expect(setSql).toContain('contentVersion');
    expect(set.refreshAttempts).toBe(0);
    expect(set.refreshError).toBeNull();
  });

  it('reports how many reports it marked', async () => {
    expect((await run('user-1', 'profile-9')).count).toBe(2);
  });
});
