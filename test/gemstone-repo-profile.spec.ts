import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Multi-profile coverage for gemstone.repo.ts: every claim/read/write must
// target the correct one of the two PARTIAL unique indexes
// (gemstone_recommendations_user_primary_unique WHERE birth_profile_id IS
// NULL, gemstone_recommendations_user_profile_unique WHERE birth_profile_id
// IS NOT NULL) depending on whether birthProfileId is null or set. Same shape
// as test/house-insight-repo-profile.spec.ts, just keyed by (userId) /
// (userId, birthProfileId) instead of (userId, house) / (userId, house,
// birthProfileId).

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { insert: state.insert, select: state.select, delete: state.delete }, sqlClient };
});

import { gemstoneRecommendations } from '../src/db/schema.js';
import {
  claimGemstoneGeneration,
  findGemstoneRecommendation,
  deleteGemstoneForUser,
} from '../src/modules/gemstone/gemstone.repo.js';

const dialect = new PgDialect();
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

interface FakeDeleteChain {
  where: (cond: unknown) => Promise<unknown>;
}

function makeDeleteChain() {
  const calls: { where?: unknown } = {};
  const chain: FakeDeleteChain = {
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return Promise.resolve(undefined);
    }),
  };
  return { chain, calls };
}

describe('claimGemstoneGeneration — partial-index targeting', () => {
  beforeEach(() => {
    state.insert.mockReset();
  });

  it('targets the primary-profile partial index (userId, birth_profile_id IS NULL) when birthProfileId is null', async () => {
    const { chain, calls } = makeInsertChain([
      { id: 'g1', status: 'generating', startedAt: new Date() },
    ]);
    state.insert.mockReturnValue(chain);

    await claimGemstoneGeneration('user-1', null);

    expect(state.insert).toHaveBeenCalledWith(gemstoneRecommendations);
    expect(calls.values).toMatchObject({
      userId: 'user-1',
      birthProfileId: null,
      status: 'generating',
    });
    expect(calls.onConflictDoUpdate.target).toBe(gemstoneRecommendations.userId);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe('"gemstone_recommendations"."birth_profile_id" is null');
  });

  it('targets the additional-profile partial index ((userId, birthProfileId), birth_profile_id IS NOT NULL) when birthProfileId is set', async () => {
    const { chain, calls } = makeInsertChain([
      { id: 'g2', status: 'generating', startedAt: new Date() },
    ]);
    state.insert.mockReturnValue(chain);

    await claimGemstoneGeneration('user-1', 'profile-a');

    expect(calls.values).toMatchObject({
      userId: 'user-1',
      birthProfileId: 'profile-a',
      status: 'generating',
    });
    expect(calls.onConflictDoUpdate.target).toEqual([
      gemstoneRecommendations.userId,
      gemstoneRecommendations.birthProfileId,
    ]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe('"gemstone_recommendations"."birth_profile_id" is not null');
  });
});

describe('findGemstoneRecommendation — profile-scoped single-row finder', () => {
  beforeEach(() => {
    state.select.mockReset();
  });

  it('filters on birth_profile_id IS NULL for the primary profile', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findGemstoneRecommendation('user-1', null);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("gemstone_recommendations"."user_id" = $1 and "gemstone_recommendations"."birth_profile_id" is null)',
    );
    expect(query.params).toEqual(['user-1']);
  });

  it('filters on birth_profile_id = <id> for an additional profile — never accidentally returns a sibling profile’s row', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findGemstoneRecommendation('user-1', 'profile-a');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("gemstone_recommendations"."user_id" = $1 and "gemstone_recommendations"."birth_profile_id" = $2)',
    );
    expect(query.params).toEqual(['user-1', 'profile-a']);
  });
});

describe('deleteGemstoneForUser — scoped to a single profile', () => {
  beforeEach(() => {
    state.delete.mockReset();
  });

  it('only deletes the primary profile’s row when birthProfileId is null, leaving additional-profile rows untouched', async () => {
    const { chain, calls } = makeDeleteChain();
    state.delete.mockReturnValue(chain);

    await deleteGemstoneForUser('user-1', null);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("gemstone_recommendations"."user_id" = $1 and "gemstone_recommendations"."birth_profile_id" is null)',
    );
    expect(query.params).toEqual(['user-1']);
  });

  it('only deletes one additional profile’s row, leaving the primary and sibling profiles’ rows untouched', async () => {
    const { chain, calls } = makeDeleteChain();
    state.delete.mockReturnValue(chain);

    await deleteGemstoneForUser('user-1', 'profile-a');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("gemstone_recommendations"."user_id" = $1 and "gemstone_recommendations"."birth_profile_id" = $2)',
    );
    expect(query.params).toEqual(['user-1', 'profile-a']);
  });
});
