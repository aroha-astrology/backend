import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  runHoroscopeBatch: vi.fn(),
  runAllHoroscopeBatches: vi.fn(),
  requestHoroscopeGeneration: vi.fn(),
  toHoroscopeDto: vi.fn(),
  isStaleGenerating: vi.fn(),
  currentPeriodStart: vi.fn(),
  periodKeyFor: vi.fn(),
  findHoroscope: vi.fn(),
  findKundliByUserId: vi.fn(),
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
  findActiveUserByFirebaseUid: vi.fn(),
  findActiveUserById: vi.fn(),
  findUserByPhoneE164: vi.fn(),
  insertUser: vi.fn(),
  updateUserById: vi.fn(),
  updateUserWithConsentLog: vi.fn(),
  softDeleteUserById: vi.fn(),
  softDeleteBirthProfilesByOwner: vi.fn(),
  revokeDeviceTokensByUser: vi.fn(),
}));

vi.mock('../src/modules/horoscope/horoscope.service.js', () => ({
  runHoroscopeBatch: state.runHoroscopeBatch,
  runAllHoroscopeBatches: state.runAllHoroscopeBatches,
  requestHoroscopeGeneration: state.requestHoroscopeGeneration,
  toHoroscopeDto: state.toHoroscopeDto,
  isStaleGenerating: state.isStaleGenerating,
  currentPeriodStart: state.currentPeriodStart,
  periodKeyFor: state.periodKeyFor,
}));

vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  findHoroscope: state.findHoroscope,
}));

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: state.findKundliByUserId,
}));

const { createApp } = await import('../src/app.js');

const SECRET = 'test-cron-secret';

describe('POST /internal/cron/horoscopes', () => {
  beforeEach(() => {
    state.runAllHoroscopeBatches.mockReset().mockResolvedValue([
      { period: 'daily', forDate: '2026-06-26', processed: 3, generated: 3, skipped: 0, failed: 0 },
      {
        period: 'weekly',
        forDate: '2026-06-22',
        processed: 3,
        generated: 0,
        skipped: 3,
        failed: 0,
      },
      {
        period: 'monthly',
        forDate: '2026-06-01',
        processed: 3,
        generated: 0,
        skipped: 3,
        failed: 0,
      },
      {
        period: 'yearly',
        forDate: '2026-01-01',
        processed: 3,
        generated: 0,
        skipped: 3,
        failed: 0,
      },
    ]);
    state.runHoroscopeBatch.mockReset().mockResolvedValue({
      period: 'daily',
      forDate: '2026-06-26',
      processed: 3,
      generated: 3,
      skipped: 0,
      failed: 0,
    });
  });

  it('rejects with 403 when the cron secret is missing', async () => {
    const res = await createApp().request('/internal/cron/horoscopes', { method: 'POST' });
    expect(res.status).toBe(403);
    expect(state.runAllHoroscopeBatches).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the cron secret is wrong', async () => {
    const res = await createApp().request('/internal/cron/horoscopes', {
      method: 'POST',
      headers: { 'X-Cron-Secret': 'nope' },
    });
    expect(res.status).toBe(403);
    expect(state.runAllHoroscopeBatches).not.toHaveBeenCalled();
  });

  it('runs all 4 periods and returns an array when no period is given', async () => {
    const res = await createApp().request('/internal/cron/horoscopes', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ period: string; generated: number }>;
    expect(body).toHaveLength(4);
    expect(body[0]?.period).toBe('daily');
    expect(state.runAllHoroscopeBatches).toHaveBeenCalledTimes(1);
    expect(state.runHoroscopeBatch).not.toHaveBeenCalled();
  });

  it('runs a single period and returns one object when period is given', async () => {
    const res = await createApp().request('/internal/cron/horoscopes', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: 'daily' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { period: string; generated: number };
    expect(body.generated).toBe(3);
    expect(state.runHoroscopeBatch).toHaveBeenCalledWith('daily', {});
    expect(state.runAllHoroscopeBatches).not.toHaveBeenCalled();
  });

  it('passes through forDate/force/limit options', async () => {
    await createApp().request('/internal/cron/horoscopes', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: 'weekly', forDate: '2026-01-01', force: true, limit: 5 }),
    });
    expect(state.runHoroscopeBatch).toHaveBeenCalledWith('weekly', {
      forDate: '2026-01-01',
      force: true,
      limit: 5,
    });
  });
});

describe('POST /internal/cron/daily-horoscopes (deprecated alias)', () => {
  beforeEach(() => {
    state.runHoroscopeBatch.mockReset().mockResolvedValue({
      period: 'daily',
      forDate: '2026-06-26',
      processed: 3,
      generated: 3,
      skipped: 0,
      failed: 0,
    });
  });

  it('delegates to runHoroscopeBatch("daily", ...)', async () => {
    const res = await createApp().request('/internal/cron/daily-horoscopes', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ forDate: '2026-01-01' }),
    });
    expect(res.status).toBe(200);
    expect(state.runHoroscopeBatch).toHaveBeenCalledWith('daily', { forDate: '2026-01-01' });
  });
});

describe('GET /v1/horoscope', () => {
  beforeEach(() => {
    state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid
      .mockReset()
      .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
    state.findHoroscope.mockReset();
    state.requestHoroscopeGeneration.mockReset().mockResolvedValue('generated');
    state.toHoroscopeDto.mockReset();
    state.isStaleGenerating.mockReset().mockReturnValue(false);
    state.currentPeriodStart.mockReset().mockReturnValue('2026-06-26');
    state.periodKeyFor.mockReset().mockReturnValue('2026-06-26');
    state.findKundliByUserId.mockReset().mockResolvedValue(undefined);
  });

  const AUTH = { Authorization: 'Bearer token' } as const;

  it('returns 202 generating when no row exists yet, and fires generation', async () => {
    state.findHoroscope.mockResolvedValueOnce(undefined);

    const res = await createApp().request('/v1/horoscope', { headers: AUTH });
    expect(res.status).toBe(202);
    expect((await res.json()) as { status: string }).toEqual({ status: 'generating' });
    expect(state.requestHoroscopeGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id-1' }),
      expect.objectContaining({ birthProfileId: null }),
      'daily',
      { retryForever: true },
    );
  });

  it('returns 200 with the horoscope when a ready row exists', async () => {
    state.findHoroscope.mockResolvedValueOnce({
      status: 'ready',
      forDate: '2026-06-26',
      summary: 'Lorem',
    });
    state.toHoroscopeDto.mockReturnValueOnce({
      forDate: '2026-06-26',
      summary: 'Lorem',
      model: 'stub',
      generatedAt: 'x',
    });

    const res = await createApp().request('/v1/horoscope', { headers: AUTH });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { summary: string }).summary).toBe('Lorem');
    expect(state.requestHoroscopeGeneration).not.toHaveBeenCalled();
  });

  it('returns 202 generating (no re-fire) for a fresh in-flight generating row', async () => {
    state.findHoroscope.mockResolvedValueOnce({ status: 'generating', updatedAt: new Date() });
    state.isStaleGenerating.mockReturnValueOnce(false);

    const res = await createApp().request('/v1/horoscope', { headers: AUTH });
    expect(res.status).toBe(202);
    expect((await res.json()) as { status: string }).toEqual({ status: 'generating' });
    expect(state.requestHoroscopeGeneration).not.toHaveBeenCalled();
  });

  it('passes through the requested period', async () => {
    state.findHoroscope.mockResolvedValueOnce({
      status: 'ready',
      forDate: '2026-01-01',
      summary: 'Lorem',
    });
    state.toHoroscopeDto.mockReturnValueOnce({
      forDate: '2026-01-01',
      summary: 'Lorem',
      model: 'stub',
      generatedAt: 'x',
    });

    const res = await createApp().request('/v1/horoscope?period=yearly', { headers: AUTH });
    expect(res.status).toBe(200);
    expect(state.periodKeyFor).toHaveBeenCalledWith('yearly', expect.any(String));
  });

  it('requires auth', async () => {
    const res = await createApp().request('/v1/horoscope');
    expect(res.status).toBe(401);
  });
});
