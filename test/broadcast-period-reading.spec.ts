import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  getAllActiveTokens: vi.fn(),
  sendPushBatch: vi.fn(),
  getOrCreateBatchRun: vi.fn(),
  completeBatchRun: vi.fn(),
  failBatchRun: vi.fn(),
}));

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  getAllActiveTokens: state.getAllActiveTokens,
}));
vi.mock('../src/lib/notifications/fcm.js', () => ({
  sendPushBatch: state.sendPushBatch,
}));
vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  getOrCreateBatchRun: state.getOrCreateBatchRun,
  completeBatchRun: state.completeBatchRun,
  failBatchRun: state.failBatchRun,
}));

import { broadcastPeriodReading } from '../src/modules/cron/broadcast.service.js';

/** Noon IST on the given IST calendar date. */
function istNoon(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0) - 5.5 * 3600 * 1000);
}

const A_MONDAY = istNoon(2026, 7, 20); // weekly's scheduled day
const AN_ORDINARY_TUESDAY = istNoon(2026, 7, 21); // no tier but daily is scheduled

function freshRun(overrides: Partial<{ status: 'running' | 'completed' | 'failed' }> = {}) {
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

describe('broadcastPeriodReading', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.getOrCreateBatchRun.mockResolvedValue(freshRun());
    state.sendPushBatch.mockResolvedValue({ success: 1, failure: 0 });
  });

  it('skips without touching tokens/db when the period is not scheduled today', async () => {
    const result = await broadcastPeriodReading('weekly', { now: AN_ORDINARY_TUESDAY });

    expect(result).toEqual(
      expect.objectContaining({ skipped: true, reason: 'not-scheduled-today' }),
    );
    expect(state.getOrCreateBatchRun).not.toHaveBeenCalled();
    expect(state.getAllActiveTokens).not.toHaveBeenCalled();
  });

  it('force bypasses the schedule check', async () => {
    state.getAllActiveTokens.mockResolvedValue([{ token: 'tok-1', locale: 'en' }]);

    const result = await broadcastPeriodReading('weekly', {
      now: AN_ORDINARY_TUESDAY,
      force: true,
    });

    expect(result.skipped).toBe(false);
    expect(state.getAllActiveTokens).toHaveBeenCalled();
  });

  it('skips as "already-sent" when the batch run for (period, IST date) is already completed', async () => {
    state.getOrCreateBatchRun.mockResolvedValue(freshRun({ status: 'completed' }));

    const result = await broadcastPeriodReading('daily', { now: AN_ORDINARY_TUESDAY });

    expect(result).toEqual(expect.objectContaining({ skipped: true, reason: 'already-sent' }));
    expect(state.getAllActiveTokens).not.toHaveBeenCalled();
  });

  it('force re-sends even when already completed today', async () => {
    state.getOrCreateBatchRun.mockResolvedValue(freshRun({ status: 'completed' }));
    state.getAllActiveTokens.mockResolvedValue([{ token: 'tok-1', locale: 'en' }]);

    const result = await broadcastPeriodReading('daily', { now: AN_ORDINARY_TUESDAY, force: true });

    expect(result.skipped).toBe(false);
    expect(state.getAllActiveTokens).toHaveBeenCalled();
  });

  it('groups tokens by normalized language and issues one sendPushBatch per language group', async () => {
    state.getAllActiveTokens.mockResolvedValue([
      { token: 'tok-en-1', locale: 'en-US' },
      { token: 'tok-en-2', locale: null },
      { token: 'tok-hi-1', locale: 'hi-IN' },
      { token: 'tok-fr-1', locale: 'fr-FR' }, // unsupported -> folds into 'en' group
    ]);

    await broadcastPeriodReading('daily', { now: AN_ORDINARY_TUESDAY });

    expect(state.sendPushBatch).toHaveBeenCalledTimes(2);
    const calledTokenLists = state.sendPushBatch.mock.calls.map((c) => c[0] as string[]);
    const enGroup = calledTokenLists.find((list) => list.includes('tok-en-1'));
    const hiGroup = calledTokenLists.find((list) => list.includes('tok-hi-1'));
    expect(enGroup).toEqual(expect.arrayContaining(['tok-en-1', 'tok-en-2', 'tok-fr-1']));
    expect(hiGroup).toEqual(['tok-hi-1']);
  });

  it('sends different copy for daily vs weekly (same tokens, different period)', async () => {
    state.getAllActiveTokens.mockResolvedValue([{ token: 'tok-1', locale: 'en' }]);

    await broadcastPeriodReading('daily', { now: A_MONDAY });
    const dailyTitle = state.sendPushBatch.mock.calls[0]![1];

    vi.clearAllMocks();
    state.getOrCreateBatchRun.mockResolvedValue(freshRun());
    state.getAllActiveTokens.mockResolvedValue([{ token: 'tok-1', locale: 'en' }]);
    state.sendPushBatch.mockResolvedValue({ success: 1, failure: 0 });

    await broadcastPeriodReading('weekly', { now: A_MONDAY });
    const weeklyTitle = state.sendPushBatch.mock.calls[0]![1];

    expect(dailyTitle).not.toBe(weeklyTitle);
  });

  it('sums success/failure across language groups and reports the total token count', async () => {
    state.getAllActiveTokens.mockResolvedValue([
      { token: 'tok-en', locale: 'en' },
      { token: 'tok-hi', locale: 'hi' },
    ]);
    state.sendPushBatch
      .mockResolvedValueOnce({ success: 1, failure: 0 })
      .mockResolvedValueOnce({ success: 0, failure: 1 });

    const result = await broadcastPeriodReading('daily', { now: AN_ORDINARY_TUESDAY });

    expect(result).toEqual(
      expect.objectContaining({ skipped: false, tokensFound: 2, success: 1, failure: 1 }),
    );
    expect(state.completeBatchRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ processed: 2, generated: 1, failed: 1 }),
    );
  });

  it('marks the batch run failed and does not throw when token lookup fails', async () => {
    state.getAllActiveTokens.mockRejectedValue(new Error('db down'));

    const result = await broadcastPeriodReading('daily', { now: AN_ORDINARY_TUESDAY });

    expect(result).toEqual(expect.objectContaining({ skipped: false, tokensFound: 0 }));
    expect(state.failBatchRun).toHaveBeenCalledWith('run-1', expect.stringContaining('db down'));
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });

  it('completes cleanly with zero sends when there are no active tokens', async () => {
    state.getAllActiveTokens.mockResolvedValue([]);

    const result = await broadcastPeriodReading('daily', { now: AN_ORDINARY_TUESDAY });

    expect(result).toEqual(expect.objectContaining({ skipped: false, tokensFound: 0 }));
    expect(state.sendPushBatch).not.toHaveBeenCalled();
    expect(state.completeBatchRun).toHaveBeenCalled();
  });
});
