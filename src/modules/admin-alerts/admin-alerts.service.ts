import { getRedis } from '../../config/redis.js';
import { alertThrottled } from '../../lib/notifications/alerts.js';
import { sendAlert } from '../../lib/notifications/telegram.js';
import { countUsersActiveSince, countNewUsersSince, countUsers } from '../users/users.repo.js';
import { insertOnlineSample } from './admin-alerts.repo.js';

export const MILESTONE_THRESHOLDS = [50, 100, 250, 500];

export const CONCURRENT_ACTIVE_THRESHOLD = 15;
export const CONCURRENT_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
export const NEW_USER_BURST_THRESHOLD = 10;
export const NEW_USER_BURST_WINDOW_MS = 15 * 60 * 1000;

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** Redis-backed KeyValueStore for milestone-band tracking — same getRedis() client as rate-limit.ts/locks.ts. */
const redisStore: KeyValueStore = {
  get: (key) => getRedis().get(key),
  set: async (key, value) => {
    await getRedis().set(key, value);
  },
};

/**
 * Detects a newly-crossed threshold in `thresholds` (ascending) for `count`,
 * persisting the highest band reached under `key` in `store`.
 *
 * The FIRST observation of a key always seeds silently (returns null) rather
 * than reporting whatever threshold `count` already happens to sit above —
 * otherwise deploying this against an existing user base fires a false
 * backlog of "milestone reached" alerts for thresholds crossed long ago.
 *
 * `monotonic: true` (total registered users — only grows) never re-fires a
 * threshold once passed, even if `count` somehow reports lower later.
 * `monotonic: false` (concurrent/online users — fluctuates) re-arms once the
 * count drops back below a threshold, so a later re-crossing fires again.
 */
export async function checkMilestone(
  store: KeyValueStore,
  key: string,
  count: number,
  thresholds: number[],
  monotonic: boolean,
): Promise<number | null> {
  const currentBand = [...thresholds].reverse().find((t) => count >= t) ?? 0;
  const raw = await store.get(key);

  if (raw === null) {
    await store.set(key, String(currentBand));
    return null;
  }

  const stored = Number(raw);
  if (currentBand === stored) return null;
  if (monotonic && currentBand < stored) return null;

  await store.set(key, String(currentBand));
  return currentBand > stored ? currentBand : null;
}

/**
 * Polled every 2 minutes by POST /internal/cron/live-activity-check.
 * "Logged in simultaneously" is defined as active in the last 5 minutes,
 * reusing the lastActiveAt heartbeat requireUser already bumps on every
 * authenticated request — no separate online-presence tracking exists.
 */
export async function checkConcurrentActivity(): Promise<{
  activeCount: number;
  onlineMilestoneCrossed: number | null;
}> {
  const activeCount = await countUsersActiveSince(
    new Date(Date.now() - CONCURRENT_ACTIVE_WINDOW_MS),
  );
  void insertOnlineSample(activeCount);

  if (activeCount > CONCURRENT_ACTIVE_THRESHOLD) {
    void alertThrottled(
      'concurrent-active',
      '🔥 High concurrent activity',
      `${activeCount} users active in the last 5 minutes (threshold: ${CONCURRENT_ACTIVE_THRESHOLD}).`,
    );
  }

  const onlineMilestoneCrossed = await checkMilestone(
    redisStore,
    'admin-alert:online-milestone-band',
    activeCount,
    MILESTONE_THRESHOLDS,
    false,
  );
  if (onlineMilestoneCrossed !== null) {
    void sendAlert(
      '🎉 Live user milestone',
      `Concurrent live users just crossed ${onlineMilestoneCrossed}! (currently ${activeCount})`,
    );
  }

  return { activeCount, onlineMilestoneCrossed };
}

/** Fire-and-forget from POST /v1/auth/session whenever a new user is created. */
export async function checkNewUserBurst(): Promise<void> {
  const newCount = await countNewUsersSince(new Date(Date.now() - NEW_USER_BURST_WINDOW_MS));
  if (newCount >= NEW_USER_BURST_THRESHOLD) {
    void alertThrottled(
      'new-user-burst',
      '🚀 New user signup burst',
      `${newCount} new users signed up in the last 15 minutes.`,
    );
  }
}

/** Fire-and-forget from POST /v1/auth/session whenever a new user is created. */
export async function checkTotalUserMilestone(): Promise<void> {
  const total = await countUsers();
  const crossed = await checkMilestone(
    redisStore,
    'admin-alert:total-milestone',
    total,
    MILESTONE_THRESHOLDS,
    true,
  );
  if (crossed !== null) {
    void sendAlert(
      '🎉 Growth milestone',
      `Aroha just crossed ${crossed} total registered users! (currently ${total})`,
    );
  }
}
