import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BirthProfileRow } from '../src/db/schema.js';

// Audit Sprint 5, M16: editing a saved family profile's birth date, time, place or accuracy left
// its chart, cached horoscopes and chart-derived readings on the OLD birth data. Only the account
// owner's own edit (PATCH /me) restarted the chart; a family profile waited until someone opened
// its Kundli screen, while chat, reports and the horoscope kept reading the stale chart.

const state = vi.hoisted(() => ({
  before: null,
  updateOwnedBirthProfile: vi.fn(),
  deleteHoroscopesForProfile: vi.fn(),
  deleteHouseInsightsForUser: vi.fn(),
  deleteGemstoneForUser: vi.fn(),
  deleteRemedyInsightForUser: vi.fn(),
  requestKundliGeneration: vi.fn(),
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  findOwnedBirthProfile: () => Promise.resolve(state.before),
  insertBirthProfile: vi.fn(),
  listBirthProfilesByOwner: vi.fn(),
  softDeleteOwnedBirthProfile: vi.fn(),
  updateOwnedBirthProfile: state.updateOwnedBirthProfile,
}));
vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  deleteHoroscopesForProfile: state.deleteHoroscopesForProfile,
}));
vi.mock('../src/modules/kundli/house-insight.repo.js', () => ({
  deleteHouseInsightsForUser: state.deleteHouseInsightsForUser,
}));
vi.mock('../src/modules/gemstone/gemstone.repo.js', () => ({
  deleteGemstoneForUser: state.deleteGemstoneForUser,
}));
vi.mock('../src/modules/astro/remedy-insight.repo.js', () => ({
  deleteRemedyInsightForUser: state.deleteRemedyInsightForUser,
}));
vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  requestKundliGeneration: state.requestKundliGeneration,
}));

const { updateBirthProfile } =
  await import('../src/modules/birth-profiles/birth-profiles.service.js');

const OWNER = '00000000-0000-0000-0000-000000000001';
const MA = '22222222-2222-4222-8222-222222222222';
const MUMBAI = { name: 'Mumbai', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata' };

function row(overrides: Partial<BirthProfileRow> = {}): BirthProfileRow {
  return {
    id: MA,
    ownerUserId: OWNER,
    relationship: 'parent',
    displayName: 'Ma',
    gender: 'female',
    dateOfBirth: '1962-03-04',
    timeOfBirth: '06:15',
    placeOfBirth: MUMBAI,
    birthTimeAccuracy: 'approximate',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as unknown as BirthProfileRow;
}

/** Lets the fire-and-forget invalidation finish. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  state.before = row();
  state.updateOwnedBirthProfile.mockImplementation((_id: string, _o: string, patch: object) =>
    Promise.resolve(row(patch as Partial<BirthProfileRow>)),
  );
  state.deleteHoroscopesForProfile.mockResolvedValue(3);
  state.deleteHouseInsightsForUser.mockResolvedValue(undefined);
  state.deleteGemstoneForUser.mockResolvedValue(undefined);
  state.deleteRemedyInsightForUser.mockResolvedValue(undefined);
  state.requestKundliGeneration.mockResolvedValue(undefined);
});

describe('M16: editing a saved profile’s birth details invalidates what was built from them', () => {
  it.each([
    ['timeOfBirth', { timeOfBirth: '18:15' }],
    ['dateOfBirth', { dateOfBirth: '1962-03-05' }],
    ['placeOfBirth', { placeOfBirth: { ...MUMBAI, name: 'Pune', lat: 18.52, lon: 73.85 } }],
    ['birthTimeAccuracy', { birthTimeAccuracy: 'exact' }],
  ])(
    'a changed %s clears that profile’s horoscopes and readings and rebuilds its chart',
    async (_n, body) => {
      await updateBirthProfile(OWNER, MA, body as never);
      await settle();
      expect(state.deleteHoroscopesForProfile).toHaveBeenCalledWith(OWNER, MA);
      expect(state.deleteHouseInsightsForUser).toHaveBeenCalledWith(OWNER, MA);
      expect(state.deleteGemstoneForUser).toHaveBeenCalledWith(OWNER, MA);
      expect(state.deleteRemedyInsightForUser).toHaveBeenCalledWith(OWNER, MA);
      expect(state.requestKundliGeneration).toHaveBeenCalledWith(OWNER, MA);
    },
  );

  it('touches only that profile: never the owner’s own (null) profile', async () => {
    await updateBirthProfile(OWNER, MA, { timeOfBirth: '18:15' });
    await settle();
    for (const fn of [
      state.deleteHoroscopesForProfile,
      state.deleteHouseInsightsForUser,
      state.deleteGemstoneForUser,
      state.deleteRemedyInsightForUser,
      state.requestKundliGeneration,
    ]) {
      expect(fn.mock.calls.every((c) => c[1] === MA)).toBe(true);
    }
  });

  it('does nothing when a field is saved with the value it already has', async () => {
    await updateBirthProfile(OWNER, MA, {
      timeOfBirth: '06:15',
      placeOfBirth: { ...MUMBAI },
    });
    await settle();
    expect(state.deleteHoroscopesForProfile).not.toHaveBeenCalled();
    expect(state.requestKundliGeneration).not.toHaveBeenCalled();
  });

  it('does nothing for an edit that is not about birth details', async () => {
    await updateBirthProfile(OWNER, MA, { displayName: 'Mummy', notes: 'x' });
    await settle();
    expect(state.deleteHoroscopesForProfile).not.toHaveBeenCalled();
    expect(state.requestKundliGeneration).not.toHaveBeenCalled();
  });

  it('still saves the edit when the clean-up fails', async () => {
    state.deleteHoroscopesForProfile.mockRejectedValue(new Error('db down'));
    state.requestKundliGeneration.mockRejectedValue(new Error('engine down'));
    const saved = await updateBirthProfile(OWNER, MA, { timeOfBirth: '18:15' });
    await settle();
    expect(saved.timeOfBirth).toBe('18:15');
  });
});
