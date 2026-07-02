import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  getKundliForUser: vi.fn(),
  missingKundliParams: vi.fn(),
  birthInputsForUser: vi.fn(),
  requestKundliGeneration: vi.fn(),
  regenerateKundli: vi.fn(),
  isStaleGenerating: vi.fn(),
  toKundliDto: vi.fn(),
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

vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  getKundliForUser: state.getKundliForUser,
  missingKundliParams: state.missingKundliParams,
  birthInputsForUser: state.birthInputsForUser,
  requestKundliGeneration: state.requestKundliGeneration,
  regenerateKundli: state.regenerateKundli,
  isStaleGenerating: state.isStaleGenerating,
  toKundliDto: state.toKundliDto,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token' } as const;

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.getKundliForUser.mockReset();
  state.missingKundliParams.mockReset().mockReturnValue([]); // complete by default
  state.birthInputsForUser.mockReset().mockReturnValue({ birthHash: 'h-current' });
  state.requestKundliGeneration.mockReset().mockResolvedValue(undefined);
  state.regenerateKundli.mockReset();
  state.isStaleGenerating.mockReset().mockReturnValue(false);
  state.toKundliDto.mockReset();
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
    expect(state.requestKundliGeneration).toHaveBeenCalledWith('id-1');
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
    expect(state.requestKundliGeneration).toHaveBeenCalledWith('id-1');
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
    expect(state.requestKundliGeneration).toHaveBeenCalledWith('id-1');
  });

  it('does NOT re-fire a recently-failed generation (cooldown)', async () => {
    state.getKundliForUser.mockResolvedValueOnce({ status: 'failed', updatedAt: new Date() });

    const res = await createApp().request('/v1/kundli', { headers: AUTH });
    expect(res.status).toBe(202);
    expect(state.requestKundliGeneration).not.toHaveBeenCalled();
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
