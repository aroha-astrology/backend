import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

// Route-level coverage for /v1/admin/report-generations/* — same convention as
// test/admin-groups-routes.spec.ts: only the repo-layer DB boundary is mocked,
// admin.service.ts runs for real.
const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
  listAllReportRows: vi.fn(),
  adminResetReportRow: vi.fn(),
  adminDeleteReportRow: vi.fn(),
  adminResetReportRowsByKey: vi.fn(),
  adminDeleteReportRowsByKey: vi.fn(),
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
}));

vi.mock('../src/modules/admin/admin.repo.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, logAdminAction: state.logAdminAction };
});

vi.mock('../src/modules/reports/reports.repo.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    listAllReportRows: state.listAllReportRows,
    adminResetReportRow: state.adminResetReportRow,
    adminDeleteReportRow: state.adminDeleteReportRow,
    adminResetReportRowsByKey: state.adminResetReportRowsByKey,
    adminDeleteReportRowsByKey: state.adminDeleteReportRowsByKey,
  };
});

const { createApp } = await import('../src/app.js');

const ADMIN_PHONE = '+919999111111';
const NON_ADMIN_PHONE = '+911111111111';
const REPORT_ID = '00000000-0000-0000-0000-000000000cc1';
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
});

describe('/v1/admin/report-generations — access control', () => {
  it('returns 403 for an authenticated non-admin phone', async () => {
    signInAs(NON_ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/admin/report-generations', { headers: authHeader() });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no Authorization header', async () => {
    const app = createApp();

    const res = await app.request('/v1/admin/report-generations');

    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/report-generations', () => {
  it('returns 200 with rows and passes the reportKey filter through', async () => {
    signInAs(ADMIN_PHONE);
    state.listAllReportRows.mockResolvedValue({
      rows: [
        {
          id: REPORT_ID,
          userId: USER_ID,
          displayName: 'Test User',
          phoneE164: '+919535960988',
          reportKey: 'marriage',
          status: 'ready',
          periodMonth: '2026-08-30',
          pricePaidPaise: 9900,
          createdAt: new Date('2026-08-30T05:44:42.973Z'),
          updatedAt: new Date('2026-08-30T05:44:42.973Z'),
        },
      ],
      total: 1,
    });
    const app = createApp();

    const res = await app.request('/v1/admin/report-generations?reportKey=marriage', {
      headers: authHeader(),
    });
    const body = (await res.json()) as { reports: { reportKey: string }[]; total: number };

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.reports[0]).toMatchObject({ reportKey: 'marriage', status: 'ready' });
    expect(state.listAllReportRows).toHaveBeenCalledWith('marriage', 50, 0);
  });
});

describe('POST /v1/admin/report-generations/{id}/reset', () => {
  it('resets a row and audit-logs', async () => {
    signInAs(ADMIN_PHONE);
    state.adminResetReportRow.mockResolvedValue({ id: REPORT_ID, status: 'failed' });
    const app = createApp();

    const res = await app.request(`/v1/admin/report-generations/${REPORT_ID}/reset`, {
      method: 'POST',
      headers: authHeader(),
    });
    const body = (await res.json()) as { id: string; status: string };

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: REPORT_ID, status: 'failed' });
    expect(state.logAdminAction).toHaveBeenCalled();
  });

  it('returns 404 for an unknown id', async () => {
    signInAs(ADMIN_PHONE);
    state.adminResetReportRow.mockResolvedValue(undefined);
    const app = createApp();

    const res = await app.request(`/v1/admin/report-generations/${REPORT_ID}/reset`, {
      method: 'POST',
      headers: authHeader(),
    });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/admin/report-generations/{id}', () => {
  it('deletes a row and returns 204', async () => {
    signInAs(ADMIN_PHONE);
    state.adminDeleteReportRow.mockResolvedValue(true);
    const app = createApp();

    const res = await app.request(`/v1/admin/report-generations/${REPORT_ID}`, {
      method: 'DELETE',
      headers: authHeader(),
    });

    expect(res.status).toBe(204);
  });

  it('returns 404 for an unknown id', async () => {
    signInAs(ADMIN_PHONE);
    state.adminDeleteReportRow.mockResolvedValue(false);
    const app = createApp();

    const res = await app.request(`/v1/admin/report-generations/${REPORT_ID}`, {
      method: 'DELETE',
      headers: authHeader(),
    });

    expect(res.status).toBe(404);
  });
});

describe('POST /v1/admin/report-generations/reset-all', () => {
  it('resets every non-failed row for the given key and returns the count', async () => {
    signInAs(ADMIN_PHONE);
    state.adminResetReportRowsByKey.mockResolvedValue(5);
    const app = createApp();

    const res = await app.request('/v1/admin/report-generations/reset-all', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportKey: 'marriage' }),
    });
    const body = (await res.json()) as { count: number };

    expect(res.status).toBe(200);
    expect(body).toEqual({ count: 5 });
    expect(state.adminResetReportRowsByKey).toHaveBeenCalledWith('marriage');
  });
});

describe('POST /v1/admin/report-generations/delete-all', () => {
  it('deletes every row for the given key and returns the count', async () => {
    signInAs(ADMIN_PHONE);
    state.adminDeleteReportRowsByKey.mockResolvedValue(7);
    const app = createApp();

    const res = await app.request('/v1/admin/report-generations/delete-all', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportKey: 'marriage' }),
    });
    const body = (await res.json()) as { count: number };

    expect(res.status).toBe(200);
    expect(body).toEqual({ count: 7 });
    expect(state.adminDeleteReportRowsByKey).toHaveBeenCalledWith('marriage');
  });
});
