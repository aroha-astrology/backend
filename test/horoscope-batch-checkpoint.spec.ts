import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow, makeProfileContext } from './helpers/mocks.js';

// Covers the two scale fixes to runHoroscopeBatch: bounded concurrency
// (replacing the old serial-with-sleep loop) and a persisted pagination
// checkpoint (replacing the old in-memory-only `lastId`).

const state = vi.hoisted(() => ({
  listRecentlyActiveUsersAfter: vi.fn(),
  claimHoroscopeGeneration: vi.fn(),
  findHoroscope: vi.fn(),
  markHoroscopeReady: vi.fn(),
  markHoroscopeFailed: vi.fn(),
  touchHoroscopeGenerating: vi.fn(),
  getOrCreateBatchRun: vi.fn(),
  checkpointBatchRun: vi.fn(),
  completeBatchRun: vi.fn(),
  failBatchRun: vi.fn(),
  resetBatchRun: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  listRecentlyActiveUsersAfter: state.listRecentlyActiveUsersAfter,
  claimHoroscopeGeneration: state.claimHoroscopeGeneration,
  findHoroscope: state.findHoroscope,
  markHoroscopeReady: state.markHoroscopeReady,
  markHoroscopeFailed: state.markHoroscopeFailed,
  touchHoroscopeGenerating: state.touchHoroscopeGenerating,
  STALE_GENERATING_MS: 5 * 60_000,
  getOrCreateBatchRun: state.getOrCreateBatchRun,
  checkpointBatchRun: state.checkpointBatchRun,
  completeBatchRun: state.completeBatchRun,
  failBatchRun: state.failBatchRun,
  resetBatchRun: state.resetBatchRun,
}));

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: state.resolveActiveProfileContext,
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifyError: state.notifyError,
}));

import {
  runHoroscopeBatch,
  runAllHoroscopeBatches,
} from '../src/modules/horoscope/horoscope.service.js';

interface FakeRun {
  id: string;
  status: 'running' | 'completed' | 'failed';
  lastId: string | null;
  processed: number;
  generated: number;
  skipped: number;
  failed: number;
}

function freshRun(overrides: Partial<FakeRun> = {}): FakeRun {
  return {
    id: 'run-1',
    status: 'running',
    lastId: null,
    processed: 0,
    generated: 0,
    skipped: 0,
    failed: 0,
    ...overrides,
  };
}

describe('runHoroscopeBatch', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) — clearAllMocks only wipes call
    // history, leaving any *unconsumed* mockResolvedValueOnce entries queued
    // for the next test (e.g. the concurrency test's page never needs its
    // queued second-page `[]`, so it would otherwise leak into whichever
    // test runs next and silently return the wrong page).
    vi.resetAllMocks();
    state.getOrCreateBatchRun.mockResolvedValue(freshRun());
    state.resolveActiveProfileContext.mockResolvedValue(makeProfileContext());
    state.findHoroscope.mockResolvedValue(undefined);
  });

  it('processes a page with bounded concurrency, not one user at a time', async () => {
    const users = Array.from({ length: 8 }, (_, i) => makeUserRow({ id: `user-${i}` }));
    state.listRecentlyActiveUsersAfter.mockResolvedValueOnce(users).mockResolvedValueOnce([]);

    const releasers: Array<() => void> = [];
    state.claimHoroscopeGeneration.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasers.push(() => resolve({ startedAt: null }));
        }),
    );

    const runPromise = runHoroscopeBatch('daily', { forDate: '2026-07-20' });

    await new Promise((r) => setImmediate(r));
    expect(releasers.length).toBe(5); // bounded concurrency, not 1 and not all 8

    releasers.splice(0, 5).forEach((release) => release());
    await new Promise((r) => setImmediate(r));
    expect(releasers.length).toBe(3); // the remaining 3 start once slots free up

    releasers.splice(0).forEach((release) => release());
    await runPromise;

    expect(state.claimHoroscopeGeneration).toHaveBeenCalledTimes(8);
  });

  it('checkpoints lastId and cumulative counts once per page', async () => {
    const users = [makeUserRow({ id: 'user-a' }), makeUserRow({ id: 'user-b' })];
    state.listRecentlyActiveUsersAfter.mockResolvedValueOnce(users).mockResolvedValueOnce([]);
    state.claimHoroscopeGeneration.mockResolvedValue({ startedAt: null });

    const result = await runHoroscopeBatch('daily', { forDate: '2026-07-20' });

    expect(result).toEqual(
      expect.objectContaining({ processed: 2, generated: 0, skipped: 2, failed: 0 }),
    );
    expect(state.checkpointBatchRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ lastId: 'user-b', processed: 2, skipped: 2 }),
    );
    expect(state.completeBatchRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ processed: 2, skipped: 2 }),
    );
  });

  it('resumes from the persisted lastId when a prior run is still "running"', async () => {
    state.getOrCreateBatchRun.mockResolvedValue(
      freshRun({ status: 'running', lastId: 'user-50', processed: 50, skipped: 50 }),
    );
    state.listRecentlyActiveUsersAfter.mockResolvedValue([]);

    await runHoroscopeBatch('daily', { forDate: '2026-07-20' });

    expect(state.listRecentlyActiveUsersAfter).toHaveBeenCalledWith('user-50', expect.any(Number), {
      includeDormant: false,
    });
    expect(state.resetBatchRun).not.toHaveBeenCalled();
    expect(state.completeBatchRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ processed: 50, skipped: 50 }),
    );
  });

  it('restarts from null when the persisted run is already "completed"', async () => {
    state.getOrCreateBatchRun.mockResolvedValue(
      freshRun({ status: 'completed', lastId: 'user-999', processed: 999 }),
    );
    state.resetBatchRun.mockResolvedValue(freshRun());
    state.listRecentlyActiveUsersAfter.mockResolvedValue([]);

    await runHoroscopeBatch('daily', { forDate: '2026-07-20' });

    expect(state.resetBatchRun).toHaveBeenCalledWith('horoscope-batch', 'daily', '2026-07-20');
    expect(state.listRecentlyActiveUsersAfter).toHaveBeenCalledWith(null, expect.any(Number), {
      includeDormant: false,
    });
  });

  it('resets progress when force is true, even if a running row has prior progress', async () => {
    state.getOrCreateBatchRun.mockResolvedValue(
      freshRun({ status: 'running', lastId: 'user-50', processed: 50 }),
    );
    state.resetBatchRun.mockResolvedValue(freshRun());
    state.listRecentlyActiveUsersAfter.mockResolvedValue([]);

    await runHoroscopeBatch('daily', { forDate: '2026-07-20', force: true });

    expect(state.resetBatchRun).toHaveBeenCalledWith('horoscope-batch', 'daily', '2026-07-20');
    expect(state.listRecentlyActiveUsersAfter).toHaveBeenCalledWith(null, expect.any(Number), {
      includeDormant: false,
    });
  });

  it('marks the run failed and rethrows when a page read fails', async () => {
    state.listRecentlyActiveUsersAfter.mockRejectedValueOnce(new Error('db down'));

    await expect(runHoroscopeBatch('daily', { forDate: '2026-07-20' })).rejects.toThrow('db down');

    expect(state.failBatchRun).toHaveBeenCalledWith('run-1', expect.stringContaining('db down'));
    expect(state.completeBatchRun).not.toHaveBeenCalled();
  });
});

describe('runAllHoroscopeBatches', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.getOrCreateBatchRun.mockResolvedValue(freshRun());
    state.resolveActiveProfileContext.mockResolvedValue(makeProfileContext());
    state.findHoroscope.mockResolvedValue(undefined);
    state.listRecentlyActiveUsersAfter.mockResolvedValue([]);
  });

  it('alerts via notifyError when a period crashes, but still runs the remaining periods', async () => {
    state.getOrCreateBatchRun
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(freshRun());

    const results = await runAllHoroscopeBatches();

    expect(results).toHaveLength(5);
    expect(results[0]).toEqual(
      expect.objectContaining({
        period: 'daily',
        processed: 0,
        generated: 0,
        skipped: 0,
        failed: 0,
      }),
    );
    // The other 4 periods still ran normally (real forDate computed, not the crash placeholder's '').
    for (const r of results.slice(1)) {
      expect(r.forDate).not.toBe('');
    }
    expect(state.notifyError).toHaveBeenCalledWith(
      expect.stringContaining('daily'),
      expect.any(Error),
    );
  });

  it('sends a summary alert when any period completes with failures', async () => {
    const user = makeUserRow({ id: 'user-x' });
    state.listRecentlyActiveUsersAfter.mockResolvedValueOnce([user]).mockResolvedValue([]);
    state.resolveActiveProfileContext.mockRejectedValueOnce(new Error('profile fetch failed'));

    await runAllHoroscopeBatches();

    expect(state.notifyError).toHaveBeenCalledWith(
      expect.stringContaining('failures'),
      expect.stringContaining('daily'),
    );
  });
});
