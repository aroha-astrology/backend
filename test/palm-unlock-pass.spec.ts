import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

// Palm Reading's full reading is an Aroha Pass benefit since 2026-10-23 (owner): every tier, one
// per Pass period, never charged to the wallet. The photo scan stays free for everyone.

const held = vi.hoisted(
  (): {
    active: unknown;
    features: Record<string, unknown>;
    row: Record<string, unknown> | null;
    used: number;
  } => ({ active: null, features: {}, row: null, used: 0 }),
);
const state = vi.hoisted(() => ({
  claimPalmGeneration: vi.fn(),
  markPalmReadingUnlocked: vi.fn(),
  countPalmUnlocksSince: vi.fn(),
  markPalmReadingFailed: vi.fn(),
  savePalmTranslation: vi.fn(),
  deductWalletBalance: vi.fn(),
  addWalletBalance: vi.fn(),
  generate: vi.fn(),
}));

vi.mock('../src/modules/palm/palm.repo.js', () => ({
  PALM_STALE_GENERATING_MS: 15 * 60_000,
  findPalmReadingById: () => Promise.resolve(held.row),
  claimPalmGeneration: state.claimPalmGeneration,
  markPalmReadingUnlocked: state.markPalmReadingUnlocked,
  countPalmUnlocksSince: state.countPalmUnlocksSince,
  markPalmReadingFailed: state.markPalmReadingFailed,
  savePalmTranslation: state.savePalmTranslation,
  createPendingPalmReading: vi.fn(),
  findReadyPalmReadingByFramesHash: vi.fn(),
  listPalmReadingsForUser: vi.fn(),
  saveUploadedFrame: vi.fn(),
  setFramesHash: vi.fn(),
  markPalmReadingObserved: vi.fn(),
  markPalmReadingReady: vi.fn(),
  findStaleGeneratingPalmReadings: vi.fn(),
  saveMountRelief: vi.fn(),
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({
  findActivePass: () => Promise.resolve(held.active),
}));
vi.mock('../src/modules/user-groups/user-groups.repo.js', () => ({
  listGroupIdsForUser: () => Promise.resolve([]),
}));
vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: () => Promise.resolve(held.features),
  modelForUser: (_u: string, _k: string, fallback: string) => Promise.resolve(fallback),
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: state.addWalletBalance,
}));
vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));
vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: () => Promise.resolve(undefined),
}));
vi.mock('../src/lib/notifications/notify-user.js', () => ({ notifyUser: vi.fn() }));

import { getPalmReadingForUser, unlockPalmReading } from '../src/modules/palm/palm.service.js';

const USER = makeUserRow({ id: 'user-1' });
const PERIOD_START = new Date('2026-10-10T00:00:00Z');

function reading(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'reading-1',
    userId: 'user-1',
    status: 'observed',
    primaryHand: 'right',
    frames: {},
    unlocked: false,
    confidenceScore: 80,
    observations: { primary: { majorLines: {} }, events: [] },
    mountRelief: null,
    content: null,
    translations: {},
    pricePaidPaise: null,
    startedAt: new Date(),
    ...over,
  };
}

const silverPass = () => ({
  source: 'google_play',
  priceVariant: 'A',
  periodStart: PERIOD_START,
  startedAt: PERIOD_START,
});

beforeEach(() => {
  for (const fn of Object.values(state)) {
    fn.mockReset();
  }
  held.active = null;
  held.features = {};
  held.row = reading();
  state.countPalmUnlocksSince.mockImplementation(() => Promise.resolve(held.used));
  held.used = 0;
  state.claimPalmGeneration.mockImplementation(() => Promise.resolve(held.row));
  // The background interpretation is not under test here; make it fail fast and quietly.
  state.generate.mockRejectedValue(new Error('not in this test'));
});

describe('unlockPalmReading (Aroha Pass only)', () => {
  it('without a Pass: 403 PASS_REQUIRED, nothing charged, nothing started', async () => {
    await expect(unlockPalmReading(USER, 'reading-1')).rejects.toThrow('PASS_REQUIRED');
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.claimPalmGeneration).not.toHaveBeenCalled();
  });

  it('every tier includes it: a Silver member unlocks without any wallet charge', async () => {
    held.active = silverPass();
    await expect(unlockPalmReading(USER, 'reading-1')).resolves.toEqual({ status: 'generating' });
    expect(state.countPalmUnlocksSince).toHaveBeenCalledWith('user-1', PERIOD_START, 'reading-1');
    expect(state.markPalmReadingUnlocked).toHaveBeenCalledWith('reading-1', 0);
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });

  it('one full reading per Pass period: the second gets 403 PALM_PERIOD_LIMIT', async () => {
    held.active = silverPass();
    held.used = 1;
    await expect(unlockPalmReading(USER, 'reading-1')).rejects.toThrow('PALM_PERIOD_LIMIT');
    expect(state.claimPalmGeneration).not.toHaveBeenCalled();
  });

  it('retrying a reading that failed after its unlock does not count again', async () => {
    held.active = silverPass();
    held.used = 1;
    held.row = reading({ status: 'failed', unlocked: true });
    await expect(unlockPalmReading(USER, 'reading-1')).resolves.toEqual({ status: 'generating' });
    expect(state.countPalmUnlocksSince).not.toHaveBeenCalled();
  });

  it('a wallet reading from before the Pass, already refunded once, is not refunded again', async () => {
    held.active = silverPass();
    held.row = reading({ status: 'failed', unlocked: true, pricePaidPaise: 9900 });
    await unlockPalmReading(USER, 'reading-1');
    // The stored price is reset to 0 before the run, so a second failure refunds nothing.
    expect(state.markPalmReadingUnlocked).toHaveBeenCalledWith('reading-1', 0);
  });

  it('the switch still turns the unlock off', async () => {
    held.active = silverPass();
    held.features = { 'paid.palmReading': { enabled: false } };
    await expect(unlockPalmReading(USER, 'reading-1')).rejects.toThrow('FEATURE_DISABLED');
  });
});

describe('getPalmReadingForUser: what the free scan tells the page', () => {
  it('a reader without a Pass sees passMember false', async () => {
    const dto = await getPalmReadingForUser('user-1', 'reading-1', 'en');
    expect(dto.allowance).toEqual({ passMember: false, left: 0 });
  });

  it("a member who used this period's reading sees 0 left", async () => {
    held.active = silverPass();
    held.used = 1;
    const dto = await getPalmReadingForUser('user-1', 'reading-1', 'en');
    expect(dto.allowance).toEqual({ passMember: true, left: 0 });
  });
});

describe('getPalmReadingForUser: translation cache', () => {
  it('caches every key, in English when the model drops one, so the next open does not pay again', async () => {
    held.row = reading({
      status: 'ready',
      unlocked: true,
      content: {
        sections: [{ heading: 'Life', paragraphs: ['Strong'] }],
        lineNotes: {},
        synthesis: { message: 'Old two-hand reading' },
      },
      observations: { primary: { majorLines: {} }, question: { answer: 'Yes, in 2027' } },
    });
    // The model returns only sections and lineNotes.
    state.generate.mockResolvedValue(
      JSON.stringify({ sections: [{ heading: 'जीवन', paragraphs: ['मज़बूत'] }], lineNotes: {} }),
    );
    await getPalmReadingForUser('user-1', 'reading-1', 'hi');
    expect(state.savePalmTranslation).toHaveBeenCalledWith(
      'reading-1',
      'hi',
      expect.objectContaining({
        synthesis: { message: 'Old two-hand reading' },
        questionAnswer: 'Yes, in 2027',
      }),
    );

    // Second open: the cache is complete, so no new model call.
    const saved = state.savePalmTranslation.mock.calls[0]![2] as Record<string, unknown>;
    held.row = { ...held.row, translations: { hi: saved } };
    state.generate.mockClear();
    await getPalmReadingForUser('user-1', 'reading-1', 'hi');
    expect(state.generate).not.toHaveBeenCalled();
  });
});
