import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrimeReportRow } from '../src/db/schema.js';
import { makeProfileContext } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  unlockPrimeReport: vi.fn(),
  claimPrimeReportGeneration: vi.fn(),
  markPrimeReportReady: vi.fn(),
  markPrimeReportFailed: vi.fn(),
  savePrimeReportTranslation: vi.fn(),
  getPrimeReportDefinition: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/modules/prime-reports/prime-reports.repo.js', () => ({
  unlockPrimeReport: state.unlockPrimeReport,
  claimPrimeReportGeneration: state.claimPrimeReportGeneration,
  markPrimeReportReady: state.markPrimeReportReady,
  markPrimeReportFailed: state.markPrimeReportFailed,
  savePrimeReportTranslation: state.savePrimeReportTranslation,
  findPrimeReport: vi.fn(),
  PRIME_REPORT_STALE_GENERATING_MS: 5 * 60_000,
}));

vi.mock('../src/modules/prime-reports/prime-reports.registry.js', () => ({
  getPrimeReportDefinition: state.getPrimeReportDefinition,
}));

const {
  unlockReport,
  requestReportGeneration,
  isReportStale,
  toReportDtoForLanguage,
  LIFETIME_PERIOD,
} = await import('../src/modules/prime-reports/prime-reports.service.js');

function makeRow(overrides: Partial<PrimeReportRow> = {}): PrimeReportRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'row-1',
    userId: 'user-1',
    birthProfileId: null,
    reportType: 'numerology',
    period: 'lifetime',
    unlockedAt: now,
    analysis: {
      intro: 'hi',
      lifePathStory: 'a',
      expressionStory: 'b',
      soulUrgeStory: 'c',
      personalityStory: 'd',
    },
    translations: null,
    model: 'gemini-3.1-flash-lite',
    status: 'ready',
    startedAt: now,
    error: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  state.unlockPrimeReport.mockReset();
  state.claimPrimeReportGeneration.mockReset();
  state.markPrimeReportReady.mockReset();
  state.markPrimeReportFailed.mockReset();
  state.savePrimeReportTranslation.mockReset().mockResolvedValue(undefined);
  state.getPrimeReportDefinition.mockReset();
});

describe('unlockReport', () => {
  it('throws for an unknown report type without touching the repo', async () => {
    state.getPrimeReportDefinition.mockReturnValueOnce(undefined);
    await expect(unlockReport('user-1', makeProfileContext(), 'nope')).rejects.toThrow(
      'Unknown report type: nope',
    );
    expect(state.unlockPrimeReport).not.toHaveBeenCalled();
  });

  it('returns already_unlocked_or_insufficient_balance when the repo returns undefined', async () => {
    state.getPrimeReportDefinition.mockReturnValue({ pricePaise: 2500, generate: vi.fn() });
    state.unlockPrimeReport.mockResolvedValueOnce(undefined);

    const result = await unlockReport('user-1', makeProfileContext(), 'numerology');
    expect(result).toBe('already_unlocked_or_insufficient_balance');
  });

  it('charges via the correct price and kicks off generation on success', async () => {
    const generate = vi.fn().mockResolvedValue({ content: { intro: 'hi' }, model: 'gemini' });
    state.getPrimeReportDefinition.mockReturnValue({ pricePaise: 2500, generate });
    const claimedAt = new Date('2026-01-01T00:00:00Z');
    state.unlockPrimeReport.mockResolvedValueOnce({ id: 'row-1', startedAt: claimedAt });

    const result = await unlockReport('user-1', makeProfileContext(), 'numerology');

    expect(state.unlockPrimeReport).toHaveBeenCalledWith(
      'user-1',
      null,
      'numerology',
      LIFETIME_PERIOD,
      2500,
    );
    expect(result).toBe('unlocked');
    // generation is fire-and-forget — flush microtasks before asserting
    await Promise.resolve();
    await Promise.resolve();
    expect(generate).toHaveBeenCalled();
    expect(state.markPrimeReportReady).toHaveBeenCalledWith(
      'user-1',
      null,
      'numerology',
      LIFETIME_PERIOD,
      claimedAt,
      { analysis: { intro: 'hi' }, model: 'gemini' },
    );
  });

  it('marks the row failed when generation throws', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('LLM exploded'));
    state.getPrimeReportDefinition.mockReturnValue({ pricePaise: 2500, generate });
    const claimedAt = new Date('2026-01-01T00:00:00Z');
    state.unlockPrimeReport.mockResolvedValueOnce({ id: 'row-1', startedAt: claimedAt });

    await unlockReport('user-1', makeProfileContext(), 'numerology');
    await Promise.resolve();
    await Promise.resolve();

    expect(state.markPrimeReportFailed).toHaveBeenCalledWith(
      'user-1',
      null,
      'numerology',
      LIFETIME_PERIOD,
      claimedAt,
      'LLM exploded',
    );
  });
});

describe('requestReportGeneration', () => {
  it('returns skipped when the claim fails (already generating/ready)', async () => {
    state.claimPrimeReportGeneration.mockResolvedValueOnce(undefined);
    const result = await requestReportGeneration('user-1', makeProfileContext(), 'numerology');
    expect(result).toBe('skipped');
  });

  it('runs generation and returns generated when the claim succeeds', async () => {
    const generate = vi.fn().mockResolvedValue({ content: { intro: 'hi' }, model: 'gemini' });
    state.getPrimeReportDefinition.mockReturnValue({ pricePaise: 2500, generate });
    const claimedAt = new Date('2026-01-01T00:00:00Z');
    state.claimPrimeReportGeneration.mockResolvedValueOnce({ startedAt: claimedAt });

    const result = await requestReportGeneration('user-1', makeProfileContext(), 'numerology');

    expect(result).toBe('generated');
    expect(generate).toHaveBeenCalled();
    expect(state.markPrimeReportReady).toHaveBeenCalled();
  });
});

describe('isReportStale', () => {
  it('is false when status is ready', () => {
    expect(isReportStale(makeRow({ status: 'ready' }))).toBe(false);
  });

  it('is true when generating and started more than 5 minutes ago', () => {
    const startedAt = new Date(Date.now() - 6 * 60_000);
    expect(isReportStale(makeRow({ status: 'generating', startedAt }))).toBe(true);
  });

  it('is false when generating and started recently', () => {
    const startedAt = new Date(Date.now() - 30_000);
    expect(isReportStale(makeRow({ status: 'generating', startedAt }))).toBe(false);
  });
});

describe('toReportDtoForLanguage', () => {
  it('returns the canonical English content untranslated', async () => {
    const dto = await toReportDtoForLanguage(makeRow(), 'numerology', 'en');
    expect(dto).toEqual({
      status: 'ready',
      reportType: 'numerology',
      content: {
        intro: 'hi',
        lifePathStory: 'a',
        expressionStory: 'b',
        soulUrgeStory: 'c',
        personalityStory: 'd',
      },
    });
  });

  it('uses a cached translation without calling translate() again', async () => {
    const translate = vi.fn();
    state.getPrimeReportDefinition.mockReturnValue({ translate });
    const row = makeRow({ translations: { hi: { intro: 'नमस्ते' } } });

    const dto = await toReportDtoForLanguage(row, 'numerology', 'hi');

    expect(dto.content).toEqual({ intro: 'नमस्ते' });
    expect(translate).not.toHaveBeenCalled();
  });

  it('translates and persists on first request for a new language', async () => {
    const translate = vi.fn().mockResolvedValue({ intro: 'नमस्ते' });
    state.getPrimeReportDefinition.mockReturnValue({ translate });

    const dto = await toReportDtoForLanguage(makeRow(), 'numerology', 'hi');

    expect(translate).toHaveBeenCalledWith(
      {
        intro: 'hi',
        lifePathStory: 'a',
        expressionStory: 'b',
        soulUrgeStory: 'c',
        personalityStory: 'd',
      },
      'hi',
    );
    expect(state.savePrimeReportTranslation).toHaveBeenCalledWith(
      'user-1',
      null,
      'numerology',
      'lifetime',
      'hi',
      { intro: 'नमस्ते' },
    );
    expect(dto.content).toEqual({ intro: 'नमस्ते' });
  });

  it('falls back to the English content if translation fails', async () => {
    const translate = vi.fn().mockRejectedValue(new Error('translation LLM exploded'));
    state.getPrimeReportDefinition.mockReturnValue({ translate });

    const dto = await toReportDtoForLanguage(makeRow(), 'numerology', 'hi');

    expect(dto.content).toEqual({
      intro: 'hi',
      lifePathStory: 'a',
      expressionStory: 'b',
      soulUrgeStory: 'c',
      personalityStory: 'd',
    });
  });
});
