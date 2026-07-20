import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Coverage for the cron-batch-run-repo checkpoint layer: a nightly cron batch
// job persists its pagination cursor into cron_batch_runs so a crash mid-run
// can resume instead of restarting from scratch. getOrCreateBatchRun must
// never reset an existing row's progress; resetBatchRun is the explicit
// opt-in for `force: true` callers who want to ignore prior progress.

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { insert: state.insert, select: state.select, update: state.update }, sqlClient };
});

import { cronBatchRuns } from '../src/db/schema.js';
import {
  getOrCreateBatchRun,
  checkpointBatchRun,
  completeBatchRun,
  failBatchRun,
  resetBatchRun,
} from '../src/modules/horoscope/horoscope.repo.js';

const dialect = new PgDialect();
/** Compiles a captured Drizzle SQL fragment to the SQL string + params Postgres would actually receive. */
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeInsertChain {
  values: (v: unknown) => FakeInsertChain;
  onConflictDoNothing: (config: unknown) => FakeInsertChain;
  onConflictDoUpdate: (config: unknown) => FakeInsertChain;
  returning: () => Promise<unknown[]>;
}

function makeInsertChain(returningResult: unknown[]) {
  const calls: {
    values?: unknown;
    onConflictDoNothing?: any;
    onConflictDoUpdate?: any;
  } = {};
  const chain: FakeInsertChain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return chain;
    }),
    onConflictDoNothing: vi.fn((config: unknown) => {
      calls.onConflictDoNothing = config;
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

describe('getOrCreateBatchRun — race-safe upsert-or-fetch', () => {
  beforeEach(() => {
    state.insert.mockReset();
    state.select.mockReset();
  });

  it('creates a new row when none exists for this (jobName, period, forDate)', async () => {
    const { chain: insertChain, calls: insertCalls } = makeInsertChain([]);
    state.insert.mockReturnValue(insertChain);

    const freshRow = {
      id: 'run-1',
      status: 'running',
      lastId: null,
      processed: 0,
      generated: 0,
      skipped: 0,
      failed: 0,
    };
    const { chain: selectChain, calls: selectCalls } = makeSelectChain([freshRow]);
    state.select.mockReturnValue(selectChain);

    const result = await getOrCreateBatchRun('daily-horoscope-batch', 'daily', '2026-07-20');

    expect(state.insert).toHaveBeenCalledWith(cronBatchRuns);
    expect(insertCalls.values).toMatchObject({
      jobName: 'daily-horoscope-batch',
      period: 'daily',
      forDate: '2026-07-20',
    });
    expect(insertCalls.onConflictDoNothing.target).toEqual([
      cronBatchRuns.jobName,
      cronBatchRuns.period,
      cronBatchRuns.forDate,
    ]);

    const query = compile(selectCalls.where);
    expect(query.sql).toBe(
      '("cron_batch_runs"."job_name" = $1 and "cron_batch_runs"."period" = $2 and "cron_batch_runs"."for_date" = $3)',
    );
    expect(query.params).toEqual(['daily-horoscope-batch', 'daily', '2026-07-20']);

    expect(result).toEqual(freshRow);
  });

  it('returns the existing row without resetting it when one already exists (does not call update)', async () => {
    const { chain: insertChain } = makeInsertChain([]);
    state.insert.mockReturnValue(insertChain);

    const existingRow = {
      id: 'run-2',
      status: 'running',
      lastId: 'user-99',
      processed: 50,
      generated: 40,
      skipped: 5,
      failed: 5,
    };
    const { chain: selectChain } = makeSelectChain([existingRow]);
    state.select.mockReturnValue(selectChain);

    const result = await getOrCreateBatchRun('daily-horoscope-batch', 'daily', '2026-07-20');

    expect(result).toEqual(existingRow);
    expect(state.update).not.toHaveBeenCalled();
  });
});

describe('checkpointBatchRun — per-page pagination progress', () => {
  beforeEach(() => {
    state.update.mockReset();
  });

  it('updates lastId/counts and bumps updatedAt', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await checkpointBatchRun('run-1', {
      lastId: 'user-5',
      processed: 10,
      generated: 8,
      skipped: 1,
      failed: 1,
    });

    expect(state.update).toHaveBeenCalledWith(cronBatchRuns);
    expect(calls.set).toMatchObject({
      lastId: 'user-5',
      processed: 10,
      generated: 8,
      skipped: 1,
      failed: 1,
    });
    expect((calls.set as any).updatedAt).toBeInstanceOf(Date);

    const query = compile(calls.where);
    expect(query.sql).toBe('"cron_batch_runs"."id" = $1');
    expect(query.params).toEqual(['run-1']);
  });
});

describe('completeBatchRun — terminal success', () => {
  beforeEach(() => {
    state.update.mockReset();
  });

  it('sets status to completed and stamps completedAt', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await completeBatchRun('run-1', { processed: 100, generated: 80, skipped: 10, failed: 10 });

    expect(calls.set).toMatchObject({
      status: 'completed',
      processed: 100,
      generated: 80,
      skipped: 10,
      failed: 10,
    });
    expect((calls.set as any).completedAt).toBeInstanceOf(Date);
    expect((calls.set as any).updatedAt).toBeInstanceOf(Date);

    const query = compile(calls.where);
    expect(query.sql).toBe('"cron_batch_runs"."id" = $1');
    expect(query.params).toEqual(['run-1']);
  });
});

describe('failBatchRun — terminal failure', () => {
  beforeEach(() => {
    state.update.mockReset();
  });

  it('sets status to failed, records the error, and stamps completedAt', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await failBatchRun('run-1', 'boom: connection reset');

    expect(calls.set).toMatchObject({
      status: 'failed',
      error: 'boom: connection reset',
    });
    expect((calls.set as any).completedAt).toBeInstanceOf(Date);
    expect((calls.set as any).updatedAt).toBeInstanceOf(Date);

    const query = compile(calls.where);
    expect(query.sql).toBe('"cron_batch_runs"."id" = $1');
    expect(query.params).toEqual(['run-1']);
  });

  it('truncates an overly long error message (matches markHoroscopeFailed convention)', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    const longError = 'x'.repeat(2000);
    await failBatchRun('run-1', longError);

    expect((calls.set as any).error).toHaveLength(1000);
  });
});

describe('resetBatchRun — force-reset for a fresh run', () => {
  beforeEach(() => {
    state.insert.mockReset();
  });

  it('zeroes lastId/counts, sets status running, clears completedAt', async () => {
    const resetRow = {
      id: 'run-1',
      status: 'running',
      lastId: null,
      processed: 0,
      generated: 0,
      skipped: 0,
      failed: 0,
    };
    const { chain, calls } = makeInsertChain([resetRow]);
    state.insert.mockReturnValue(chain);

    const result = await resetBatchRun('daily-horoscope-batch', 'daily', '2026-07-20');

    expect(state.insert).toHaveBeenCalledWith(cronBatchRuns);
    expect(calls.values).toMatchObject({
      jobName: 'daily-horoscope-batch',
      period: 'daily',
      forDate: '2026-07-20',
      status: 'running',
    });
    expect(calls.onConflictDoUpdate.target).toEqual([
      cronBatchRuns.jobName,
      cronBatchRuns.period,
      cronBatchRuns.forDate,
    ]);
    expect(calls.onConflictDoUpdate.set).toMatchObject({
      status: 'running',
      lastId: null,
      processed: 0,
      generated: 0,
      skipped: 0,
      failed: 0,
      error: null,
      completedAt: null,
    });
    expect(calls.onConflictDoUpdate.set.startedAt).toBeInstanceOf(Date);
    expect(calls.onConflictDoUpdate.set.updatedAt).toBeInstanceOf(Date);

    expect(result).toEqual(resetRow);
  });
});
