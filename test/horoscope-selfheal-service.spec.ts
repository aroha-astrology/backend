import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow, makeProfileContext } from './helpers/mocks.js';
import type { DailyHoroscopeRow } from '../src/db/schema.js';

// Coverage for the new narrow self-heal sweep: runHoroscopeSelfHeal pages
// through ONLY the rows listFailedOrStaleHoroscopes returns (not every
// recently-active user, unlike runHoroscopeBatch) and retries each via
// requestHoroscopeGeneration with force:true/retryForever:false, checkpointed
// under its own 'horoscope-selfheal' jobName so it never collides with the
// 'horoscope-batch' checkpoint row.
//
// Same trick as horoscope-batch-checkpoint.spec.ts: claimHoroscopeGeneration
// resolving { startedAt: null } makes requestHoroscopeGeneration return
// 'skipped' immediately, without ever touching findKundliByUserId /
// generateHoroscopeSummary — so those don't need mocking here either.

const state = vi.hoisted(() => ({
  listFailedOrStaleHoroscopes: vi.fn(),
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
  listRecentlyActiveUsersAfter: vi.fn(),
  findActiveUserById: vi.fn(),
  resolveProfileContext: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  listFailedOrStaleHoroscopes: state.listFailedOrStaleHoroscopes,
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
  listRecentlyActiveUsersAfter: state.listRecentlyActiveUsersAfter,
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findActiveUserById: state.findActiveUserById,
}));

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: state.resolveActiveProfileContext,
  resolveProfileContext: state.resolveProfileContext,
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifyError: state.notifyError,
}));

import { runHoroscopeSelfHeal } from '../src/modules/horoscope/horoscope.service.js';

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
    id: 'selfheal-run-1',
    status: 'running',
    lastId: null,
    processed: 0,
    generated: 0,
    skipped: 0,
    failed: 0,
    ...overrides,
  };
}

function makeStaleRow(overrides: Partial<DailyHoroscopeRow> = {}): DailyHoroscopeRow {
  return {
    id: 'h-1',
    userId: 'user-1',
    birthProfileId: null,
    forDate: '2026-07-20',
    period: 'daily',
    periodKey: '2026-07-20',
    summary: null,
    monthlyBreakdown: null,
    structured: null,
    translations: null,
    model: null,
    status: 'failed',
    startedAt: null,
    error: 'boom',
    createdAt: new Date('2026-07-20T00:00:00Z'),
    updatedAt: new Date('2026-07-20T00:05:00Z'),
    ...overrides,
  } as unknown as DailyHoroscopeRow;
}

describe('runHoroscopeSelfHeal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.getOrCreateBatchRun.mockResolvedValue(freshRun());
    state.findActiveUserById.mockResolvedValue(makeUserRow({ id: 'user-1' }));
    state.resolveProfileContext.mockResolvedValue(makeProfileContext());
  });

  it('checkpoints under the horoscope-selfheal jobName, not horoscope-batch', async () => {
    state.listFailedOrStaleHoroscopes.mockResolvedValue([]);

    await runHoroscopeSelfHeal();

    expect(state.getOrCreateBatchRun).toHaveBeenCalledWith(
      'horoscope-selfheal',
      expect.any(String),
      expect.any(String),
    );
    expect(state.getOrCreateBatchRun).not.toHaveBeenCalledWith(
      'horoscope-batch',
      expect.anything(),
      expect.anything(),
    );
  });

  it('resolves the row-specific profile (not the user’s currently-active one) and claims a forced, bounded generation', async () => {
    const row = makeStaleRow({
      birthProfileId: 'profile-x',
      period: 'weekly',
      periodKey: '2026-07-14',
    });
    state.listFailedOrStaleHoroscopes.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    state.resolveProfileContext.mockResolvedValue(
      makeProfileContext({ birthProfileId: 'profile-x' }),
    );
    state.claimHoroscopeGeneration.mockResolvedValue({ startedAt: null }); // skipped path — no LLM call

    const result = await runHoroscopeSelfHeal();

    expect(state.findActiveUserById).toHaveBeenCalledWith('user-1');
    expect(state.resolveProfileContext).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      'profile-x',
    );
    expect(state.claimHoroscopeGeneration).toHaveBeenCalledWith(
      'user-1',
      'profile-x', // threaded through from the row-specific resolved profile, not the user's active profile
      'weekly',
      '2026-07-14',
      '2026-07-20',
      { force: true },
    );
    expect(result).toEqual(
      expect.objectContaining({ processed: 1, skipped: 1, generated: 0, failed: 0 }),
    );
  });

  it('skips a row whose user no longer exists (soft-deleted) without attempting a claim', async () => {
    const row = makeStaleRow({ userId: 'deleted-user' });
    state.listFailedOrStaleHoroscopes.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    state.findActiveUserById.mockResolvedValueOnce(undefined);

    const result = await runHoroscopeSelfHeal();

    expect(state.claimHoroscopeGeneration).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ processed: 1, skipped: 1 }));
  });

  it('counts a row as failed when the generation attempt throws', async () => {
    const row = makeStaleRow();
    state.listFailedOrStaleHoroscopes.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    state.claimHoroscopeGeneration.mockRejectedValueOnce(new Error('db down'));

    const result = await runHoroscopeSelfHeal();

    expect(result).toEqual(expect.objectContaining({ processed: 1, failed: 1, skipped: 0 }));
  });

  it('paginates using the row id as the keyset cursor and checkpoints per page', async () => {
    const rowA = makeStaleRow({ id: 'h-a', userId: 'user-a' });
    state.listFailedOrStaleHoroscopes.mockResolvedValueOnce([rowA]).mockResolvedValueOnce([]);
    state.claimHoroscopeGeneration.mockResolvedValue({ startedAt: null });

    await runHoroscopeSelfHeal();

    expect(state.listFailedOrStaleHoroscopes).toHaveBeenNthCalledWith(2, 'h-a', expect.any(Number));
    expect(state.checkpointBatchRun).toHaveBeenCalledWith(
      'selfheal-run-1',
      expect.objectContaining({ lastId: 'h-a', processed: 1, skipped: 1 }),
    );
    expect(state.completeBatchRun).toHaveBeenCalledWith(
      'selfheal-run-1',
      expect.objectContaining({ processed: 1, skipped: 1 }),
    );
  });

  it('restarts from scratch when a prior run for today already completed', async () => {
    state.getOrCreateBatchRun.mockResolvedValue(
      freshRun({ status: 'completed', lastId: 'h-999', processed: 999 }),
    );
    state.resetBatchRun.mockResolvedValue(freshRun());
    state.listFailedOrStaleHoroscopes.mockResolvedValue([]);

    await runHoroscopeSelfHeal();

    expect(state.resetBatchRun).toHaveBeenCalledWith(
      'horoscope-selfheal',
      expect.any(String),
      expect.any(String),
    );
    expect(state.listFailedOrStaleHoroscopes).toHaveBeenCalledWith(null, expect.any(Number));
  });

  it('does not process rows beyond what listFailedOrStaleHoroscopes returned (never touches already-ready rows)', async () => {
    state.listFailedOrStaleHoroscopes.mockResolvedValue([]);

    const result = await runHoroscopeSelfHeal();

    expect(state.claimHoroscopeGeneration).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, generated: 0, skipped: 0, failed: 0 });
  });

  it('marks the run failed and rethrows when a page read fails', async () => {
    state.listFailedOrStaleHoroscopes.mockRejectedValueOnce(new Error('db down'));

    await expect(runHoroscopeSelfHeal()).rejects.toThrow('db down');

    expect(state.failBatchRun).toHaveBeenCalledWith(
      'selfheal-run-1',
      expect.stringContaining('db down'),
    );
    expect(state.completeBatchRun).not.toHaveBeenCalled();
  });
});
