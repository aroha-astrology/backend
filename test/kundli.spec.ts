import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BirthProfileRow } from '../src/db/schema.js';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  findOwnedBirthProfile: vi.fn(),
  getKundliForUser: vi.fn(),
  missingKundliParams: vi.fn(),
  birthInputsForProfile: vi.fn(),
  requestKundliGeneration: vi.fn(),
  regenerateKundli: vi.fn(),
  isStaleGenerating: vi.fn(),
  toKundliDto: vi.fn(),
  findHouseInsight: vi.fn(),
  toHouseInsightDtoForLanguage: vi.fn(),
  requestHouseInsightGeneration: vi.fn(),
  isHouseInsightStale: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: state.verifyIdToken })),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findUserByFirebaseUid: state.findUserByFirebaseUid,
  findActiveUserByFirebaseUid: vi.fn(),
  findActiveUserById: vi.fn(),
  findUserByPhoneE164: vi.fn(),
  insertUser: vi.fn(),
  updateUserById: vi.fn(),
  updateUserWithConsentLog: vi.fn(),
  softDeleteUserById: vi.fn(),
  softDeleteBirthProfilesByOwner: vi.fn(),
  revokeDeviceTokensByUser: vi.fn(),
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  findOwnedBirthProfile: state.findOwnedBirthProfile,
}));

vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  getKundliForUser: state.getKundliForUser,
  missingKundliParams: state.missingKundliParams,
  birthInputsForProfile: state.birthInputsForProfile,
  requestKundliGeneration: state.requestKundliGeneration,
  regenerateKundli: state.regenerateKundli,
  isStaleGenerating: state.isStaleGenerating,
  toKundliDto: state.toKundliDto,
  findHouseInsight: state.findHouseInsight,
  toHouseInsightDtoForLanguage: state.toHouseInsightDtoForLanguage,
  requestHouseInsightGeneration: state.requestHouseInsightGeneration,
  isHouseInsightStale: state.isHouseInsightStale,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token' } as const;

function makeBirthProfileRow(overrides: Partial<BirthProfileRow> = {}): BirthProfileRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'profile-a',
    ownerUserId: 'id-1',
    relationship: 'partner',
    displayName: 'Bob',
    gender: 'male',
    dateOfBirth: '1990-05-10',
    timeOfBirth: '08:15:00',
    placeOfBirth: { name: 'Delhi', lat: 28.6, lon: 77.2, tz: 'Asia/Kolkata' },
    birthTimeAccuracy: 'exact',
    birthTimeSource: 'birth_certificate',
    birthLocationAccuracy: 'exact',
    gotra: null,
    addedWithConsent: true,
    notes: null,
    unlockedHouses: [3],
    gemstoneUnlockedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.findOwnedBirthProfile.mockReset();
  state.getKundliForUser.mockReset();
  state.missingKundliParams.mockReset().mockReturnValue([]); // complete by default
  state.birthInputsForProfile.mockReset().mockReturnValue({ birthHash: 'h-current' });
  state.requestKundliGeneration.mockReset().mockResolvedValue(undefined);
  state.regenerateKundli.mockReset();
  state.isStaleGenerating.mockReset().mockReturnValue(false);
  state.toKundliDto.mockReset();
  state.findHouseInsight.mockReset();
  state.toHouseInsightDtoForLanguage.mockReset();
  state.requestHouseInsightGeneration.mockReset().mockResolvedValue('generated');
  state.isHouseInsightStale.mockReset().mockReturnValue(false);
});

describe('GET /v1/kundli', () => {
  it('returns 200 with the kundli when ready and up to date', async () => {
    state.getKundliForUser.mockResolvedValueOnce({
      status: 'ready',
      id: 'k1',
      birthHash: 'h-current',
    });
    state.toKundliDto.mockReturnValueOnce({ status: 'ready', id: 'k1', timeKnown: true });

    const res = await createApp().request('/v1/kundli', { headers: AUTH });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('ready');
  });

  it('self-heals a stale ready kundli (birth data changed) with 202 + regen', async () => {
    state.getKundliForUser.mockResolvedValueOnce({ status: 'ready', id: 'k1', birthHash: 'h-OLD' });

    const res = await createApp().request('/v1/kundli', { headers: AUTH });
    expect(res.status).toBe(202);
    expect(state.requestKundliGeneration).toHaveBeenCalledWith('id-1', null);
  });

  it('returns 202 (WIP) while generation is in progress', async () => {
    state.getKundliForUser.mockResolvedValueOnce({ status: 'generating', startedAt: new Date() });

    const res = await createApp().request('/v1/kundli', { headers: AUTH });
    expect(res.status).toBe(202);
    expect(((await res.json()) as { status: string }).status).toBe('generating');
    expect(state.requestKundliGeneration).not.toHaveBeenCalled();
  });

  it('self-heals: 202 and triggers generation when none exists yet', async () => {
    state.getKundliForUser.mockResolvedValueOnce(undefined);

    const res = await createApp().request('/v1/kundli', { headers: AUTH });
    expect(res.status).toBe(202);
    expect(state.requestKundliGeneration).toHaveBeenCalledWith('id-1', null);
  });

  it('returns 422 with the missing parameters when birth data is incomplete', async () => {
    state.missingKundliParams.mockReturnValueOnce(['timeOfBirth', 'placeOfBirth']);

    const res = await createApp().request('/v1/kundli', { headers: AUTH });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { status: string; missing: string[] };
    expect(body.status).toBe('missing_parameters');
    expect(body.missing).toEqual(['timeOfBirth', 'placeOfBirth']);
    expect(state.requestKundliGeneration).not.toHaveBeenCalled();
  });

  it('retriggers a failed generation (past cooldown) and reports its status as 202', async () => {
    state.getKundliForUser.mockResolvedValueOnce({ status: 'failed', updatedAt: new Date(0) });

    const res = await createApp().request('/v1/kundli', { headers: AUTH });
    expect(res.status).toBe(202);
    expect(((await res.json()) as { status: string }).status).toBe('failed');
    expect(state.requestKundliGeneration).toHaveBeenCalledWith('id-1', null);
  });

  it('does NOT re-fire a recently-failed generation (cooldown)', async () => {
    state.getKundliForUser.mockResolvedValueOnce({ status: 'failed', updatedAt: new Date() });

    const res = await createApp().request('/v1/kundli', { headers: AUTH });
    expect(res.status).toBe(202);
    expect(state.requestKundliGeneration).not.toHaveBeenCalled();
  });
});

describe('GET /v1/kundli — additional (non-primary) profile', () => {
  beforeEach(() => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', activeProfileId: 'profile-a' }),
    );
    state.findOwnedBirthProfile.mockResolvedValue(makeBirthProfileRow());
  });

  it('resolves the active additional profile and feeds its birth data to missingKundliParams/birthInputsForProfile, threading its birthProfileId through getKundliForUser', async () => {
    state.getKundliForUser.mockResolvedValueOnce({
      status: 'ready',
      id: 'k1',
      birthHash: 'h-current',
    });
    state.toKundliDto.mockReturnValueOnce({ status: 'ready', id: 'k1', timeKnown: true });

    const res = await createApp().request('/v1/kundli', { headers: AUTH });

    expect(res.status).toBe(200);
    expect(state.findOwnedBirthProfile).toHaveBeenCalledWith('profile-a', 'id-1');
    const expectedProfile = expect.objectContaining({
      birthProfileId: 'profile-a',
      displayName: 'Bob',
      dateOfBirth: '1990-05-10',
    });
    expect(state.missingKundliParams).toHaveBeenCalledWith(expectedProfile);
    expect(state.birthInputsForProfile).toHaveBeenCalledWith(
      expectedProfile,
      expect.objectContaining({ id: 'id-1' }),
    );
    expect(state.getKundliForUser).toHaveBeenCalledWith('id-1', 'profile-a');
  });

  it('fires generation scoped to the additional profile’s birthProfileId when no kundli exists yet', async () => {
    state.getKundliForUser.mockResolvedValueOnce(undefined);

    const res = await createApp().request('/v1/kundli', { headers: AUTH });

    expect(res.status).toBe(202);
    expect(state.requestKundliGeneration).toHaveBeenCalledWith('id-1', 'profile-a');
  });
});

describe('POST /v1/kundli/regenerate', () => {
  it('regenerates synchronously and returns 200 with the kundli', async () => {
    state.regenerateKundli.mockResolvedValueOnce({ ok: true, row: { status: 'ready', id: 'k1' } });
    state.toKundliDto.mockReturnValueOnce({ status: 'ready', id: 'k1', timeKnown: true });

    const res = await createApp().request('/v1/kundli/regenerate', {
      method: 'POST',
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('ready');
    expect(state.regenerateKundli).toHaveBeenCalledWith('id-1', null);
  });

  it('returns 422 with missing parameters when incomplete', async () => {
    state.regenerateKundli.mockResolvedValueOnce({ ok: false, missing: ['timeOfBirth'] });

    const res = await createApp().request('/v1/kundli/regenerate', {
      method: 'POST',
      headers: AUTH,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { status: string; missing: string[] };
    expect(body.status).toBe('missing_parameters');
    expect(body.missing).toEqual(['timeOfBirth']);
  });
});

describe('GET /v1/kundli/houses/:house/insight', () => {
  beforeEach(() => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', unlockedHouses: [2] }),
    );
    state.getKundliForUser.mockResolvedValue({ status: 'ready', id: 'k1' });
  });

  it('returns 403 when the house is not unlocked', async () => {
    const res = await createApp().request('/v1/kundli/houses/5/insight', { headers: AUTH });
    expect(res.status).toBe(403);
    expect(state.findHouseInsight).not.toHaveBeenCalled();
  });

  it('defaults to English and returns the dto as-is when no language is requested', async () => {
    state.findHouseInsight.mockResolvedValueOnce({ status: 'ready' });
    state.toHouseInsightDtoForLanguage.mockResolvedValueOnce({
      status: 'ready',
      text: 'You value stability.',
      strengths: [],
      weaknesses: [],
    });

    const res = await createApp().request('/v1/kundli/houses/2/insight', { headers: AUTH });

    expect(res.status).toBe(200);
    expect(state.toHouseInsightDtoForLanguage).toHaveBeenCalledWith({ status: 'ready' }, 'en');
  });

  it('passes the ?language query param through to the language-aware dto builder', async () => {
    state.findHouseInsight.mockResolvedValueOnce({ status: 'ready' });
    state.toHouseInsightDtoForLanguage.mockResolvedValueOnce({
      status: 'ready',
      text: 'आप स्थिरता को महत्व देते हैं।',
      strengths: [],
      weaknesses: [],
    });

    const res = await createApp().request('/v1/kundli/houses/2/insight?language=hi', {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect(state.toHouseInsightDtoForLanguage).toHaveBeenCalledWith({ status: 'ready' }, 'hi');
    const body = (await res.json()) as { text: string };
    expect(body.text).toBe('आप स्थिरता को महत्व देते हैं।');
  });

  it('returns 202 and fires generation on a cache miss, ignoring language', async () => {
    state.findHouseInsight.mockResolvedValueOnce(undefined);

    const res = await createApp().request('/v1/kundli/houses/2/insight?language=hi', {
      headers: AUTH,
    });

    expect(res.status).toBe(202);
    expect(state.requestHouseInsightGeneration).toHaveBeenCalledWith('id-1', 2, {
      status: 'ready',
      id: 'k1',
    });
    expect(state.toHouseInsightDtoForLanguage).not.toHaveBeenCalled();
  });
});

describe('GET /v1/kundli/houses/:house/insight — additional (non-primary) profile', () => {
  beforeEach(() => {
    // House 9 is unlocked on the PRIMARY users row but the active profile is
    // the additional one — if the route accidentally read user.unlockedHouses
    // instead of the resolved profile's, house 9 would wrongly succeed and
    // house 3 (unlocked only on the additional profile) would wrongly 403.
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({
        id: 'id-1',
        firebaseUid: 'uid-1',
        activeProfileId: 'profile-a',
        unlockedHouses: [9],
      }),
    );
    state.findOwnedBirthProfile.mockResolvedValue(makeBirthProfileRow({ unlockedHouses: [3] }));
    state.getKundliForUser.mockResolvedValue({
      status: 'ready',
      id: 'k1',
      birthProfileId: 'profile-a',
    });
  });

  it('gates on the resolved additional profile’s unlockedHouses (birth_profiles), not the primary users row', async () => {
    const res9 = await createApp().request('/v1/kundli/houses/9/insight', { headers: AUTH });
    expect(res9.status).toBe(403);

    state.findHouseInsight.mockResolvedValueOnce({ status: 'ready' });
    state.toHouseInsightDtoForLanguage.mockResolvedValueOnce({
      status: 'ready',
      text: 't',
      strengths: [],
      weaknesses: [],
    });
    const res3 = await createApp().request('/v1/kundli/houses/3/insight', { headers: AUTH });
    expect(res3.status).toBe(200);
  });

  it('threads the resolved profile’s birthProfileId through getKundliForUser/findHouseInsight/generation', async () => {
    state.findHouseInsight.mockResolvedValueOnce(undefined);

    const res = await createApp().request('/v1/kundli/houses/3/insight', { headers: AUTH });

    expect(res.status).toBe(202);
    expect(state.getKundliForUser).toHaveBeenCalledWith('id-1', 'profile-a');
    expect(state.findHouseInsight).toHaveBeenCalledWith('id-1', 'profile-a', 3);
    expect(state.requestHouseInsightGeneration).toHaveBeenCalledWith('id-1', 3, {
      status: 'ready',
      id: 'k1',
      birthProfileId: 'profile-a',
    });
  });
});
