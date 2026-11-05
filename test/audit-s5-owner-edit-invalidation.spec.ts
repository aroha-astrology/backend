import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

// Audit Sprint 5, M16, account owner: PATCH /me already restarted the chart and cleared horoscopes
// after the rebuild. What it did not do: bought reports. Their text is frozen on the old chart while
// their numbers follow the new one, so once the chart is rebuilt they must be rebuilt (free) on open.

const state = vi.hoisted(() => ({
  findActiveUserById: vi.fn(),
  updateUserById: vi.fn(),
  requestKundliGeneration: vi.fn(),
  markReportsStaleForProfile: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});
vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  requestKundliGeneration: state.requestKundliGeneration,
}));
vi.mock('../src/modules/reports/reports.repo.js', () => ({
  markReportsStaleForProfile: state.markReportsStaleForProfile,
}));
vi.mock('../src/modules/users/users.repo.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  findActiveUserById: state.findActiveUserById,
  updateUserById: state.updateUserById,
  claimBirthDetailsEdit: vi.fn().mockResolvedValue(true),
  findUserByReferralCode: vi.fn(),
}));
vi.mock('../src/modules/kundli/house-insight.repo.js', () => ({
  deleteHouseInsightsForUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/modules/gemstone/gemstone.repo.js', () => ({
  deleteGemstoneForUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/modules/astro/remedy-insight.repo.js', () => ({
  deleteRemedyInsightForUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  deleteHoroscopesForProfile: vi.fn().mockResolvedValue(0),
}));

const { updateMe } = await import('../src/modules/users/users.service.js');

const DELHI = { name: 'Delhi', lat: 28.6, lon: 77.2, tz: 'Asia/Kolkata' };
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  vi.clearAllMocks();
  const user = makeUserRow({
    id: 'u1',
    displayName: 'Asha',
    gender: 'female',
    dateOfBirth: '1990-01-01',
    timeOfBirth: '06:30',
    placeOfBirth: DELHI,
    birthTimeAccuracy: 'exact',
    profileCompletedAt: new Date('2026-01-01T00:00:00Z'),
  });
  state.findActiveUserById.mockResolvedValue(user);
  state.updateUserById.mockImplementation((_id: string, patch: object) =>
    Promise.resolve({ ...user, ...patch }),
  );
  state.markReportsStaleForProfile.mockResolvedValue(3);
});

describe('M16: the account owner’s birth-detail edit marks their bought reports old', () => {
  it('after the chart has really been rebuilt', async () => {
    state.requestKundliGeneration.mockResolvedValue(true);
    await updateMe('u1', { timeOfBirth: '18:30' });
    await settle();
    expect(state.markReportsStaleForProfile).toHaveBeenCalledWith('u1', null);
  });

  it('not when the chart did not need rebuilding (same details saved again)', async () => {
    state.requestKundliGeneration.mockResolvedValue(false);
    await updateMe('u1', { timeOfBirth: '06:30' });
    await settle();
    expect(state.markReportsStaleForProfile).not.toHaveBeenCalled();
  });

  it('not for an edit that is not about the chart', async () => {
    await updateMe('u1', { displayName: 'Asha' });
    await settle();
    expect(state.requestKundliGeneration).not.toHaveBeenCalled();
    expect(state.markReportsStaleForProfile).not.toHaveBeenCalled();
  });
});
