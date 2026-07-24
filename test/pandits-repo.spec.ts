import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: { insert: state.insert, select: state.select, update: state.update },
    sqlClient,
  };
});

import {
  createPandit,
  findPanditById,
  updatePanditEmail,
} from '../src/modules/pooja-bookings/pandits.repo.js';

const dialect = new PgDialect();
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

beforeEach(() => {
  state.insert.mockReset();
  state.select.mockReset();
  state.update.mockReset();
});

describe('createPandit', () => {
  it('inserts the given values and returns the created row', async () => {
    const insertChain: { values: unknown; returning: () => Promise<unknown[]> } = {
      values: undefined,
      returning: vi.fn(() =>
        Promise.resolve([
          {
            id: 'pandit-1',
            displayName: 'Ravi Shastri',
            phone: '+919999999999',
            city: 'Pune',
            languages: ['hi', 'mr'],
            verified: true,
            active: true,
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-01'),
          },
        ]),
      ),
    };
    insertChain.values = vi.fn(() => insertChain);
    state.insert.mockReturnValue(insertChain);

    const row = await createPandit({
      displayName: 'Ravi Shastri',
      phone: '+919999999999',
      city: 'Pune',
      languages: ['hi', 'mr'],
      verified: true,
      active: true,
    });

    expect(insertChain.values).toHaveBeenCalledWith({
      displayName: 'Ravi Shastri',
      phone: '+919999999999',
      city: 'Pune',
      languages: ['hi', 'mr'],
      verified: true,
      active: true,
    });
    expect(row).toMatchObject({ id: 'pandit-1', displayName: 'Ravi Shastri' });
  });

  it('throws when the insert returns no row', async () => {
    const insertChain: { values: unknown; returning: () => Promise<unknown[]> } = {
      values: undefined,
      returning: vi.fn(() => Promise.resolve([])),
    };
    insertChain.values = vi.fn(() => insertChain);
    state.insert.mockReturnValue(insertChain);

    await expect(
      createPandit({
        displayName: 'Ravi Shastri',
        phone: null,
        city: 'Pune',
        languages: [],
        verified: true,
        active: true,
      }),
    ).rejects.toThrow('Failed to insert pandit');
  });
});

describe('findPanditById', () => {
  it('filters on id', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findPanditById('pandit-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"pandits"."id" = $1');
    expect(query.params).toEqual(['pandit-1']);
  });
});

function makeUpdateChain(result: unknown[]) {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain = {
    set: vi.fn((patch: unknown) => {
      calls.set = patch;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

describe('updatePanditEmail', () => {
  it("scopes the UPDATE's WHERE to this pandit id and sets the email", async () => {
    const { chain, calls } = makeUpdateChain([]);
    state.update.mockReturnValue(chain);

    await updatePanditEmail('pandit-1', 'ravi.shastri@example.com');

    expect(calls.set).toMatchObject({ email: 'ravi.shastri@example.com' });
    const query = compile(calls.where);
    expect(query.sql).toBe('"pandits"."id" = $1');
    expect(query.params).toEqual(['pandit-1']);
  });

  it('returns the updated row on success', async () => {
    const { chain } = makeUpdateChain([{ id: 'pandit-1', email: 'ravi.shastri@example.com' }]);
    state.update.mockReturnValue(chain);

    const result = await updatePanditEmail('pandit-1', 'ravi.shastri@example.com');

    expect(result).toMatchObject({ id: 'pandit-1', email: 'ravi.shastri@example.com' });
  });
});
