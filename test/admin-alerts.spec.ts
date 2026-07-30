import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeEnv = { LOG_LEVEL: 'silent' };
vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));

const state = vi.hoisted(() => ({
  countUsersActiveSince: vi.fn(),
  countNewUsersSince: vi.fn(),
  countUsers: vi.fn(),
  alertThrottled: vi.fn().mockResolvedValue(undefined),
  sendAlert: vi.fn().mockResolvedValue(true),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  countUsersActiveSince: state.countUsersActiveSince,
  countNewUsersSince: state.countNewUsersSince,
  countUsers: state.countUsers,
}));

vi.mock('../src/lib/notifications/alerts.js', () => ({
  alertThrottled: state.alertThrottled,
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  sendAlert: state.sendAlert,
}));

const redisData = new Map<string, string>();
vi.mock('../src/config/redis.js', () => ({
  getRedis: () => ({
    get: (key: string) => Promise.resolve(redisData.get(key) ?? null),
    set: (key: string, value: string) => {
      redisData.set(key, value);
      return Promise.resolve('OK');
    },
  }),
}));

const {
  checkMilestone,
  checkConcurrentActivity,
  checkNewUserBurst,
  checkTotalUserMilestone,
  MILESTONE_THRESHOLDS,
} = await import('../src/modules/admin-alerts/admin-alerts.service.js');

function makeStore() {
  const data = new Map<string, string>();
  return {
    get: (k: string) => Promise.resolve(data.get(k) ?? null),
    set: (k: string, v: string) => {
      data.set(k, v);
      return Promise.resolve();
    },
  };
}

beforeEach(() => {
  redisData.clear();
  state.countUsersActiveSince.mockReset();
  state.countNewUsersSince.mockReset();
  state.countUsers.mockReset();
  state.alertThrottled.mockReset().mockResolvedValue(undefined);
  state.sendAlert.mockReset().mockResolvedValue(true);
});

describe('checkMilestone', () => {
  it('seeds silently on first observation instead of alerting a false backlog', async () => {
    const store = makeStore();
    const crossed = await checkMilestone(store, 'k', 220, MILESTONE_THRESHOLDS, true);
    expect(crossed).toBeNull();
  });

  it('fires once when a monotonic count crosses a new threshold', async () => {
    const store = makeStore();
    await checkMilestone(store, 'k', 40, MILESTONE_THRESHOLDS, true); // seeds at band 0
    const crossed = await checkMilestone(store, 'k', 55, MILESTONE_THRESHOLDS, true);
    expect(crossed).toBe(50);
  });

  it('never re-fires the same threshold for a monotonic count', async () => {
    const store = makeStore();
    await checkMilestone(store, 'k', 55, MILESTONE_THRESHOLDS, true); // seeds at band 50
    const crossed = await checkMilestone(store, 'k', 60, MILESTONE_THRESHOLDS, true);
    expect(crossed).toBeNull();
  });

  it('reports the highest threshold when a monotonic count jumps past several at once', async () => {
    const store = makeStore();
    await checkMilestone(store, 'k', 10, MILESTONE_THRESHOLDS, true); // seeds at band 0
    const crossed = await checkMilestone(store, 'k', 300, MILESTONE_THRESHOLDS, true);
    expect(crossed).toBe(250);
  });

  it('re-arms a non-monotonic count after it drops back below a threshold', async () => {
    const store = makeStore();
    await checkMilestone(store, 'k', 60, MILESTONE_THRESHOLDS, false); // seeds at band 50
    await checkMilestone(store, 'k', 10, MILESTONE_THRESHOLDS, false); // drops to band 0, silent
    const crossed = await checkMilestone(store, 'k', 55, MILESTONE_THRESHOLDS, false);
    expect(crossed).toBe(50);
  });
});

describe('checkConcurrentActivity', () => {
  it('alerts (throttled) when more than 15 users are active', async () => {
    state.countUsersActiveSince.mockResolvedValueOnce(20);
    await checkConcurrentActivity();
    expect(state.alertThrottled).toHaveBeenCalledWith(
      'concurrent-active',
      expect.any(String),
      expect.stringContaining('20'),
    );
  });

  it('does not alert at or below 15 active users', async () => {
    state.countUsersActiveSince.mockResolvedValueOnce(15);
    await checkConcurrentActivity();
    expect(state.alertThrottled).not.toHaveBeenCalled();
  });

  it('sends a milestone alert when the online count crosses a new band', async () => {
    redisData.set('admin-alert:online-milestone-band', '0'); // pre-seeded
    state.countUsersActiveSince.mockResolvedValueOnce(60);
    const result = await checkConcurrentActivity();
    expect(result.onlineMilestoneCrossed).toBe(50);
    expect(state.sendAlert).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('50'));
  });
});

describe('checkNewUserBurst', () => {
  it('alerts (throttled) when 10+ new users signed up in the last 15 minutes', async () => {
    state.countNewUsersSince.mockResolvedValueOnce(12);
    await checkNewUserBurst();
    expect(state.alertThrottled).toHaveBeenCalledWith(
      'new-user-burst',
      expect.any(String),
      expect.stringContaining('12'),
    );
  });

  it('does not alert below the burst threshold', async () => {
    state.countNewUsersSince.mockResolvedValueOnce(9);
    await checkNewUserBurst();
    expect(state.alertThrottled).not.toHaveBeenCalled();
  });
});

describe('checkTotalUserMilestone', () => {
  it('sends a milestone alert once a new threshold is crossed', async () => {
    redisData.set('admin-alert:total-milestone', '0');
    state.countUsers.mockResolvedValueOnce(101);
    await checkTotalUserMilestone();
    expect(state.sendAlert).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('100'),
    );
  });

  it('does not re-fire a threshold already recorded', async () => {
    redisData.set('admin-alert:total-milestone', '100');
    state.countUsers.mockResolvedValueOnce(120);
    await checkTotalUserMilestone();
    expect(state.sendAlert).not.toHaveBeenCalled();
  });
});
