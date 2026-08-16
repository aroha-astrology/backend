import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

// Route-level coverage for /v1/admin/deletion-requests, same convention as
// test/admin-routes.spec.ts — only the DB boundary (users.repo.js/
// users.service.js/admin.repo.js) is mocked, admin.service.ts runs for real.
const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
  findActiveUserById: vi.fn(),
  listPendingDeletionRequestsBefore: vi.fn(),
  clearDeletionRequest: vi.fn(),
  hardDeleteUserById: vi.fn(),
  requestAccountDeletion: vi.fn(),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

const fakeEnv = vi.hoisted(() => ({
  ADMIN_PHONE_E164: ['+919999111111'],
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: [],
  TELEGRAM_ADMIN_CHAT_IDS: [],
  TELEGRAM_READONLY_CHAT_IDS: [],
}));

vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: state.verifyIdToken })),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/modules/users/users.repo.js', () => ({
  findUserByFirebaseUid: state.findUserByFirebaseUid,
  touchUserLastActive: state.touchUserLastActive,
  findActiveUserById: state.findActiveUserById,
  listPendingDeletionRequestsBefore: state.listPendingDeletionRequestsBefore,
  clearDeletionRequest: state.clearDeletionRequest,
  hardDeleteUserById: state.hardDeleteUserById,
}));

vi.mock('../src/modules/users/users.service.js', () => ({
  requestAccountDeletion: state.requestAccountDeletion,
}));

vi.mock('../src/modules/admin/admin.repo.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, logAdminAction: state.logAdminAction };
});

const { createApp } = await import('../src/app.js');

const ADMIN_PHONE = '+919999111111';
const NON_ADMIN_PHONE = '+911111111111';
const USER_ID = '00000000-0000-0000-0000-0000000000aa';

function authHeader() {
  return { Authorization: 'Bearer good-token' };
}

function signInAs(phone: string) {
  state.verifyIdToken.mockResolvedValue(makeDecodedToken('uid-1', phone));
  state.findUserByFirebaseUid.mockResolvedValue(
    makeUserRow({ id: 'user-1', firebaseUid: 'uid-1', phoneE164: phone }),
  );
}

beforeEach(() => {
  for (const fn of Object.values(state)) {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as any).mockReset();
  }
  state.touchUserLastActive.mockResolvedValue(undefined);
  state.logAdminAction.mockResolvedValue(undefined);
});

describe('GET /v1/admin/deletion-requests', () => {
  it('returns 200 with the pending queue, oldest first', async () => {
    signInAs(ADMIN_PHONE);
    state.listPendingDeletionRequestsBefore.mockResolvedValue([
      makeUserRow({
        id: USER_ID,
        displayName: 'Asha',
        phoneE164: '+919999999999',
        deletionRequestedAt: new Date('2026-08-01T00:00:00Z'),
      }),
    ]);
    const app = createApp();

    const res = await app.request('/v1/admin/deletion-requests', { headers: authHeader() });
    const body = (await res.json()) as { requests: { id: string; deletionRequestedAt: string }[] };

    expect(res.status).toBe(200);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0]).toMatchObject({
      id: USER_ID,
      deletionRequestedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/deletion-requests'),
      expect.anything(),
    );
  });

  it('returns 403 for a non-admin phone', async () => {
    signInAs(NON_ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/admin/deletion-requests', { headers: authHeader() });

    expect(res.status).toBe(403);
  });
});

describe('POST /v1/admin/deletion-requests/:id', () => {
  it('flags a user for deletion and returns the request timestamp', async () => {
    signInAs(ADMIN_PHONE);
    const requestedAt = new Date('2026-08-16T00:00:00Z');
    state.requestAccountDeletion.mockResolvedValue(requestedAt);
    const app = createApp();

    const res = await app.request(`/v1/admin/deletion-requests/${USER_ID}`, {
      method: 'POST',
      headers: authHeader(),
    });
    const body = (await res.json()) as { id: string; deletionRequestedAt: string };

    expect(res.status).toBe(200);
    expect(state.requestAccountDeletion).toHaveBeenCalledWith(USER_ID);
    expect(body).toEqual({ id: USER_ID, deletionRequestedAt: '2026-08-16T00:00:00.000Z' });
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining(`/v1/admin/deletion-requests/${USER_ID}`),
      expect.anything(),
    );
  });
});

describe('PATCH /v1/admin/deletion-requests/:id/reject', () => {
  it('clears the request and returns a null timestamp', async () => {
    signInAs(ADMIN_PHONE);
    state.findActiveUserById.mockResolvedValue(makeUserRow({ id: USER_ID }));
    const app = createApp();

    const res = await app.request(`/v1/admin/deletion-requests/${USER_ID}/reject`, {
      method: 'PATCH',
      headers: authHeader(),
    });
    const body = (await res.json()) as { id: string; deletionRequestedAt: string | null };

    expect(res.status).toBe(200);
    expect(state.clearDeletionRequest).toHaveBeenCalledWith(USER_ID);
    expect(body).toEqual({ id: USER_ID, deletionRequestedAt: null });
  });

  it('returns 404 for an unknown user', async () => {
    signInAs(ADMIN_PHONE);
    state.findActiveUserById.mockResolvedValue(undefined);
    const app = createApp();

    const res = await app.request(`/v1/admin/deletion-requests/${USER_ID}/reject`, {
      method: 'PATCH',
      headers: authHeader(),
    });

    expect(res.status).toBe(404);
    expect(state.clearDeletionRequest).not.toHaveBeenCalled();
  });
});

describe('DELETE /v1/admin/deletion-requests/:id', () => {
  it('hard-deletes the user and audit-logs their phone number', async () => {
    signInAs(ADMIN_PHONE);
    state.findActiveUserById.mockResolvedValue(
      makeUserRow({ id: USER_ID, phoneE164: '+919876543210' }),
    );
    const app = createApp();

    const res = await app.request(`/v1/admin/deletion-requests/${USER_ID}`, {
      method: 'DELETE',
      headers: authHeader(),
    });
    const body = (await res.json()) as { id: string };

    expect(res.status).toBe(200);
    expect(state.hardDeleteUserById).toHaveBeenCalledWith(USER_ID);
    expect(body).toEqual({ id: USER_ID });
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining(`/v1/admin/deletion-requests/${USER_ID}`),
      expect.objectContaining({ phoneE164: '+919876543210' }),
    );
  });

  it('returns 404 for an unknown user and never deletes', async () => {
    signInAs(ADMIN_PHONE);
    state.findActiveUserById.mockResolvedValue(undefined);
    const app = createApp();

    const res = await app.request(`/v1/admin/deletion-requests/${USER_ID}`, {
      method: 'DELETE',
      headers: authHeader(),
    });

    expect(res.status).toBe(404);
    expect(state.hardDeleteUserById).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin phone', async () => {
    signInAs(NON_ADMIN_PHONE);
    const app = createApp();

    const res = await app.request(`/v1/admin/deletion-requests/${USER_ID}`, {
      method: 'DELETE',
      headers: authHeader(),
    });

    expect(res.status).toBe(403);
    expect(state.hardDeleteUserById).not.toHaveBeenCalled();
  });
});
