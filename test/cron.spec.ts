import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  runDailyHoroscopes: vi.fn(),
  getHoroscopeForUser: vi.fn(),
  toHoroscopeDto: vi.fn(),
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
  runDailyHoroscopes: state.runDailyHoroscopes,
  getHoroscopeForUser: state.getHoroscopeForUser,
  toHoroscopeDto: state.toHoroscopeDto,
}));

const { createApp } = await import('../src/app.js');

const SECRET = 'test-cron-secret';

describe('POST /internal/cron/daily-horoscopes', () => {
  beforeEach(() => {
    state.runDailyHoroscopes
      .mockReset()
      .mockResolvedValue({
        forDate: '2026-06-26',
        processed: 3,
        generated: 3,
        skipped: 0,
        failed: 0,
      });
  });

  it('rejects with 403 when the cron secret is missing', async () => {
    const res = await createApp().request('/internal/cron/daily-horoscopes', { method: 'POST' });
    expect(res.status).toBe(403);
    expect(state.runDailyHoroscopes).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the cron secret is wrong', async () => {
    const res = await createApp().request('/internal/cron/daily-horoscopes', {
      method: 'POST',
      headers: { 'X-Cron-Secret': 'nope' },
    });
    expect(res.status).toBe(403);
    expect(state.runDailyHoroscopes).not.toHaveBeenCalled();
  });

  it('runs the batch and returns the summary with the correct secret', async () => {
    const res = await createApp().request('/internal/cron/daily-horoscopes', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { generated: number };
    expect(body.generated).toBe(3);
    expect(state.runDailyHoroscopes).toHaveBeenCalledTimes(1);
  });

  it('passes through forDate/force/limit options', async () => {
    await createApp().request('/internal/cron/daily-horoscopes', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ forDate: '2026-01-01', force: true, limit: 5 }),
    });
    expect(state.runDailyHoroscopes).toHaveBeenCalledWith({
      forDate: '2026-01-01',
      force: true,
      limit: 5,
    });
  });
});

describe('GET /v1/horoscope', () => {
  beforeEach(() => {
    state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid
      .mockReset()
      .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
    state.getHoroscopeForUser.mockReset();
    state.toHoroscopeDto.mockReset();
  });

  const AUTH = { Authorization: 'Bearer token' } as const;

  it("returns 200 with today's horoscope", async () => {
    state.getHoroscopeForUser.mockResolvedValueOnce({ forDate: '2026-06-26', summary: 'Lorem' });
    state.toHoroscopeDto.mockReturnValueOnce({
      forDate: '2026-06-26',
      summary: 'Lorem',
      model: 'stub',
      generatedAt: 'x',
    });

    const res = await createApp().request('/v1/horoscope', { headers: AUTH });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { summary: string }).summary).toBe('Lorem');
  });

  it('returns 404 when no horoscope exists for today', async () => {
    state.getHoroscopeForUser.mockResolvedValueOnce(undefined);

    const res = await createApp().request('/v1/horoscope', { headers: AUTH });
    expect(res.status).toBe(404);
  });

  it('requires auth', async () => {
    const res = await createApp().request('/v1/horoscope');
    expect(res.status).toBe(401);
  });
});
