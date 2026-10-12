import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BirthProfileRow } from '../src/db/schema.js';
import { makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  profiles: [] as unknown[],
  pass: true,
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  listBirthProfilesByOwner: () => Promise.resolve(state.profiles),
  findOwnedBirthProfile: (id: string) =>
    Promise.resolve(state.profiles.find((p) => (p as { id: string }).id === id)),
}));
vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: () => Promise.resolve(undefined),
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({
  findActivePass: () => Promise.resolve(state.pass ? { id: 'pass-1' } : null),
}));

import {
  bondCategory,
  bondCompatibility,
  bondPhase,
  bondSpec,
  getBond,
  harmonyLabel,
  isMarriageTrack,
  isRomantic,
  listBonds,
  loadBondChart,
  lordStrained,
  lordTie,
  nextBirthday,
} from '../src/modules/bonds/bonds.service.js';
import { BOND_CATEGORY } from '../src/modules/bonds/bond-types.js';
import { birthProfileRelationshipEnum } from '../src/db/schema.js';
import { BirthProfileRelationshipSchema } from '../src/modules/birth-profiles/birth-profiles.schemas.js';
import type { ChartContext } from '../src/lib/intelligence/chart-context.js';
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
  state.pass = true;
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

  it('reads a parent with no gender on file from both the 4th and the 9th', () => {
    expect(bondSpec('parent', null, 'male')).toMatchObject({
      houses: [4, 9],
      karakas: ['Moon', 'Sun'],
    });
    expect(bondSpec('child', 'male', null).theirHouses).toEqual([4, 9]);
  });

  it('keeps Guna Milan for a marriage or one that may come, not for other romance', () => {
    for (const r of ['partner', 'fiance', 'spouse', 'prospective_match'] as const) {
      expect(bondSpec(r, 'female', 'male')).toMatchObject({ houses: [7], guna: true });
    }
    for (const r of ['situationship', 'crush', 'first_love', 'fwb', 'soulmate', 'ex'] as const) {
      expect(bondSpec(r, 'female', 'male').guna).toBe(false);
      expect(isRomantic(r)).toBe(true);
      expect(isMarriageTrack(r)).toBe(false);
    }
    expect(bondSpec('situationship', null, null)).toMatchObject({
      houses: [5],
      karakas: ['Venus', 'Rahu'],
    });
    expect(bondSpec('soulmate', null, null).houses).toEqual([9, 12]);
  });

  it('reads in-laws from the house counted from the 7th', () => {
    // Mother-in-law: 4th from the 7th. Father-in-law: 9th from the 7th.
    const from7th = (n: number) => ((7 + n - 2) % 12) + 1;
    expect(bondSpec('mother_in_law', 'female', 'male').houses).toEqual([from7th(4)]);
    expect(bondSpec('father_in_law', 'male', 'female').houses).toEqual([from7th(9)]);
    expect(from7th(4)).toBe(10);
    expect(from7th(9)).toBe(3);
    // Their chart reads a child's spouse: 7th from the 5th.
    expect(bondSpec('mother_in_law', 'female', 'male').theirHouses).toEqual([11]);
  });

  it('reads a manager and an employee as the two ends of one bond', () => {
    const up = bondSpec('manager', 'male', 'male');
    const down = bondSpec('employee', 'male', 'male');
    expect(up).toMatchObject({ houses: [10], karakas: ['Sun'], theirHouses: [6] });
    expect(down).toMatchObject({ houses: [6], karakas: ['Saturn'], theirHouses: [10] });
    expect(up.houses).toEqual(down.theirHouses);
    expect(up.theirKarakas).toEqual(down.karakas);
  });

  it('reads work, money and shared-activity bonds from their own houses', () => {
    expect(bondSpec('colleague', null, null).houses).toEqual([10, 3]);
    expect(bondSpec('investor', null, null)).toMatchObject({ houses: [8], theirHouses: [5] });
    expect(bondSpec('competitor', null, null)).toMatchObject({ houses: [6], karakas: ['Mars'] });
    expect(bondSpec('roommate', null, null).houses).toEqual([4, 11]);
    expect(bondSpec('travel_buddy', null, null).houses).toEqual([9, 3]);
    expect(bondSpec('creative_partner', null, null).houses).toEqual([5, 3]);
    expect(bondSpec('gym_partner', null, null).houses).toEqual([6, 3]);
    expect(bondSpec('cousin', null, null)).toEqual(bondSpec('sibling', null, null));
  });
});

describe('every relationship is covered', () => {
  const all = birthProfileRelationshipEnum.enumValues;

  it('the database list, the API list and the category list name the same relationships', () => {
    expect([...BirthProfileRelationshipSchema.options].sort()).toEqual([...all].sort());
    expect(Object.keys(BOND_CATEGORY).sort()).toEqual([...all].sort());
  });

  it('each one has a group and real houses and significators on both sides', () => {
    const planets = [
      'Sun',
      'Moon',
      'Mars',
      'Mercury',
      'Jupiter',
      'Venus',
      'Saturn',
      'Rahu',
      'Ketu',
    ];
    for (const r of all) {
      expect(['romantic', 'professional', 'family', 'social', 'other']).toContain(bondCategory(r));
      for (const [self, other] of [
        ['male', 'female'],
        ['female', 'male'],
        [null, null],
      ] as const) {
        const spec = bondSpec(r, other, self);
        for (const houses of [spec.houses, spec.theirHouses]) {
          expect(houses.length, r).toBeGreaterThan(0);
          for (const h of houses) expect(h >= 1 && h <= 12, `${r} house ${h}`).toBe(true);
        }
        for (const karakas of [spec.karakas, spec.theirKarakas]) {
          expect(karakas.length, r).toBeGreaterThan(0);
          for (const k of karakas) expect(planets, r).toContain(k);
        }
      }
    }
  });

  it('groups them for the tabs on the Bonds page', () => {
    const count = (c: string) => all.filter((r) => bondCategory(r) === c).length;
    expect(count('romantic')).toBe(10);
    expect(count('professional')).toBe(6);
    expect(count('family')).toBe(6);
    expect(count('social')).toBe(5);
    expect(count('other')).toBe(1);
    expect(bondCategory(null)).toBe('other');
  });
});

/** A chart whose only planet is `planet`, in `house`, ruling `rules`. */
function chartWith(planet: string, house: number, rules: number[]): ChartContext {
  return {
    natal: [{ planet, house, signIndex: 0, nakshatraIndex: 0 }],
    houseLords: Object.fromEntries(rules.map((h) => [h, planet])),
    dasha: { mahadasha: null, antardasha: null, pratyantardasha: null },
    transits: [],
  } as unknown as ChartContext;
}

describe('the strain rule with a bond that lives in the 6th, 8th or 12th', () => {
  it("does not call a lord strained for sitting in the bond's own house", () => {
    // Saturn rules and sits in the 6th: at home for an employee bond.
    const atHome = chartWith('Saturn', 6, [6]);
    expect(lordStrained(atHome, 'Saturn', [6])).toBe(false);
    // rules 3 + sits 2 + significator 1, and no penalty for the 6th.
    expect(lordTie(atHome, 'Saturn', [6], ['Saturn']).score).toBe(6);
  });

  it('still calls it strained in a different difficult house', () => {
    const away = chartWith('Saturn', 8, [6]);
    expect(lordStrained(away, 'Saturn', [6])).toBe(true);
    // rules 3 + significator 1, less 1 for the 8th.
    expect(lordTie(away, 'Saturn', [6], ['Saturn']).score).toBe(3);
  });

  it('leaves the old rule unchanged for a bond in an ordinary house', () => {
    const venus12 = chartWith('Venus', 12, [7]);
    expect(lordStrained(venus12, 'Venus', [7])).toBe(true);
    expect(lordTie(venus12, 'Venus', [7], ['Venus']).score).toBe(3);
    const venus7 = chartWith('Venus', 7, [7]);
    expect(lordStrained(venus7, 'Venus', [7])).toBe(false);
    // rules 3 + sits 2 + significator 1 + 1 for an angle.
    expect(lordTie(venus7, 'Venus', [7], ['Venus']).score).toBe(7);
  });
});

describe('harmonyLabel', () => {
  it('goes below Mixed when the score is very low', () => {
    expect(harmonyLabel(80)).toBe('excellent');
    expect(harmonyLabel(60)).toBe('good');
    expect(harmonyLabel(45)).toBe('average');
    expect(harmonyLabel(30)).toBe('mixed');
    expect(harmonyLabel(29)).toBe('poor');
    expect(harmonyLabel(0)).toBe('poor');
  });
});

/** A chart with nothing in it but the slow planets passing the given houses from the Moon. */
function quietChart(transits: Array<{ planet: string; houseFromMoon: number }>): ChartContext {
  return {
    natal: [],
    houseLords: {},
    dasha: { mahadasha: null, antardasha: null, pratyantardasha: null },
    transits: transits.map((t) => ({
      ...t,
      signIndex: 0,
      sign: 'Aries',
      nakshatraIndex: 0,
      isRetrograde: false,
      houseFromLagna: 1,
    })),
  } as unknown as ChartContext;
}

describe('bondPhase transits', () => {
  it("counts Saturn in a business partner's 10th house, not only the 7th", () => {
    const spec = bondSpec('business_partner', 'male', 'male');
    const phase = bondPhase(
      quietChart([{ planet: 'Saturn', houseFromMoon: 10 }]),
      quietChart([]),
      spec,
      'Ravi',
    );
    expect(phase.tone).toBe('mixed');
    expect(phase.why).toContainEqual(
      expect.objectContaining({ kind: 'transit', planet: 'Saturn', house: 10, effect: -1 }),
    );
  });

  it('stays steady when the slow planets are elsewhere', () => {
    const spec = bondSpec('business_partner', 'male', 'male');
    const phase = bondPhase(
      quietChart([{ planet: 'Saturn', houseFromMoon: 2 }]),
      quietChart([]),
      spec,
      'Ravi',
    );
    expect(phase.tone).toBe('steady');
    expect(phase.why).toHaveLength(0);
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

describe('listBonds / getBond', () => {
  it('are Aroha Pass only', async () => {
    state.pass = false;
    state.profiles = [profile({})];
    await expect(listBonds(OWNER)).rejects.toThrow('PASS_REQUIRED');
    await expect(getBond(OWNER, '11111111-1111-4111-8111-111111111111')).rejects.toThrow(
      'PASS_REQUIRED',
    );
  });

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
    expect(bonds[0]).toMatchObject({
      name: 'Priya',
      relationship: 'spouse',
      category: 'romantic',
      gender: 'female',
      ready: true,
    });
    expect(bonds[1]).toMatchObject({ category: 'family' });
    expect(bonds[0]!.compatibility?.kind).toBe('guna');
    expect(['active', 'steady', 'mixed', 'testing']).toContain(bonds[0]!.phase);
    expect(bonds[1]).toMatchObject({ name: 'Ma', ready: false, compatibility: null, phase: null });
  }, 60_000);

  it("needs the owner's own birth details", async () => {
    state.profiles = [profile({})];
    await expect(listBonds(makeUserRow())).rejects.toThrow('CHART_NOT_READY');
  });

  it('gives the phase and the detail: windows, themes and the birthday', async () => {
    state.profiles = [profile({})];
    const open = await getBond(OWNER, '11111111-1111-4111-8111-111111111111');
    expect(open.phaseDetail?.lords).toHaveLength(2);
    expect(open.detail).not.toBeNull();
    expect(open.detail!.communication.length).toBeGreaterThanOrEqual(1);
    expect(open.detail!.communication[0]!.textKey).toMatch(/^bonds\.comm\.moon/);
    expect(open.detail!.dates.some((d) => d.kind === 'birthday' && d.date.endsWith('-11-03'))).toBe(
      true,
    );
    for (const w of open.detail!.upcoming) expect(w.start <= w.end).toBe(true);
  }, 60_000);

  it('404s for a profile that is not yours', async () => {
    state.profiles = [profile({})];
    await expect(getBond(OWNER, '99999999-9999-4999-8999-999999999999')).rejects.toThrow(
      'BOND_NOT_FOUND',
    );
  });
});
