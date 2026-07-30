import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same mocking idiom as test/gemstone-repo-profile.spec.ts: stub the drizzle
// `db` chain methods directly rather than hitting a real database.
const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select, insert: state.insert }, sqlClient };
});

import { featureFlags } from '../src/db/schema.js';
import {
  findAllFeatureOverrides,
  upsertFeatureOverride,
} from '../src/modules/features/features.repo.js';

interface FakeSelectChain {
  from: (table: unknown) => Promise<unknown[]>;
}

function makeSelectChain(result: unknown[]) {
  const chain: FakeSelectChain = {
    from: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
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

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
});

describe('findAllFeatureOverrides', () => {
  it('selects every row from feature_flags', async () => {
    const rows = [
      {
        key: 'paid.chat',
        enabled: false,
        pricePaise: 1500,
        updatedAt: new Date(),
        updatedBy: 'admin',
      },
    ];
    const chain = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await findAllFeatureOverrides();

    expect(state.select).toHaveBeenCalled();
    expect(chain.from).toHaveBeenCalledWith(featureFlags);
    expect(result).toEqual(rows);
  });

  it('returns an empty array when there are no overrides', async () => {
    const chain = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const result = await findAllFeatureOverrides();

    expect(result).toEqual([]);
  });
});

describe('upsertFeatureOverride', () => {
  it('inserts with an ON CONFLICT(key) DO UPDATE targeting the key column', async () => {
    const returned = {
      key: 'paid.chat',
      enabled: false,
      pricePaise: 1500,
      originalPricePaise: 2000,
      updatedAt: new Date(),
      updatedBy: 'admin-1',
    };
    const { chain, calls } = makeInsertChain([returned]);
    state.insert.mockReturnValue(chain);

    const result = await upsertFeatureOverride('paid.chat', false, 1500, 2000, 'admin-1');

    expect(state.insert).toHaveBeenCalledWith(featureFlags);
    expect(calls.values).toMatchObject({
      key: 'paid.chat',
      enabled: false,
      pricePaise: 1500,
      originalPricePaise: 2000,
      updatedBy: 'admin-1',
    });
    expect(calls.onConflictDoUpdate.target).toBe(featureFlags.key);
    expect(calls.onConflictDoUpdate.set).toMatchObject({
      enabled: false,
      pricePaise: 1500,
      originalPricePaise: 2000,
      updatedBy: 'admin-1',
    });
    expect(result).toEqual(returned);
  });

  it('passes a null pricePaise through untouched (no price override for a non-priced feature)', async () => {
    const returned = {
      key: 'nav.home',
      enabled: false,
      pricePaise: null,
      originalPricePaise: null,
      updatedAt: new Date(),
      updatedBy: 'admin-1',
    };
    const { chain, calls } = makeInsertChain([returned]);
    state.insert.mockReturnValue(chain);

    await upsertFeatureOverride('nav.home', false, null, null, 'admin-1');

    expect(calls.values).toMatchObject({
      key: 'nav.home',
      enabled: false,
      pricePaise: null,
      originalPricePaise: null,
    });
  });

  it('passes a null originalPricePaise through untouched even when pricePaise is set (no discount configured)', async () => {
    const returned = {
      key: 'paid.chat',
      enabled: true,
      pricePaise: 2000,
      originalPricePaise: null,
      updatedAt: new Date(),
      updatedBy: 'admin-1',
    };
    const { chain, calls } = makeInsertChain([returned]);
    state.insert.mockReturnValue(chain);

    await upsertFeatureOverride('paid.chat', true, 2000, null, 'admin-1');

    expect(calls.values).toMatchObject({
      key: 'paid.chat',
      pricePaise: 2000,
      originalPricePaise: null,
    });
  });
});
