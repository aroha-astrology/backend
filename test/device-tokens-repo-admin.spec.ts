import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select }, sqlClient };
});

import { countActiveDeviceTokensByPlatform } from '../src/modules/device-tokens/device-tokens.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  groupBy: (col: unknown) => Promise<unknown[]>;
}
function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown; groupBy?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    groupBy: vi.fn((col: unknown) => {
      calls.groupBy = col;
      return Promise.resolve(result);
    }),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.select.mockReset();
});

describe('countActiveDeviceTokensByPlatform', () => {
  it('groups active (unrevoked) tokens by platform', async () => {
    const { chain, calls } = makeSelectChain([
      { platform: 'ios', count: 3 },
      { platform: 'android', count: 5 },
    ]);
    state.select.mockReturnValue(chain);

    const rows = await countActiveDeviceTokensByPlatform();

    expect(rows).toEqual([
      { platform: 'ios', count: 3 },
      { platform: 'android', count: 5 },
    ]);
    const query = compile(calls.where);
    expect(query.sql).toBe('"device_push_tokens"."revoked_at" is null');
  });
});
