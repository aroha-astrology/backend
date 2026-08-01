import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The 18+ gate (Terms §1, Privacy §8, DPDP Act §9). Two things must hold and
 * both have a way of quietly regressing:
 *
 *  1. `isAtLeast18` is right on the boundary — an off-by-one here either lets
 *     minors in or rejects adults on their birthday.
 *  2. The gate fires ONLY while onboarding. Widening it to every write would
 *     brick live accounts whose DOB is a typo; dropping the check entirely
 *     would put the app back in breach. Both directions are asserted.
 */

const state = vi.hoisted(() => ({
  findActiveUserById: vi.fn(),
  updateUserById: vi.fn(),
  updateUserWithConsentLog: vi.fn(),
  claimBirthDetailsEdit: vi.fn(),
  revertBirthDetailsEditClaim: vi.fn(),
  findUserByReferralCode: vi.fn(),
  ensureReferralCode: vi.fn(),
  creditReferralBonus: vi.fn(),
}));

vi.mock('../src/modules/users/users.repo.js', () => state);
// Fire-and-forget triggers: updateMe calls `.catch()` on what these return,
// so they must resolve rather than return undefined.
vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  requestKundliGeneration: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/modules/kundli/house-insight.repo.js', () => ({
  deleteHouseInsightsForUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/modules/gemstone/gemstone.repo.js', () => ({
  deleteGemstoneForUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/modules/horoscope/horoscope.service.js', () => ({
  HOROSCOPE_PERIODS: [],
  requestHoroscopeGeneration: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  softDeleteBirthProfilesByOwner: vi.fn(),
  listBirthProfilesByOwner: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveProfileContext: vi.fn(),
}));
vi.mock('../src/config/db.js', () => ({ db: {} }));
vi.mock('../src/lib/notifications/fcm.js', () => ({ sendPushBatch: vi.fn() }));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isAtLeast18, updateMe } from '../src/modules/users/users.service.js';

/** A DOB "YYYY-MM-DD" exactly `years` years and `offsetDays` days ago. */
function dobAgo(years: number, offsetDays = 0) {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() + offsetDays),
  );
  return d.toISOString().slice(0, 10);
}

describe('isAtLeast18', () => {
  it('accepts someone whose 18th birthday is today', () => {
    expect(isAtLeast18(dobAgo(18))).toBe(true);
  });

  it('rejects someone one day short of 18', () => {
    // Born 18 years ago minus a day => 18th birthday is tomorrow.
    expect(isAtLeast18(dobAgo(18, 1))).toBe(false);
  });

  it('accepts someone a day past 18', () => {
    expect(isAtLeast18(dobAgo(18, -1))).toBe(true);
  });

  it('rejects a clear minor and accepts a clear adult', () => {
    expect(isAtLeast18(dobAgo(9))).toBe(false);
    expect(isAtLeast18(dobAgo(40))).toBe(true);
  });

  it('handles a 29 February birth date without throwing', () => {
    expect(() => isAtLeast18('2004-02-29')).not.toThrow();
    expect(isAtLeast18('2004-02-29')).toBe(true);
  });

  it('rejects a malformed date rather than defaulting to allowed', () => {
    expect(isAtLeast18('')).toBe(false);
    expect(isAtLeast18('not-a-date')).toBe(false);
  });
});

describe('updateMe 18+ gate', () => {
  const onboardingUser = { id: 'u1', profileCompletedAt: null, referredByCode: null };
  const completedUser = {
    id: 'u1',
    profileCompletedAt: new Date('2026-01-01'),
    referredByCode: null,
  };

  beforeEach(() => {
    Object.values(state).forEach((fn) => fn.mockReset());
    state.updateUserById.mockResolvedValue(completedUser);
    state.updateUserWithConsentLog.mockResolvedValue(completedUser);
    state.claimBirthDetailsEdit.mockResolvedValue(completedUser);
  });

  it('rejects an under-18 date of birth during onboarding', async () => {
    state.findActiveUserById.mockResolvedValue(onboardingUser);
    await expect(updateMe('u1', { dateOfBirth: dobAgo(15) })).rejects.toThrow(/18 or older/i);
    // Nothing was written — the account must not come into existence at all.
    expect(state.updateUserById).not.toHaveBeenCalled();
    expect(state.updateUserWithConsentLog).not.toHaveBeenCalled();
  });

  it('rejects a DOB one day short of 18 during onboarding', async () => {
    state.findActiveUserById.mockResolvedValue(onboardingUser);
    await expect(updateMe('u1', { dateOfBirth: dobAgo(18, 1) })).rejects.toThrow(/18 or older/i);
  });

  it('allows an under-18 DOB on an ALREADY-onboarded account', async () => {
    // Existing users are deliberately exempt: a typo'd DOB is indistinguishable
    // from a real minor, and silently bricking live accounts would do more harm
    // than the rule prevents. Regressing this to "block everyone" is the failure
    // this test exists to catch.
    state.findActiveUserById.mockResolvedValue(completedUser);
    await expect(updateMe('u1', { dateOfBirth: dobAgo(15) })).resolves.toBeDefined();
  });

  it('allows an 18+ DOB during onboarding', async () => {
    state.findActiveUserById.mockResolvedValue(onboardingUser);
    await expect(updateMe('u1', { dateOfBirth: dobAgo(30) })).resolves.toBeDefined();
  });

  it('ignores the gate entirely when the patch does not touch dateOfBirth', async () => {
    state.findActiveUserById.mockResolvedValue(onboardingUser);
    await expect(updateMe('u1', { displayName: 'Asha' })).resolves.toBeDefined();
  });
});
