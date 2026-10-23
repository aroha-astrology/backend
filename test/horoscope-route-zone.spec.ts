import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

vi.mock('../src/config/redis.js', () => ({
  getRedis: () => ({
    eval: (_script: string, numKeys: number, _key: string, windowMs: number) =>
      Promise.resolve(numKeys === 1 ? [1, Number(windowMs)] : [1, 0]),
  }),
}));

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  findHoroscope: vi.fn(),
  requestHoroscopeGeneration: vi.fn(),
  toHoroscopeDto: vi.fn(),
  isStaleGenerating: vi.fn(),
  currentPeriodStart: vi.fn(),
  periodKeyFor: vi.fn(),
  findKundliByUserId: vi.fn(),
  findOwnedBirthProfile: vi.fn(),
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
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/horoscope/horoscope.service.js', () => ({
  requestHoroscopeGeneration: state.requestHoroscopeGeneration,
  toHoroscopeDto: state.toHoroscopeDto,
  isStaleGenerating: state.isStaleGenerating,
  currentPeriodStart: state.currentPeriodStart,
  periodKeyFor: state.periodKeyFor,
  runHoroscopeBatch: vi.fn(),
  runAllHoroscopeBatches: vi.fn(),
  runHoroscopeSelfHeal: vi.fn(),
}));

vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  findHoroscope: state.findHoroscope,
}));

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: state.findKundliByUserId,
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  findOwnedBirthProfile: state.findOwnedBirthProfile,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token' } as const;

// GET /v1/horoscope reads the reader's own day: the zone the device sends,
// else the zone saved on the account, else IST. The date it picks is the one
// generation then writes, so the row it later finds is the same row.
describe('GET /v1/horoscope on the reader clock', () => {
  beforeEach(() => {
    state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid
      .mockReset()
      .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
    state.findHoroscope.mockReset().mockResolvedValue(undefined);
    state.requestHoroscopeGeneration.mockReset().mockResolvedValue('generated');
    state.toHoroscopeDto.mockReset();
    state.isStaleGenerating.mockReset().mockReturnValue(false);
    state.currentPeriodStart.mockReset().mockReturnValue('2026-10-20');
    state.periodKeyFor.mockReset().mockImplementation((_p: string, d: string) => d);
    state.findKundliByUserId.mockReset().mockResolvedValue(undefined);
    state.findOwnedBirthProfile.mockReset();
  });

  it('uses the zone the device sends', async () => {
    const res = await createApp().request('/v1/horoscope?period=daily&tz=America%2FNew_York', {
      headers: AUTH,
    });
    expect(res.status).toBe(202);
    expect(state.currentPeriodStart).toHaveBeenCalledWith('daily', 'America/New_York');
  });

  it('falls back to the saved zone, then to IST', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', currentTimezone: 'Europe/London' }),
    );
    await createApp().request('/v1/horoscope?period=weekly', { headers: AUTH });
    expect(state.currentPeriodStart).toHaveBeenLastCalledWith('weekly', 'Europe/London');

    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', currentTimezone: null }),
    );
    await createApp().request('/v1/horoscope?period=weekly&tz=Not%2FAZone', { headers: AUTH });
    expect(state.currentPeriodStart).toHaveBeenLastCalledWith('weekly', 'Asia/Kolkata');
  });

  it('looks up and generates the reader day, not India day', async () => {
    await createApp().request('/v1/horoscope?period=daily&tz=America%2FNew_York', {
      headers: AUTH,
    });
    expect(state.findHoroscope).toHaveBeenCalledWith('id-1', null, 'daily', '2026-10-20');
    expect(state.requestHoroscopeGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id-1' }),
      expect.anything(),
      'daily',
      { forDate: '2026-10-20', retryForever: true },
    );
  });
});
