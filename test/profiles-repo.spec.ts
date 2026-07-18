import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';
import type { BirthProfileRow } from '../src/db/schema.js';

const state = vi.hoisted(() => ({
  delete: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { delete: state.delete }, sqlClient };
});

import { birthProfiles } from '../src/db/schema.js';
import { hardDeleteOwnedBirthProfile } from '../src/modules/birth-profiles/birth-profiles.repo.js';

const dialect = new PgDialect();

function makeBirthProfileRow(overrides: Partial<BirthProfileRow> = {}): BirthProfileRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'profile-1',
    ownerUserId: 'user-1',
    relationship: 'partner',
    displayName: 'Bob',
    gender: 'male',
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

/** Minimal fake of Drizzle's `db.delete(table).where(cond).returning()` chain. */
function makeDeleteChain(returningResult: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain = {
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(returningResult)),
  };
  return { chain, calls };
}

function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

describe('hardDeleteOwnedBirthProfile', () => {
  beforeEach(() => {
    state.delete.mockReset();
  });

  it('issues a real DELETE scoped to id + ownerUserId (no deletedAt filter) and returns the deleted row', async () => {
    const row = makeBirthProfileRow({ id: 'profile-1', ownerUserId: 'user-1' });
    const { chain, calls } = makeDeleteChain([row]);
    state.delete.mockReturnValue(chain);

    const result = await hardDeleteOwnedBirthProfile('profile-1', 'user-1');

    expect(state.delete).toHaveBeenCalledWith(birthProfiles);
    expect(result?.id).toBe('profile-1');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("birth_profiles"."id" = $1 and "birth_profiles"."owner_user_id" = $2)',
    );
    expect(query.params).toEqual(['profile-1', 'user-1']);
    // Unconditional delete — unlike the soft-delete queries, no deletedAt clause.
    expect(query.sql).not.toContain('deleted_at');
  });

  it('returns undefined when no row matches (not found / not owned)', async () => {
    const { chain } = makeDeleteChain([]);
    state.delete.mockReturnValue(chain);

    const result = await hardDeleteOwnedBirthProfile('missing-profile', 'user-1');

    expect(result).toBeUndefined();
  });

  it('scopes strictly by both id and ownerUserId — a matching id under a different owner never matches', async () => {
    const { chain, calls } = makeDeleteChain([]);
    state.delete.mockReturnValue(chain);

    await hardDeleteOwnedBirthProfile('profile-1', 'someone-else');

    const query = compile(calls.where);
    expect(query.params).toEqual(['profile-1', 'someone-else']);
  });
});
