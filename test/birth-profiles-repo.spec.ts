import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';
import type { BirthProfileRow } from '../src/db/schema.js';

const state = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { transaction: state.transaction }, sqlClient };
});

import { users, birthProfiles } from '../src/db/schema.js';
import { softDeleteOwnedBirthProfile } from '../src/modules/birth-profiles/birth-profiles.repo.js';

const dialect = new PgDialect();

function makeBirthProfileRow(overrides: Partial<BirthProfileRow> = {}): BirthProfileRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'profile-1',
    ownerUserId: 'user-1',
    relationship: 'partner',
    displayName: 'Bob',
    gender: 'male',
    // Left null so `decryptRow`'s `decryptField`/`decryptJson` calls take
    // their null/legacy-plaintext short-circuit and never need a real
    // ENCRYPTION_KEY in this unit test.
    dateOfBirth: null,
    timeOfBirth: null,
    placeOfBirth: null,
    birthTimeAccuracy: null,
    birthTimeSource: null,
    birthLocationAccuracy: null,
    gotra: null,
    addedWithConsent: true,
    notes: null,
    unlockedHouses: [],
    gemstoneUnlockedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Minimal fake of Drizzle's chained `tx.update(table).set(patch).where(cond)`
 * builder. Records the `set`/`where` args (so the test can compile the
 * captured `where` condition to real SQL via `PgDialect` and assert on it)
 * and resolves both `.returning()` and a bare `await` (the `users` update in
 * the repo function never calls `.returning()`) with a preset result.
 */
interface FakeUpdateChain {
  set: (patch: unknown) => FakeUpdateChain;
  where: (cond: unknown) => FakeUpdateChain;
  returning: () => Promise<unknown[]>;
  then: <T>(onFulfilled: (v: unknown[]) => T) => Promise<T>;
}

function makeUpdateChain(returningResult: unknown[]) {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain: FakeUpdateChain = {
    set: vi.fn((patch: unknown) => {
      calls.set = patch;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(returningResult)),
    then: <T>(onFulfilled: (v: unknown[]) => T) =>
      Promise.resolve(returningResult).then(onFulfilled),
  };
  return { chain, calls };
}

/** Compiles a captured Drizzle `where(...)` condition to the SQL string + params Postgres would actually receive. */
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

describe('softDeleteOwnedBirthProfile', () => {
  beforeEach(() => {
    state.transaction.mockReset();
  });

  function setupTransaction(profileRow: BirthProfileRow | undefined) {
    const birthProfilesChain = makeUpdateChain(profileRow ? [profileRow] : []);
    const usersChain = makeUpdateChain([]);
    const updateMock = vi.fn((table: unknown): FakeUpdateChain => {
      if (table === birthProfiles) return birthProfilesChain.chain;
      if (table === users) return usersChain.chain;
      throw new Error(`unexpected table passed to tx.update: ${String(table)}`);
    });
    state.transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb({ update: updateMock }),
    );
    return { birthProfilesChain, usersChain, updateMock };
  }

  it('guards the users.activeProfileId clear to exactly this owner + this profile id (fires when it was active)', async () => {
    const row = makeBirthProfileRow({ id: 'profile-1', ownerUserId: 'user-1' });
    const { usersChain, updateMock } = setupTransaction(row);

    const result = await softDeleteOwnedBirthProfile('profile-1', 'user-1');

    expect(result?.id).toBe('profile-1');
    expect(updateMock).toHaveBeenCalledWith(users);
    expect(usersChain.calls.set).toEqual({ activeProfileId: null });

    // The compiled predicate is `users.id = 'user-1' AND users.active_profile_id
    // = 'profile-1'` — Postgres only applies the UPDATE when the row's actual
    // active_profile_id already equals the profile being deleted, which is
    // exactly the "if and only if it was active" self-healing behavior.
    const query = compile(usersChain.calls.where);
    expect(query.sql).toBe('("users"."id" = $1 and "users"."active_profile_id" = $2)');
    expect(query.params).toEqual(['user-1', 'profile-1']);
  });

  it('builds the identical (id + ownerUserId)-scoped guard for a non-active profile — Postgres will match zero rows since active_profile_id points elsewhere', async () => {
    const row = makeBirthProfileRow({ id: 'profile-2', ownerUserId: 'user-1' });
    const { usersChain } = setupTransaction(row);

    await softDeleteOwnedBirthProfile('profile-2', 'user-1');

    const query = compile(usersChain.calls.where);
    // Compares against the deleted profile's own id ('profile-2'). A user
    // whose real activeProfileId is 'profile-1' (or anything else) fails
    // this predicate in Postgres, so the row — and activeProfileId — is left
    // untouched.
    expect(query.params).toEqual(['user-1', 'profile-2']);
    expect(query.params[1]).not.toBe('profile-1');
  });

  it('is a no-op in SQL terms when activeProfileId was already null (NULL = value is never true)', async () => {
    const row = makeBirthProfileRow({ id: 'profile-3', ownerUserId: 'user-1' });
    const { usersChain } = setupTransaction(row);

    await softDeleteOwnedBirthProfile('profile-3', 'user-1');

    const query = compile(usersChain.calls.where);
    // The guard always compares active_profile_id to a concrete, non-null
    // profile id — in SQL, `NULL = 'profile-3'` evaluates to NULL (not
    // true), so a user whose activeProfileId column is already NULL never
    // matches this WHERE and the UPDATE affects 0 rows either way.
    expect(query.params[1]).toBe('profile-3');
    expect(query.sql).toContain('"users"."active_profile_id" = $2');
  });

  it('does not touch users at all when the profile was not found (already deleted / not owned)', async () => {
    const { updateMock } = setupTransaction(undefined);

    const result = await softDeleteOwnedBirthProfile('missing-profile', 'user-1');

    expect(result).toBeUndefined();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(birthProfiles);
    expect(updateMock).not.toHaveBeenCalledWith(users);
  });

  it('runs both updates inside the same db.transaction call', async () => {
    const row = makeBirthProfileRow();
    setupTransaction(row);

    await softDeleteOwnedBirthProfile('profile-1', 'user-1');

    expect(state.transaction).toHaveBeenCalledTimes(1);
  });
});
