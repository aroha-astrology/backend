import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';
import type * as AdminRepoModule from '../src/modules/admin/admin.repo.js';

// Route-level coverage for /v1/admin/*, mounted via the full createApp() (same
// convention as test/auth.spec.ts / test/telegram-bot.spec.ts). Only the
// actual DB boundary is mocked (admin.repo.js's/users.repo.js's/etc. query
// functions) — admin.service.ts itself runs for real, so e.g. the "unknown
// feature key -> 400" case is exercising real validation, not a canned mock.
const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
  usersActiveBetween: vi.fn(),
  usersCreatedBetween: vi.fn(),
  sumWalletBalanceOutstanding: vi.fn(),
  listUsersPage: vi.fn(),
  countUsersMatching: vi.fn(),
  addWalletBalance: vi.fn().mockResolvedValue(undefined),
  deductWalletBalance: vi.fn(),
  findActiveUserById: vi.fn(),
  sumPaidOrdersBetween: vi.fn(),
  revenueTimeSeries: vi.fn(),
  spendByFeature: vi.fn(),
  spendByReportKey: vi.fn(),
  topUpFunnel: vi.fn(),
  payingUserCount: vi.fn(),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
  costByAgent: vi.fn(),
  resolveFeatures: vi.fn(),
  invalidateFeatureCache: vi.fn(),
  upsertFeatureOverride: vi.fn(),
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
  usersActiveBetween: state.usersActiveBetween,
  usersCreatedBetween: state.usersCreatedBetween,
  sumWalletBalanceOutstanding: state.sumWalletBalanceOutstanding,
  listUsersPage: state.listUsersPage,
  countUsersMatching: state.countUsersMatching,
  addWalletBalance: state.addWalletBalance,
  deductWalletBalance: state.deductWalletBalance,
  findActiveUserById: state.findActiveUserById,
}));

vi.mock('../src/modules/admin/admin.repo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof AdminRepoModule>();
  return {
    ...actual, // keep the real (pure) resolveDateRangePreset
    sumPaidOrdersBetween: state.sumPaidOrdersBetween,
    revenueTimeSeries: state.revenueTimeSeries,
    spendByFeature: state.spendByFeature,
    spendByReportKey: state.spendByReportKey,
    topUpFunnel: state.topUpFunnel,
    payingUserCount: state.payingUserCount,
    logAdminAction: state.logAdminAction,
  };
});

vi.mock('../src/modules/admin/ai-usage.repo.js', () => ({
  costByAgent: state.costByAgent,
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeatures: state.resolveFeatures,
  invalidateFeatureCache: state.invalidateFeatureCache,
}));

vi.mock('../src/modules/features/features.repo.js', () => ({
  upsertFeatureOverride: state.upsertFeatureOverride,
}));

const { createApp } = await import('../src/app.js');

const ADMIN_PHONE = '+919999111111';
const NON_ADMIN_PHONE = '+911111111111';

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
  state.addWalletBalance.mockResolvedValue(undefined);
  // Sensible defaults so the "200 with expected shape" tests don't need to
  // restate every dependency.
  state.sumPaidOrdersBetween.mockResolvedValue({ totalPaise: 0, count: 0 });
  state.revenueTimeSeries.mockResolvedValue([]);
  state.spendByFeature.mockResolvedValue([]);
  state.spendByReportKey.mockResolvedValue([]);
  state.topUpFunnel.mockResolvedValue([]);
  state.payingUserCount.mockResolvedValue(0);
  state.usersActiveBetween.mockResolvedValue(0);
  state.usersCreatedBetween.mockResolvedValue(0);
  state.sumWalletBalanceOutstanding.mockResolvedValue(0);
  state.costByAgent.mockResolvedValue([]);
  state.resolveFeatures.mockResolvedValue({});
});

describe('/v1/admin/* — access control', () => {
  it('returns 403 for an authenticated non-admin phone', async () => {
    signInAs(NON_ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/admin/overview', { headers: authHeader() });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no Authorization header', async () => {
    const app = createApp();

    const res = await app.request('/v1/admin/overview');

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/overview', () => {
  it('returns 200 with the expected shape for an admin phone', async () => {
    signInAs(ADMIN_PHONE);
    state.sumPaidOrdersBetween.mockResolvedValue({ totalPaise: 10000, count: 2 });
    state.usersActiveBetween.mockResolvedValue(5);
    const app = createApp();

    const res = await app.request('/v1/admin/overview?preset=last7d', { headers: authHeader() });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      cashInPaise: 10000,
      orderCount: 2,
      activeUsers: 5,
      arpuPaise: 2000,
    });
    expect(body.range).toBeDefined();
    expect(Array.isArray(body.timeSeries)).toBe(true);
  });

  it('returns 400 for an unknown preset', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/admin/overview?preset=not_a_real_preset', {
      headers: authHeader(),
    });

    expect(res.status).toBe(400);
  });

  it('audit-logs the read, per the "every /v1/admin/* route logs" spec', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    await app.request('/v1/admin/overview?preset=last7d', { headers: authHeader() });

    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/overview'),
      expect.anything(),
    );
  });
});

describe('GET /v1/admin/features', () => {
  it('returns 200 with the merged registry + overrides', async () => {
    signInAs(ADMIN_PHONE);
    state.resolveFeatures.mockResolvedValue({ 'paid.chat': { enabled: false, pricePaise: 1500 } });
    const app = createApp();

    const res = await app.request('/v1/admin/features', { headers: authHeader() });
    const body = (await res.json()) as { features: { key: string; enabled: boolean }[] };

    expect(res.status).toBe(200);
    const chat = body.features.find((f) => f.key === 'paid.chat');
    expect(chat?.enabled).toBe(false);
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/features'),
      expect.anything(),
    );
  });
});

describe('PUT /v1/admin/features', () => {
  it('returns 400 for an unknown feature key', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/admin/features', {
      method: 'PUT',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'not.a.real.key', enabled: true }),
    });

    expect(res.status).toBe(400);
    expect(state.upsertFeatureOverride).not.toHaveBeenCalled();
  });

  it('returns 200 and upserts on a known key', async () => {
    signInAs(ADMIN_PHONE);
    state.upsertFeatureOverride.mockResolvedValue({
      key: 'paid.chat',
      enabled: false,
      pricePaise: 2000,
      updatedAt: new Date(),
      updatedBy: ADMIN_PHONE,
    });
    const app = createApp();

    const res = await app.request('/v1/admin/features', {
      method: 'PUT',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'paid.chat', enabled: false }),
    });

    expect(res.status).toBe(200);
    expect(state.invalidateFeatureCache).toHaveBeenCalledTimes(1);
  });
});

describe('GET /v1/admin/users', () => {
  it('returns 200 with a paginated user list', async () => {
    signInAs(ADMIN_PHONE);
    state.listUsersPage.mockResolvedValue([
      {
        id: 'u1',
        displayName: 'Asha',
        phoneE164: '+919999999999',
        email: null,
        walletBalancePaise: 1000,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        lastActiveAt: null,
      },
    ]);
    state.countUsersMatching.mockResolvedValue(1);
    const app = createApp();

    const res = await app.request('/v1/admin/users?q=asha', { headers: authHeader() });
    const body = (await res.json()) as { users: unknown[]; total: number };

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.users).toHaveLength(1);
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/users'),
      expect.anything(),
    );
  });
});

describe('POST /v1/admin/users/:id/wallet', () => {
  const userId = '00000000-0000-0000-0000-0000000000aa';

  it('grants a positive delta and returns 200', async () => {
    signInAs(ADMIN_PHONE);
    state.findActiveUserById
      .mockResolvedValueOnce({ id: userId, walletBalancePaise: 1000 })
      .mockResolvedValueOnce({ id: userId, walletBalancePaise: 6000 });
    const app = createApp();

    const res = await app.request(`/v1/admin/users/${userId}/wallet`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ deltaPaise: 5000, note: 'goodwill' }),
    });
    const body = (await res.json()) as { walletBalancePaise: number };

    expect(res.status).toBe(200);
    expect(body.walletBalancePaise).toBe(6000);
    expect(state.addWalletBalance).toHaveBeenCalledWith(userId, 5000, 'admin_grant');
  });

  it('refuses (409) a deduction that would exceed the balance — never floors at zero', async () => {
    signInAs(ADMIN_PHONE);
    state.findActiveUserById.mockResolvedValueOnce({ id: userId, walletBalancePaise: 1000 });
    state.deductWalletBalance.mockResolvedValueOnce(false);
    const app = createApp();

    const res = await app.request(`/v1/admin/users/${userId}/wallet`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ deltaPaise: -5000, note: 'oops' }),
    });

    expect(res.status).toBe(409);
    expect(state.logAdminAction).not.toHaveBeenCalled();
  });

  it('returns 400 for a zero deltaPaise (rejected by the body schema)', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request(`/v1/admin/users/${userId}/wallet`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ deltaPaise: 0, note: 'x' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /v1/admin/reports', () => {
  it('returns 200 with the per-report breakdown', async () => {
    signInAs(ADMIN_PHONE);
    state.spendByReportKey.mockResolvedValue([
      { reportKey: 'marriage', totalPaise: 9900, count: 1 },
    ]);
    const app = createApp();

    const res = await app.request('/v1/admin/reports?preset=last30d', { headers: authHeader() });
    const body = (await res.json()) as { reports: { reportKey: string }[] };

    expect(res.status).toBe(200);
    expect(body.reports).toEqual([{ reportKey: 'marriage', totalPaise: 9900, count: 1 }]);
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/reports'),
      expect.anything(),
    );
  });
});
