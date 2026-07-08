import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  insertUser: vi.fn(),
  updateUserById: vi.fn(),
  notifyNewSignup: vi.fn(),
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifyNewSignup: state.notifyNewSignup,
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
  findUserByPhoneE164: vi.fn(),
  findActiveUserByFirebaseUid: vi.fn(),
  findActiveUserById: vi.fn(),
  insertUser: state.insertUser,
  updateUserById: state.updateUserById,
  updateUserWithConsentLog: vi.fn(),
  softDeleteUserById: vi.fn(),
}));

const { createApp } = await import('../src/app.js');

describe('POST /v1/auth/session', () => {
  beforeEach(() => {
    state.verifyIdToken.mockReset();
    state.findUserByFirebaseUid.mockReset();
    state.insertUser.mockReset();
    state.updateUserById.mockReset();
    state.notifyNewSignup.mockReset().mockResolvedValue(true);
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const app = createApp();
    const res = await app.request('/v1/auth/session', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is invalid', async () => {
    state.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    const app = createApp();
    const res = await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer bad-token' },
    });
    expect(res.status).toBe(401);
  });

  it('creates a new user (201) when no row exists for the firebase uid', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-new', '+911111111111'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
    state.insertUser.mockResolvedValueOnce(
      makeUserRow({ id: 'id-new', firebaseUid: 'uid-new', phoneE164: '+911111111111' }),
    );

    const app = createApp();
    const res = await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { firebaseUid: string }; created: boolean };
    expect(body.created).toBe(true);
    expect(body.user.firebaseUid).toBe('uid-new');
    expect(state.insertUser).toHaveBeenCalledWith({
      firebaseUid: 'uid-new',
      phoneE164: '+911111111111',
    });
    // Notification fires without awaiting, but in vitest it'll synchronously trigger the mock call
    expect(state.notifyNewSignup).toHaveBeenCalledWith({
      id: 'id-new',
      email: null,
      phone: '+911111111111',
    });
  });

  it('returns the existing user (200) when one already exists', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-existing'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-existing', firebaseUid: 'uid-existing' }),
    );

    const app = createApp();
    const res = await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string }; created: boolean };
    expect(body.created).toBe(false);
    expect(body.user.id).toBe('id-existing');
    expect(state.insertUser).not.toHaveBeenCalled();
    expect(state.notifyNewSignup).not.toHaveBeenCalled();
  });

  it('resurrects a soft-deleted user on re-sign-in', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-deleted'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-deleted', firebaseUid: 'uid-deleted', deletedAt: new Date() }),
    );
    state.updateUserById.mockResolvedValueOnce(
      makeUserRow({ id: 'id-deleted', firebaseUid: 'uid-deleted', deletedAt: null }),
    );

    const app = createApp();
    const res = await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(200);
    expect(state.updateUserById).toHaveBeenCalledWith('id-deleted', { deletedAt: null });
  });
});
