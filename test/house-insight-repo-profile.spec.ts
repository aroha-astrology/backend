import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Multi-profile coverage for house-insight.repo.ts: every claim/read must
// target the correct one of the two PARTIAL unique indexes
// (house_insights_user_house_primary_unique WHERE birth_profile_id IS NULL,
// house_insights_user_house_profile_unique WHERE birth_profile_id IS NOT
// NULL) depending on whether birthProfileId is null or set.

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

import { houseInsights } from '../src/db/schema.js';
import {
  claimHouseInsightGeneration,
  findHouseInsight,
  deleteHouseInsightsForUser,
} from '../src/modules/kundli/house-insight.repo.js';

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

describe('claimHouseInsightGeneration — partial-index targeting', () => {
  beforeEach(() => {
    state.insert.mockReset();
  });

  it('targets the primary-profile partial index ((userId, house), birth_profile_id IS NULL) when birthProfileId is null', async () => {
    const { chain, calls } = makeInsertChain([
      { id: 'hi1', status: 'generating', startedAt: new Date() },
    ]);
    state.insert.mockReturnValue(chain);

    await claimHouseInsightGeneration('user-1', null, 3);

    expect(state.insert).toHaveBeenCalledWith(houseInsights);
    expect(calls.values).toMatchObject({
      userId: 'user-1',
      birthProfileId: null,
      house: 3,
      status: 'generating',
    });
    expect(calls.onConflictDoUpdate.target).toEqual([houseInsights.userId, houseInsights.house]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe('"house_insights"."birth_profile_id" is null');
  });

  it('targets the additional-profile partial index ((userId, house, birthProfileId), birth_profile_id IS NOT NULL) when birthProfileId is set', async () => {
    const { chain, calls } = makeInsertChain([
      { id: 'hi2', status: 'generating', startedAt: new Date() },
    ]);
    state.insert.mockReturnValue(chain);

    await claimHouseInsightGeneration('user-1', 'profile-a', 3);

    expect(calls.values).toMatchObject({
      userId: 'user-1',
      birthProfileId: 'profile-a',
      house: 3,
      status: 'generating',
    });
    expect(calls.onConflictDoUpdate.target).toEqual([
      houseInsights.userId,
      houseInsights.house,
      houseInsights.birthProfileId,
    ]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe('"house_insights"."birth_profile_id" is not null');
  });
});

describe('findHouseInsight — profile-scoped single-row finder', () => {
  beforeEach(() => {
    state.select.mockReset();
  });

  it('filters on birth_profile_id IS NULL for the primary profile', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findHouseInsight('user-1', null, 3);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("house_insights"."user_id" = $1 and "house_insights"."birth_profile_id" is null and "house_insights"."house" = $2)',
    );
    expect(query.params).toEqual(['user-1', 3]);
  });

  it('filters on birth_profile_id = <id> for an additional profile — never accidentally returns a sibling profile’s row', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findHouseInsight('user-1', 'profile-a', 3);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("house_insights"."user_id" = $1 and "house_insights"."birth_profile_id" = $2 and "house_insights"."house" = $3)',
    );
    expect(query.params).toEqual(['user-1', 'profile-a', 3]);
  });
});

describe('deleteHouseInsightsForUser — scoped to a single profile', () => {
  beforeEach(() => {
    state.delete.mockReset();
  });

  it('only deletes the primary profile’s rows when birthProfileId is null, leaving additional-profile rows untouched', async () => {
    const { chain, calls } = makeDeleteChain();
    state.delete.mockReturnValue(chain);

    await deleteHouseInsightsForUser('user-1', null);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("house_insights"."user_id" = $1 and "house_insights"."birth_profile_id" is null)',
    );
    expect(query.params).toEqual(['user-1']);
  });

  it('only deletes one additional profile’s rows, leaving the primary and sibling profiles’ rows untouched', async () => {
    const { chain, calls } = makeDeleteChain();
    state.delete.mockReturnValue(chain);

    await deleteHouseInsightsForUser('user-1', 'profile-a');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("house_insights"."user_id" = $1 and "house_insights"."birth_profile_id" = $2)',
    );
    expect(query.params).toEqual(['user-1', 'profile-a']);
  });
});
