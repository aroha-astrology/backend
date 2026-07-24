import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';
import { Errors } from '../src/lib/errors.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
  inspectUserByPhone: vi.fn(),
  notifyUserByPhone: vi.fn(),
  startRegeneration: vi.fn().mockResolvedValue(undefined),
  getDeviceTokenStats: vi.fn(),
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
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/admin/admin.repo.js', () => ({
  logAdminAction: state.logAdminAction,
}));

vi.mock('../src/modules/admin/admin.service.js', () => ({
  inspectUserByPhone: state.inspectUserByPhone,
  notifyUserByPhone: state.notifyUserByPhone,
  startRegeneration: state.startRegeneration,
  getDeviceTokenStats: state.getDeviceTokenStats,
}));

process.env.ADMIN_FIREBASE_UIDS = 'admin-uid-1';

const { createApp } = await import('../src/app.js');

const ADMIN_AUTH = { Authorization: 'Bearer admin-token' } as const;
const NON_ADMIN_AUTH = { Authorization: 'Bearer plain-token' } as const;

// Persistent mocks (mockResolvedValue, not mockResolvedValueOnce) — matches
// the convention already established in test/palm-photo-routes.spec.ts.
// requireAdmin wraps requireUser internally, and depending on where a
// router is mounted relative to the other /v1 routers that register their
// own `.use('*', requireUser)` wildcard (see the app.ts mount-order comment
// above adminRouter's `app.route()` call), requireUser can run more than
// once per request — a one-shot mock would starve the second call.
function mockAsAdmin() {
  state.verifyIdToken.mockResolvedValue(makeDecodedToken('admin-uid-1'));
  state.findUserByFirebaseUid.mockResolvedValue(
    makeUserRow({ id: 'admin-id-1', firebaseUid: 'admin-uid-1' }),
  );
}

function mockAsNonAdmin() {
  state.verifyIdToken.mockResolvedValue(makeDecodedToken('plain-uid'));
  state.findUserByFirebaseUid.mockResolvedValue(
    makeUserRow({ id: 'plain-id-1', firebaseUid: 'plain-uid' }),
  );
}

beforeEach(() => {
  state.verifyIdToken.mockReset();
  state.findUserByFirebaseUid.mockReset();
  state.logAdminAction.mockReset().mockResolvedValue(undefined);
  state.inspectUserByPhone.mockReset();
  state.notifyUserByPhone.mockReset();
  state.startRegeneration.mockReset().mockResolvedValue(undefined);
  state.getDeviceTokenStats.mockReset();
});

describe('GET /v1/admin/users/:phone/inspect', () => {
  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/admin/users/+919999999999/inspect');
    expect(res.status).toBe(401);
  });

  it('403s for an authenticated non-admin', async () => {
    mockAsNonAdmin();
    const res = await createApp().request('/v1/admin/users/+919999999999/inspect', {
      headers: NON_ADMIN_AUTH,
    });
    expect(res.status).toBe(403);
    expect(state.inspectUserByPhone).not.toHaveBeenCalled();
  });

  it('404s when the service reports no such user', async () => {
    mockAsAdmin();
    state.inspectUserByPhone.mockRejectedValueOnce(
      Errors.notFound('No user found with phone +919999999999'),
    );

    const res = await createApp().request('/v1/admin/users/+919999999999/inspect', {
      headers: ADMIN_AUTH,
    });
    expect(res.status).toBe(404);
  });

  it('200s with the dump for an admin, and audits the call', async () => {
    mockAsAdmin();
    state.inspectUserByPhone.mockResolvedValueOnce({
      user: { id: 'u1' },
      kundlis: [],
      horoscopes: [],
    });

    const res = await createApp().request('/v1/admin/users/+919999999999/inspect', {
      headers: ADMIN_AUTH,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } };
    expect(body.user.id).toBe('u1');
    expect(state.inspectUserByPhone).toHaveBeenCalledWith('+919999999999');
    expect(state.logAdminAction).toHaveBeenCalledWith({
      adminFirebaseUid: 'admin-uid-1',
      route: 'GET /v1/admin/users/:phone/inspect',
      params: { phone: '+919999999999' },
    });
  });
});

describe('POST /v1/admin/users/:phone/regenerate', () => {
  it('403s for an authenticated non-admin', async () => {
    mockAsNonAdmin();
    const res = await createApp().request('/v1/admin/users/+919999999999/regenerate', {
      method: 'POST',
      headers: { ...NON_ADMIN_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'all' }),
    });
    expect(res.status).toBe(403);
    expect(state.startRegeneration).not.toHaveBeenCalled();
  });

  it('422s for an invalid category', async () => {
    mockAsAdmin();
    const res = await createApp().request('/v1/admin/users/+919999999999/regenerate', {
      method: 'POST',
      headers: { ...ADMIN_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'not-a-real-category' }),
    });
    expect(res.status).toBe(422);
    expect(state.startRegeneration).not.toHaveBeenCalled();
  });

  it("200s with {status:'started'} and audits the call", async () => {
    mockAsAdmin();
    const res = await createApp().request('/v1/admin/users/+919999999999/regenerate', {
      method: 'POST',
      headers: { ...ADMIN_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'dosha' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { status: string }).toEqual({ status: 'started' });
    expect(state.startRegeneration).toHaveBeenCalledWith('+919999999999', 'dosha');
    expect(state.logAdminAction).toHaveBeenCalledWith({
      adminFirebaseUid: 'admin-uid-1',
      route: 'POST /v1/admin/users/:phone/regenerate',
      params: { phone: '+919999999999', category: 'dosha' },
    });
  });
});

describe('POST /v1/admin/users/:phone/notify', () => {
  it('403s for an authenticated non-admin', async () => {
    mockAsNonAdmin();
    const res = await createApp().request('/v1/admin/users/+919999999999/notify', {
      method: 'POST',
      headers: { ...NON_ADMIN_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hi', body: 'there' }),
    });
    expect(res.status).toBe(403);
    expect(state.notifyUserByPhone).not.toHaveBeenCalled();
  });

  it('200s with the push result and audits the call', async () => {
    mockAsAdmin();
    state.notifyUserByPhone.mockResolvedValueOnce({ tokenCount: 2, success: 2, failure: 0 });

    const res = await createApp().request('/v1/admin/users/+919999999999/notify', {
      method: 'POST',
      headers: { ...ADMIN_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hi', body: 'there' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tokenCount: 2, success: 2, failure: 0 });
    expect(state.notifyUserByPhone).toHaveBeenCalledWith('+919999999999', 'Hi', 'there');
    expect(state.logAdminAction).toHaveBeenCalledWith({
      adminFirebaseUid: 'admin-uid-1',
      route: 'POST /v1/admin/users/:phone/notify',
      params: { phone: '+919999999999', title: 'Hi' },
    });
  });
});

describe('GET /v1/admin/device-tokens/stats', () => {
  it('403s for an authenticated non-admin', async () => {
    mockAsNonAdmin();
    const res = await createApp().request('/v1/admin/device-tokens/stats', {
      headers: NON_ADMIN_AUTH,
    });
    expect(res.status).toBe(403);
  });

  it('200s with the stats for an admin', async () => {
    mockAsAdmin();
    state.getDeviceTokenStats.mockResolvedValueOnce({
      total: 8,
      byPlatform: { ios: 3, android: 5 },
    });

    const res = await createApp().request('/v1/admin/device-tokens/stats', { headers: ADMIN_AUTH });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 8, byPlatform: { ios: 3, android: 5 } });
  });
});
