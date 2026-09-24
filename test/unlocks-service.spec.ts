import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  hasPass: vi.fn(),
  priceOf: vi.fn(),
  deductWalletBalance: vi.fn(),
  addWalletBalance: vi.fn(),
  findActiveUnlock: vi.fn(),
  insertUnlock: vi.fn(),
}));

vi.mock('../src/lib/entitlements.js', () => ({ hasPass: state.hasPass }));
vi.mock('../src/modules/features/features.service.js', () => ({ priceOf: state.priceOf }));
vi.mock('../src/modules/users/users.repo.js', () => ({
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: state.addWalletBalance,
}));
vi.mock('../src/modules/unlocks/unlocks.repo.js', () => ({
  findActiveUnlock: state.findActiveUnlock,
  insertUnlock: state.insertUnlock,
}));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { purchaseUnlock, unlockState } from '../src/modules/unlocks/unlocks.service.js';

const opts = {
  userId: 'user-1',
  birthProfileId: null,
  featureKey: 'paid.lifeTimelineFull',
  fallbackPaise: 9900,
  reason: 'life_timeline_full',
};

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset();
  state.hasPass.mockResolvedValue(false);
  state.priceOf.mockResolvedValue(9900);
  state.findActiveUnlock.mockResolvedValue(undefined);
  state.deductWalletBalance.mockResolvedValue(true);
  state.insertUnlock.mockResolvedValue(true);
  state.addWalletBalance.mockResolvedValue(undefined);
});

describe('unlockState', () => {
  it('is open with the Pass, open after a purchase, otherwise priced', async () => {
    state.hasPass.mockResolvedValueOnce(true);
    expect(await unlockState('user-1', null, opts.featureKey, 9900)).toEqual({
      unlocked: true,
      via: 'pass',
      pricePaise: 0,
    });
    state.findActiveUnlock.mockResolvedValueOnce({ id: 'u' });
    expect(await unlockState('user-1', null, opts.featureKey, 9900)).toEqual({
      unlocked: true,
      via: 'purchase',
      pricePaise: 0,
    });
    expect(await unlockState('user-1', null, opts.featureKey, 9900)).toEqual({
      unlocked: false,
      via: null,
      pricePaise: 9900,
    });
  });
});

describe('purchaseUnlock', () => {
  it('charges the wallet once and records the unlock', async () => {
    await purchaseUnlock(opts);
    expect(state.deductWalletBalance).toHaveBeenCalledWith('user-1', 9900, 'life_timeline_full');
    expect(state.insertUnlock).toHaveBeenCalledWith(
      expect.objectContaining({ featureKey: opts.featureKey, pricePaidPaise: 9900 }),
    );
  });

  it('never charges for something already open', async () => {
    state.findActiveUnlock.mockResolvedValue({ id: 'u' });
    await purchaseUnlock(opts);
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });

  it('refunds when a concurrent purchase already recorded the unlock', async () => {
    state.insertUnlock.mockResolvedValue(false);
    await purchaseUnlock(opts);
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      9900,
      'refund:life_timeline_full',
    );
  });

  it('refuses without recording anything when the wallet is short', async () => {
    state.deductWalletBalance.mockResolvedValue(false);
    await expect(purchaseUnlock(opts)).rejects.toMatchObject({ status: 409 });
    expect(state.insertUnlock).not.toHaveBeenCalled();
  });
});
