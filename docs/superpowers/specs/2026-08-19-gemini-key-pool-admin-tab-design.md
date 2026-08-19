# Gemini Key Pool admin tab — design

Date: 2026-08-19
Status: Approved, pending implementation plan

## Context

`gemini-key-pool.ts` (backend) round-robins across free-tier Gemini keys and
falls back to a paid reserve key when the free tier is exhausted or
cooling down. It currently has **no per-key usage visibility** and **no
admin control surface** — every incident so far (e.g. the 2026-08-03 dead
key, and today's 2026-08-19 `ACCOUNT_STATE_INVALID` dead key) required an
engineer to SSH into EC2, curl each key individually to isolate the bad
one, then hand-edit `.env` and reload pm2. Same session, the user also
independently believed the free pool was "exhausted" and paid reserve was
active — turned out to be a stale reading of the Overview page's "Billed
Today" tile (non-zero for the rest of the calendar day after any paid
usage), not a live block; live curl testing showed 5/6 free keys healthy at
the time. That confusion is itself evidence this needs a real dashboard
instead of ad hoc SSH diagnosis.

Goal: give admins **visibility** (today's per-key usage, live status) and
**control** (disable a bad key, force tier routing, clear stuck cooldowns)
from the existing admin panel, without SSH.

## Non-goals

- Heuristic auto-detection of a "possibly dead" key (would need tracking
  error outcomes per key beyond the existing cooldown mechanism — deferred).
- A dedicated audit trail beyond the existing `admin_audit_log` table that
  `logAdminAction` already writes every admin mutation to.
- Changing the underlying round-robin/cooldown algorithm in
  `gemini-key-pool.ts` — this only adds visibility and override switches
  around it.

## Data model (new Redis state in `gemini-key-pool.ts`)

1. **Per-key daily usage counter** — `gemini:pool:usage:{index}:{cycleId}`.
   `cycleId` is derived from Google's actual RPD reset boundary (midnight
   Pacific = 12:30 PM IST), not calendar midnight IST — matches what "1,500
   requests today" actually means for the free tier. INCR'd once per
   request attempt (regardless of that attempt's outcome) right after
   `pickKey()` returns a key, in both `generate()` and `stream()` in
   `gemini-client.ts`. TTL ~25h so it self-expires; no explicit reset needed
   for the counter itself.
2. **Admin-disabled set** — `gemini:pool:disabled` (Redis SET of pool
   indices). Checked in `scanRange()` alongside the existing
   `isCoolingDown()` check, as an additional exclusion. Unlike auto-cooldowns
   this has no TTL — stays disabled until an admin re-enables it. Applies to
   both tiers (a paid key can be disabled too).
3. **Tier-override mode** — `gemini:pool:mode` (Redis STRING), one of
   `normal` (default) / `paid_only` / `free_only`. Read at the top of
   `pickKey()`:
   - `paid_only`: skip the free-tier scan entirely, always resolve from the
     paid range.
   - `free_only`: never take the paid-tier fallback path, even when the free
     tier is fully excluded/cooling down — `pickKey()` returns `null`
     instead (same as "whole pool exhausted" today, just without ever
     touching the reserve).
   - `normal`: today's existing free-first-then-paid-fallback behavior,
     unchanged.

All three follow the existing "Redis primary, bounded-timeout fail-open"
pattern already used for the cursor and cooldowns in this file — on Redis
error, usage counting is best-effort (skip the INCR, don't block the
request), the disabled-set check fails open to "not disabled", and mode
fails open to `normal`. None of these are safety-critical; visibility
degrading gracefully beats a Redis blip breaking key selection.

## Backend admin API

New routes in `admin.routes.ts` / `admin.service.ts`, same
`requireAdmin` middleware and `logAdminAction(adminPhone, route, params)`
audit pattern every existing admin mutation uses (e.g. `updateFeature`):

- `GET /v1/admin/gemini-pool` — per index: `tier`, key suffix (last 4 chars
  only, key content never leaves the backend), `requestsToday`,
  `coolingDownUntil` (epoch ms or null), `disabled` (bool). Free-tier rows
  also carry the 1,500 RPD cap for the usage bar.
- `POST /v1/admin/gemini-pool/:index/disable`
- `POST /v1/admin/gemini-pool/:index/enable`
- `POST /v1/admin/gemini-pool/reset-cooldowns` — clears
  `gemini:pool:cooldown:*` for free-tier indices only (the live-relief
  button for a stuck/exhausted-looking pool).
- `POST /v1/admin/gemini-pool/mode` — body `{ mode: 'normal'|'paid_only'|'free_only' }`.
- `POST /v1/admin/gemini-pool/:index/test` — fires one small live prompt
  through that specific key (mirrors the manual curl isolation test used
  today) and returns its real HTTP status, so an admin can self-diagnose a
  suspected dead key without SSH.

## Frontend

New tab `/admin/gemini-pool`, added to the nav array in `app/admin/layout.tsx`
next to "Overview". Follows existing admin page conventions (`Card`,
`KpiTile`, table styling already used on the Overview page).

- Table, one row per pool index: tier badge, masked suffix, requests today
  (progress bar vs 1,500 for free rows, plain count for paid), status
  chip (OK / Cooling down Xs / Disabled), and per-row **Disable/Enable** +
  **Test** buttons.
- Mode switch (Normal / Force Paid Only / Free Only) — a confirm dialog
  before applying, since it changes live request routing immediately across
  the whole pm2 cluster.
- **Reset free-tier cooldowns** button, with a confirm dialog.
- A short caption cross-referencing the Overview page's "Billed ₹ Today"
  tile, noting that tile stays non-zero for the rest of the calendar day
  after any paid usage even once the free pool has recovered — the thing
  that caused today's "pool is exhausted" false alarm.

## Testing

- `gemini-key-pool.spec.ts` (existing file, extend): unit tests for the
  disabled-set exclusion in `scanRange()`, the three `mode` behaviors in
  `pickKey()`, and usage-counter increment/cycle-boundary math — same style
  as the existing cooldown/cursor tests in that file, Redis mocked/faked
  the same way they already are.
- One admin-route integration test per new endpoint (auth-gated, happy path
  - the audit-log row got written) — matches the existing pattern for
    `updateFeature`/wallet-adjust admin routes.
