import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  findActiveUserById: vi.fn(),
  updateUserById: vi.fn(),
  updateUserWithConsentLog: vi.fn(),
  anonymizeUserById: vi.fn(),
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

vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  requestKundliGeneration: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findUserByFirebaseUid: state.findUserByFirebaseUid,
  findUserByPhoneE164: vi.fn(),
  findActiveUserByFirebaseUid: vi.fn(),
  findActiveUserById: state.findActiveUserById,
  insertUser: vi.fn(),
  updateUserById: state.updateUserById,
  updateUserWithConsentLog: state.updateUserWithConsentLog,
  anonymizeUserById: state.anonymizeUserById,
  softDeleteBirthProfilesByOwner: vi.fn().mockResolvedValue(undefined),
  revokeDeviceTokensByUser: vi.fn().mockResolvedValue(undefined),
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token', 'Content-Type': 'application/json' } as const;

describe('GET /v1/me', () => {
  beforeEach(() => {
    state.verifyIdToken.mockReset();
    state.findUserByFirebaseUid.mockReset();
    state.findActiveUserById.mockReset();
    state.updateUserById.mockReset();
    state.anonymizeUserById.mockReset();
  });

  it('returns the current user profile', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', displayName: 'Alice' }),
    );

    const app = createApp();
    const res = await app.request('/v1/me', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; displayName: string | null };
    expect(body.id).toBe('id-1');
    expect(body.displayName).toBe('Alice');
  });

  it('returns 401 when no user row exists for the token', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-missing'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);

    const app = createApp();
    const res = await app.request('/v1/me', { headers: AUTH });
    expect(res.status).toBe(401);
  });

  it('returns 401 for soft-deleted users', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-gone'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-gone', firebaseUid: 'uid-gone', deletedAt: new Date() }),
    );

    const app = createApp();
    const res = await app.request('/v1/me', { headers: AUTH });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /v1/me', () => {
  beforeEach(() => {
    state.verifyIdToken.mockReset();
    state.findUserByFirebaseUid.mockReset();
    state.findActiveUserById.mockReset();
    state.updateUserById.mockReset();
    state.updateUserWithConsentLog.mockReset();
  });

  it('updates the profile and stamps profileCompletedAt when all fields are present', async () => {
    const user = makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' });
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(user);
    state.findActiveUserById.mockResolvedValueOnce(user);

    const filled = makeUserRow({
      id: 'id-1',
      firebaseUid: 'uid-1',
      displayName: 'Alice',
      gender: 'female',
      dateOfBirth: '1995-04-12',
      timeOfBirth: '06:30:00',
      placeOfBirth: { name: 'Mumbai', lat: 19, lon: 72, tz: 'Asia/Kolkata' },
    });
    state.updateUserById.mockResolvedValueOnce(filled);
    const finalized = makeUserRow({ ...filled, profileCompletedAt: new Date() });
    state.updateUserById.mockResolvedValueOnce(finalized);

    const app = createApp();
    const res = await app.request('/v1/me', {
      method: 'PATCH',
      headers: AUTH,
      body: JSON.stringify({
        displayName: 'Alice',
        gender: 'female',
        dateOfBirth: '1995-04-12',
        timeOfBirth: '06:30:00',
        placeOfBirth: { name: 'Mumbai', lat: 19, lon: 72, tz: 'Asia/Kolkata' },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profileCompletedAt: string | null };
    expect(body.profileCompletedAt).not.toBeNull();
    expect(state.updateUserById).toHaveBeenCalledTimes(2);
  });

  it('completes the profile with unknown birth time (no timeOfBirth required)', async () => {
    const user = makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' });
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(user);
    state.findActiveUserById.mockResolvedValueOnce(user);

    // Core fields present, time genuinely unknown, time column stays null.
    const filled = makeUserRow({
      id: 'id-1',
      firebaseUid: 'uid-1',
      displayName: 'Bina',
      gender: 'female',
      dateOfBirth: '1990-01-01',
      timeOfBirth: null,
      birthTimeAccuracy: 'unknown',
      placeOfBirth: { name: 'Delhi', lat: 28.6, lon: 77.2, tz: 'Asia/Kolkata' },
    });
    state.updateUserById.mockResolvedValueOnce(filled);
    state.updateUserById.mockResolvedValueOnce(
      makeUserRow({ ...filled, profileCompletedAt: new Date() }),
    );

    const app = createApp();
    const res = await app.request('/v1/me', {
      method: 'PATCH',
      headers: AUTH,
      body: JSON.stringify({
        displayName: 'Bina',
        gender: 'female',
        dateOfBirth: '1990-01-01',
        birthTimeAccuracy: 'unknown',
        placeOfBirth: { name: 'Delhi', lat: 28.6, lon: 77.2, tz: 'Asia/Kolkata' },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profileCompletedAt: string | null };
    expect(body.profileCompletedAt).not.toBeNull();
  });

  it('does NOT complete when birth time is approximate but missing', async () => {
    const user = makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' });
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(user);
    state.findActiveUserById.mockResolvedValueOnce(user);

    const filled = makeUserRow({
      id: 'id-1',
      firebaseUid: 'uid-1',
      displayName: 'Bina',
      gender: 'female',
      dateOfBirth: '1990-01-01',
      timeOfBirth: null,
      birthTimeAccuracy: 'approximate',
      placeOfBirth: { name: 'Delhi', lat: 28.6, lon: 77.2, tz: 'Asia/Kolkata' },
    });
    state.updateUserById.mockResolvedValueOnce(filled);

    const app = createApp();
    const res = await app.request('/v1/me', {
      method: 'PATCH',
      headers: AUTH,
      body: JSON.stringify({ birthTimeAccuracy: 'approximate' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profileCompletedAt: string | null };
    expect(body.profileCompletedAt).toBeNull();
    // No second (finalizing) write happened.
    expect(state.updateUserById).toHaveBeenCalledTimes(1);
  });

  it('records consent transactionally and exposes the active flag', async () => {
    const user = makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' });
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(user);
    state.findActiveUserById.mockResolvedValueOnce(user);
    state.updateUserWithConsentLog.mockResolvedValueOnce(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', marketingConsentAt: new Date() }),
    );

    const app = createApp();
    const res = await app.request('/v1/me', {
      method: 'PATCH',
      headers: AUTH,
      body: JSON.stringify({ consent: { marketing: true } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { marketingConsentActive: boolean };
    expect(body.marketingConsentActive).toBe(true);
    expect(state.updateUserWithConsentLog).toHaveBeenCalledTimes(1);
    expect(state.updateUserById).not.toHaveBeenCalled();
  });

  it('rejects unknown fields with 422', async () => {
    const user = makeUserRow();
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(user);

    const app = createApp();
    const res = await app.request('/v1/me', {
      method: 'PATCH',
      headers: AUTH,
      body: JSON.stringify({ favoriteColor: 'blue' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed dateOfBirth', async () => {
    const user = makeUserRow();
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(user);

    const app = createApp();
    const res = await app.request('/v1/me', {
      method: 'PATCH',
      headers: AUTH,
      body: JSON.stringify({ dateOfBirth: 'not-a-date' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /v1/me', () => {
  beforeEach(() => {
    state.verifyIdToken.mockReset();
    state.findUserByFirebaseUid.mockReset();
    state.findActiveUserById.mockReset();
    state.anonymizeUserById.mockReset();
  });

  it('erases the user (anonymize, not just soft-delete)', async () => {
    const user = makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' });
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(user);
    state.findActiveUserById.mockResolvedValueOnce(user);
    state.anonymizeUserById.mockResolvedValueOnce(undefined);

    const app = createApp();
    const res = await app.request('/v1/me', { method: 'DELETE', headers: AUTH });
    expect(res.status).toBe(204);
    expect(state.anonymizeUserById).toHaveBeenCalledWith('id-1');
  });
});
