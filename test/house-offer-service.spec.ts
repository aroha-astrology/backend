import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

// Unlocking houses under the v7 offer (switch money.houseOffer): free houses cost nothing, the
// rest cost the single price, the bundle charges what getHouseOffer says is due, and the free
// houses are marked unlocked on their own.

const state = vi.hoisted(() => ({
  isFeatureOn: vi.fn(),
  getHouseOffer: vi.fn(),
  loadFreeHouses: vi.fn(),
  unlockHouseForUser: vi.fn(),
  unlockAllHousesForUser: vi.fn(),
  unlockHouseForOwnedProfile: vi.fn(),
  unlockAllHousesForOwnedProfile: vi.fn(),
}));

vi.mock('../src/modules/features/features.service.js', () => ({ isFeatureOn: state.isFeatureOn }));
vi.mock('../src/modules/kundli/house-offer.js', () => ({
  getHouseOffer: state.getHouseOffer,
  loadFreeHouses: state.loadFreeHouses,
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  unlockHouseForUser: state.unlockHouseForUser,
  unlockAllHousesForUser: state.unlockAllHousesForUser,
}));
vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  unlockHouseForOwnedProfile: state.unlockHouseForOwnedProfile,
  unlockAllHousesForOwnedProfile: state.unlockAllHousesForOwnedProfile,
}));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { unlockHouseWithOffer, unlockAllHouses, ensureFreeHousesUnlocked } = await import(
  '../src/modules/kundli/house-offer.service.js'
);

const user = makeUserRow({ id: 'u1' });
const primary = (unlockedHouses: number[] = []) =>
  ({ birthProfileId: null, unlockedHouses }) as never;
const other = (unlockedHouses: number[] = []) =>
  ({ birthProfileId: 'p1', unlockedHouses }) as never;

const OFFER = {
  enabled: true,
  freeHouses: [1, 7],
  singlePaise: 2500,
  bundlePaise: 14900,
  bundleDuePaise: 14900,
  lockedPaidHouses: [2, 3, 4, 5, 6, 8, 9, 10, 11, 12],
};

beforeEach(() => {
  state.isFeatureOn.mockReset().mockResolvedValue(true);
  state.getHouseOffer.mockReset().mockResolvedValue(OFFER);
  state.loadFreeHouses.mockReset().mockResolvedValue([1, 7]);
  state.unlockHouseForUser.mockReset().mockResolvedValue(true);
  state.unlockAllHousesForUser.mockReset().mockResolvedValue(true);
  state.unlockHouseForOwnedProfile.mockReset().mockResolvedValue(true);
  state.unlockAllHousesForOwnedProfile.mockReset().mockResolvedValue(true);
});

describe('unlockHouseWithOffer', () => {
  it('a free house costs nothing', async () => {
    await unlockHouseWithOffer(user, primary(), 7);
    expect(state.unlockHouseForUser).toHaveBeenCalledWith('u1', 7, 0);
  });

  it('any other house costs the single price (25 coins)', async () => {
    await unlockHouseWithOffer(user, primary(), 4);
    expect(state.unlockHouseForUser).toHaveBeenCalledWith('u1', 4, 2500);
  });

  it('an additional profile is charged to its owner through its own primitive', async () => {
    await unlockHouseWithOffer(user, other(), 4);
    expect(state.unlockHouseForOwnedProfile).toHaveBeenCalledWith('p1', 'u1', 4, 2500);
    expect(state.unlockHouseForUser).not.toHaveBeenCalled();
  });

  it('refuses a house that is already unlocked, without a charge attempt', async () => {
    await expect(unlockHouseWithOffer(user, primary([4]), 4)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(state.unlockHouseForUser).not.toHaveBeenCalled();
  });

  it('answers 409 when the balance is short', async () => {
    state.unlockHouseForUser.mockResolvedValue(false);
    await expect(unlockHouseWithOffer(user, primary(), 4)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('unlockAllHouses', () => {
  it('is refused while the offer is off', async () => {
    state.isFeatureOn.mockResolvedValue(false);
    await expect(unlockAllHouses(user, primary())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(state.unlockAllHousesForUser).not.toHaveBeenCalled();
  });

  it('charges what the offer says is due, and nothing more', async () => {
    state.getHouseOffer.mockResolvedValue({ ...OFFER, bundleDuePaise: 5000 });
    await unlockAllHouses(user, primary([2, 3, 4, 5, 6, 8, 9, 10]));
    expect(state.unlockAllHousesForUser).toHaveBeenCalledWith('u1', 5000);
  });

  it('charges an additional profile to its owner', async () => {
    await unlockAllHouses(user, other());
    expect(state.unlockAllHousesForOwnedProfile).toHaveBeenCalledWith('p1', 'u1', 14900);
  });

  it('refuses when every house is already unlocked', async () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    await expect(unlockAllHouses(user, primary(all))).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(state.unlockAllHousesForUser).not.toHaveBeenCalled();
  });

  it('answers 409 when the balance is short', async () => {
    state.unlockAllHousesForUser.mockResolvedValue(false);
    await expect(unlockAllHouses(user, primary())).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('ensureFreeHousesUnlocked', () => {
  it('unlocks the free houses that are not marked yet, at no charge', async () => {
    const out = await ensureFreeHousesUnlocked(user, primary());
    expect(out).toEqual([1, 7]);
    expect(state.unlockHouseForUser).toHaveBeenCalledWith('u1', 1, 0);
    expect(state.unlockHouseForUser).toHaveBeenCalledWith('u1', 7, 0);
  });

  it('skips a free house that is already unlocked', async () => {
    const out = await ensureFreeHousesUnlocked(user, primary([1]));
    expect(out).toEqual([7]);
    expect(state.unlockHouseForUser).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the offer is off', async () => {
    state.isFeatureOn.mockResolvedValue(false);
    expect(await ensureFreeHousesUnlocked(user, primary())).toEqual([]);
    expect(state.unlockHouseForUser).not.toHaveBeenCalled();
  });

  it('does nothing while the chart is not ready', async () => {
    state.loadFreeHouses.mockResolvedValue(null);
    expect(await ensureFreeHousesUnlocked(user, primary())).toEqual([]);
  });

  it('never throws: a failure just leaves the house locked until the next call', async () => {
    state.loadFreeHouses.mockRejectedValue(new Error('db down'));
    await expect(ensureFreeHousesUnlocked(user, primary())).resolves.toEqual([]);
  });
});
