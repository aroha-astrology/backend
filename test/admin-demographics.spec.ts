import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select }, sqlClient };
});

import { users } from '../src/db/schema.js';
import { userDemographics } from '../src/modules/admin/admin.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  groupBy: (expr: unknown) => FakeSelectChain;
  then: (resolve: (value: unknown) => void) => void;
}

function makeSelectChain(result: unknown[]) {
  const calls: { from?: unknown; where?: unknown; groupBy?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn((table: unknown) => {
      calls.from = table;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    groupBy: vi.fn((expr: unknown) => {
      calls.groupBy = expr;
      return chain;
    }),
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  return { chain, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-31T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('userDemographics', () => {
  it('counts gender/relationship-status via SQL and buckets ages from decrypted DOBs', async () => {
    const genderRows = [
      { label: 'male', count: 12 },
      { label: 'female', count: 10 },
      { label: 'unknown', count: 1 },
    ];
    const statusRows = [
      { label: 'single', count: 15 },
      { label: 'married', count: 8 },
    ];
    // Plaintext (no `enc:v1:` prefix) passes decryptField's legacy short-circuit
    // untouched, so this test needs no real ENCRYPTION_KEY — same trick as
    // birth-profiles-repo.spec.ts.
    const dobRows = [
      { dateOfBirth: '2010-01-01' }, // age 16 -> <18
      { dateOfBirth: '2000-01-01' }, // age 26 -> 25-34
      { dateOfBirth: '1990-01-01' }, // age 36 -> 35-44
      { dateOfBirth: null }, // unknown
      { dateOfBirth: 'not-a-date' }, // unknown
    ];

    const genderChain = makeSelectChain(genderRows);
    const statusChain = makeSelectChain(statusRows);
    const dobChain = makeSelectChain(dobRows);
    state.select
      .mockReturnValueOnce(genderChain.chain)
      .mockReturnValueOnce(statusChain.chain)
      .mockReturnValueOnce(dobChain.chain);

    const result = await userDemographics();

    expect(genderChain.calls.from).toBe(users);
    expect(statusChain.calls.from).toBe(users);
    expect(dobChain.calls.from).toBe(users);
    expect(compile(genderChain.calls.where).sql).toMatch(/deleted_at/);
    expect(compile(statusChain.calls.where).sql).toMatch(/deleted_at/);
    expect(compile(dobChain.calls.where).sql).toMatch(/deleted_at/);

    expect(result.gender).toEqual(genderRows);
    expect(result.relationshipStatus).toEqual(statusRows);
    expect(result.ageBrackets).toEqual([
      { label: '<18', count: 1 },
      { label: '18-24', count: 0 },
      { label: '25-34', count: 1 },
      { label: '35-44', count: 1 },
      { label: '45-54', count: 0 },
      { label: '55-64', count: 0 },
      { label: '65+', count: 0 },
      { label: 'unknown', count: 2 },
    ]);
  });
});
