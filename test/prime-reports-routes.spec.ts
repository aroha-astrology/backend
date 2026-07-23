import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeProfileContext, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  listPrimeReportDefinitions: vi.fn(),
  getPrimeReportDefinition: vi.fn(),
  findPrimeReport: vi.fn(),
  isReportStale: vi.fn(),
  requestReportGeneration: vi.fn(),
  toReportDtoForLanguage: vi.fn(),
  unlockReport: vi.fn(),
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

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: state.resolveActiveProfileContext,
}));

vi.mock('../src/modules/prime-reports/prime-reports.registry.js', () => ({
  listPrimeReportDefinitions: state.listPrimeReportDefinitions,
  getPrimeReportDefinition: state.getPrimeReportDefinition,
}));

vi.mock('../src/modules/prime-reports/prime-reports.service.js', () => ({
  findPrimeReport: state.findPrimeReport,
  isReportStale: state.isReportStale,
  requestReportGeneration: state.requestReportGeneration,
  toReportDtoForLanguage: state.toReportDtoForLanguage,
  unlockReport: state.unlockReport,
  LIFETIME_PERIOD: 'lifetime',
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token' } as const;

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.resolveActiveProfileContext.mockReset().mockResolvedValue(makeProfileContext());
  state.listPrimeReportDefinitions.mockReset();
  state.getPrimeReportDefinition.mockReset();
  state.findPrimeReport.mockReset();
  state.isReportStale.mockReset().mockReturnValue(false);
  state.requestReportGeneration.mockReset().mockResolvedValue('generated');
  state.toReportDtoForLanguage.mockReset();
  state.unlockReport.mockReset();
});

describe('GET /v1/prime/reports', () => {
  it('lists the catalogue with unlocked state per report', async () => {
    state.listPrimeReportDefinitions.mockReturnValue([
      { reportType: 'numerology', title: 'Numerology Report', pricePaise: 2500 },
    ]);
    state.findPrimeReport.mockResolvedValueOnce({ id: 'row-1' });

    const res = await createApp().request('/v1/prime/reports', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ reportType: string; unlocked: boolean }> };
    expect(body.items).toEqual([
      { reportType: 'numerology', title: 'Numerology Report', pricePaise: 2500, unlocked: true },
    ]);
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/prime/reports');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/prime/reports/:reportType', () => {
  it('404s for an unknown report type', async () => {
    state.getPrimeReportDefinition.mockReturnValue(undefined);
    const res = await createApp().request('/v1/prime/reports/nope', { headers: AUTH });
    expect(res.status).toBe(404);
  });

  it('403s when the report is not unlocked', async () => {
    state.getPrimeReportDefinition.mockReturnValue({ reportType: 'numerology' });
    state.findPrimeReport.mockResolvedValueOnce(undefined);

    const res = await createApp().request('/v1/prime/reports/numerology', { headers: AUTH });
    expect(res.status).toBe(403);
  });

  it('returns 200 with the report when ready', async () => {
    state.getPrimeReportDefinition.mockReturnValue({ reportType: 'numerology' });
    state.findPrimeReport.mockResolvedValueOnce({ status: 'ready' });
    state.toReportDtoForLanguage.mockResolvedValueOnce({
      status: 'ready',
      reportType: 'numerology',
      content: { intro: 'hi' },
    });

    const res = await createApp().request('/v1/prime/reports/numerology', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: { intro: string } };
    expect(body.content.intro).toBe('hi');
  });

  it('returns 202 and fires generation when unlocked but no row exists yet', async () => {
    state.getPrimeReportDefinition.mockReturnValue({ reportType: 'numerology' });
    state.findPrimeReport.mockResolvedValueOnce({ status: 'generating', startedAt: new Date() });

    const res = await createApp().request('/v1/prime/reports/numerology', { headers: AUTH });
    expect(res.status).toBe(202);
  });
});

describe('POST /v1/prime/reports/:reportType/unlock', () => {
  it('404s for an unknown report type', async () => {
    state.getPrimeReportDefinition.mockReturnValue(undefined);
    const res = await createApp().request('/v1/prime/reports/nope/unlock', {
      method: 'POST',
      headers: AUTH,
    });
    expect(res.status).toBe(404);
  });

  it('200s with status unlocked on success', async () => {
    state.getPrimeReportDefinition.mockReturnValue({ reportType: 'numerology' });
    state.unlockReport.mockResolvedValueOnce('unlocked');

    const res = await createApp().request('/v1/prime/reports/numerology/unlock', {
      method: 'POST',
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { status: string }).toEqual({ status: 'unlocked' });
  });

  it('409s when already unlocked or balance is insufficient', async () => {
    state.getPrimeReportDefinition.mockReturnValue({ reportType: 'numerology' });
    state.unlockReport.mockResolvedValueOnce('already_unlocked_or_insufficient_balance');

    const res = await createApp().request('/v1/prime/reports/numerology/unlock', {
      method: 'POST',
      headers: AUTH,
    });
    expect(res.status).toBe(409);
  });
});
