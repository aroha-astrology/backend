import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HouseInsightRow } from '../src/db/schema.js';
import type * as HouseInsightLlm from '../src/lib/llm/house-insight.js';
import type * as HouseInsightRepo from '../src/modules/kundli/house-insight.repo.js';

const state = vi.hoisted(() => ({
  translateHouseInsightContent: vi.fn(),
  saveHouseInsightTranslation: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/lib/llm/house-insight.js', async () => {
  const actual = await vi.importActual<typeof HouseInsightLlm>('../src/lib/llm/house-insight.js');
  return { ...actual, translateHouseInsightContent: state.translateHouseInsightContent };
});

vi.mock('../src/modules/kundli/house-insight.repo.js', async () => {
  const actual = await vi.importActual<typeof HouseInsightRepo>(
    '../src/modules/kundli/house-insight.repo.js',
  );
  return { ...actual, saveHouseInsightTranslation: state.saveHouseInsightTranslation };
});

const { toHouseInsightDtoForLanguage } = await import('../src/modules/kundli/kundli.service.js');

function makeRow(overrides: Partial<HouseInsightRow> = {}): HouseInsightRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'row-1',
    userId: 'user-1',
    birthProfileId: null,
    house: 2,
    text: 'You value stability.',
    strengths: ['Steady income'],
    weaknesses: ['Overcautious'],
    translations: null,
    model: 'gemini',
    status: 'ready',
    startedAt: now,
    error: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  state.translateHouseInsightContent.mockReset();
  state.saveHouseInsightTranslation.mockReset().mockResolvedValue(undefined);
});

describe('toHouseInsightDtoForLanguage', () => {
  it('returns the untranslated dto for English', async () => {
    const dto = await toHouseInsightDtoForLanguage(makeRow(), 'en');
    expect(dto).toEqual({
      status: 'ready',
      text: 'You value stability.',
      strengths: ['Steady income'],
      weaknesses: ['Overcautious'],
    });
    expect(state.translateHouseInsightContent).not.toHaveBeenCalled();
  });

  it('uses a cached translation without calling the LLM again', async () => {
    const row = makeRow({
      translations: { hi: { text: 'आप स्थिरता को महत्व देते हैं।', strengths: ['स्थिर आय'] } },
    });
    const dto = await toHouseInsightDtoForLanguage(row, 'hi');
    expect(dto).toEqual({
      status: 'ready',
      text: 'आप स्थिरता को महत्व देते हैं।',
      strengths: ['स्थिर आय'],
      weaknesses: ['Overcautious'],
    });
    expect(state.translateHouseInsightContent).not.toHaveBeenCalled();
  });

  it('translates and persists on first request for a new language', async () => {
    state.translateHouseInsightContent.mockResolvedValueOnce({
      text: 'आप स्थिरता को महत्व देते हैं।',
      strengths: ['स्थिर आय'],
      weaknesses: ['अति सतर्क'],
    });
    const row = makeRow();

    const dto = await toHouseInsightDtoForLanguage(row, 'hi');

    expect(state.translateHouseInsightContent).toHaveBeenCalledWith(
      { text: 'You value stability.', strengths: ['Steady income'], weaknesses: ['Overcautious'] },
      'hi',
    );
    expect(state.saveHouseInsightTranslation).toHaveBeenCalledWith(
      'user-1',
      2,
      'hi',
      {
        text: 'आप स्थिरता को महत्व देते हैं।',
        strengths: ['स्थिर आय'],
        weaknesses: ['अति सतर्क'],
      },
      null,
    );
    expect(dto).toEqual({
      status: 'ready',
      text: 'आप स्थिरता को महत्व देते हैं।',
      strengths: ['स्थिर आय'],
      weaknesses: ['अति सतर्क'],
    });
  });

  it('falls back to the untranslated dto if translation fails', async () => {
    state.translateHouseInsightContent.mockRejectedValueOnce(new Error('LLM down'));
    const row = makeRow();

    const dto = await toHouseInsightDtoForLanguage(row, 'hi');

    expect(dto).toEqual({
      status: 'ready',
      text: 'You value stability.',
      strengths: ['Steady income'],
      weaknesses: ['Overcautious'],
    });
    expect(state.saveHouseInsightTranslation).not.toHaveBeenCalled();
  });
});
