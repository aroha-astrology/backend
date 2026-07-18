import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Multi-profile coverage for user-facts.repo.ts: getUserFacts/saveUserFacts
// must scope every read/write to (userId, birthProfileId) — `null` means the
// primary/self profile, a real id an additional saved profile — same
// isNull/eq profileFilter() shape as gemstone.repo.ts/chat-sessions.repo.ts.
// Also covers saveUserFacts's dedup + MAX_FACTS_PER_USER cap applying PER
// profile, not globally across a user's saved profiles.

const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: { select: state.select, insert: state.insert, delete: state.delete },
    sqlClient,
  };
});

// Identity pass-through — avoids requiring a real ENCRYPTION_KEY in this
// unit test (same reasoning as test/birth-profiles-repo.spec.ts's comment
// about decryptField's null short-circuit, just applied to non-null values
// too here since `fact` is always populated).
vi.mock('../src/lib/crypto/field-encryption.js', () => ({
  encryptField: (v: string | null | undefined) => v ?? null,
  decryptField: (v: string | null | undefined) => v ?? null,
}));

import { userFacts } from '../src/db/schema.js';
import { getUserFacts, saveUserFacts } from '../src/modules/astro/user-facts.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  orderBy: (ord: unknown) => FakeSelectChain;
  limit: (n: number) => Promise<unknown[]>;
  then: Promise<unknown[]>['then'];
}

/** Supports both terminal shapes used in this repo: `.where().orderBy()` (awaited directly, via the thenable) and `.where().orderBy().limit()`. */
function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown; orderBy?: unknown; limit?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn((ord: unknown) => {
      calls.orderBy = ord;
      return chain;
    }),
    limit: vi.fn((n: number) => {
      calls.limit = n;
      return Promise.resolve(result);
    }),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return { chain, calls };
}

interface FakeInsertChain {
  values: (v: unknown) => Promise<unknown>;
}

function makeInsertChain() {
  const calls: { values?: unknown } = {};
  const chain: FakeInsertChain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return Promise.resolve(undefined);
    }),
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

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
  state.delete.mockReset();
});

describe('getUserFacts — profile-scoped read', () => {
  it('filters on birth_profile_id IS NULL for the primary profile', async () => {
    const { chain, calls } = makeSelectChain([{ fact: 'f1' }, { fact: 'f2' }]);
    state.select.mockReturnValue(chain);

    const facts = await getUserFacts('user-1', null);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("user_facts"."user_id" = $1 and "user_facts"."birth_profile_id" is null)',
    );
    expect(query.params).toEqual(['user-1']);
    expect(facts).toEqual(['f1', 'f2']);
  });

  it('filters on birth_profile_id = <id> for an additional profile — never leaks a sibling profile’s facts', async () => {
    const { chain, calls } = makeSelectChain([{ fact: 'child likes cricket' }]);
    state.select.mockReturnValue(chain);

    const facts = await getUserFacts('user-1', 'profile-a');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("user_facts"."user_id" = $1 and "user_facts"."birth_profile_id" = $2)',
    );
    expect(query.params).toEqual(['user-1', 'profile-a']);
    expect(facts).toEqual(['child likes cricket']);
  });
});

describe('saveUserFacts — profile-scoped write, dedup, and cap', () => {
  it('inserts new facts tagged with the given birthProfileId, deduping only against that same profile’s existing facts', async () => {
    const existingChain = makeSelectChain([{ fact: 'wife loves cooking' }]);
    const insertChain = makeInsertChain();
    state.select.mockReturnValueOnce(existingChain.chain);
    state.insert.mockReturnValueOnce(insertChain.chain);

    await saveUserFacts('user-1', 'profile-a', ['wife loves cooking', 'New Fact']);

    // Dedup is case-insensitive and scoped to this profile's existing set.
    expect(state.insert).toHaveBeenCalledWith(userFacts);
    expect(insertChain.calls.values).toEqual([
      { userId: 'user-1', birthProfileId: 'profile-a', fact: 'New Fact' },
    ]);
    const existingQuery = compile(existingChain.calls.where);
    expect(existingQuery.sql).toBe(
      '("user_facts"."user_id" = $1 and "user_facts"."birth_profile_id" = $2)',
    );
    expect(existingQuery.params).toEqual(['user-1', 'profile-a']);
  });

  it('writes null birthProfileId for the primary profile', async () => {
    const existingChain = makeSelectChain([]);
    const insertChain = makeInsertChain();
    state.select.mockReturnValueOnce(existingChain.chain);
    state.insert.mockReturnValueOnce(insertChain.chain);

    await saveUserFacts('user-1', null, ['born in Delhi']);

    expect(insertChain.calls.values).toEqual([
      { userId: 'user-1', birthProfileId: null, fact: 'born in Delhi' },
    ]);
    const existingQuery = compile(existingChain.calls.where);
    expect(existingQuery.sql).toBe(
      '("user_facts"."user_id" = $1 and "user_facts"."birth_profile_id" is null)',
    );
  });

  it('does not insert anything when every fact already exists for this profile', async () => {
    const existingChain = makeSelectChain([{ fact: 'already known' }]);
    state.select.mockReturnValueOnce(existingChain.chain);

    await saveUserFacts('user-1', 'profile-a', ['Already Known']);

    expect(state.insert).not.toHaveBeenCalled();
  });

  it('trims the oldest rows PER PROFILE once the cap is exceeded, never touching a sibling profile’s facts', async () => {
    // 49 existing facts already on file for profile-a; adding 3 new distinct
    // facts pushes the total to 52 -> 2 must be evicted (cap is 50), and the
    // eviction lookup must be scoped to profile-a too.
    const existingFacts = Array.from({ length: 49 }, (_, i) => ({ fact: `fact-${i}` }));
    const existingChain = makeSelectChain(existingFacts);
    const insertChain = makeInsertChain();
    const oldestRows = [{ id: 'old-1' }, { id: 'old-2' }];
    const oldestChain = makeSelectChain(oldestRows);
    const deleteChain1 = makeDeleteChain();
    const deleteChain2 = makeDeleteChain();

    state.select.mockReturnValueOnce(existingChain.chain).mockReturnValueOnce(oldestChain.chain);
    state.insert.mockReturnValueOnce(insertChain.chain);
    state.delete.mockReturnValueOnce(deleteChain1.chain).mockReturnValueOnce(deleteChain2.chain);

    await saveUserFacts('user-1', 'profile-a', ['new-1', 'new-2', 'new-3']);

    expect(oldestChain.calls.limit).toBe(2); // overflow = 52 - 50
    const oldestQuery = compile(oldestChain.calls.where);
    expect(oldestQuery.sql).toBe(
      '("user_facts"."user_id" = $1 and "user_facts"."birth_profile_id" = $2)',
    );
    expect(oldestQuery.params).toEqual(['user-1', 'profile-a']);
    expect(state.delete).toHaveBeenCalledTimes(2);
  });
});
