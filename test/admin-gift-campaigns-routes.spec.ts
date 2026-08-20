import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

// Route-level coverage for /v1/admin/gift-campaigns/*, mounted via the full
// createApp() — same convention as test/admin-groups-routes.spec.ts. Only the
// repo-layer DB boundary is mocked; gift-campaigns.service.ts runs for real.
const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
  listGiftCampaigns: vi.fn(),
  getGiftCampaignById: vi.fn(),
  insertGiftCampaign: vi.fn(),
  resolveAudience: vi.fn(),
  cancelGiftCampaignIfPending: vi.fn(),
  getAllActiveTokens: vi.fn(),
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
  const sqlClient = ((..._args: unknown[]) => Promise.resolve([])) as unknown as {
    end: () => Promise<void>;
  };
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

vi.mock('../src/modules/gift-campaigns/gift-campaigns.repo.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    listGiftCampaigns: state.listGiftCampaigns,
    getGiftCampaignById: state.getGiftCampaignById,
    insertGiftCampaign: state.insertGiftCampaign,
    resolveAudience: state.resolveAudience,
    cancelGiftCampaignIfPending: state.cancelGiftCampaignIfPending,
  };
});

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  getAllActiveTokens: state.getAllActiveTokens,
}));

const { createApp } = await import('../src/app.js');

const ADMIN_PHONE = '+919999111111';
const NON_ADMIN_PHONE = '+911111111111';
const CAMPAIGN_ID = '00000000-0000-0000-0000-000000000cc1';

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
    if (typeof fn === 'function' && 'mockReset' in fn)
      (fn as { mockReset: () => void }).mockReset();
  }
  state.touchUserLastActive.mockResolvedValue(undefined);
  state.logAdminAction.mockResolvedValue(undefined);
});

describe('/v1/admin/gift-campaigns — access control', () => {
  it('returns 403 for an authenticated non-admin phone', async () => {
    signInAs(NON_ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/admin/gift-campaigns', { headers: authHeader() });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no Authorization header', async () => {
    const app = createApp();

    const res = await app.request('/v1/admin/gift-campaigns');

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/gift-campaigns', () => {
  it('returns 200 with the campaign list', async () => {
    signInAs(ADMIN_PHONE);
    state.listGiftCampaigns.mockResolvedValue([
      {
        id: CAMPAIGN_ID,
        key: 'diwali_2026_abc123',
        title: 'Diwali 2026',
        amountPaise: 5000,
        audienceMaxBalancePaise: null,
        deliveryMode: 'auto_credit',
        claimWindowDays: null,
        creditExpiryDays: null,
        scheduledSendAt: null,
        status: 'draft',
        validFrom: null,
        validUntil: null,
        sentAt: null,
        createdBy: ADMIN_PHONE,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const app = createApp();

    const res = await app.request('/v1/admin/gift-campaigns', { headers: authHeader() });
    const body = (await res.json()) as { campaigns: { title: string; status: string }[] };

    expect(res.status).toBe(200);
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0]).toMatchObject({ title: 'Diwali 2026', status: 'draft' });
  });
});

describe('POST /v1/admin/gift-campaigns', () => {
  it('creates a campaign and returns it', async () => {
    signInAs(ADMIN_PHONE);
    state.insertGiftCampaign.mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve({
        id: CAMPAIGN_ID,
        ...input,
        validFrom: null,
        validUntil: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const app = createApp();

    const res = await app.request('/v1/admin/gift-campaigns', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Diwali 2026',
        amountPaise: 5000,
        audienceMaxBalancePaise: null,
        deliveryMode: 'auto_credit',
        claimWindowDays: null,
        creditExpiryDays: null,
        scheduledSendAt: null,
      }),
    });
    const body = (await res.json()) as { key: string; status: string };

    expect(res.status).toBe(200);
    expect(body.key).toMatch(/^diwali_2026_[a-f0-9]{8}$/);
    expect(body.status).toBe('draft');
  });

  it('returns 400 for a self_claim campaign with no claim window (a cross-field rule zod cannot express)', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/admin/gift-campaigns', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Diwali 2026',
        amountPaise: 5000,
        audienceMaxBalancePaise: null,
        deliveryMode: 'self_claim',
        claimWindowDays: null,
        creditExpiryDays: null,
        scheduledSendAt: null,
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /v1/admin/gift-campaigns/preview', () => {
  it('returns eligible/pushable counts and total cost', async () => {
    signInAs(ADMIN_PHONE);
    state.resolveAudience.mockResolvedValue([
      { userId: 'u1', walletBalancePaise: 1000, locale: 'en', createdAt: new Date() },
    ]);
    state.getAllActiveTokens.mockResolvedValue([{ userId: 'u1', token: 't1' }]);
    const app = createApp();

    const res = await app.request('/v1/admin/gift-campaigns/preview', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountPaise: 5000, audienceMaxBalancePaise: null }),
    });
    const body = (await res.json()) as {
      eligibleCount: number;
      pushableCount: number;
      totalCostPaise: number;
    };

    expect(res.status).toBe(200);
    expect(body).toEqual({ eligibleCount: 1, pushableCount: 1, totalCostPaise: 5000 });
  });
});

describe('DELETE /v1/admin/gift-campaigns/{id}', () => {
  it('returns 404 for an unknown campaign', async () => {
    signInAs(ADMIN_PHONE);
    state.getGiftCampaignById.mockResolvedValue(undefined);
    const app = createApp();

    const res = await app.request(`/v1/admin/gift-campaigns/${CAMPAIGN_ID}`, {
      method: 'DELETE',
      headers: authHeader(),
    });

    expect(res.status).toBe(404);
  });

  it('returns 204 and cancels a pending campaign', async () => {
    signInAs(ADMIN_PHONE);
    state.getGiftCampaignById.mockResolvedValue({ id: CAMPAIGN_ID, status: 'draft' });
    state.cancelGiftCampaignIfPending.mockResolvedValue(true);
    const app = createApp();

    const res = await app.request(`/v1/admin/gift-campaigns/${CAMPAIGN_ID}`, {
      method: 'DELETE',
      headers: authHeader(),
    });

    expect(res.status).toBe(204);
  });
});
