# Telegram Admin Activity Alerts — Design

Date: 2026-07-25

## Goal

Three new automated Telegram alerts to the existing admin chat (`TELEGRAM_ALERT_CHAT_ID`, same channel `notifyNewSignup`/`notifyError` already use):

1. Concurrent active users > 15
2. New-user signup burst: 10+ new users within 15 minutes
3. Milestone crossings at 50 / 100 / 250 / 500 — for **both** total registered users and concurrent online users

## Shared building block: "active users right now"

No real-time online tracking exists today — only `users.lastActiveAt`, throttle-bumped (5-minute granularity) on every authenticated request via `requireUser` middleware (`src/middleware/auth.ts`). "Logged in simultaneously" is defined as **active in the last 5 minutes**, computed with a plain DB query against existing data — no new online-presence infrastructure:

```ts
// users.repo.ts
export async function countUsersActiveSince(since: Date): Promise<number> {
  const [res] = await db
    .select({ count: count() })
    .from(users)
    .where(and(gt(users.lastActiveAt, since), isNull(users.deletedAt)));
  return res?.count ?? 0;
}
```

## Feature 1 + 3b: Concurrent-activity cron job

New cron-triggered route `POST /cron/live-activity-check`, guarded by `requireCronSecret` (same pattern as `/cron/transit-alerts`, `/cron/health-report`). Wired via a new `scripts/cron-live-activity.sh` wrapper and a crontab entry polling **every 2 minutes** (`*/2 * * * *`).

Each run:

- Computes `activeCount = countUsersActiveSince(now - 5min)`.
- **>15 alert**: edge-triggered via a Redis boolean flag `admin-alert:concurrent-active`. Fires once when `activeCount` crosses above 15; the flag clears once it drops back ≤15, so it can fire again on the next spike.
- **Online milestone (50/100/250/500)**: tracks the highest threshold currently met in Redis key `admin-alert:online-milestone-band`. Alerts when the band moves _up_ past a new threshold; updates silently (no alert) when it drops. Each new upward crossing re-fires, even after a dip — this is a fluctuating metric, not a one-time growth event.
- First-ever run seeds both Redis keys from the current `activeCount` **without** alerting, so deploy doesn't trigger a false backlog of alerts.

Redis is already wired up via `getRedis()` (`src/config/redis.ts`) for rate-limiting; reused here purely as small cross-request/cross-worker dedup state, same idiom as `src/middleware/rate-limit.ts`. Redis unavailability fails open (no alert sent, no crash) — consistent with the rate-limiter's existing fail-open behavior.

## Feature 2: New-user burst

Triggered inline, fire-and-forget, at the existing `notifyNewSignup` call site (`src/modules/auth/auth.routes.ts`, `created === true` branch). Computes `countNewUsersSince(now - 15min)` (new generic version of the existing `countNewUsersToday`); if the result is ≥10 and no burst alert has been sent in the last 15 minutes (Redis key `admin-alert:new-user-burst` with a 15-minute TTL as the dedup / rate-limit), sends the alert and sets the key. No new cron job — rides the existing signup event.

## Feature 3a: Total-registered-user milestones

Also triggered inline on signup (monotonic count, only grows). Reuses existing `countUsers()`. Tracks the highest milestone ever reached in Redis key `admin-alert:total-milestone`; alerts once per threshold and never re-fires for the same one — "we now have 100 users" is a one-time growth event, unlike the fluctuating online-count version.

## New code surface

- `src/modules/users/users.repo.ts`: add `countUsersActiveSince(date)`, `countNewUsersSince(date)` (generic version of existing `countNewUsersToday`).
- `src/lib/notifications/telegram.ts`: add `notifyConcurrentActivity(count)`, `notifyNewUserBurst(count, windowMinutes)`, `notifyMilestone(kind: 'total' | 'online', threshold, count)`. All reuse existing `sendAlert`/`sendMessage` plumbing.
- New `src/modules/admin-alerts/admin-alerts.service.ts` holding the threshold-crossing / dedup logic (pure functions taking counts + a small Redis-backed state store, so the crossing logic itself is unit-testable without a live Redis).
- `src/modules/cron/cron.routes.ts`: register `POST /cron/live-activity-check`.
- `src/modules/auth/auth.routes.ts`: extend the existing `if (created)` block to also call the burst-check and total-milestone-check (fire-and-forget, `.catch(() => {})`, matching `notifyNewSignup`'s existing error handling).
- New `scripts/cron-live-activity.sh` (mirrors `scripts/cron-transit-alerts.sh`) + one new crontab line on the EC2 box.

## Error handling

- All Telegram sends are fire-and-forget with `.catch(() => {})` at the call site — an alert failure must never break login/signup requests, matching every existing `notifyX` call site.
- Redis reads/writes for the dedup state use the same short timeout + fail-open behavior as `rate-limit.ts`: if Redis is unreachable, skip the alert rather than blocking or throwing.
- The cron route itself follows the existing `requireCronSecret` + try/catch-and-alert-on-failure pattern already used by `transit-alerts`/`health-report`.

## Testing

Unit tests for the pure threshold/band-crossing logic in `admin-alerts.service.ts` (crossing detection, dedup transitions) using a fake in-memory key-value store standing in for Redis — same style as existing service tests in the repo. `sendMessage`/`fetch` stubbed in tests, no live Telegram calls, matching the existing `notifyNewSignup` test pattern.

## Defaults chosen (flagged for approval)

- 2-minute poll interval for the concurrent-activity cron.
- Online milestone re-fires on every re-crossing; total-user milestone fires once ever.
