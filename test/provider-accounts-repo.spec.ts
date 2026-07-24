import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: { select: state.select, insert: state.insert },
    sqlClient,
  };
});

import {
  createProviderAccount,
  findProviderAccountByFirebaseUid,
  findProviderAccountByKindAndRefId,
} from '../src/modules/providers/provider-accounts.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
});

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

function makeInsertChain(result: unknown[]) {
  const calls: { values?: unknown } = {};
  const chain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

describe('findProviderAccountByFirebaseUid', () => {
  it('filters on firebaseUid', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'provider-1', firebaseUid: 'fb-uid-1' }]);
    state.select.mockReturnValue(chain);

    const row = await findProviderAccountByFirebaseUid('fb-uid-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"provider_accounts"."firebase_uid" = $1');
    expect(query.params).toEqual(['fb-uid-1']);
    expect(row).toEqual({ id: 'provider-1', firebaseUid: 'fb-uid-1' });
  });

  it('returns undefined when no row matches', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const row = await findProviderAccountByFirebaseUid('missing-uid');

    expect(row).toBeUndefined();
  });
});

describe('findProviderAccountByKindAndRefId', () => {
  it('filters on (kind, refId)', async () => {
    const { chain, calls } = makeSelectChain([
      { id: 'provider-1', kind: 'astrologer', refId: 'astro-1' },
    ]);
    state.select.mockReturnValue(chain);

    const row = await findProviderAccountByKindAndRefId('astrologer', 'astro-1');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("provider_accounts"."kind" = $1 and "provider_accounts"."ref_id" = $2)',
    );
    expect(query.params).toEqual(['astrologer', 'astro-1']);
    expect(row).toEqual({ id: 'provider-1', kind: 'astrologer', refId: 'astro-1' });
  });
});

describe('createProviderAccount', () => {
  it('inserts and returns the new row', async () => {
    const { chain, calls } = makeInsertChain([
      {
        id: 'provider-1',
        kind: 'astrologer',
        refId: 'astro-1',
        firebaseUid: 'fb-uid-1',
        displayName: 'Guru Ji',
      },
    ]);
    state.insert.mockReturnValue(chain);

    const row = await createProviderAccount({
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-uid-1',
      displayName: 'Guru Ji',
    });

    expect(calls.values).toMatchObject({
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-uid-1',
    });
    expect(row).toMatchObject({ id: 'provider-1', displayName: 'Guru Ji' });
  });
});
