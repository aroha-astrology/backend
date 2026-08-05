/**
 * Coverage for buildPurchaseFacts — the fix for chat being able to contradict
 * a report/gemstone/vastu/palm result the user already paid for and read. See
 * chat-purchase-facts.ts's header comment for the full rationale.
 */
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  reports: [] as Record<string, unknown>[],
  gemstone: undefined as Record<string, unknown> | undefined,
  vastuPlans: [] as Record<string, unknown>[],
  palmReadings: [] as Record<string, unknown>[],
}));

vi.mock('../src/modules/reports/reports.repo.js', () => ({
  listReportsForUser: vi.fn(() => Promise.resolve(state.reports)),
}));
vi.mock('../src/modules/gemstone/gemstone.repo.js', () => ({
  findGemstoneRecommendation: vi.fn(() => Promise.resolve(state.gemstone)),
}));
vi.mock('../src/modules/vastu/vastu.repo.js', () => ({
  listPlansForUser: vi.fn(() => Promise.resolve(state.vastuPlans)),
}));
vi.mock('../src/modules/palm/palm.repo.js', () => ({
  listPalmReadingsForUser: vi.fn(() => Promise.resolve(state.palmReadings)),
}));

import { buildPurchaseFacts } from '../src/lib/chat-purchase-facts.js';

const reset = () => {
  state.reports = [];
  state.gemstone = undefined;
  state.vastuPlans = [];
  state.palmReadings = [];
};

describe('buildPurchaseFacts', () => {
  it('returns nothing for a user who has bought nothing', async () => {
    reset();
    const facts = await buildPurchaseFacts('user-1', null, { unlockedHouses: [] });
    expect(facts).toEqual([]);
  });

  it('surfaces a ready, purchased report by its catalogue label', async () => {
    reset();
    state.reports = [
      {
        status: 'ready',
        reportKey: 'marriage',
        createdAt: new Date('2026-07-20T00:00:00Z'),
      },
    ];
    const facts = await buildPurchaseFacts('user-1', null, { unlockedHouses: [] });
    expect(facts.some((f) => f.includes('Marriage Report') && f.includes('2026-07-20'))).toBe(true);
  });

  it('never surfaces a report that is still generating or failed', async () => {
    reset();
    state.reports = [
      { status: 'generating', reportKey: 'wealth', createdAt: new Date() },
      { status: 'failed', reportKey: 'past_life', createdAt: new Date() },
    ];
    const facts = await buildPurchaseFacts('user-1', null, { unlockedHouses: [] });
    expect(facts).toEqual([]);
  });

  it('surfaces the gemstone report intro, not a re-derived recommendation', async () => {
    reset();
    state.gemstone = { status: 'ready', analysis: { intro: 'Jupiter is your guiding light.' } };
    const facts = await buildPurchaseFacts('user-1', null, { unlockedHouses: [] });
    expect(facts.some((f) => f.includes('Jupiter is your guiding light.'))).toBe(true);
  });

  it('says nothing about the gemstone report while it is still generating', async () => {
    reset();
    state.gemstone = { status: 'generating', analysis: null };
    const facts = await buildPurchaseFacts('user-1', null, { unlockedHouses: [] });
    expect(facts).toEqual([]);
  });

  it('lists unlocked houses sorted, straight from the resolved profile', async () => {
    reset();
    const facts = await buildPurchaseFacts('user-1', null, { unlockedHouses: [7, 1, 10] });
    expect(facts.some((f) => f.includes('1, 7, 10'))).toBe(true);
  });

  it('surfaces a done vastu plan with its score', async () => {
    reset();
    state.vastuPlans = [{ status: 'done', overallScore: 82 }];
    const facts = await buildPurchaseFacts('user-1', null, { unlockedHouses: [] });
    expect(facts.some((f) => f.includes('Vastu') && f.includes('82/100'))).toBe(true);
  });

  it('ignores a pending/errored vastu plan', async () => {
    reset();
    state.vastuPlans = [{ status: 'pending', overallScore: null }];
    const facts = await buildPurchaseFacts('user-1', null, { unlockedHouses: [] });
    expect(facts.some((f) => f.includes('Vastu'))).toBe(false);
  });

  it('surfaces a ready palm reading by existence only, never image data', async () => {
    reset();
    state.palmReadings = [{ status: 'ready' }];
    const facts = await buildPurchaseFacts('user-1', null, { unlockedHouses: [] });
    const palmFact = facts.find((f) => f.includes('palm reading'));
    expect(palmFact).toBeDefined();
    expect(palmFact).not.toMatch(/https?:\/\/|frame|image|photo/i);
  });

  it('degrades gracefully when one lookup fails — the others still contribute', async () => {
    reset();
    const { listReportsForUser } = await import('../src/modules/reports/reports.repo.js');
    vi.mocked(listReportsForUser).mockRejectedValueOnce(new Error('db down'));
    state.gemstone = { status: 'ready', analysis: { intro: 'Still works.' } };

    // Each lookup is individually wrapped (same degrade-gracefully contract
    // as buildProfileFacts/buildMatchReportFacts in astro.service.ts) — one
    // failing source must never take the others down with it.
    const facts = await buildPurchaseFacts('user-1', null, { unlockedHouses: [] });
    expect(facts.some((f) => f.includes('Still works.'))).toBe(true);
  });
});
