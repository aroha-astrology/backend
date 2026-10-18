import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

// The signup bonus in three stages (switch money.signupDrip): 101 coins when the account is made,
// +50 for the first check-in on a LATER day, +50 for the first extra profile. Only accounts made
// while the switch was on carry users.signup_drip, so turning it on later never pays anyone who
// already got the whole bonus.

const state = vi.hoisted(() => ({
  isFeatureOnGlobally: vi.fn(),
  globalPayoutOf: vi.fn(),
  payoutOf: vi.fn(),
  addWalletBalance: vi.fn(),
  findActiveUserById: vi.fn(),
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  isFeatureOnGlobally: state.isFeatureOnGlobally,
  globalPayoutOf: state.globalPayoutOf,
  payoutOf: state.payoutOf,
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  addWalletBalance: state.addWalletBalance,
  findActiveUserById: state.findActiveUserById,
}));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { openingBalanceForNewUser, grantSignupStage } = await import('../src/modules/rewards/signup-drip.js');

// 2026-10-20 12:00 IST, and signup the same day / the day before.
const NOW = new Date('2026-10-20T06:30:00Z');
const SAME_DAY = new Date('2026-10-20T03:00:00Z');
const DAY_BEFORE = new Date('2026-10-19T09:00:00Z');

beforeEach(() => {
  state.isFeatureOnGlobally.mockReset().mockResolvedValue(false);
  state.globalPayoutOf.mockReset().mockResolvedValue(10100);
  state.payoutOf.mockReset().mockImplementation((_u: string, _k: string, fallback: number) => Promise.resolve(fallback));
  state.addWalletBalance.mockReset().mockResolvedValue(true);
  state.findActiveUserById.mockReset();
});

describe('openingBalanceForNewUser', () => {
  it('switch off: the whole bonus now, and the account is not marked', async () => {
    const out = await openingBalanceForNewUser(() => Promise.resolve(20100));
    expect(out).toEqual({ walletBalancePaise: 20100, signupDrip: false });
    expect(state.globalPayoutOf).not.toHaveBeenCalled();
  });

  it('switch on: stage 1 only, and the account is marked for stages 2 and 3', async () => {
    state.isFeatureOnGlobally.mockResolvedValue(true);
    const allAtOnce = vi.fn().mockResolvedValue(20100);
    const out = await openingBalanceForNewUser(allAtOnce);
    expect(out).toEqual({ walletBalancePaise: 10100, signupDrip: true });
    expect(state.globalPayoutOf).toHaveBeenCalledWith('money.signupFirst', 10100);
    expect(allAtOnce).not.toHaveBeenCalled();
  });
});

describe('grantSignupStage', () => {
  it('pays stage 3 (first extra profile) to a marked account, keyed so it can only happen once', async () => {
    state.findActiveUserById.mockResolvedValue(makeUserRow({ id: 'u1', signupDrip: true, createdAt: SAME_DAY }));
    expect(await grantSignupStage('u1', 3, NOW)).toBe(5000);
    expect(state.addWalletBalance).toHaveBeenCalledWith('u1', 5000, 'signup_stage_3', {
      idempotencyKey: 'signup_stage:3',
    });
  });

  it('pays stage 2 only on a later calendar day than signup', async () => {
    state.findActiveUserById.mockResolvedValue(makeUserRow({ id: 'u1', signupDrip: true, createdAt: SAME_DAY }));
    expect(await grantSignupStage('u1', 2, NOW)).toBe(0);
    expect(state.addWalletBalance).not.toHaveBeenCalled();

    state.findActiveUserById.mockResolvedValue(makeUserRow({ id: 'u1', signupDrip: true, createdAt: DAY_BEFORE }));
    expect(await grantSignupStage('u1', 2, NOW)).toBe(5000);
    expect(state.addWalletBalance).toHaveBeenCalledWith('u1', 5000, 'signup_stage_2', {
      idempotencyKey: 'signup_stage:2',
    });
  });

  it('pays nothing to an account that got the whole bonus at signup', async () => {
    state.findActiveUserById.mockResolvedValue(makeUserRow({ id: 'u1', signupDrip: false, createdAt: DAY_BEFORE }));
    expect(await grantSignupStage('u1', 3, NOW)).toBe(0);
    expect(await grantSignupStage('u1', 2, NOW)).toBe(0);
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('a repeat is a no-op: the ledger key refuses it and nothing is reported as granted', async () => {
    state.findActiveUserById.mockResolvedValue(makeUserRow({ id: 'u1', signupDrip: true, createdAt: DAY_BEFORE }));
    state.addWalletBalance.mockResolvedValue(false);
    expect(await grantSignupStage('u1', 3, NOW)).toBe(0);
  });

  it('an amount the admin set to 0 skips the stage', async () => {
    state.findActiveUserById.mockResolvedValue(makeUserRow({ id: 'u1', signupDrip: true, createdAt: DAY_BEFORE }));
    state.payoutOf.mockResolvedValue(0);
    expect(await grantSignupStage('u1', 3, NOW)).toBe(0);
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('never throws: a failure is swallowed so the check-in or profile it rode on still succeeds', async () => {
    state.findActiveUserById.mockRejectedValue(new Error('db down'));
    await expect(grantSignupStage('u1', 3, NOW)).resolves.toBe(0);
  });

  it('an unknown or deleted user gets nothing', async () => {
    state.findActiveUserById.mockResolvedValue(undefined);
    expect(await grantSignupStage('ghost', 3, NOW)).toBe(0);
  });
});
