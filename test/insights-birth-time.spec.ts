import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfileContext, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  resolveActiveProfileContext: vi.fn(),
  rectifyBirthTime: vi.fn(),
  findActivePass: vi.fn(),
  updateUserById: vi.fn(),
  findActiveUserById: vi.fn(),
  updateOwnedBirthProfile: vi.fn(),
  insertRectification: vi.fn(),
  findRectificationForUser: vi.fn(),
  markRectificationApplied: vi.fn(),
  findLatestRectification: vi.fn(),
  findLatestAppliedRectification: vi.fn(),
  requestKundliGeneration: vi.fn(),
}));

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: state.resolveActiveProfileContext,
}));
vi.mock('../src/lib/astro-engine/calculations/rectification.js', () => ({
  rectifyBirthTime: state.rectifyBirthTime,
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({ findActivePass: state.findActivePass }));
vi.mock('../src/modules/users/users.repo.js', () => ({
  updateUserById: state.updateUserById,
  findActiveUserById: state.findActiveUserById,
}));
vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  updateOwnedBirthProfile: state.updateOwnedBirthProfile,
}));
vi.mock('../src/modules/insights/birth-time.repo.js', () => ({
  insertRectification: state.insertRectification,
  findRectificationForUser: state.findRectificationForUser,
  markRectificationApplied: state.markRectificationApplied,
  findLatestRectification: state.findLatestRectification,
  findLatestAppliedRectification: state.findLatestAppliedRectification,
}));
vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  requestKundliGeneration: state.requestKundliGeneration,
  tzOffsetHours: () => 5.5,
}));
vi.mock('../src/modules/kundli/kundli.repo.js', () => ({ findKundliByUserId: vi.fn() }));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  applyBirthTimeCheck,
  getBirthTimeStatus,
  runBirthTimeCheck,
  searchWindowMinutes,
} from '../src/modules/insights/insights.service.js';

const user = makeUserRow({ id: 'user-1' });
const EVENTS = [
  { date: '2015-03-10', domain: 'marriage' as const },
  { date: '2018-07-22', domain: 'job_started' as const },
  { date: '2020-01-05', domain: 'childbirth' as const },
];
const RESULT = {
  best: { offsetMinutes: -8, time: '08:18', ascendantSign: 'Leo', matched: 3, score: 1 },
  eventMatches: EVENTS.map((e, i) => ({ ...e, strength: i === 0 ? 'weak' : 'strong' })),
  confidencePct: 78,
  candidates: [],
  confidence: 'high',
  reasoning: '3 of 3 events line up',
};

function rowFrom(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rect-1',
    userId: 'user-1',
    birthProfileId: null,
    statedTime: '08:26',
    suggestedTime: '08:18',
    detail: {
      events: EVENTS,
      eventMatches: RESULT.eventMatches,
      reasoning: RESULT.reasoning,
      offsetMinutes: -8,
    },
    confidence: 'high',
    confidencePct: 78,
    pricePaidPaise: 0,
    appliedAt: null,
    createdAt: new Date('2026-09-24T10:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset();
  state.resolveActiveProfileContext.mockResolvedValue(
    makeProfileContext({
      dateOfBirth: '1990-05-15',
      timeOfBirth: '08:26',
      birthTimeAccuracy: 'approximate',
      placeOfBirth: { name: 'Kolkata', lat: 22.57, lon: 88.36, tz: 'Asia/Kolkata' },
    }),
  );
  state.findActivePass.mockResolvedValue({ id: 'pass-1' });
  state.insertRectification.mockImplementation((v: Record<string, unknown>) =>
    Promise.resolve(rowFrom({ ...v, id: 'rect-1', appliedAt: null, createdAt: new Date() })),
  );
  state.requestKundliGeneration.mockResolvedValue(undefined);
});

describe('runBirthTimeCheck', () => {
  it('searches a window sized to how sure the user was, then stores the result', async () => {
    state.rectifyBirthTime.mockResolvedValue(RESULT);

    const dto = await runBirthTimeCheck(user, EVENTS);

    expect(state.rectifyBirthTime).toHaveBeenCalledWith(
      expect.objectContaining({ hour: 8, minute: 26, windowMinutes: 90, events: EVENTS }),
    );
    expect(state.insertRectification).toHaveBeenCalledWith(
      expect.objectContaining({ pricePaidPaise: 0 }),
    );
    expect(dto).toMatchObject({
      suggestedTime: '08:18',
      confidencePct: 78,
      counts: { strong: 2, weak: 1, none: 0 },
      canApply: true,
    });
  });

  it('says so when there is not enough evidence', async () => {
    state.rectifyBirthTime.mockResolvedValue(null);
    await expect(runBirthTimeCheck(user, EVENTS)).rejects.toMatchObject({ status: 422 });
    expect(state.insertRectification).not.toHaveBeenCalled();
  });

  it('is Aroha Pass only', async () => {
    state.findActivePass.mockResolvedValue(null);
    await expect(runBirthTimeCheck(user, EVENTS)).rejects.toThrow('PASS_REQUIRED');
    expect(state.rectifyBirthTime).not.toHaveBeenCalled();
  });
});

describe('searchWindowMinutes', () => {
  it('widens with uncertainty', () => {
    expect([
      searchWindowMinutes('exact'),
      searchWindowMinutes('approximate'),
      searchWindowMinutes('unknown'),
    ]).toEqual([60, 90, 180]);
  });
});

describe('applyBirthTimeCheck', () => {
  it("moves the primary profile's time, marks it rectified, and rebuilds the kundli", async () => {
    state.findRectificationForUser.mockResolvedValue(rowFrom());
    state.findActiveUserById.mockResolvedValue(user);
    state.markRectificationApplied.mockResolvedValue(true);

    await applyBirthTimeCheck(user, 'rect-1');

    expect(state.updateUserById).toHaveBeenCalledWith('user-1', {
      timeOfBirth: '08:18',
      birthTimeAccuracy: 'exact',
      birthTimeSource: 'rectified',
      birthTimeRectified: true,
      birthTimeRectificationConfidence: 'high',
    });
    // The one-time birth-detail edit is not touched.
    expect(state.updateUserById.mock.calls[0]![1]).not.toHaveProperty('birthDetailsEditedAt');
    expect(state.requestKundliGeneration).toHaveBeenCalledWith('user-1', null);
  });

  it('updates an additional profile through its own repo', async () => {
    state.findRectificationForUser.mockResolvedValue(
      rowFrom({ birthProfileId: 'profile-2', confidence: 'medium', confidencePct: 60 }),
    );
    state.updateOwnedBirthProfile.mockResolvedValue({ id: 'profile-2' });
    state.markRectificationApplied.mockResolvedValue(true);

    await applyBirthTimeCheck(user, 'rect-1');

    expect(state.updateOwnedBirthProfile).toHaveBeenCalledWith('profile-2', 'user-1', {
      timeOfBirth: '08:18',
      birthTimeAccuracy: 'approximate',
      birthTimeSource: 'rectified',
    });
    expect(state.requestKundliGeneration).toHaveBeenCalledWith('user-1', 'profile-2');
  });

  it('is Aroha Pass only', async () => {
    state.findActivePass.mockResolvedValue(null);
    await expect(applyBirthTimeCheck(user, 'rect-1')).rejects.toThrow('PASS_REQUIRED');
    expect(state.findRectificationForUser).not.toHaveBeenCalled();
  });

  it('refuses low-confidence checks and checks already applied', async () => {
    state.findRectificationForUser.mockResolvedValue(
      rowFrom({ confidence: 'low', confidencePct: 30 }),
    );
    await expect(applyBirthTimeCheck(user, 'rect-1')).rejects.toMatchObject({ status: 409 });

    state.findRectificationForUser.mockResolvedValue(rowFrom({ appliedAt: new Date() }));
    await expect(applyBirthTimeCheck(user, 'rect-1')).rejects.toMatchObject({ status: 409 });
    expect(state.updateUserById).not.toHaveBeenCalled();
  });
});

describe('getBirthTimeStatus', () => {
  it('uses the applied check as the confidence once the time is rectified', async () => {
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({
        timeOfBirth: '08:18',
        birthTimeAccuracy: 'exact',
        birthTimeSource: 'rectified',
      }),
    );
    state.findLatestRectification.mockResolvedValue(rowFrom({ appliedAt: new Date() }));
    state.findLatestAppliedRectification.mockResolvedValue(rowFrom({ appliedAt: new Date() }));

    const status = await getBirthTimeStatus(user);

    expect(status.confidence).toEqual({ pct: 78, level: 'high', basis: 'rectified' });
    expect(status.latest?.canApply).toBe(false);
  });

  it('is Aroha Pass only', async () => {
    state.findActivePass.mockResolvedValue(null);
    await expect(getBirthTimeStatus(user)).rejects.toThrow('PASS_REQUIRED');
  });
});
