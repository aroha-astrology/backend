import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GemstoneRecommendationRow } from '../src/db/schema.js';
import type * as GemstoneLlm from '../src/lib/llm/gemstone.js';
import type * as GemstoneRepo from '../src/modules/gemstone/gemstone.repo.js';

const state = vi.hoisted(() => ({
  translateGemstoneContent: vi.fn(),
  saveGemstoneTranslation: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/lib/llm/gemstone.js', async () => {
  const actual = await vi.importActual<typeof GemstoneLlm>('../src/lib/llm/gemstone.js');
  return { ...actual, translateGemstoneContent: state.translateGemstoneContent };
});

vi.mock('../src/modules/gemstone/gemstone.repo.js', async () => {
  const actual = await vi.importActual<typeof GemstoneRepo>(
    '../src/modules/gemstone/gemstone.repo.js',
  );
  return { ...actual, saveGemstoneTranslation: state.saveGemstoneTranslation };
});

const { toGemstoneReportDtoForLanguage } =
  await import('../src/modules/gemstone/gemstone.service.js');

/** A chart where Mars rules the 8th house (fires Mars' conditionalDont) and nothing else does. */
const MARS_DUSTANA_CHART: Record<string, unknown> = {
  planets: [{ planet: 'Mars', sign: 'Aries', house: 3 }],
  houses: [{ house: 8, lord: 'Mars' }],
};

const NEUTRAL_CHART: Record<string, unknown> = {
  planets: [{ planet: 'Mars', sign: 'Aries', house: 3 }],
  houses: [{ house: 8, lord: 'Sun' }],
};

function makeRow(overrides: Partial<GemstoneRecommendationRow> = {}): GemstoneRecommendationRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'row-1',
    userId: 'user-1',
    birthProfileId: null,
    // Simulates a row persisted by the OLD code, before this fix — a stale
    // "gems" blob baked in at generation time, which the fixed read path must
    // ignore entirely and recompute fresh instead.
    analysis: {
      intro: 'Your chart shows a mix of strong and supportive placements.',
      notes: { Mars: 'Mars could use some support here.' },
      gems: [{ planet: 'Mars', donts: ['STALE: some old baked-in text'], mantraCount: 10000 }],
    },
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
  state.translateGemstoneContent.mockReset();
  state.saveGemstoneTranslation.mockReset().mockResolvedValue(undefined);
});

describe('toGemstoneReportDtoForLanguage — self-healing read-time recompute', () => {
  it('ignores any stale persisted "gems" and recomputes mantra practice fresh from GEMSTONE_DATA', async () => {
    const dto = await toGemstoneReportDtoForLanguage(makeRow(), 'en', NEUTRAL_CHART);
    const mars = dto.gems.find((g) => g.planet === 'Mars')!;
    expect(mars.mantraPerDay).toBe(108);
    expect(mars.mantraDays).toBe(11);
    expect(JSON.stringify(mars)).not.toContain('STALE');
  });

  it('sets conditionalCautionApplies=true only when the live chart actually meets the condition', async () => {
    const applies = await toGemstoneReportDtoForLanguage(makeRow(), 'en', MARS_DUSTANA_CHART);
    const notApplies = await toGemstoneReportDtoForLanguage(makeRow(), 'en', NEUTRAL_CHART);
    expect(applies.gems.find((g) => g.planet === 'Mars')!.conditionalCautionApplies).toBe(true);
    expect(notApplies.gems.find((g) => g.planet === 'Mars')!.conditionalCautionApplies).toBe(false);
  });

  it('still merges the cached AI intro/note on top of the freshly computed gems', async () => {
    const dto = await toGemstoneReportDtoForLanguage(makeRow(), 'en', NEUTRAL_CHART);
    expect(dto.intro).toBe('Your chart shows a mix of strong and supportive placements.');
    expect(dto.gems.find((g) => g.planet === 'Mars')!.note).toBe(
      'Mars could use some support here.',
    );
    expect(state.translateGemstoneContent).not.toHaveBeenCalled();
  });

  it('uses a cached translation for a non-English language without calling the LLM again', async () => {
    const row = makeRow({
      translations: { hi: { intro: 'नमस्ते', notes: { Mars: 'मंगल नोट' } } },
    });
    const dto = await toGemstoneReportDtoForLanguage(row, 'hi', NEUTRAL_CHART);
    expect(dto.intro).toBe('नमस्ते');
    expect(dto.gems.find((g) => g.planet === 'Mars')!.note).toBe('मंगल नोट');
    expect(state.translateGemstoneContent).not.toHaveBeenCalled();
  });

  it('translates and persists on first request for a new language, still with fresh gems', async () => {
    state.translateGemstoneContent.mockResolvedValueOnce({
      intro: 'नमस्ते',
      notes: { Mars: 'मंगल नोट' },
    });
    const dto = await toGemstoneReportDtoForLanguage(makeRow(), 'hi', NEUTRAL_CHART);

    expect(state.translateGemstoneContent).toHaveBeenCalledWith(
      {
        intro: 'Your chart shows a mix of strong and supportive placements.',
        notes: { Mars: 'Mars could use some support here.' },
      },
      'hi',
    );
    expect(state.saveGemstoneTranslation).toHaveBeenCalledWith('user-1', null, 'hi', {
      intro: 'नमस्ते',
      notes: { Mars: 'मंगल नोट' },
    });
    expect(dto.intro).toBe('नमस्ते');
    expect(dto.gems.find((g) => g.planet === 'Mars')!.mantraPerDay).toBe(108);
  });

  it("threads an additional profile row's birthProfileId through to the translation save", async () => {
    state.translateGemstoneContent.mockResolvedValueOnce({
      intro: 'नमस्ते',
      notes: { Mars: 'मंगल नोट' },
    });
    const row = makeRow({ birthProfileId: 'profile-1' });
    await toGemstoneReportDtoForLanguage(row, 'hi', NEUTRAL_CHART);

    expect(state.saveGemstoneTranslation).toHaveBeenCalledWith('user-1', 'profile-1', 'hi', {
      intro: 'नमस्ते',
      notes: { Mars: 'मंगल नोट' },
    });
  });
});
