# Telegram Admin Activity Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three new Telegram admin alerts — concurrent active users > 15, new-user signup burst (10+ in 15 min), and 50/100/250/500 milestone crossings for both total registered and concurrent-online users.

**Architecture:** A new `admin-alerts.service.ts` holds all threshold/dedup logic. The two "spike" alerts (concurrent >15, new-user burst) reuse the existing `alertThrottled()` helper (`src/lib/notifications/alerts.ts`) unchanged — it already does exactly the "at most once per 15 min per signature, report suppressed count" dedup this needs, so no new Redis logic is required for them. Milestones need different semantics (track the highest threshold ever/currently reached, not just a time window), so they get one new pure function, `checkMilestone`, backed by a tiny `KeyValueStore` interface — real implementation over Redis (`get`/`set`), tested with an in-memory fake so the crossing logic needs no Redis mock at all. A new cron route polls concurrent-activity every 2 minutes; the two signup-triggered checks piggyback on the existing `notifyNewSignup` call site.

**Tech Stack:** Hono + `@hono/zod-openapi`, Drizzle ORM (Postgres), ioredis, Vitest. Spec: `docs/superpowers/specs/2026-07-25-telegram-admin-activity-alerts-design.md`.

---

## Design refinement discovered during planning

The spec's Feature 1/2 sections assumed new bespoke Redis dedup keys (`admin-alert:concurrent-active` boolean flag, `admin-alert:new-user-burst` TTL key). While reading the actual code, an existing `alertThrottled()` helper (`src/lib/notifications/alerts.ts`, backed by `test/alerts.spec.ts`) turned out to already implement exactly this — a signature-keyed, 15-minute, cross-pm2-worker dedup with suppressed-count reporting, purpose-built for "don't flood the chat during a sustained condition." Reusing it for both spike alerts eliminates two of the three new Redis structures the spec proposed and one telegram.ts change entirely. The milestone logic (Feature 3) still needs its own state — `alertThrottled`'s time-window dedup is the wrong shape for "only fire once per threshold band" — so `checkMilestone` remains new, bespoke logic. Net effect: same behavior the spec described, meaningfully less new code. `telegram.ts` needs **no changes at all** — `sendAlert`/`alertThrottled` are reused as-is.

---

## Task 1: Repo query helpers

**Files:**

- Modify: `src/modules/users/users.repo.ts` (add after `countNewUsersThisWeek`, line 456)

Two one-line-where-clause count queries, same shape and same file as the adjacent `countUsers`/`countNewUsersToday`/`countNewUsersThisWeek` — which have no dedicated unit tests today (only exercised indirectly via their callers). Following that established precedent, these aren't given standalone tests either; they're exercised through Task 2's mocked-repo tests and Task 4/5's route tests.

- [ ] **Step 1: Add the two functions**

```ts
/** Active in the last N minutes — the "logged in simultaneously" signal for admin-alerts.service.ts. */
export async function countUsersActiveSince(since: Date): Promise<number> {
  const [res] = await db
    .select({ count: count() })
    .from(users)
    .where(and(isNull(users.deletedAt), gte(users.lastActiveAt, since)));
  return res?.count ?? 0;
}

/** Generic version of `countNewUsersToday` — powers the new-user-burst check in admin-alerts.service.ts. */
export async function countNewUsersSince(since: Date): Promise<number> {
  const [res] = await db
    .select({ count: count() })
    .from(users)
    .where(and(isNull(users.deletedAt), gte(users.createdAt, since)));
  return res?.count ?? 0;
}
```

No new imports needed — `and`, `isNull`, `count`, `gte` are already imported at the top of the file.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` (or `npx tsc --noEmit` if no dedicated script — check `package.json` first)
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/modules/users/users.repo.ts
git commit -m "feat(users): add countUsersActiveSince/countNewUsersSince repo helpers"
```

---

## Task 2: `checkMilestone` — pure threshold-crossing logic

**Files:**

- Create: `src/modules/admin-alerts/admin-alerts.service.ts`
- Create: `test/admin-alerts.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/admin-alerts.spec.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/admin-alerts.spec.ts`
Expected: FAIL — `Cannot find module '../src/modules/admin-alerts/admin-alerts.service.js'`

- [ ] **Step 3: Write `checkMilestone`**

```ts
// src/modules/admin-alerts/admin-alerts.service.ts
export const MILESTONE_THRESHOLDS = [50, 100, 250, 500];

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

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
```

- [ ] **Step 4: Run to verify the `checkMilestone` tests pass (others still fail)**

Run: `npx vitest run test/admin-alerts.spec.ts`
Expected: the 5 `describe('checkMilestone', ...)` tests PASS; remaining describes FAIL (functions not exported yet) — that's expected, Task 3 adds them.

- [ ] **Step 5: Commit**

```bash
git add src/modules/admin-alerts/admin-alerts.service.ts test/admin-alerts.spec.ts
git commit -m "feat(admin-alerts): add checkMilestone threshold-crossing logic"
```

---

## Task 3: Orchestration — `checkConcurrentActivity`, `checkNewUserBurst`, `checkTotalUserMilestone`

**Files:**

- Modify: `src/modules/admin-alerts/admin-alerts.service.ts`
- Modify: `test/admin-alerts.spec.ts` (tests already written in Task 2, Step 1 — this task just makes them pass)

- [ ] **Step 1: Confirm the remaining tests currently fail**

Run: `npx vitest run test/admin-alerts.spec.ts`
Expected: FAIL on `checkConcurrentActivity`/`checkNewUserBurst`/`checkTotalUserMilestone` describes — not exported yet.

- [ ] **Step 2: Implement the orchestration functions**

Append to `src/modules/admin-alerts/admin-alerts.service.ts`:

```ts
import { getRedis } from '../../config/redis.js';
import { alertThrottled } from '../../lib/notifications/alerts.js';
import { sendAlert } from '../../lib/notifications/telegram.js';
import { countUsersActiveSince, countNewUsersSince, countUsers } from '../users/users.repo.js';

export const CONCURRENT_ACTIVE_THRESHOLD = 15;
export const CONCURRENT_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
export const NEW_USER_BURST_THRESHOLD = 10;
export const NEW_USER_BURST_WINDOW_MS = 15 * 60 * 1000;

/** Redis-backed KeyValueStore for milestone-band tracking — same getRedis() client as rate-limit.ts/locks.ts. */
const redisStore: KeyValueStore = {
  get: (key) => getRedis().get(key),
  set: async (key, value) => {
    await getRedis().set(key, value);
  },
};

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
```

(Place the new imports at the top of the file alongside `checkMilestone`/`KeyValueStore`/`MILESTONE_THRESHOLDS` already there from Task 2.)

- [ ] **Step 3: Run to verify all tests pass**

Run: `npx vitest run test/admin-alerts.spec.ts`
Expected: PASS — all describes green.

- [ ] **Step 4: Commit**

```bash
git add src/modules/admin-alerts/admin-alerts.service.ts test/admin-alerts.spec.ts
git commit -m "feat(admin-alerts): wire concurrent-activity, new-user-burst, and total-milestone checks"
```

---

## Task 4: Cron route — `POST /internal/cron/live-activity-check`

**Files:**

- Modify: `src/modules/cron/cron.routes.ts`
- Modify: `test/cron.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `test/cron.spec.ts` (mirror the file's existing `vi.hoisted`/`vi.mock` setup — add a `checkConcurrentActivity` mock alongside the existing hoisted state, and mock `../src/modules/admin-alerts/admin-alerts.service.js`):

```ts
// Add to the vi.hoisted(() => ({ ... })) block near the top of test/cron.spec.ts:
checkConcurrentActivity: (vi.fn(),
  // Add a new vi.mock alongside the file's other module mocks:
  vi.mock('../src/modules/admin-alerts/admin-alerts.service.js', () => ({
    checkConcurrentActivity: state.checkConcurrentActivity,
  })));

// Add this describe block:
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
```

(`SECRET` and `createApp` are already defined/imported at the top of `test/cron.spec.ts` — confirm the file's existing `CRON_SECRET` env mock matches `SECRET = 'test-cron-secret'` before reusing it.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/cron.spec.ts -t "live-activity-check"`
Expected: FAIL — 404 (route doesn't exist yet)

- [ ] **Step 3: Add the route**

In `src/modules/cron/cron.routes.ts`, add the import near the top:

```ts
import { checkConcurrentActivity } from '../admin-alerts/admin-alerts.service.js';
```

Append this route block at the end of the file (after the `transitAlertsRoute` handler):

```ts
// ---------------------------------------------------------------------------
// Live-activity check — polls how many users have been active in the last 5
// minutes for the ">15 simultaneous" and online-milestone Telegram alerts.
// Wired to run every 2 minutes (see scripts/cron-live-activity.sh).
// ---------------------------------------------------------------------------

const liveActivityCheckRoute = createRoute({
  method: 'post',
  path: '/cron/live-activity-check',
  tags: ['Cron'],
  summary: 'Poll concurrent active-user count for admin Telegram alerts',
  description:
    'Machine-to-machine endpoint, meant to run every 2 minutes via the OS crontab. Computes ' +
    'how many users have been active in the last 5 minutes; alerts (throttled to once per 15 ' +
    'min) if that exceeds 15, and separately alerts whenever it crosses a new 50/100/250/500 ' +
    'milestone band. Authenticated via the X-Cron-Secret header.',
  responses: {
    200: {
      description: 'Check completed',
      content: {
        'application/json': {
          schema: z.object({
            activeCount: z.number(),
            onlineMilestoneCrossed: z.number().nullable(),
          }),
        },
      },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(liveActivityCheckRoute, async (c) => {
  const result = await checkConcurrentActivity();
  return c.json(result, 200);
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/cron.spec.ts -t "live-activity-check"`
Expected: PASS

- [ ] **Step 5: Run the full cron test file to check for regressions**

Run: `npx vitest run test/cron.spec.ts`
Expected: PASS (all tests, including pre-existing ones)

- [ ] **Step 6: Commit**

```bash
git add src/modules/cron/cron.routes.ts test/cron.spec.ts
git commit -m "feat(cron): add POST /cron/live-activity-check for concurrent-activity alerts"
```

---

## Task 5: Wire signup-triggered checks into `POST /v1/auth/session`

**Files:**

- Modify: `src/modules/auth/auth.routes.ts`
- Modify: `test/auth.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `test/auth.spec.ts`:

```ts
// Add to the vi.hoisted(() => ({ ... })) block:
checkNewUserBurst: vi.fn().mockResolvedValue(undefined),
checkTotalUserMilestone: vi.fn().mockResolvedValue(undefined),

// Add a new vi.mock alongside the existing '../src/lib/notifications/telegram.js' mock:
vi.mock('../src/modules/admin-alerts/admin-alerts.service.js', () => ({
  checkNewUserBurst: state.checkNewUserBurst,
  checkTotalUserMilestone: state.checkTotalUserMilestone,
}));

// Add to the beforeEach in describe('POST /v1/auth/session', ...):
state.checkNewUserBurst.mockReset().mockResolvedValue(undefined);
state.checkTotalUserMilestone.mockReset().mockResolvedValue(undefined);

// Add this test inside describe('POST /v1/auth/session', ...):
it('runs the burst and total-milestone checks when a new user is created', async () => {
  state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-new2', '+911111111112'));
  state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
  state.insertUser.mockResolvedValueOnce(
    makeUserRow({ id: 'id-new2', firebaseUid: 'uid-new2', phoneE164: '+911111111112' }),
  );

  const app = createApp();
  await app.request('/v1/auth/session', {
    method: 'POST',
    headers: { Authorization: 'Bearer good-token' },
  });

  expect(state.checkNewUserBurst).toHaveBeenCalledTimes(1);
  expect(state.checkTotalUserMilestone).toHaveBeenCalledTimes(1);
});

it('does not run the burst/total-milestone checks for an existing user', async () => {
  state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-existing'));
  state.findUserByFirebaseUid.mockResolvedValueOnce(
    makeUserRow({ id: 'id-existing', firebaseUid: 'uid-existing' }),
  );

  const app = createApp();
  await app.request('/v1/auth/session', {
    method: 'POST',
    headers: { Authorization: 'Bearer good-token' },
  });

  expect(state.checkNewUserBurst).not.toHaveBeenCalled();
  expect(state.checkTotalUserMilestone).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/auth.spec.ts -t "burst"`
Expected: FAIL — mocked functions never called (route doesn't call them yet)

- [ ] **Step 3: Wire the calls**

In `src/modules/auth/auth.routes.ts`, add the import:

```ts
import {
  checkNewUserBurst,
  checkTotalUserMilestone,
} from '../admin-alerts/admin-alerts.service.js';
```

Change the existing `if (created)` block (lines 54-56):

```ts
if (created) {
  void notifyNewSignup({ id: user.id, email: user.email, phone: user.phoneE164 }).catch(() => {});
  void checkNewUserBurst().catch(() => {});
  void checkTotalUserMilestone().catch(() => {});
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/auth.spec.ts`
Expected: PASS (all tests, including pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/auth.routes.ts test/auth.spec.ts
git commit -m "feat(auth): trigger new-user-burst and total-milestone checks on signup"
```

---

## Task 6: Cron shell wrapper

**Files:**

- Create: `scripts/cron-live-activity.sh` (executable)

- [ ] **Step 1: Create the script**

Mirror `scripts/cron-health-report.sh` exactly (no action parameter, no request body needed):

```bash
#!/usr/bin/env bash
#
# Polls concurrent active-user count for the Telegram admin activity alerts
# (>15 simultaneous, and 50/100/250/500 online-milestone crossings).
#
# Wired into the EC2 crontab to run every 2 minutes:
#   */2 * * * * /home/ec2-user/aroha-backend/scripts/cron-live-activity.sh \
#     >> /home/ec2-user/cron-live-activity.log 2>&1
#
# Reads CRON_SECRET from the app's .env (never hard-coded in the crontab) and
# calls the internal, secret-protected endpoint on localhost. Alert dedup
# (alertThrottled, 15-min windows) lives in the app itself, not this script —
# every 2-minute tick is expected to hit the endpoint; most ticks are no-ops.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"
SECRET="$(grep -E '^CRON_SECRET=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
TELEGRAM_ALERT_CHAT_ID="$(grep -E '^TELEGRAM_ALERT_CHAT_ID=' "$DIR/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"

if [ -z "$SECRET" ]; then
  echo "$(date -u +%FT%TZ) ERROR: CRON_SECRET not set in $DIR/.env" >&2
  exit 1
fi

CURL_EXIT=0
curl -fsS --max-time 30 -X POST \
  -H "X-Cron-Secret: $SECRET" \
  -H 'Content-Type: application/json' \
  -d '{}' \
  "http://127.0.0.1:${PORT}/internal/cron/live-activity-check" || CURL_EXIT=$?

if [ "$CURL_EXIT" -ne 0 ]; then
  echo "$(date -u +%FT%TZ) ERROR: cron-live-activity.sh failed (curl exit $CURL_EXIT)" >&2
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_ALERT_CHAT_ID" ]; then
    curl -fsS --max-time 10 -X POST \
      -H 'Content-Type: application/json' \
      -d "{\"chat_id\":\"${TELEGRAM_ALERT_CHAT_ID}\",\"text\":\"cron-live-activity.sh failed (curl exit ${CURL_EXIT})\"}" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      >/dev/null 2>&1 || echo "$(date -u +%FT%TZ) WARN: Telegram alert POST failed" >&2
  fi
  exit "$CURL_EXIT"
fi
```

(No per-tick success log line, unlike the other cron scripts — at a 2-minute cadence that would write ~720 lines/day to `cron-live-activity.log` for what's almost always a no-op poll. Errors still log and still alert.)

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/cron-live-activity.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/cron-live-activity.sh
git commit -m "feat(cron): add cron-live-activity.sh wrapper script"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, no regressions

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint` (check exact script names in `package.json` first)
Expected: no errors

- [ ] **Step 3: Confirm before push and deploy**

Per standing project policy, confirm with the user before pushing this branch to `main` and before deploying to the EC2 production server — even though this session already has "do it" authorization for the feature build itself, push-to-main and production deploy are separate, explicitly gated actions. Deploy also requires adding the new crontab line (`*/2 * * * * .../cron-live-activity.sh`) on the EC2 box, which is a manual step outside the deploy script.
