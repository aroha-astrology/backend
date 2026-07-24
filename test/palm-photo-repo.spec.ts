import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: { insert: state.insert, select: state.select, delete: state.delete },
    sqlClient,
  };
});

import { palmPhotos } from '../src/db/schema.js';
import {
  deleteExpiredPalmPhotos,
  deletePalmPhoto,
  findPendingPalmPhoto,
  upsertPendingPalmPhoto,
} from '../src/modules/palm/palm-photo.repo.js';

const dialect = new PgDialect();
/** Compiles a captured Drizzle SQL fragment to the SQL string + params Postgres would actually receive. */
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
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

interface FakeInsertChain {
  values: (v: unknown) => FakeInsertChain;
  returning: () => Promise<unknown[]>;
}

function makeInsertChain(returningResult: unknown[], onValues?: (v: unknown) => void) {
  const calls: { values?: unknown } = {};
  const chain: FakeInsertChain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      onValues?.(v);
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(returningResult)),
  };
  return { chain, calls };
}

/**
 * Minimal fake of Drizzle's `db.delete(table).where(cond)` chain. Some
 * callers (upsertPendingPalmPhoto, deletePalmPhoto) await this directly with
 * no `.returning()`; others (deleteExpiredPalmPhotos) chain `.returning()` —
 * `where()` returning the same plain `chain` object supports both, since
 * `await`ing a non-thenable object just resolves to that object.
 */
function makeDeleteChain(returningResult: unknown[], onWhere?: (cond: unknown) => void) {
  const calls: { where?: unknown } = {};
  const chain = {
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      onWhere?.(cond);
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(returningResult)),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.insert.mockReset();
  state.select.mockReset();
  state.delete.mockReset();
});

describe('upsertPendingPalmPhoto — replace-then-insert', () => {
  it('deletes any existing pending photo scoped to (userId, birth_profile_id IS NULL) before inserting, for the primary profile', async () => {
    const order: string[] = [];
    const { chain: deleteChain, calls: deleteCalls } = makeDeleteChain([], () =>
      order.push('delete'),
    );
    const { chain: insertChain, calls: insertCalls } = makeInsertChain(
      [{ id: 'photo-1', userId: 'user-1', birthProfileId: null }],
      () => order.push('insert'),
    );
    state.delete.mockReturnValue(deleteChain);
    state.insert.mockReturnValue(insertChain);

    const before = Date.now();
    const row = await upsertPendingPalmPhoto('user-1', null, 'base64data', 'image/jpeg');
    const after = Date.now();

    expect(state.delete).toHaveBeenCalledWith(palmPhotos);
    const deleteQuery = compile(deleteCalls.where);
    expect(deleteQuery.sql).toBe(
      '("palm_photos"."user_id" = $1 and "palm_photos"."birth_profile_id" is null)',
    );
    expect(deleteQuery.params).toEqual(['user-1']);

    // The DELETE must be issued (and awaited) before the INSERT.
    expect(order).toEqual(['delete', 'insert']);

    expect(state.insert).toHaveBeenCalledWith(palmPhotos);
    expect(insertCalls.values).toMatchObject({
      userId: 'user-1',
      birthProfileId: null,
      imageBase64: 'base64data',
      mimeType: 'image/jpeg',
    });
    const expiresAt = (insertCalls.values as { expiresAt: Date }).expiresAt;
    expect(expiresAt).toBeInstanceOf(Date);
    const expiresMs = expiresAt.getTime();
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + fortyEightHoursMs - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + fortyEightHoursMs + 1000);

    expect(row).toMatchObject({ id: 'photo-1' });
  });

  it('deletes scoped to (userId, birth_profile_id = <id>) before inserting, for an additional profile', async () => {
    const order: string[] = [];
    const { chain: deleteChain, calls: deleteCalls } = makeDeleteChain([], () =>
      order.push('delete'),
    );
    const { chain: insertChain, calls: insertCalls } = makeInsertChain(
      [{ id: 'photo-2', userId: 'user-1', birthProfileId: 'profile-a' }],
      () => order.push('insert'),
    );
    state.delete.mockReturnValue(deleteChain);
    state.insert.mockReturnValue(insertChain);

    await upsertPendingPalmPhoto('user-1', 'profile-a', 'base64data', 'image/png');

    const deleteQuery = compile(deleteCalls.where);
    expect(deleteQuery.sql).toBe(
      '("palm_photos"."user_id" = $1 and "palm_photos"."birth_profile_id" = $2)',
    );
    expect(deleteQuery.params).toEqual(['user-1', 'profile-a']);
    expect(order).toEqual(['delete', 'insert']);

    expect(insertCalls.values).toMatchObject({
      userId: 'user-1',
      birthProfileId: 'profile-a',
      imageBase64: 'base64data',
      mimeType: 'image/png',
    });
  });
});

describe('findPendingPalmPhoto — not-expired, profile-scoped finder', () => {
  it('filters on birth_profile_id IS NULL + expires_at > now for the primary profile', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findPendingPalmPhoto('user-1', null);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("palm_photos"."user_id" = $1 and "palm_photos"."birth_profile_id" is null and "palm_photos"."expires_at" > $2)',
    );
    expect(query.params[0]).toBe('user-1');
    expect(typeof query.params[1]).toBe('string'); // serialized `now` Date
  });

  it('filters on birth_profile_id = <id> + expires_at > now for an additional profile', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findPendingPalmPhoto('user-1', 'profile-a');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("palm_photos"."user_id" = $1 and "palm_photos"."birth_profile_id" = $2 and "palm_photos"."expires_at" > $3)',
    );
    expect(query.params[0]).toBe('user-1');
    expect(query.params[1]).toBe('profile-a');
    expect(typeof query.params[2]).toBe('string');
  });

  it('returns the found row', async () => {
    const row = { id: 'photo-1', userId: 'user-1', birthProfileId: null };
    const { chain } = makeSelectChain([row]);
    state.select.mockReturnValue(chain);

    const result = await findPendingPalmPhoto('user-1', null);

    expect(result).toBe(row);
  });

  it('returns undefined when nothing matches', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const result = await findPendingPalmPhoto('user-1', null);

    expect(result).toBeUndefined();
  });
});

describe('deletePalmPhoto — delete by exact id', () => {
  it('deletes scoped to id only', async () => {
    const { chain, calls } = makeDeleteChain([]);
    state.delete.mockReturnValue(chain);

    await deletePalmPhoto('photo-1');

    expect(state.delete).toHaveBeenCalledWith(palmPhotos);
    const query = compile(calls.where);
    expect(query.sql).toBe('"palm_photos"."id" = $1');
    expect(query.params).toEqual(['photo-1']);
  });
});

describe('deleteExpiredPalmPhotos — bulk cleanup', () => {
  it('deletes rows where expires_at <= now (not <, not >=) and returns the deleted count', async () => {
    const { chain, calls } = makeDeleteChain([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
    state.delete.mockReturnValue(chain);

    const count = await deleteExpiredPalmPhotos();

    expect(state.delete).toHaveBeenCalledWith(palmPhotos);
    const query = compile(calls.where);
    expect(query.sql).toBe('"palm_photos"."expires_at" <= $1');
    expect(typeof query.params[0]).toBe('string');
    // Not `<` (would leave rows expiring exactly now) and not `>=` (would delete unexpired rows).
    expect(query.sql).not.toContain(' < $');
    expect(query.sql).not.toContain(' >= $');
    expect(count).toBe(3);
  });

  it('returns 0 when nothing is expired', async () => {
    const { chain } = makeDeleteChain([]);
    state.delete.mockReturnValue(chain);

    const count = await deleteExpiredPalmPhotos();

    expect(count).toBe(0);
  });
});
