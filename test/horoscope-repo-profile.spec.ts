import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Multi-profile coverage for horoscope.repo.ts: every claim/read must target
// the correct one of the two PARTIAL unique indexes
// (daily_horoscopes_user_period_key_primary_unique WHERE birth_profile_id IS
// NULL, daily_horoscopes_user_period_key_profile_unique WHERE
// birth_profile_id IS NOT NULL) depending on whether birthProfileId is null
// or set.

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { insert: state.insert, select: state.select }, sqlClient };
});

import { dailyHoroscopes } from '../src/db/schema.js';
import {
  claimHoroscopeGeneration,
  findHoroscope,
} from '../src/modules/horoscope/horoscope.repo.js';

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

describe('claimHoroscopeGeneration — partial-index targeting', () => {
  beforeEach(() => {
    state.insert.mockReset();
  });

  it('targets the primary-profile partial index ((userId, period, periodKey), birth_profile_id IS NULL) when birthProfileId is null', async () => {
    const { chain, calls } = makeInsertChain([
      { id: 'h1', status: 'generating', startedAt: new Date() },
    ]);
    state.insert.mockReturnValue(chain);

    await claimHoroscopeGeneration('user-1', null, 'daily', '2026-07-18', '2026-07-18');

    expect(state.insert).toHaveBeenCalledWith(dailyHoroscopes);
    expect(calls.values).toMatchObject({
      userId: 'user-1',
      birthProfileId: null,
      period: 'daily',
      periodKey: '2026-07-18',
      status: 'generating',
    });
    expect(calls.onConflictDoUpdate.target).toEqual([
      dailyHoroscopes.userId,
      dailyHoroscopes.period,
      dailyHoroscopes.periodKey,
    ]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe('"daily_horoscopes"."birth_profile_id" is null');
  });

  it('targets the additional-profile partial index ((userId, period, periodKey, birthProfileId), birth_profile_id IS NOT NULL) when birthProfileId is set', async () => {
    const { chain, calls } = makeInsertChain([
      { id: 'h2', status: 'generating', startedAt: new Date() },
    ]);
    state.insert.mockReturnValue(chain);

    await claimHoroscopeGeneration('user-1', 'profile-a', 'daily', '2026-07-18', '2026-07-18');

    expect(calls.values).toMatchObject({
      userId: 'user-1',
      birthProfileId: 'profile-a',
      period: 'daily',
      periodKey: '2026-07-18',
      status: 'generating',
    });
    expect(calls.onConflictDoUpdate.target).toEqual([
      dailyHoroscopes.userId,
      dailyHoroscopes.period,
      dailyHoroscopes.periodKey,
      dailyHoroscopes.birthProfileId,
    ]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe('"daily_horoscopes"."birth_profile_id" is not null');
  });
});

describe('findHoroscope — profile-scoped single-row finder', () => {
  beforeEach(() => {
    state.select.mockReset();
  });

  it('filters on birth_profile_id IS NULL for the primary profile', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findHoroscope('user-1', null, 'daily', '2026-07-18');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("daily_horoscopes"."user_id" = $1 and "daily_horoscopes"."birth_profile_id" is null and "daily_horoscopes"."period" = $2 and "daily_horoscopes"."period_key" = $3)',
    );
    expect(query.params).toEqual(['user-1', 'daily', '2026-07-18']);
  });

  it('filters on birth_profile_id = <id> for an additional profile — never accidentally returns a sibling profile’s row', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findHoroscope('user-1', 'profile-a', 'daily', '2026-07-18');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("daily_horoscopes"."user_id" = $1 and "daily_horoscopes"."birth_profile_id" = $2 and "daily_horoscopes"."period" = $3 and "daily_horoscopes"."period_key" = $4)',
    );
    expect(query.params).toEqual(['user-1', 'profile-a', 'daily', '2026-07-18']);
  });
});
