import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  findUserByPhoneE164: vi.fn(),
  resolveProfileContext: vi.fn(),
  listKundlisByUserId: vi.fn(),
  findKundliByUserId: vi.fn(),
  listHoroscopesByUserId: vi.fn(),
  requestHoroscopeGeneration: vi.fn(),
  regenerateDoshaForUser: vi.fn(),
  requestGemstoneGeneration: vi.fn(),
  findActiveTokensForUser: vi.fn(),
  countActiveDeviceTokensByPlatform: vi.fn(),
  sendPushBatch: vi.fn(),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findUserByPhoneE164: state.findUserByPhoneE164,
}));

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveProfileContext: state.resolveProfileContext,
}));

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  listKundlisByUserId: state.listKundlisByUserId,
  findKundliByUserId: state.findKundliByUserId,
}));

vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  regenerateDoshaForUser: state.regenerateDoshaForUser,
}));

vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  listHoroscopesByUserId: state.listHoroscopesByUserId,
}));

vi.mock('../src/modules/horoscope/horoscope.service.js', () => ({
  HOROSCOPE_PERIODS: ['daily', 'tomorrow', 'weekly', 'monthly', 'yearly'],
  currentPeriodStart: (period: string) => `2026-07-${period === 'daily' ? '23' : '24'}`,
  requestHoroscopeGeneration: state.requestHoroscopeGeneration,
}));

vi.mock('../src/modules/gemstone/gemstone.service.js', () => ({
  requestGemstoneGeneration: state.requestGemstoneGeneration,
}));

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  findActiveTokensForUser: state.findActiveTokensForUser,
  countActiveDeviceTokensByPlatform: state.countActiveDeviceTokensByPlatform,
}));

vi.mock('../src/lib/notifications/fcm.js', () => ({
  sendPushBatch: state.sendPushBatch,
}));

const { inspectUserByPhone, notifyUserByPhone, startRegeneration, getDeviceTokenStats } =
  await import('../src/modules/admin/admin.service.js');

const PROFILE = {
  birthProfileId: null,
  displayName: null,
  gender: null,
  dateOfBirth: null,
  timeOfBirth: null,
  placeOfBirth: null,
  birthTimeAccuracy: null,
  birthTimeSource: null,
  birthLocationAccuracy: null,
  unlockedHouses: [] as number[],
  gemstoneUnlockedAt: null,
};

beforeEach(() => {
  state.findUserByPhoneE164.mockReset();
  state.resolveProfileContext.mockReset().mockResolvedValue(PROFILE);
  state.listKundlisByUserId.mockReset().mockResolvedValue([]);
  state.findKundliByUserId.mockReset();
  state.listHoroscopesByUserId.mockReset().mockResolvedValue([]);
  state.requestHoroscopeGeneration.mockReset().mockResolvedValue('generated');
  state.regenerateDoshaForUser.mockReset().mockResolvedValue('updated');
  state.requestGemstoneGeneration.mockReset().mockResolvedValue('generated');
  state.findActiveTokensForUser.mockReset().mockResolvedValue([]);
  state.countActiveDeviceTokensByPlatform.mockReset().mockResolvedValue([]);
  state.sendPushBatch.mockReset().mockResolvedValue({ success: 0, failure: 0 });
});

describe('inspectUserByPhone', () => {
  it('throws a 404 AppError for an unknown phone', async () => {
    state.findUserByPhoneE164.mockResolvedValueOnce(undefined);
    await expect(inspectUserByPhone('+919999999999')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns the user profile plus every kundli and horoscope row', async () => {
    const now = new Date('2026-07-01T00:00:00Z');
    state.findUserByPhoneE164.mockResolvedValueOnce(
      makeUserRow({ id: 'u1', phoneE164: '+919999999999', createdAt: now, updatedAt: now }),
    );
    state.listKundlisByUserId.mockResolvedValueOnce([
      {
        birthProfileId: null,
        status: 'ready',
        error: null,
        updatedAt: now,
        chartData: { ascendant: {} },
        dashaData: null,
        yogaData: null,
        doshaData: null,
        ashtakavargaData: null,
      },
    ]);
    state.listHoroscopesByUserId.mockResolvedValueOnce([
      {
        birthProfileId: null,
        period: 'daily',
        forDate: '2026-07-01',
        periodKey: '2026-07-01',
        status: 'ready',
        model: 'gemini',
        summary: 'hook',
        structured: null,
        monthlyBreakdown: null,
        error: null,
        updatedAt: now,
      },
    ]);

    const dump = await inspectUserByPhone('+919999999999');

    expect(dump.user.id).toBe('u1');
    expect(dump.kundlis).toHaveLength(1);
    expect(dump.horoscopes).toHaveLength(1);
    expect(dump.horoscopes[0]?.summary).toBe('hook');
  });
});

describe('notifyUserByPhone', () => {
  it('throws a 404 AppError for an unknown phone', async () => {
    state.findUserByPhoneE164.mockResolvedValueOnce(undefined);
    await expect(notifyUserByPhone('+919999999999', 'Hi', 'body')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('reports tokenCount=0 without calling sendPushBatch when the user has no active devices', async () => {
    state.findUserByPhoneE164.mockResolvedValueOnce(makeUserRow({ id: 'u1' }));
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    const result = await notifyUserByPhone('+919999999999', 'Hi', 'body');

    expect(result).toEqual({ tokenCount: 0, success: 0, failure: 0 });
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });

  it('sends to every active device token and reports the fcm result', async () => {
    state.findUserByPhoneE164.mockResolvedValueOnce(makeUserRow({ id: 'u1' }));
    state.findActiveTokensForUser.mockResolvedValueOnce([{ token: 'tok-a' }, { token: 'tok-b' }]);
    state.sendPushBatch.mockResolvedValueOnce({ success: 2, failure: 0 });

    const result = await notifyUserByPhone('+919999999999', 'Hi', 'body');

    expect(state.sendPushBatch).toHaveBeenCalledWith(['tok-a', 'tok-b'], 'Hi', 'body');
    expect(result).toEqual({ tokenCount: 2, success: 2, failure: 0 });
  });
});

describe('startRegeneration', () => {
  it('throws a 404 AppError for an unknown phone and dispatches nothing', async () => {
    state.findUserByPhoneE164.mockResolvedValueOnce(undefined);
    await expect(startRegeneration('+919999999999', 'all')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(state.requestHoroscopeGeneration).not.toHaveBeenCalled();
  });

  it("category 'horoscope' fires all 5 periods and nothing else", async () => {
    state.findUserByPhoneE164.mockResolvedValueOnce(makeUserRow({ id: 'u1' }));

    await startRegeneration('+919999999999', 'horoscope');

    await vi.waitFor(() => {
      expect(state.requestHoroscopeGeneration).toHaveBeenCalledTimes(5);
    });
    expect(state.regenerateDoshaForUser).not.toHaveBeenCalled();
    expect(state.requestGemstoneGeneration).not.toHaveBeenCalled();
  });

  it("category 'dosha' calls kundli.service's regenerateDoshaForUser only", async () => {
    state.findUserByPhoneE164.mockResolvedValueOnce(makeUserRow({ id: 'u1' }));

    await startRegeneration('+919999999999', 'dosha');

    await vi.waitFor(() => {
      expect(state.regenerateDoshaForUser).toHaveBeenCalledWith('u1', null);
    });
    expect(state.requestHoroscopeGeneration).not.toHaveBeenCalled();
    expect(state.requestGemstoneGeneration).not.toHaveBeenCalled();
  });

  it("category 'gemstone' skips generation when there's no ready kundli yet", async () => {
    state.findUserByPhoneE164.mockResolvedValueOnce(makeUserRow({ id: 'u1' }));
    state.findKundliByUserId.mockResolvedValueOnce(undefined);

    await startRegeneration('+919999999999', 'gemstone');

    await vi.waitFor(() => {
      expect(state.findKundliByUserId).toHaveBeenCalled();
    });
    expect(state.requestGemstoneGeneration).not.toHaveBeenCalled();
  });

  it("category 'gemstone' regenerates when a ready kundli exists", async () => {
    state.findUserByPhoneE164.mockResolvedValueOnce(makeUserRow({ id: 'u1' }));
    state.findKundliByUserId.mockResolvedValueOnce({
      status: 'ready',
      chartData: { ascendant: {} },
    });

    await startRegeneration('+919999999999', 'gemstone');

    await vi.waitFor(() => {
      expect(state.requestGemstoneGeneration).toHaveBeenCalledWith(
        'u1',
        null,
        { chartData: { ascendant: {} } },
        { force: true },
      );
    });
  });

  it("category 'all' fires horoscope, dosha, and gemstone", async () => {
    state.findUserByPhoneE164.mockResolvedValueOnce(makeUserRow({ id: 'u1' }));
    state.findKundliByUserId.mockResolvedValueOnce({ status: 'ready', chartData: {} });

    await startRegeneration('+919999999999', 'all');

    await vi.waitFor(() => {
      expect(state.requestHoroscopeGeneration).toHaveBeenCalledTimes(5);
      expect(state.regenerateDoshaForUser).toHaveBeenCalled();
      expect(state.requestGemstoneGeneration).toHaveBeenCalled();
    });
  });
});

describe('getDeviceTokenStats', () => {
  it('sums per-platform counts into a total', async () => {
    state.countActiveDeviceTokensByPlatform.mockResolvedValueOnce([
      { platform: 'ios', count: 3 },
      { platform: 'android', count: 5 },
    ]);

    const stats = await getDeviceTokenStats();

    expect(stats).toEqual({ total: 8, byPlatform: { ios: 3, android: 5 } });
  });
});
