import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select, insert: state.insert }, sqlClient };
});

import { orders, walletTransactions, adminAuditLog } from '../src/db/schema.js';
import {
  sumPaidOrdersBetween,
  revenueTimeSeries,
  spendByFeature,
  spendByReportKey,
  topUpFunnel,
  payingUserCount,
  logAdminAction,
} from '../src/modules/admin/admin.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  groupBy: (expr: unknown) => FakeSelectChain;
  orderBy: (expr: unknown) => FakeSelectChain;
  then: (resolve: (value: unknown) => void) => void;
}

/** Every drizzle query-builder step is itself a thenable, so awaiting the chain at any depth resolves — same idiom needed whether a query has 0, 1, or 3 more chained calls after `.where()`. */
function makeSelectChain(result: unknown[]) {
  const calls: { from?: unknown; where?: unknown; groupBy?: unknown; orderBy?: unknown } = {};
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
      return chain;
    }),
    orderBy: vi.fn((expr: unknown) => {
      calls.orderBy = expr;
      return chain;
    }),
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  return { chain, calls };
}

const range = { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-07-08T00:00:00Z') };

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
});

describe('sumPaidOrdersBetween', () => {
  it('sums finalAmountPaise for paid orders within [from, to)', async () => {
    const { chain, calls } = makeSelectChain([{ total: 15000, count: 3 }]);
    state.select.mockReturnValue(chain);

    const result = await sumPaidOrdersBetween(range);

    expect(calls.from).toBe(orders);
    const compiled = compile(calls.where);
    expect(compiled.sql).toMatch(/status/);
    expect(compiled.sql).toMatch(/paid_at/);
    expect(compiled.params).toContain('paid');
    expect(compiled.params).toContainEqual(range.from.toISOString());
    expect(compiled.params).toContainEqual(range.to.toISOString());
    expect(result).toEqual({ totalPaise: 15000, count: 3 });
  });

  it('defaults to zero when there are no matching orders', async () => {
    const { chain } = makeSelectChain([{ total: null, count: 0 }]);
    state.select.mockReturnValue(chain);

    const result = await sumPaidOrdersBetween(range);

    expect(result).toEqual({ totalPaise: 0, count: 0 });
  });

  it('defaults to zero when the query returns no row at all', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const result = await sumPaidOrdersBetween(range);

    expect(result).toEqual({ totalPaise: 0, count: 0 });
  });
});

describe('revenueTimeSeries', () => {
  it('buckets by the requested granularity and orders ascending', async () => {
    const rows = [
      { bucketStart: '2026-07-01T00:00:00.000Z', totalPaise: 5000, count: 1 },
      { bucketStart: '2026-07-02T00:00:00.000Z', totalPaise: 7000, count: 2 },
    ];
    const { chain, calls } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await revenueTimeSeries(range, 'day');

    expect(calls.from).toBe(orders);
    expect(calls.groupBy).toBeDefined();
    expect(calls.orderBy).toBeDefined();
    const groupSql = compile(calls.groupBy).sql;
    expect(groupSql).toMatch(/date_trunc/);
    expect(groupSql).toMatch(/Asia\/Kolkata/);
    expect(result).toEqual([
      { bucketStart: '2026-07-01T00:00:00.000Z', totalPaise: 5000, count: 1 },
      { bucketStart: '2026-07-02T00:00:00.000Z', totalPaise: 7000, count: 2 },
    ]);
  });

  it('passes the bucket size ("week"/"month") into the date_trunc call', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await revenueTimeSeries(range, 'month');

    const compiled = compile(calls.groupBy);
    expect(compiled.params).toContain('month');
  });
});

describe('spendByFeature', () => {
  it('groups debit reasons by their prefix up to the first colon', async () => {
    const rows = [
      { reasonPrefix: 'report_unlock', totalPaise: 9900, count: 1 },
      { reasonPrefix: 'chat_message', totalPaise: 2000, count: 1 },
    ];
    const { chain, calls } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await spendByFeature(range);

    expect(calls.from).toBe(walletTransactions);
    const whereSql = compile(calls.where).sql;
    expect(whereSql).toMatch(/delta/);
    expect(whereSql).toMatch(/created_at/);
    const groupSql = compile(calls.groupBy).sql;
    expect(groupSql).toMatch(/split_part/);
    expect(result).toEqual(rows);
  });

  it('only includes debits (delta < 0), not credits or refunds', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await spendByFeature(range);

    const compiled = compile(calls.where);
    expect(compiled.sql).toMatch(/delta.*<.*0|<\s*\$/);
  });
});

describe('spendByReportKey', () => {
  it('groups only report_unlock:* debits, by the report key (2nd reason segment)', async () => {
    const rows = [
      { reportKey: 'marriage', totalPaise: 9900, count: 1 },
      { reportKey: 'health_monthly', totalPaise: 2500, count: 1 },
    ];
    const { chain, calls } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await spendByReportKey(range);

    expect(calls.from).toBe(walletTransactions);
    const whereSql = compile(calls.where).sql;
    expect(whereSql).toMatch(/delta/);
    expect(whereSql).toMatch(/reason/);
    expect(whereSql).toMatch(/like/i);
    const compiledWhere = compile(calls.where);
    expect(compiledWhere.params).toContain('report_unlock:%');
    const groupSql = compile(calls.groupBy).sql;
    expect(groupSql).toMatch(/split_part/);
    expect(result).toEqual(rows);
  });
});

describe('topUpFunnel', () => {
  it('groups orders by status within the range', async () => {
    const rows = [
      { status: 'paid', count: 10 },
      { status: 'pending', count: 4 },
      { status: 'failed', count: 1 },
    ];
    const { chain, calls } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await topUpFunnel(range);

    expect(calls.from).toBe(orders);
    const whereSql = compile(calls.where).sql;
    expect(whereSql).toMatch(/created_at/);
    expect(result).toEqual(rows);
  });
});

describe('payingUserCount', () => {
  it('counts distinct users with a paid order in range', async () => {
    const { chain, calls } = makeSelectChain([{ count: 7 }]);
    state.select.mockReturnValue(chain);

    const result = await payingUserCount(range);

    expect(calls.from).toBe(orders);
    const whereSql = compile(calls.where).sql;
    expect(whereSql).toMatch(/status/);
    expect(whereSql).toMatch(/paid_at/);
    expect(result).toBe(7);
  });

  it('defaults to zero with no paying users', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const result = await payingUserCount(range);

    expect(result).toBe(0);
  });
});

describe('logAdminAction', () => {
  it('inserts an admin_audit_log row with the admin phone, route, and params', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    state.insert.mockReturnValue({ values });

    await logAdminAction('+919999111111', 'PUT /v1/admin/features', { key: 'paid.chat' });

    expect(state.insert).toHaveBeenCalledWith(adminAuditLog);
    expect(values).toHaveBeenCalledWith({
      adminPhone: '+919999111111',
      route: 'PUT /v1/admin/features',
      params: { key: 'paid.chat' },
    });
  });

  it('stores null params when none are given', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    state.insert.mockReturnValue({ values });

    await logAdminAction('+919999111111', 'GET /v1/admin/overview', undefined);

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ params: null }),
    );
  });
});
