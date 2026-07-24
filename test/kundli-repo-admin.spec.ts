import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select, update: state.update }, sqlClient };
});

import { listKundlisByUserId, updateKundliDoshaData } from '../src/modules/kundli/kundli.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => Promise<unknown[]>;
}
function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return Promise.resolve(result);
    }),
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

beforeEach(() => {
  state.select.mockReset();
  state.update.mockReset();
});

describe('listKundlisByUserId', () => {
  it('selects every kundli row for the user, across all profiles', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'k1' }, { id: 'k2' }]);
    state.select.mockReturnValue(chain);

    const rows = await listKundlisByUserId('user-1');

    expect(rows).toEqual([{ id: 'k1' }, { id: 'k2' }]);
    const query = compile(calls.where);
    expect(query.sql).toBe('"kundlis"."user_id" = $1');
    expect(query.params).toEqual(['user-1']);
  });
});

describe('updateKundliDoshaData', () => {
  it('updates doshaData and updatedAt for the exact kundli row by id', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await updateKundliDoshaData('kundli-1', { mangal: { present: false } });

    expect(calls.set).toMatchObject({ doshaData: { mangal: { present: false } } });
    expect((calls.set as { updatedAt: Date }).updatedAt).toBeInstanceOf(Date);
    const query = compile(calls.where);
    expect(query.sql).toBe('"kundlis"."id" = $1');
    expect(query.params).toEqual(['kundli-1']);
  });
});
