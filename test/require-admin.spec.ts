import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
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
  touchUserLastActive: state.touchUserLastActive,
}));

// Must be set BEFORE the dynamic import below triggers config/env.ts's
// module-level loadEnv() — same technique already used by other spec files
// that need a specific env value not covered by test/setup.ts's defaults.
process.env.ADMIN_FIREBASE_UIDS = 'admin-uid-1, admin-uid-2';

const { requireAdmin } = await import('../src/middleware/auth.js');
const { errorHandler } = await import('../src/middleware/error.js');

function makeApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/admin-only', requireAdmin, (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => {
  state.verifyIdToken.mockReset();
  state.findUserByFirebaseUid.mockReset();
  state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
});

describe('requireAdmin', () => {
  it('401s with no Authorization header', async () => {
    const res = await makeApp().request('/admin-only');
    expect(res.status).toBe(401);
  });

  it('401s with an invalid Firebase token', async () => {
    state.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    const res = await makeApp().request('/admin-only', {
      headers: { Authorization: 'Bearer bad' },
    });
    expect(res.status).toBe(401);
  });

  it('403s for a valid, authenticated user not in ADMIN_FIREBASE_UIDS', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('not-an-admin'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-1', firebaseUid: 'not-an-admin' }),
    );
    const res = await makeApp().request('/admin-only', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(403);
  });

  it('200s for a user whose firebaseUid is in ADMIN_FIREBASE_UIDS', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('admin-uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-1', firebaseUid: 'admin-uid-1' }),
    );
    const res = await makeApp().request('/admin-only', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
  });

  it('honors every entry in a comma-separated ADMIN_FIREBASE_UIDS list', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('admin-uid-2'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-2', firebaseUid: 'admin-uid-2' }),
    );
    const res = await makeApp().request('/admin-only', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
  });
});
