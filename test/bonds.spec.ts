import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BirthProfileRow } from '../src/db/schema.js';
import { makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  profiles: [] as unknown[],
  unlocked: false,
  unlockState: vi.fn(),
  purchaseUnlock: vi.fn(),
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  listBirthProfilesByOwner: () => Promise.resolve(state.profiles),
  findOwnedBirthProfile: (id: string) =>
    Promise.resolve(state.profiles.find((p) => (p as { id: string }).id === id)),
}));
vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: () => Promise.resolve(undefined),
}));
vi.mock('../src/modules/unlocks/unlocks.service.js', () => ({
  unlockState: state.unlockState,
  purchaseUnlock: state.purchaseUnlock,
}));

import {
  bondCompatibility,
  bondSpec,
  getBond,
  listBonds,
  loadBondChart,
  nextBirthday,
  unlockBond,
} from '../src/modules/bonds/bonds.service.js';
import { makeProfileContext } from './helpers/mocks.js';

const DELHI = { name: 'Delhi', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' };
const OWNER = makeUserRow({
  id: '00000000-0000-0000-0000-000000000001',
  gender: 'male',
  dateOfBirth: '1990-05-15',
  timeOfBirth: '14:30',
  placeOfBirth: DELHI,
  birthTimeAccuracy: 'exact',
});

function profile(overrides: Partial<BirthProfileRow>): BirthProfileRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ownerUserId: OWNER.id,
    relationship: 'spouse',
    displayName: 'Priya',
    gender: 'female',
    dateOfBirth: '1992-11-03',
    timeOfBirth: '06:45',
    placeOfBirth: { name: 'Mumbai', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata' },
    birthTimeAccuracy: 'exact',
    birthTimeSource: null,
    birthLocationAccuracy: null,
    gotra: null,
    addedWithConsent: true,
    notes: null,
    unlockedHouses: null,
    gemstoneUnlockedAt: null,
    gemstoneWeightKg: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.profiles = [];
  state.unlocked = false;
  state.unlockState
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve(
        state.unlocked
          ? { unlocked: true, via: 'purchase', pricePaise: 0 }
          : { unlocked: false, via: null, pricePaise: 4900 },
      ),
    );
  state.purchaseUnlock
    .mockReset()
    .mockResolvedValue({ unlocked: true, via: 'purchase', pricePaise: 0 });
});

describe('bondSpec', () => {
  it('reads the 7th for couples and business partners, with Guna Milan only for couples', () => {
    expect(bondSpec('spouse', 'female', 'male')).toMatchObject({ houses: [7], guna: true });
    expect(bondSpec('business_partner', 'male', 'male')).toMatchObject({
      houses: [7, 10],
      guna: false,
    });
  });

  it('reads a mother from the 4th and a father from the 9th; the child side reads the 5th', () => {
    expect(bondSpec('parent', 'female', 'male')).toMatchObject({
      houses: [4],
      karakas: ['Moon'],
      theirHouses: [5],
    });
    expect(bondSpec('parent', 'male', 'female')).toMatchObject({ houses: [9], karakas: ['Sun'] });
    // A child's chart reads the owner (their mother) from its 4th.
    expect(bondSpec('child', 'male', 'female')).toMatchObject({ houses: [5], theirHouses: [4] });
  });

  it('treats friends and anything unknown as the 11th', () => {
    expect(bondSpec('friend', null, null).houses).toEqual([11]);
    expect(bondSpec(null, null, null).houses).toEqual([11]);
  });
});

describe('nextBirthday', () => {
  it('finds this year or next, and moves 29 Feb to the 28th in a common year', () => {
    expect(nextBirthday('1992-11-03', '2026-09-24')).toBe('2026-11-03');
    expect(nextBirthday('1992-03-01', '2026-09-24')).toBe('2027-03-01');
    expect(nextBirthday('1992-09-24', '2026-09-24')).toBe('2026-09-24');
    expect(nextBirthday('2000-02-29', '2026-09-24')).toBe('2027-02-28');
    expect(nextBirthday('2000-02-29', '2027-09-24')).toBe('2028-02-29');
  });
});

describe('bondCompatibility on real charts', () => {
  it('scores a couple out of 36 and anyone else as a 0-100 harmony', async () => {
    const now = new Date('2026-09-24T06:30:00Z');
    const me = (await loadBondChart(
      OWNER,
      makeProfileContext({ ...OWNER, birthProfileId: null }),
      now,
    ))!;
    const them = (await loadBondChart(
      OWNER,
      makeProfileContext({
        birthProfileId: 'x',
        dateOfBirth: '1992-11-03',
        timeOfBirth: '06:45',
        placeOfBirth: { name: 'Mumbai', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata' },
      }),
      now,
    ))!;
    expect(me.mahadashas.length).toBeGreaterThan(0);

    const couple = bondCompatibility(
      me.ctx,
      them.ctx,
      bondSpec('spouse', 'female', 'male'),
      'male',
      'female',
    );
    expect(couple.kind).toBe('guna');
    expect(couple.max).toBe(36);
    expect(couple.kootas).toHaveLength(8);
    expect(couple.score).toBe(couple.kootas.reduce((s, k) => s + k.score, 0));

    const friends = bondCompatibility(
      me.ctx,
      them.ctx,
      bondSpec('friend', 'female', 'male'),
      'male',
      'female',
    );
    expect(friends.kind).toBe('harmony');
    expect(friends.kootas.map((k) => k.koota).sort()).toEqual(['Bhakoot', 'GrahaMaitri', 'Tara']);
    expect(friends.pct).toBeGreaterThanOrEqual(0);
    expect(friends.pct).toBeLessThanOrEqual(100);
  }, 60_000);
});

describe('listBonds / getBond / unlockBond', () => {
  it('lists each saved person with a score and phase; one without a birth time is not ready yet', async () => {
    state.profiles = [
      profile({}),
      profile({
        id: '22222222-2222-4222-8222-222222222222',
        relationship: 'parent',
        displayName: 'Ma',
        timeOfBirth: null,
      }),
    ];
    const { bonds } = await listBonds(OWNER);
    expect(bonds).toHaveLength(2);
    expect(bonds[0]).toMatchObject({ name: 'Priya', relationship: 'spouse', ready: true });
    expect(bonds[0]!.compatibility?.kind).toBe('guna');
    expect(['active', 'steady', 'mixed', 'testing']).toContain(bonds[0]!.phase);
    expect(bonds[1]).toMatchObject({ name: 'Ma', ready: false, compatibility: null, phase: null });
  }, 60_000);

  it("needs the owner's own birth details", async () => {
    state.profiles = [profile({})];
    await expect(listBonds(makeUserRow())).rejects.toThrow('CHART_NOT_READY');
  });

  it('keeps the detail locked until the bond is unlocked, then adds windows, themes and the birthday', async () => {
    state.profiles = [profile({})];
    const locked = await getBond(OWNER, '11111111-1111-4111-8111-111111111111');
    expect(locked.detail).toBeNull();
    expect(locked.unlock.pricePaise).toBe(4900);
    expect(locked.phaseDetail?.lords).toHaveLength(2);
    expect(state.unlockState).toHaveBeenCalledWith(
      OWNER.id,
      '11111111-1111-4111-8111-111111111111',
      'paid.bondInsight',
      4900,
    );

    state.unlocked = true;
    const open = await getBond(OWNER, '11111111-1111-4111-8111-111111111111');
    expect(open.detail).not.toBeNull();
    expect(open.detail!.communication.length).toBeGreaterThanOrEqual(1);
    expect(open.detail!.communication[0]!.textKey).toMatch(/^bonds\.comm\.moon/);
    expect(open.detail!.dates.some((d) => d.kind === 'birthday' && d.date.endsWith('-11-03'))).toBe(
      true,
    );
    for (const w of open.detail!.upcoming) expect(w.start <= w.end).toBe(true);
  }, 60_000);

  it('unlocks per person, and 404s for a profile that is not yours', async () => {
    state.profiles = [profile({})];
    await unlockBond(OWNER, '11111111-1111-4111-8111-111111111111');
    expect(state.purchaseUnlock).toHaveBeenCalledWith({
      userId: OWNER.id,
      birthProfileId: '11111111-1111-4111-8111-111111111111',
      featureKey: 'paid.bondInsight',
      fallbackPaise: 4900,
      reason: 'bond_insight',
    });
    await expect(unlockBond(OWNER, '99999999-9999-4999-8999-999999999999')).rejects.toThrow(
      'BOND_NOT_FOUND',
    );
  });
});
