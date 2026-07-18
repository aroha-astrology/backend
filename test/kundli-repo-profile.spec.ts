import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Multi-profile coverage for kundli.repo.ts: every claim/read must target the
// correct one of the two PARTIAL unique indexes (kundlis_user_primary_unique
// WHERE birth_profile_id IS NULL, kundlis_user_profile_unique WHERE
// birth_profile_id IS NOT NULL) depending on whether birthProfileId is null
// or set — see the schema.ts comment above those indexes and the
// claimKundliGeneration docstring for why a bare ON CONFLICT target can't
// resolve against a partial index without repeating its WHERE.

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { insert: state.insert, select: state.select, update: state.update }, sqlClient };
});

import { kundlis } from '../src/db/schema.js';
import {
  claimKundliGeneration,
  findKundliByUserId,
  markKundliReady,
} from '../src/modules/kundli/kundli.repo.js';

const dialect = new PgDialect();
/** Compiles a captured Drizzle SQL fragment to the SQL string + params Postgres would actually receive. */
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeInsertChain {
  values: (v: unknown) => FakeInsertChain;
  onConflictDoUpdate: (config: unknown) => FakeInsertChain;
  returning: () => Promise<unknown[]>;
}

function makeInsertChain(returningResult: unknown[]) {
  const calls: { values?: unknown; onConflictDoUpdate?: any } = {};
  const chain: FakeInsertChain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return chain;
    }),
    onConflictDoUpdate: vi.fn((config: unknown) => {
      calls.onConflictDoUpdate = config;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(returningResult)),
  };
  return { chain, calls };
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

interface FakeUpdateChain {
  set: (patch: unknown) => FakeUpdateChain;
  where: (cond: unknown) => Promise<unknown>;
}

function makeUpdateChain() {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain: FakeUpdateChain = {
    set: vi.fn((patch: unknown) => {
      calls.set = patch;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return Promise.resolve(undefined);
    }),
  };
  return { chain, calls };
}

describe('claimKundliGeneration — partial-index targeting', () => {
  beforeEach(() => {
    state.insert.mockReset();
  });

  it('targets the primary-profile partial index (userId only, birth_profile_id IS NULL) when birthProfileId is null', async () => {
    const { chain, calls } = makeInsertChain([
      { id: 'k1', status: 'generating', startedAt: new Date() },
    ]);
    state.insert.mockReturnValue(chain);

    await claimKundliGeneration('user-1', null, 'hash-1');

    expect(state.insert).toHaveBeenCalledWith(kundlis);
    expect(calls.values).toMatchObject({
      userId: 'user-1',
      birthProfileId: null,
      birthHash: 'hash-1',
      status: 'generating',
    });
    expect(calls.onConflictDoUpdate.target).toBe(kundlis.userId);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe('"kundlis"."birth_profile_id" is null');
  });

  it('targets the additional-profile partial index ((userId, birthProfileId), birth_profile_id IS NOT NULL) when birthProfileId is set', async () => {
    const { chain, calls } = makeInsertChain([
      { id: 'k2', status: 'generating', startedAt: new Date() },
    ]);
    state.insert.mockReturnValue(chain);

    await claimKundliGeneration('user-1', 'profile-a', 'hash-1');

    expect(calls.values).toMatchObject({
      userId: 'user-1',
      birthProfileId: 'profile-a',
      birthHash: 'hash-1',
      status: 'generating',
    });
    expect(calls.onConflictDoUpdate.target).toEqual([kundlis.userId, kundlis.birthProfileId]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe('"kundlis"."birth_profile_id" is not null');
  });
});

describe('findKundliByUserId — profile-scoped single-row finder', () => {
  beforeEach(() => {
    state.select.mockReset();
  });

  it('filters on birth_profile_id IS NULL for the primary profile (never returns an additional profile row)', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findKundliByUserId('user-1', null);

    const query = compile(calls.where);
    expect(query.sql).toBe('("kundlis"."user_id" = $1 and "kundlis"."birth_profile_id" is null)');
    expect(query.params).toEqual(['user-1']);
  });

  it('filters on birth_profile_id = <id> for an additional profile — never accidentally returns a sibling profile’s row', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findKundliByUserId('user-1', 'profile-a');

    const query = compile(calls.where);
    expect(query.sql).toBe('("kundlis"."user_id" = $1 and "kundlis"."birth_profile_id" = $2)');
    expect(query.params).toEqual(['user-1', 'profile-a']);
  });
});

describe('markKundliReady — claim-token fencing preserved per profile', () => {
  beforeEach(() => {
    state.update.mockReset();
  });

  it('fences the primary-profile write on (userId, birth_profile_id IS NULL, status=generating, startedAt=claimedAt)', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);
    const claimedAt = new Date('2026-07-18T00:00:00Z');

    await markKundliReady('user-1', null, claimedAt, {
      ayanamsa: 'lahiri',
      houseSystem: 'W',
      timeKnown: true,
      birthHash: 'hash-1',
      chartData: {},
      dashaData: {},
      yogaData: null,
      doshaData: null,
      ashtakavargaData: null,
    });

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("kundlis"."user_id" = $1 and "kundlis"."birth_profile_id" is null and "kundlis"."status" = $2 and "kundlis"."started_at" = $3)',
    );
    expect(query.params).toEqual(['user-1', 'generating', claimedAt.toISOString()]);
  });

  it('fences an additional profile’s write on (userId, birth_profile_id = <id>, status=generating, startedAt=claimedAt) — never leaks into the primary or a sibling profile’s row', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);
    const claimedAt = new Date('2026-07-18T00:00:00Z');

    await markKundliReady('user-1', 'profile-a', claimedAt, {
      ayanamsa: 'lahiri',
      houseSystem: 'W',
      timeKnown: true,
      birthHash: 'hash-1',
      chartData: {},
      dashaData: {},
      yogaData: null,
      doshaData: null,
      ashtakavargaData: null,
    });

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("kundlis"."user_id" = $1 and "kundlis"."birth_profile_id" = $2 and "kundlis"."status" = $3 and "kundlis"."started_at" = $4)',
    );
    expect(query.params).toEqual(['user-1', 'profile-a', 'generating', claimedAt.toISOString()]);
  });
});
