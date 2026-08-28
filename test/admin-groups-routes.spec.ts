import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

// Route-level coverage for /v1/admin/groups/*, mounted via the full
// createApp() — same convention as test/admin-routes.spec.ts. Only the
// repo-layer DB boundary is mocked; admin-groups.service.ts runs for real.
const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
  createGroup: vi.fn(),
  listGroupsWithMemberCount: vi.fn(),
  deleteGroup: vi.fn(),
  addMember: vi.fn(),
  removeMember: vi.fn(),
  listMembers: vi.fn(),
  listGroupIdsForUser: vi.fn(),
  upsertGroupFeatureOverride: vi.fn(),
  deleteGroupFeatureOverride: vi.fn(),
  listGroupFeatureOverrides: vi.fn(),
  listAllGroupFeatureOverrides: vi.fn(),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
  findAllFeatureOverrides: vi.fn(),
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
}));

vi.mock('../src/modules/admin/admin.repo.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, logAdminAction: state.logAdminAction };
});

vi.mock('../src/modules/user-groups/user-groups.repo.js', () => ({
  createGroup: state.createGroup,
  listGroupsWithMemberCount: state.listGroupsWithMemberCount,
  deleteGroup: state.deleteGroup,
  addMember: state.addMember,
  removeMember: state.removeMember,
  listMembers: state.listMembers,
  listGroupIdsForUser: state.listGroupIdsForUser,
  upsertGroupFeatureOverride: state.upsertGroupFeatureOverride,
  deleteGroupFeatureOverride: state.deleteGroupFeatureOverride,
  listGroupFeatureOverrides: state.listGroupFeatureOverrides,
  listAllGroupFeatureOverrides: state.listAllGroupFeatureOverrides,
}));

vi.mock('../src/modules/features/features.repo.js', () => ({
  findAllFeatureOverrides: state.findAllFeatureOverrides,
}));

const { createApp } = await import('../src/app.js');
const { invalidateFeatureCache, invalidateGroupOverrideCache } =
  await import('../src/modules/features/features.service.js');

const ADMIN_PHONE = '+919999111111';
const NON_ADMIN_PHONE = '+911111111111';
const GROUP_ID = '00000000-0000-0000-0000-000000000aa1';
const USER_ID = '00000000-0000-0000-0000-000000000bb1';

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
  state.findAllFeatureOverrides.mockResolvedValue([]);
  state.listAllGroupFeatureOverrides.mockResolvedValue([]);
  invalidateFeatureCache();
  invalidateGroupOverrideCache();
});

describe('/v1/admin/groups — access control', () => {
  it('returns 403 for an authenticated non-admin phone', async () => {
    signInAs(NON_ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/admin/groups', { headers: authHeader() });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no Authorization header', async () => {
    const app = createApp();

    const res = await app.request('/v1/admin/groups');

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/groups', () => {
  it('returns 200 with the group list including member counts', async () => {
    signInAs(ADMIN_PHONE);
    state.listGroupsWithMemberCount.mockResolvedValue([
      {
        id: GROUP_ID,
        name: 'Beta testers',
        description: null,
        createdAt: new Date(),
        createdBy: ADMIN_PHONE,
        memberCount: 2,
      },
    ]);
    const app = createApp();

    const res = await app.request('/v1/admin/groups', { headers: authHeader() });
    const body = (await res.json()) as { groups: { name: string; memberCount: number }[] };

    expect(res.status).toBe(200);
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0]).toMatchObject({ name: 'Beta testers', memberCount: 2 });
  });
});

describe('POST /v1/admin/groups', () => {
  it('creates a group and audit-logs', async () => {
    signInAs(ADMIN_PHONE);
    state.createGroup.mockResolvedValue({
      id: GROUP_ID,
      name: 'Beta testers',
      description: 'early access',
      createdAt: new Date(),
      createdBy: ADMIN_PHONE,
    });
    const app = createApp();

    const res = await app.request('/v1/admin/groups', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Beta testers', description: 'early access' }),
    });
    const body = (await res.json()) as { id: string; memberCount: number };

    expect(res.status).toBe(200);
    expect(body.memberCount).toBe(0);
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/groups'),
      expect.anything(),
    );
  });

  it('returns 400 for a duplicate (case-insensitive) group name', async () => {
    signInAs(ADMIN_PHONE);
    state.createGroup.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );
    const app = createApp();

    const res = await app.request('/v1/admin/groups', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'beta testers' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 403 for a non-admin', async () => {
    signInAs(NON_ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/admin/groups', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sneaky group' }),
    });

    expect(res.status).toBe(403);
    expect(state.createGroup).not.toHaveBeenCalled();
  });
});

describe('DELETE /v1/admin/groups/:id', () => {
  it('deletes the group and audit-logs', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request(`/v1/admin/groups/${GROUP_ID}`, {
      method: 'DELETE',
      headers: authHeader(),
    });

    expect(res.status).toBe(204);
    expect(state.deleteGroup).toHaveBeenCalledWith(GROUP_ID);
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining(`/v1/admin/groups/${GROUP_ID}`),
      expect.anything(),
    );
  });
});

describe('GET /v1/admin/groups/:id/members', () => {
  it('returns 200 with the member list', async () => {
    signInAs(ADMIN_PHONE);
    state.listMembers.mockResolvedValue([
      { userId: USER_ID, displayName: 'Asha', phoneE164: '+919999999999', addedAt: new Date() },
    ]);
    const app = createApp();

    const res = await app.request(`/v1/admin/groups/${GROUP_ID}/members`, {
      headers: authHeader(),
    });
    const body = (await res.json()) as { members: { userId: string }[] };

    expect(res.status).toBe(200);
    expect(body.members).toHaveLength(1);
    expect(body.members[0]!.userId).toBe(USER_ID);
  });
});

describe('POST /v1/admin/groups/:id/members', () => {
  it('adds a member (idempotent) and audit-logs', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request(`/v1/admin/groups/${GROUP_ID}/members`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID }),
    });

    expect(res.status).toBe(204);
    expect(state.addMember).toHaveBeenCalledWith(GROUP_ID, USER_ID);
    expect(state.logAdminAction).toHaveBeenCalled();
  });
});

describe('DELETE /v1/admin/groups/:id/members/:userId', () => {
  it('removes the member and audit-logs', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request(`/v1/admin/groups/${GROUP_ID}/members/${USER_ID}`, {
      method: 'DELETE',
      headers: authHeader(),
    });

    expect(res.status).toBe(204);
    expect(state.removeMember).toHaveBeenCalledWith(GROUP_ID, USER_ID);
  });
});

describe('GET /v1/admin/groups/:id/features', () => {
  it("returns every FEATURE_REGISTRY key annotated with this group's override state", async () => {
    signInAs(ADMIN_PHONE);
    state.listGroupFeatureOverrides.mockResolvedValue([
      { featureKey: 'paid.chat', enabled: false },
    ]);
    const app = createApp();

    const res = await app.request(`/v1/admin/groups/${GROUP_ID}/features`, {
      headers: authHeader(),
    });
    const body = (await res.json()) as { features: { key: string; state: unknown }[] };

    expect(res.status).toBe(200);
    const chat = body.features.find((f) => f.key === 'paid.chat');
    expect(chat?.state).toBe(false);
    const navHome = body.features.find((f) => f.key === 'nav.home');
    expect(navHome?.state).toBe('inherit');
  });
});

describe('PUT /v1/admin/groups/:id/features', () => {
  it('returns 400 for an unknown feature key', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request(`/v1/admin/groups/${GROUP_ID}/features`, {
      method: 'PUT',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'not.a.real.key', enabled: true }),
    });

    expect(res.status).toBe(400);
    expect(state.upsertGroupFeatureOverride).not.toHaveBeenCalled();
  });

  it('upserts a true/false override on a known key', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request(`/v1/admin/groups/${GROUP_ID}/features`, {
      method: 'PUT',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'paid.chat', enabled: false }),
    });
    const body = (await res.json()) as { state: unknown };

    expect(res.status).toBe(200);
    expect(body.state).toBe(false);
    expect(state.upsertGroupFeatureOverride).toHaveBeenCalledWith(
      GROUP_ID,
      'paid.chat',
      false,
      ADMIN_PHONE,
      null,
    );
  });

  it('a null enabled clears the override (back to "inherit")', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request(`/v1/admin/groups/${GROUP_ID}/features`, {
      method: 'PUT',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'paid.chat', enabled: null }),
    });
    const body = (await res.json()) as { state: unknown };

    expect(res.status).toBe(200);
    expect(body.state).toBe('inherit');
    expect(state.deleteGroupFeatureOverride).toHaveBeenCalledWith(GROUP_ID, 'paid.chat');
  });

  it('end-to-end: a group override actually changes what resolveFeaturesForUser returns for a member', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    await app.request(`/v1/admin/groups/${GROUP_ID}/features`, {
      method: 'PUT',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'paid.chat', enabled: false }),
    });

    // Simulate the write having landed, then resolve as the affected member would.
    state.listGroupIdsForUser.mockResolvedValue([GROUP_ID]);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: GROUP_ID, featureKey: 'paid.chat', enabled: false },
    ]);

    const { resolveFeaturesForUser } = await import('../src/modules/features/features.service.js');
    const resolved = await resolveFeaturesForUser(USER_ID);

    expect(resolved['paid.chat']!.enabled).toBe(false);
  });
});
