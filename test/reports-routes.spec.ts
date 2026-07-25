import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

// Route-level coverage for /v1/reports/*, mounted via the full createApp()
// (same convention as test/admin-routes.spec.ts). reports.service.js is
// mocked wholesale here — its own behavior (pricing, claim-fencing,
// translate-on-read, the "no generator registered" safety net) is covered in
// depth by test/reports-service.spec.ts. This file only proves the HTTP
// wiring: auth is required, requests are parsed/validated and handed to the
// service correctly, and the service's status ('generating'/'ready'/'failed')
// maps to the right HTTP status code.

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
  purchaseReport: vi.fn(),
  getReportCatalogueForUser: vi.fn(),
  getReportForUser: vi.fn(),
}));

const fakeEnv = vi.hoisted(() => ({
  ADMIN_PHONE_E164: [],
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

vi.mock('../src/modules/reports/reports.service.js', () => ({
  purchaseReport: state.purchaseReport,
  getReportCatalogueForUser: state.getReportCatalogueForUser,
  getReportForUser: state.getReportForUser,
}));

const { createApp } = await import('../src/app.js');
const { Errors } = await import('../src/lib/errors.js');

function authHeader() {
  return { Authorization: 'Bearer good-token' };
}

function signIn() {
  state.verifyIdToken.mockResolvedValue(makeDecodedToken('uid-1', '+919999999999'));
  state.findUserByFirebaseUid.mockResolvedValue(makeUserRow({ id: 'user-1', firebaseUid: 'uid-1' }));
}

beforeEach(() => {
  state.verifyIdToken.mockReset();
  state.findUserByFirebaseUid.mockReset();
  state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
  state.purchaseReport.mockReset();
  state.getReportCatalogueForUser.mockReset();
  state.getReportForUser.mockReset();
});

describe('/v1/reports/* — auth required', () => {
  it('GET /v1/reports returns 401 with no Authorization header', async () => {
    const app = createApp();
    const res = await app.request('/v1/reports');
    expect(res.status).toBe(401);
  });

  it('POST /v1/reports/purchase returns 401 with no Authorization header', async () => {
    const app = createApp();
    const res = await app.request('/v1/reports/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportKey: 'marriage' }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /v1/reports/:id returns 401 with no Authorization header', async () => {
    const app = createApp();
    const res = await app.request('/v1/reports/00000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/reports', () => {
  it('returns 200 with the catalogue from the service', async () => {
    signIn();
    state.getReportCatalogueForUser.mockResolvedValue([
      { key: 'marriage', label: 'Marriage Report', isMonthly: false, requiresPartner: false, enabled: true, pricePaise: 9900, purchases: [] },
    ]);
    const app = createApp();

    const res = await app.request('/v1/reports', { headers: authHeader() });
    const body = (await res.json()) as { reports: unknown[] };

    expect(res.status).toBe(200);
    expect(body.reports).toHaveLength(1);
    expect(state.getReportCatalogueForUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      null,
    );
  });
});

describe('POST /v1/reports/purchase', () => {
  it('returns 200 and forwards the parsed body to purchaseReport', async () => {
    signIn();
    state.purchaseReport.mockResolvedValue({
      reports: [{ id: 'r1', reportKey: 'marriage', periodMonth: null, status: 'generating' }],
    });
    const app = createApp();

    const res = await app.request('/v1/reports/purchase', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportKey: 'marriage' }),
    });
    const body = (await res.json()) as { reports: unknown[] };

    expect(res.status).toBe(200);
    expect(body.reports).toHaveLength(1);
    expect(state.purchaseReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      expect.objectContaining({ reportKey: 'marriage' }),
    );
  });

  it('returns 400 when the body fails schema validation (missing reportKey)', async () => {
    signIn();
    const app = createApp();

    const res = await app.request('/v1/reports/purchase', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(state.purchaseReport).not.toHaveBeenCalled();
  });

  it('propagates a 404 thrown by the service for an unknown report key', async () => {
    signIn();
    state.purchaseReport.mockRejectedValue(Errors.notFound('Unknown report key: not_real'));
    const app = createApp();

    const res = await app.request('/v1/reports/purchase', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportKey: 'not_real' }),
    });

    expect(res.status).toBe(404);
  });

  it('propagates a 409 thrown by the service for insufficient credits', async () => {
    signIn();
    state.purchaseReport.mockRejectedValue(Errors.conflict('INSUFFICIENT_CREDITS'));
    const app = createApp();

    const res = await app.request('/v1/reports/purchase', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportKey: 'marriage' }),
    });

    expect(res.status).toBe(409);
  });
});

describe('GET /v1/reports/:id', () => {
  const id = '00000000-0000-0000-0000-000000000099';

  it('returns 202 when the report is still generating', async () => {
    signIn();
    state.getReportForUser.mockResolvedValue({ status: 'generating' });
    const app = createApp();

    const res = await app.request(`/v1/reports/${id}`, { headers: authHeader() });
    expect(res.status).toBe(202);
  });

  it('returns 200 with the error when the report failed', async () => {
    signIn();
    state.getReportForUser.mockResolvedValue({ status: 'failed', error: 'boom' });
    const app = createApp();

    const res = await app.request(`/v1/reports/${id}`, { headers: authHeader() });
    const body = (await res.json()) as { status: string; error: string };

    expect(res.status).toBe(200);
    expect(body.error).toBe('boom');
  });

  it('returns 200 with sections + scores when ready, forwarding the language query param', async () => {
    signIn();
    state.getReportForUser.mockResolvedValue({
      status: 'ready',
      reportKey: 'marriage',
      periodMonth: null,
      scores: { foo: 1 },
      sections: [{ heading: 'H', paragraphs: ['p'] }],
    });
    const app = createApp();

    const res = await app.request(`/v1/reports/${id}?language=hi`, { headers: authHeader() });
    const body = (await res.json()) as { sections: unknown[] };

    expect(res.status).toBe(200);
    expect(body.sections).toHaveLength(1);
    expect(state.getReportForUser).toHaveBeenCalledWith(id, 'user-1', 'hi');
  });

  it('returns 404 when the service throws not found (including cross-user ownership)', async () => {
    signIn();
    state.getReportForUser.mockRejectedValue(Errors.notFound('Report not found'));
    const app = createApp();

    const res = await app.request(`/v1/reports/${id}`, { headers: authHeader() });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-uuid id', async () => {
    signIn();
    const app = createApp();

    const res = await app.request('/v1/reports/not-a-uuid', { headers: authHeader() });
    expect(res.status).toBe(400);
  });
});
