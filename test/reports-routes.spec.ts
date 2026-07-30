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
  previewReport: vi.fn(),
  getReportCatalogueForUser: vi.fn(),
  getReportForUser: vi.fn(),
  getReportStats: vi.fn(),
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
  previewReport: state.previewReport,
  getReportCatalogueForUser: state.getReportCatalogueForUser,
  getReportForUser: state.getReportForUser,
  getReportStats: state.getReportStats,
}));

const { createApp } = await import('../src/app.js');
const { Errors } = await import('../src/lib/errors.js');

function authHeader() {
  return { Authorization: 'Bearer good-token' };
}

function signIn() {
  state.verifyIdToken.mockResolvedValue(makeDecodedToken('uid-1', '+919999999999'));
  state.findUserByFirebaseUid.mockResolvedValue(
    makeUserRow({ id: 'user-1', firebaseUid: 'uid-1' }),
  );
}

beforeEach(() => {
  state.verifyIdToken.mockReset();
  state.findUserByFirebaseUid.mockReset();
  state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
  state.purchaseReport.mockReset();
  state.previewReport.mockReset();
  state.getReportCatalogueForUser.mockReset();
  state.getReportForUser.mockReset();
  state.getReportStats.mockReset();
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

  it('POST /v1/reports/preview returns 401 with no Authorization header', async () => {
    const app = createApp();
    const res = await app.request('/v1/reports/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportKey: 'marriage' }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /v1/reports/stats returns 401 with no Authorization header', async () => {
    const app = createApp();
    const res = await app.request('/v1/reports/stats');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/reports', () => {
  it('returns 200 with the catalogue from the service', async () => {
    signIn();
    state.getReportCatalogueForUser.mockResolvedValue([
      {
        key: 'marriage',
        label: 'Marriage Report',
        isMonthly: false,
        requiresPartner: false,
        enabled: true,
        pricePaise: 9900,
        originalPricePaise: null,
        purchases: [],
      },
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

describe('POST /v1/reports/preview', () => {
  it('returns 200 and forwards the parsed body to previewReport', async () => {
    signIn();
    state.previewReport.mockResolvedValue({
      id: 'p1',
      reportKey: 'marriage',
      status: 'generating',
    });
    const app = createApp();

    const res = await app.request('/v1/reports/preview', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportKey: 'marriage' }),
    });
    const body = (await res.json()) as { id: string; reportKey: string; status: string };

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: 'p1', reportKey: 'marriage', status: 'generating' });
    expect(state.previewReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      expect.objectContaining({ reportKey: 'marriage' }),
    );
  });

  it('returns 400 when the body fails schema validation (missing reportKey)', async () => {
    signIn();
    const app = createApp();

    const res = await app.request('/v1/reports/preview', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(state.previewReport).not.toHaveBeenCalled();
  });

  it('propagates a 400 thrown by the service when the report key requires partner details (kundli_milan/match_report — no partner data exists at preview time)', async () => {
    signIn();
    state.previewReport.mockRejectedValue(
      Errors.badRequest('kundli_milan does not support preview — no partner data exists yet'),
    );
    const app = createApp();

    const res = await app.request('/v1/reports/preview', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportKey: 'kundli_milan' }),
    });

    expect(res.status).toBe(400);
  });

  it('propagates a 404 thrown by the service for an unknown report key', async () => {
    signIn();
    state.previewReport.mockRejectedValue(Errors.notFound('Unknown report key: not_real'));
    const app = createApp();

    const res = await app.request('/v1/reports/preview', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportKey: 'not_real' }),
    });

    expect(res.status).toBe(404);
  });
});

describe('GET /v1/reports/stats', () => {
  it('returns 200 with the report-key -> count map from the service', async () => {
    signIn();
    state.getReportStats.mockResolvedValue({ marriage: 12, wealth: 3 });
    const app = createApp();

    const res = await app.request('/v1/reports/stats', { headers: authHeader() });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ marriage: 12, wealth: 3 });
  });

  it('is not shadowed by the GET /v1/reports/:id route (a literal path segment, not treated as an id)', async () => {
    signIn();
    state.getReportStats.mockResolvedValue({});
    const app = createApp();

    const res = await app.request('/v1/reports/stats', { headers: authHeader() });

    expect(res.status).toBe(200);
    expect(state.getReportForUser).not.toHaveBeenCalled();
    expect(state.getReportStats).toHaveBeenCalled();
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
