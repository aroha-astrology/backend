import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Pass gifts coins at the start of each period (switch money.passCoins): Gold 100, Platinum
// 200, Silver and older Passes nothing. One gift per (subscription, period).

const state = vi.hoisted(() => ({
  isFeatureOn: vi.fn(),
  addWalletBalance: vi.fn(),
}));

vi.mock('../src/modules/features/features.service.js', () => ({ isFeatureOn: state.isFeatureOn }));
vi.mock('../src/modules/users/users.repo.js', () => ({ addWalletBalance: state.addWalletBalance }));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { grantPassMonthlyCoins } = await import('../src/modules/pass/pass-coins.js');
const { PASS_TIERS } = await import('../src/modules/pass/pass.config.js');

const START = new Date('2026-11-03T08:00:00Z');

beforeEach(() => {
  state.isFeatureOn.mockReset().mockResolvedValue(true);
  state.addWalletBalance.mockReset().mockResolvedValue(true);
});

describe('the tiers', () => {
  it('gift nothing on Silver, 100 on Gold and 200 on Platinum', () => {
    expect(PASS_TIERS.map((t) => [t.tier, t.monthlyCoins])).toEqual([
      ['silver', 0],
      ['gold', 100],
      ['platinum', 200],
    ]);
  });
});

describe('grantPassMonthlyCoins', () => {
  it('pays Gold 100 coins, keyed by subscription and period so it can only happen once', async () => {
    expect(await grantPassMonthlyCoins('u1', 'B', 'sub-1', START)).toBe(10000);
    expect(state.addWalletBalance).toHaveBeenCalledWith('u1', 10000, 'pass_monthly_coins:gold', {
      idempotencyKey: 'pass_coins:sub-1:2026-11-03',
    });
  });

  it('pays Platinum 200 coins', async () => {
    expect(await grantPassMonthlyCoins('u1', 'C', 'sub-2', START)).toBe(20000);
  });

  it('the next period is a different key, so each month pays once', async () => {
    await grantPassMonthlyCoins('u1', 'B', 'sub-1', START);
    await grantPassMonthlyCoins('u1', 'B', 'sub-1', new Date('2026-12-03T08:00:00Z'));
    const keys = state.addWalletBalance.mock.calls.map((c) => (c[3] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual(['pass_coins:sub-1:2026-11-03', 'pass_coins:sub-1:2026-12-03']);
  });

  it('pays nothing on Silver, or on a Pass from before the tiers', async () => {
    expect(await grantPassMonthlyCoins('u1', 'A', 'sub-3', START)).toBe(0);
    expect(await grantPassMonthlyCoins('u1', null, 'sub-4', START)).toBe(0);
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('pays nothing while the money.passCoins switch is off', async () => {
    state.isFeatureOn.mockResolvedValue(false);
    expect(await grantPassMonthlyCoins('u1', 'B', 'sub-1', START)).toBe(0);
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('a repeat (the ledger key already used) reports nothing granted', async () => {
    state.addWalletBalance.mockResolvedValue(false);
    expect(await grantPassMonthlyCoins('u1', 'B', 'sub-1', START)).toBe(0);
  });

  it('never throws, so a failed gift cannot stop the Pass from being recorded', async () => {
    state.addWalletBalance.mockRejectedValue(new Error('db down'));
    await expect(grantPassMonthlyCoins('u1', 'B', 'sub-1', START)).resolves.toBe(0);
  });
});
