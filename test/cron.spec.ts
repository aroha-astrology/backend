import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BirthProfileRow } from '../src/db/schema.js';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  findOwnedBirthProfile: vi.fn(),
  runHoroscopeBatch: vi.fn(),
  runAllHoroscopeBatches: vi.fn(),
  runHoroscopeSelfHeal: vi.fn(),
  requestHoroscopeGeneration: vi.fn(),
  toHoroscopeDto: vi.fn(),
  isStaleGenerating: vi.fn(),
  currentPeriodStart: vi.fn(),
  periodKeyFor: vi.fn(),
  findHoroscope: vi.fn(),
  findKundliByUserId: vi.fn(),
  broadcastPeriodReading: vi.fn(),
  checkConcurrentActivity: vi.fn(),
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
  runHoroscopeBatch: state.runHoroscopeBatch,
  runAllHoroscopeBatches: state.runAllHoroscopeBatches,
  runHoroscopeSelfHeal: state.runHoroscopeSelfHeal,
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

vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  findOwnedBirthProfile: state.findOwnedBirthProfile,
}));

vi.mock('../src/modules/cron/broadcast.service.js', () => ({
  broadcastPeriodReading: state.broadcastPeriodReading,
}));

vi.mock('../src/modules/admin-alerts/admin-alerts.service.js', () => ({
  checkConcurrentActivity: state.checkConcurrentActivity,
}));

const { createApp } = await import('../src/app.js');

const SECRET = 'test-cron-secret';

function makeBirthProfileRow(overrides: Partial<BirthProfileRow> = {}): BirthProfileRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'profile-a',
    ownerUserId: 'id-1',
    relationship: 'partner',
    displayName: 'Bob',
    gender: 'male',
    dateOfBirth: '1990-05-10',
    timeOfBirth: '08:15:00',
    placeOfBirth: { name: 'Delhi', lat: 28.6, lon: 77.2, tz: 'Asia/Kolkata' },
    birthTimeAccuracy: 'exact',
    birthTimeSource: 'birth_certificate',
    birthLocationAccuracy: 'exact',
    gotra: null,
    addedWithConsent: true,
    notes: null,
    unlockedHouses: [3],
    gemstoneUnlockedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

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

describe('POST /internal/cron/horoscopes-selfheal', () => {
  beforeEach(() => {
    state.runHoroscopeSelfHeal.mockReset().mockResolvedValue({
      processed: 5,
      generated: 1,
      skipped: 3,
      failed: 1,
    });
  });

  it('rejects with 403 when the cron secret is missing', async () => {
    const res = await createApp().request('/internal/cron/horoscopes-selfheal', { method: 'POST' });
    expect(res.status).toBe(403);
    expect(state.runHoroscopeSelfHeal).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the cron secret is wrong', async () => {
    const res = await createApp().request('/internal/cron/horoscopes-selfheal', {
      method: 'POST',
      headers: { 'X-Cron-Secret': 'nope' },
    });
    expect(res.status).toBe(403);
    expect(state.runHoroscopeSelfHeal).not.toHaveBeenCalled();
  });

  it('runs the self-heal sweep and returns its result', async () => {
    const res = await createApp().request('/internal/cron/horoscopes-selfheal', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      processed: number;
      generated: number;
      skipped: number;
      failed: number;
    };
    expect(body).toEqual({ processed: 5, generated: 1, skipped: 3, failed: 1 });
    expect(state.runHoroscopeSelfHeal).toHaveBeenCalledWith({});
  });

  it('passes through an explicit limit', async () => {
    await createApp().request('/internal/cron/horoscopes-selfheal', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50 }),
    });
    expect(state.runHoroscopeSelfHeal).toHaveBeenCalledWith({ limit: 50 });
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
    state.findOwnedBirthProfile.mockReset();
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

describe('GET /v1/horoscope — additional (non-primary) profile', () => {
  beforeEach(() => {
    state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid
      .mockReset()
      .mockResolvedValue(
        makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', activeProfileId: 'profile-a' }),
      );
    state.findOwnedBirthProfile.mockReset().mockResolvedValue(makeBirthProfileRow());
    state.findHoroscope.mockReset();
    state.requestHoroscopeGeneration.mockReset().mockResolvedValue('generated');
    state.toHoroscopeDto.mockReset();
    state.isStaleGenerating.mockReset().mockReturnValue(false);
    state.currentPeriodStart.mockReset().mockReturnValue('2026-06-26');
    state.periodKeyFor.mockReset().mockReturnValue('2026-06-26');
    state.findKundliByUserId.mockReset().mockResolvedValue(undefined);
  });

  const AUTH = { Authorization: 'Bearer token' } as const;

  it('resolves the active additional profile and threads its birthProfileId through findHoroscope', async () => {
    state.findHoroscope.mockResolvedValueOnce(undefined);

    const res = await createApp().request('/v1/horoscope', { headers: AUTH });

    expect(res.status).toBe(202);
    expect(state.findOwnedBirthProfile).toHaveBeenCalledWith('profile-a', 'id-1');
    expect(state.findHoroscope).toHaveBeenCalledWith('id-1', 'profile-a', 'daily', '2026-06-26');
    expect(state.requestHoroscopeGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id-1' }),
      expect.objectContaining({ birthProfileId: 'profile-a', displayName: 'Bob' }),
      'daily',
      { retryForever: true },
    );
  });

  it('threads the additional profile’s birthProfileId through findKundliByUserId when the horoscope is ready', async () => {
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
    expect(state.findKundliByUserId).toHaveBeenCalledWith('id-1', 'profile-a');
  });
});

describe('POST /internal/cron/broadcast-reading', () => {
  beforeEach(() => {
    state.broadcastPeriodReading.mockReset();
  });

  it('rejects with 403 when the cron secret is missing', async () => {
    const res = await createApp().request('/internal/cron/broadcast-reading', { method: 'POST' });
    expect(res.status).toBe(403);
    expect(state.broadcastPeriodReading).not.toHaveBeenCalled();
  });

  // BROADCAST_READING_DISABLED (cron.routes.ts) — no horoscope broadcast
  // notification fires, per 2026-08-07 user request. Route short-circuits
  // before ever calling broadcastPeriodReading.
  it('is disabled: never calls broadcastPeriodReading, returns skipped/disabled', async () => {
    const res = await createApp().request('/internal/cron/broadcast-reading', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ period: 'weekly', force: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { period: string; skipped: boolean; reason: string };
    expect(body).toEqual(
      expect.objectContaining({ period: 'weekly', skipped: true, reason: 'disabled' }),
    );
    expect(state.broadcastPeriodReading).not.toHaveBeenCalled();
  });

  it('defaults the disabled response period to "daily" when the body is omitted', async () => {
    const res = await createApp().request('/internal/cron/broadcast-reading', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { period: string };
    expect(body.period).toBe('daily');
    expect(state.broadcastPeriodReading).not.toHaveBeenCalled();
  });
});

describe('POST /internal/cron/broadcast-daily-reading (deprecated alias)', () => {
  beforeEach(() => {
    state.broadcastPeriodReading.mockReset();
  });

  it('is disabled: never calls broadcastPeriodReading, returns skipped/disabled', async () => {
    const res = await createApp().request('/internal/cron/broadcast-daily-reading', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { period: string; skipped: boolean; reason: string };
    expect(body).toEqual(
      expect.objectContaining({ period: 'daily', skipped: true, reason: 'disabled' }),
    );
    expect(state.broadcastPeriodReading).not.toHaveBeenCalled();
  });
});

describe('POST /internal/cron/live-activity-check', () => {
  beforeEach(() => {
    state.checkConcurrentActivity.mockReset();
  });

  it('rejects a missing cron secret', async () => {
    const app = createApp();
    const res = await app.request('/internal/cron/live-activity-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(403);
  });

  it('runs the check and returns its result', async () => {
    state.checkConcurrentActivity.mockResolvedValueOnce({
      activeCount: 20,
      onlineMilestoneCrossed: null,
    });

    const app = createApp();
    const res = await app.request('/internal/cron/live-activity-check', {
      method: 'POST',
      headers: { 'X-Cron-Secret': SECRET, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      activeCount: number;
      onlineMilestoneCrossed: number | null;
    };
    expect(body.activeCount).toBe(20);
    expect(body.onlineMilestoneCrossed).toBeNull();
  });
});
