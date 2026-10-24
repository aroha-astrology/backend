import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

// Palm Reading's full reading is open to everyone (owner, 2026-10-24): the normal price (Rs 199)
// from the wallet, and an Aroha Pass member gets one free per Pass period on top (admin can reset
// that count). The photo scan stays free for everyone.

const held = vi.hoisted(
  (): {
    active: unknown;
    features: Record<string, unknown>;
    row: Record<string, unknown> | null;
    used: number;
    groups: string[];
  } => ({ active: null, features: {}, row: null, used: 0, groups: [] }),
);
const state = vi.hoisted(() => ({
  claimPalmGeneration: vi.fn(),
  markPalmReadingUnlocked: vi.fn(),
  clearPalmUnlock: vi.fn(),
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
  clearPalmUnlock: state.clearPalmUnlock,
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
  listGroupIdsForUser: () => Promise.resolve(held.groups),
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
  held.groups = [];
  state.claimPalmGeneration.mockImplementation(() => Promise.resolve(held.row));
  state.deductWalletBalance.mockResolvedValue(true);
  // The background interpretation is not under test here; make it fail fast and quietly.
  state.generate.mockRejectedValue(new Error('not in this test'));
});

const NORMAL_PRICE = 19_900;

describe('unlockPalmReading: open to everyone at the normal price', () => {
  it('a reader without a Pass pays Rs 199 from the wallet and the reading starts', async () => {
    await expect(unlockPalmReading(USER, 'reading-1')).resolves.toEqual({ status: 'generating' });
    expect(state.deductWalletBalance).toHaveBeenCalledWith('user-1', NORMAL_PRICE, 'palm_unlock');
    expect(state.markPalmReadingUnlocked).toHaveBeenCalledWith('reading-1', NORMAL_PRICE);
    expect(state.countPalmUnlocksSince).not.toHaveBeenCalled();
  });

  it('charges the price the admin set, not a fixed one', async () => {
    held.features = { 'paid.palmReading': { enabled: true, pricePaise: 24_900 } };
    await unlockPalmReading(USER, 'reading-1');
    expect(state.deductWalletBalance).toHaveBeenCalledWith('user-1', 24_900, 'palm_unlock');
  });

  it('a short wallet: 409 INSUFFICIENT_CREDITS, nothing started', async () => {
    state.deductWalletBalance.mockResolvedValue(false);
    await expect(unlockPalmReading(USER, 'reading-1')).rejects.toThrow('INSUFFICIENT_CREDITS');
    expect(state.claimPalmGeneration).not.toHaveBeenCalled();
    expect(state.markPalmReadingUnlocked).not.toHaveBeenCalled();
  });

  it('if the reading is already being unlocked, the charge is given back', async () => {
    state.claimPalmGeneration.mockResolvedValue(null);
    await expect(unlockPalmReading(USER, 'reading-1')).rejects.toThrow('already being unlocked');
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      NORMAL_PRICE,
      'refund:palm_unlock',
    );
  });

  it('the switch still turns the unlock off', async () => {
    held.features = { 'paid.palmReading': { enabled: false } };
    await expect(unlockPalmReading(USER, 'reading-1')).rejects.toThrow('FEATURE_DISABLED');
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });
});

describe('unlockPalmReading: one free reading per Pass period', () => {
  it('a member unlocks the first one with no wallet charge, counted from their period start', async () => {
    held.active = silverPass();
    await expect(unlockPalmReading(USER, 'reading-1')).resolves.toEqual({ status: 'generating' });
    expect(state.countPalmUnlocksSince).toHaveBeenCalledWith('user-1', PERIOD_START, 'reading-1');
    expect(state.markPalmReadingUnlocked).toHaveBeenCalledWith('reading-1', 0);
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });

  it("once this period's free one is used, the next costs the normal price", async () => {
    held.active = silverPass();
    held.used = 1;
    await expect(unlockPalmReading(USER, 'reading-1')).resolves.toEqual({ status: 'generating' });
    expect(state.deductWalletBalance).toHaveBeenCalledWith('user-1', NORMAL_PRICE, 'palm_unlock');
    expect(state.markPalmReadingUnlocked).toHaveBeenCalledWith('reading-1', NORMAL_PRICE);
  });

  it('an admin reset moves where the count starts: only free readings after it count', async () => {
    held.active = silverPass();
    const reset = new Date('2026-10-20T00:00:00Z');
    await unlockPalmReading(makeUserRow({ id: 'user-1', palmFreeResetAt: reset }), 'reading-1');
    expect(state.countPalmUnlocksSince).toHaveBeenCalledWith('user-1', reset, 'reading-1');
  });

  it('a reset older than the period start changes nothing', async () => {
    held.active = silverPass();
    const old = new Date('2026-09-01T00:00:00Z');
    await unlockPalmReading(makeUserRow({ id: 'user-1', palmFreeResetAt: old }), 'reading-1');
    expect(state.countPalmUnlocksSince).toHaveBeenCalledWith('user-1', PERIOD_START, 'reading-1');
  });

  it('retrying a reading that failed after a free unlock is free and does not count again', async () => {
    held.active = silverPass();
    held.used = 1;
    held.row = reading({ status: 'failed', unlocked: true, pricePaidPaise: 0 });
    await expect(unlockPalmReading(USER, 'reading-1')).resolves.toEqual({ status: 'generating' });
    expect(state.countPalmUnlocksSince).not.toHaveBeenCalled();
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.markPalmReadingUnlocked).toHaveBeenCalledWith('reading-1', 0);
  });
});

describe('admin user groups are never limited or charged', () => {
  it('a group member unlocks without a charge and without counting, however many they have used', async () => {
    held.groups = ['staff'];
    held.used = 7;
    await expect(unlockPalmReading(USER, 'reading-1')).resolves.toEqual({ status: 'generating' });
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.countPalmUnlocksSince).not.toHaveBeenCalled();
    expect(state.markPalmReadingUnlocked).toHaveBeenCalledWith('reading-1', 0);
  });

  it('the page is told it is unlimited for them', async () => {
    held.groups = ['staff'];
    held.used = 7;
    const dto = await getPalmReadingForUser(USER, 'reading-1', 'en');
    expect(dto.allowance).toEqual({
      passMember: true,
      left: 1,
      pricePaise: NORMAL_PRICE,
      unlimited: true,
    });
  });

  it('the switch still turns the unlock off for them too', async () => {
    held.groups = ['staff'];
    held.features = { 'paid.palmReading': { enabled: false } };
    await expect(unlockPalmReading(USER, 'reading-1')).rejects.toThrow('FEATURE_DISABLED');
  });
});

describe('a paid reading that fails is refunded once, and must be paid for again', () => {
  it('refunds the price, puts the reading back to not-unlocked, and never refunds twice', async () => {
    held.row = reading({ status: 'observed', unlocked: false });
    state.markPalmReadingUnlocked.mockImplementation((_id: string, price: number) => {
      held.row = { ...held.row, unlocked: true, pricePaidPaise: price };
      return Promise.resolve();
    });
    await unlockPalmReading(USER, 'reading-1');
    // The background interpretation fails (generate is rejected in beforeEach): refund + reset.
    await vi.waitFor(() => expect(state.clearPalmUnlock).toHaveBeenCalledWith('reading-1'));
    expect(state.addWalletBalance).toHaveBeenCalledTimes(1);
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      NORMAL_PRICE,
      'refund:palm_unlock',
    );
  });

  it('a free (Pass) reading that fails refunds nothing and is not reset', async () => {
    held.active = silverPass();
    state.markPalmReadingUnlocked.mockImplementation((_id: string, price: number) => {
      held.row = { ...held.row, unlocked: true, pricePaidPaise: price };
      return Promise.resolve();
    });
    await unlockPalmReading(USER, 'reading-1');
    await vi.waitFor(() => expect(state.markPalmReadingFailed).toHaveBeenCalled());
    expect(state.addWalletBalance).not.toHaveBeenCalled();
    expect(state.clearPalmUnlock).not.toHaveBeenCalled();
  });
});

describe('getPalmReadingForUser: what the free scan tells the page', () => {
  it('a reader without a Pass sees no free reading and the price', async () => {
    const dto = await getPalmReadingForUser(USER, 'reading-1', 'en');
    expect(dto.allowance).toEqual({ passMember: false, left: 0, pricePaise: NORMAL_PRICE });
  });

  it("a member who used this period's free one sees 0 left, still with the price", async () => {
    held.active = silverPass();
    held.used = 1;
    const dto = await getPalmReadingForUser(USER, 'reading-1', 'en');
    expect(dto.allowance).toEqual({ passMember: true, left: 0, pricePaise: NORMAL_PRICE });
  });

  it('a member with the free one unused sees 1 left', async () => {
    held.active = silverPass();
    const dto = await getPalmReadingForUser(USER, 'reading-1', 'en');
    expect(dto.allowance).toEqual({ passMember: true, left: 1, pricePaise: NORMAL_PRICE });
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
    await getPalmReadingForUser(USER, 'reading-1', 'hi');
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
    await getPalmReadingForUser(USER, 'reading-1', 'hi');
    expect(state.generate).not.toHaveBeenCalled();
  });
});
