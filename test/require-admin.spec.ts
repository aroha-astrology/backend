import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

// requireAdmin is built/tested in isolation here, the same way
// test/require-feature.spec.ts exercises requireFeature — mount it directly
// on a bare Hono app rather than the full createApp(), so only its own
// dependency graph (middleware/auth.ts) needs mocking.
const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
}));

const fakeEnv = vi.hoisted(() => ({
  ADMIN_PHONE_E164: ['+919999111111'],
  LOG_LEVEL: 'silent',
}));

vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));

vi.mock('../src/config/firebase.js', () => ({
  getFirebaseAuth: () => ({ verifyIdToken: state.verifyIdToken }),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findUserByFirebaseUid: state.findUserByFirebaseUid,
  touchUserLastActive: state.touchUserLastActive,
}));

const { requireAdmin } = await import('../src/middleware/auth.js');
const { errorHandler } = await import('../src/middleware/error.js');

function makeApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/admin-only', requireAdmin, (c) => c.text('ok'));
  return app;
}

beforeEach(() => {
  state.verifyIdToken.mockReset();
  state.findUserByFirebaseUid.mockReset();
  state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
  fakeEnv.ADMIN_PHONE_E164 = ['+919999111111'];
});

describe('requireAdmin', () => {
  it('passes an allowlisted admin phone through to the route handler', async () => {
    state.verifyIdToken.mockResolvedValueOnce(
      makeDecodedToken('uid-admin', '+919999111111'),
    );
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-admin', firebaseUid: 'uid-admin', phoneE164: '+919999111111' }),
    );
    const app = makeApp();

    const res = await app.request('/admin-only', {
      headers: { Authorization: 'Bearer good-token' },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('returns 403 for an authenticated user whose phone is not on the allowlist', async () => {
    state.verifyIdToken.mockResolvedValueOnce(
      makeDecodedToken('uid-user', '+911111111111'),
    );
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-user', firebaseUid: 'uid-user', phoneE164: '+911111111111' }),
    );
    const app = makeApp();

    const res = await app.request('/admin-only', {
      headers: { Authorization: 'Bearer good-token' },
    });
    const body = (await res.json()) as { error: { code: string; message: string } };

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBe('Admin access required');
  });

  it('returns 403 when the token has no phone_number claim at all', async () => {
    const tokenWithoutPhone = makeDecodedToken('uid-noph');
    delete (tokenWithoutPhone as { phone_number?: string }).phone_number;
    state.verifyIdToken.mockResolvedValueOnce(tokenWithoutPhone);
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-noph', firebaseUid: 'uid-noph', phoneE164: null }),
    );
    const app = makeApp();

    const res = await app.request('/admin-only', {
      headers: { Authorization: 'Bearer good-token' },
    });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no Authorization header, delegating to requireUser', async () => {
    const app = makeApp();

    const res = await app.request('/admin-only');

    expect(res.status).toBe(401);
    expect(state.verifyIdToken).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid/expired token, delegating to requireUser', async () => {
    state.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    const app = makeApp();

    const res = await app.request('/admin-only', {
      headers: { Authorization: 'Bearer bad-token' },
    });

    expect(res.status).toBe(401);
  });

  it('returns 401 for a valid token with no matching active user, delegating to requireUser', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-ghost', '+919999111111'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
    const app = makeApp();

    const res = await app.request('/admin-only', {
      headers: { Authorization: 'Bearer good-token' },
    });

    expect(res.status).toBe(401);
  });
});
