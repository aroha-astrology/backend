import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select, insert: state.insert }, sqlClient };
});

import { aiUsage } from '../src/db/schema.js';
import { insertAiUsage, costByAgent } from '../src/modules/admin/ai-usage.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  groupBy: (expr: unknown) => Promise<unknown[]>;
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
      return Promise.resolve(result);
    }),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
});

describe('insertAiUsage', () => {
  it('inserts a row with the given usage fields', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    state.insert.mockReturnValue({ values });

    await insertAiUsage({
      userId: 'user-1',
      agent: 'chat',
      model: 'gemini-3.1-flash-lite',
      tokensIn: 120,
      tokensOut: 340,
      durationMs: 850,
    });

    expect(state.insert).toHaveBeenCalledWith(aiUsage);
    expect(values).toHaveBeenCalledWith({
      userId: 'user-1',
      agent: 'chat',
      model: 'gemini-3.1-flash-lite',
      tokensIn: 120,
      tokensOut: 340,
      durationMs: 850,
    });
  });

  it('accepts a null userId for anonymous/system generations', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    state.insert.mockReturnValue({ values });

    await insertAiUsage({
      userId: null,
      agent: 'horoscope',
      model: 'gemini-3.1-flash-lite',
      tokensIn: 50,
      tokensOut: 100,
      durationMs: 400,
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });
});

describe('costByAgent', () => {
  const range = { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-07-08T00:00:00Z') };

  it('groups token usage by agent within the range', async () => {
    const rows = [
      {
        agent: 'chat',
        tokensIn: 1000,
        tokensOut: 2000,
        calls: 10,
        paidTokensIn: 0,
        paidTokensOut: 0,
        paidCalls: 0,
      },
      {
        agent: 'horoscope',
        tokensIn: 500,
        tokensOut: 800,
        calls: 4,
        paidTokensIn: 100,
        paidTokensOut: 200,
        paidCalls: 1,
      },
    ];
    const { chain, calls } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await costByAgent(range);

    expect(calls.from).toBe(aiUsage);
    const whereSql = compile(calls.where).sql;
    expect(whereSql).toMatch(/created_at/);
    expect(result).toEqual(rows);
  });

  it('does not filter by user unless asked to', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await costByAgent(range);

    expect(compile(calls.where).sql).not.toMatch(/user_id/);
  });

  it('narrows to a single user when one is given', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await costByAgent(range, { userId: 'user-42' });

    const where = compile(calls.where);
    expect(where.sql).toMatch(/user_id/);
    expect(where.params).toContain('user-42');
  });

  it('coerces missing paid columns to 0 rather than NaN', async () => {
    // A row shaped like the pre-tier world. NaN here would silently poison
    // every rupee total on the dashboard instead of failing loudly.
    const { chain } = makeSelectChain([{ agent: 'chat', tokensIn: 1, tokensOut: 2, calls: 1 }]);
    state.select.mockReturnValue(chain);

    const result = await costByAgent(range);

    expect(result[0]).toMatchObject({ paidTokensIn: 0, paidTokensOut: 0, paidCalls: 0 });
  });
});
