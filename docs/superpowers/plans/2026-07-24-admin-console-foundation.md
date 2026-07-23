# Admin Console Foundation (HTTP API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give support/ops staff four secured `/v1/admin/*` HTTP endpoints — per-user diagnostic dump, single-user content regeneration, single-user push notification, and device-token health stats — that replace manual SSH + one-off script runs on the EC2 box, without building any new frontend.

**Architecture:** A new `requireAdmin` Hono middleware wraps the existing `requireUser` middleware (`src/middleware/auth.ts`) and checks the resolved user's `firebaseUid` against a new `ADMIN_FIREBASE_UIDS` env allowlist — the exact comma-split/trim/Set pattern already proven by `TELEGRAM_ADMIN_CHAT_IDS`. A new `src/modules/admin/` module (`admin.schemas.ts`, `admin.service.ts`, `admin.repo.ts`, `admin.routes.ts`) hosts the 4 routes, calling into the **existing** kundli/horoscope/gemstone/device-tokens repos and services (with a handful of small, justified additions to those repos/services where the one-off scripts only had inline logic) rather than reimplementing any query or generation logic. Every admin route call is audited to a new `admin_audit_log` table (kept separate from `telegram_admin_audit_log` — see Task 2's rationale). Regeneration and generation calls follow `prime-reports.service.ts`'s fire-and-forget-with-catch-and-log convention.

**Tech Stack:** Hono + `@hono/zod-openapi`, Drizzle ORM / Postgres, Firebase Admin Auth, Vitest.

---

## Before you start

Verified by actually running the commands / reading the files in `C:\dev\aroha-astrology\jyotish-backend\.worktrees\prime-reports-batch2` (branch `feat/prime-reports-batch2`) — all paths in this plan are relative to that worktree. Every function/field name below has been independently spot-checked against the real source a second time (not just trusted from the drafting pass) — see the Self-review section at the end.

- **Baseline `pnpm test`:** 4 test files failed / 101 passed (105 total), 9 tests failed / 803 passed (812 total). All 9 failures are pre-existing and unrelated to this plan: `test/horoscope-jargon.spec.ts` (a case-insensitivity assertion), `test/purchase-plan-notify.spec.ts` (a stale expected push copy string), and the same two files' knock-on effects. Do not try to fix these as part of this plan; just confirm the failure _count_ doesn't grow.
- **Baseline `pnpm typecheck`:** 104 pre-existing errors (`tsc --noEmit` exit code 2). Notably includes `scripts/inspect-user.ts(51,32)` (`user.credits` — stale, the field is now `walletBalancePaise`) and `scripts/inspect-user.ts(65,34)`/`(147,33)` (`kundli.errorMessage`/`horoscope.errorMessage` — stale, the field is now `error`). This confirms `scripts/inspect-user.ts` is already out of sync with the current schema; **the new route uses the correct current field names, not the script's stale ones.** Confirm the error count doesn't grow beyond what each task's own new code might legitimately add (it shouldn't — see each task's verification step).
- **Next migration number:** `0033`. Last existing migration is `src/db/migrations/0032_even_menace.sql`. **Run `pnpm db:generate` and it will land on `0033_<generated-name>.sql`** — do not hand-author the file name (see Task 2).
- **Real regenerate categories found** (from reading all 6 `scripts/regenerate-*.ts` end-to-end):
  - `scripts/regenerate-one-user.ts`, `scripts/regenerate-for-users.ts`, `scripts/regenerate-categories-backfill.ts`, and `scripts/force-regenerate.ts` all call `requestHoroscopeGeneration(user, profile, period, { forDate, force: true, ... })` from `src/modules/horoscope/horoscope.service.ts` across the 5 periods (`daily`, `tomorrow`, `weekly`, `monthly`, `yearly` — exported as `HOROSCOPE_PERIODS`). → category **`horoscope`**.
  - `scripts/regenerate-all-doshas.ts` recomputes `kundlis.doshaData` deterministically via `analyzeAllDoshas(chart, saturn.longitude)` (already imported in `kundli.service.ts`, line 7 — confirmed, no new import needed for this function) — no LLM call, doesn't touch horoscopes/house-insights. → category **`dosha`**.
  - `scripts/regenerate-gemstone-all.ts` calls `requestGemstoneGeneration(userId, birthProfileId, { chartData }, { force: true })` from `src/modules/gemstone/gemstone.service.ts`. → category **`gemstone`**.
  - `scripts/force-regenerate.ts` _additionally_ regenerates all 12 house insights via `requestHouseInsightGeneration` — this is **deliberately not a category** in this MVP (matches the pre-agreed `'gemstone' | 'dosha' | 'horoscope' | 'all'` scope); flagged as a fast-follow in the Notes section.
  - **`all`** = run `horoscope` + `dosha` + `gemstone` concurrently, fire-and-forget, each independently error-isolated.
- **Field-name corrections vs. the stale scripts:** `user.credits` → `user.walletBalancePaise`; `kundli.errorMessage` → `kundli.error`; `horoscope.errorMessage` → `horoscope.error`.
- **Existing pattern to mirror for the allowlist** (`src/modules/telegram-bot/telegram-bot.service.ts`):
  ```ts
  function resolveTier(chatId: string): Tier | null {
    const adminIds = new Set(
      [env.TELEGRAM_ALERT_CHAT_ID, ...env.TELEGRAM_ADMIN_CHAT_IDS].filter(Boolean),
    );
    if (adminIds.has(chatId)) return 'admin';
    ...
  }
  ```
  and the env parsing (`src/config/env.ts`, verified at line 93):
  ```ts
  TELEGRAM_ADMIN_CHAT_IDS: z.string().default('').transform((value) =>
    value.split(',').map((id) => id.trim()).filter(Boolean),
  ),
  ```
  `TELEGRAM_WEBHOOK_SECRET` is confirmed at line 127, `HOROSCOPE_ACTIVE_WINDOW_DAYS` at line 134 — the new `ADMIN_FIREBASE_UIDS` field goes between them.
- **`requireUser`'s real implementation (verified in full)** — it's a plain `MiddlewareHandler` that verifies the bearer token, looks up the user, `c.set('user', user)`, fires a throttled `touchUserLastActive`, then unconditionally calls `await next()`. This means `requireAdmin` can validly wrap it as `await requireUser(c, async () => { ...admin check...; await next(); })` — the inner callback runs exactly where `requireUser` would have called the route's own next-in-chain, so `c.get('user')` is already populated by the time the admin check runs.
- **`resolveProfileContext` (verified signature, distinct from `resolveActiveProfileContext`):** `resolveProfileContext(user: UserRow, activeProfileId: string | null): Promise<ProfileContext>` — matches this plan's `resolveProfileContext(user, null)` call in `startRegeneration` exactly (always regenerates the primary/self profile, matching every existing `regenerate-*.ts` script's behavior).
- **Existing audit table** (`src/db/schema.ts`):
  ```ts
  export const telegramAdminAuditLog = pgTable(
    'telegram_admin_audit_log',
    {
      id: uuid('id')
        .primaryKey()
        .default(sql`gen_random_uuid()`),
      chatId: text('chat_id').notNull(),
      tier: text('tier').notNull(),
      command: text('command').notNull(),
      args: text('args'),
      createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .default(sql`now()`),
    },
    (table) => ({
      createdAtIdx: index('telegram_admin_audit_log_created_at_idx').on(table.createdAt),
    }),
  );
  ```
  **Decision (Task 2): add a NEW `admin_audit_log` table rather than a `channel` discriminator on this one.** Rejected the discriminator because (a) `chatId`/`tier` are Telegram-specific — a Firebase UID isn't a "chat ID" and there's no web equivalent of "tier" beyond admin/not-admin, so the columns would need ambiguous overloading; (b) it would mean renaming/repurposing a table a live, working Telegram bot audit trail depends on, for zero benefit over (c) a same-shaped new table, which costs one small migration and zero risk to the existing feature.
- **Verified field names on `kundlis`** (`src/db/schema.ts`): `id`, `userId`, `birthProfileId` (nullable, NULL = primary profile), `status`, `chartData`, `dashaData`, `yogaData`, `doshaData`, `ashtakavargaData`, `error`, `updatedAt` — all jsonb columns typed `Record<string, unknown> | null` except `chartData` which the codebase elsewhere casts to `ChartData`.
- **Verified field names on `dailyHoroscopes`** (`src/db/schema.ts`): `id`, `userId`, `birthProfileId` (nullable), `forDate` (date), `period` (enum), `periodKey`, `summary`, `monthlyBreakdown`, `structured`, `status`, `model`, `error`, `updatedAt`.
- **Verified field names on `users`** (`src/db/schema.ts`): `onboardingStatus`, `walletBalancePaise`, `unlockedHouses` (integer array), `gemstoneUnlockedAt`, `deletedAt` — all present exactly as this plan's DTO assumes.
- **`sendPushBatch` (verified signature, `src/lib/notifications/fcm.ts`):** `sendPushBatch(tokens: string[], title: string, body: string, data?: Record<string,string>): Promise<{ success: number; failure: number }>` — short-circuits to `{success:0,failure:0}` for an empty token array.
- **`findActiveTokensForUser` (verified, `src/modules/device-tokens/device-tokens.repo.ts`):** `findActiveTokensForUser(userId: string): Promise<DevicePushTokenRow[]>`.
- **`findUserByPhoneE164` (verified, `src/modules/users/users.repo.ts`):** `findUserByPhoneE164(phoneE164: string): Promise<UserRow | undefined>`.
- **`HOROSCOPE_PERIODS`, `currentPeriodStart`, `requestHoroscopeGeneration` (all verified exports of `src/modules/horoscope/horoscope.service.ts`).**

## File structure

| File                                              | Action             | Responsibility                                                                        |
| ------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `src/config/env.ts`                               | Modify             | Add `ADMIN_FIREBASE_UIDS` allowlist env var                                           |
| `src/middleware/auth.ts`                          | Modify             | Add `requireAdmin` middleware                                                         |
| `test/require-admin.spec.ts`                      | Create             | `requireAdmin` unit tests                                                             |
| `src/db/schema.ts`                                | Modify             | Add `adminAuditLog` table                                                             |
| `src/db/migrations/0033_*.sql` (+ `meta/`)        | Create (generated) | Migration for `admin_audit_log`                                                       |
| `src/modules/admin/admin.repo.ts`                 | Create             | `logAdminAction`                                                                      |
| `test/admin-repo.spec.ts`                         | Create             | Repo test for `logAdminAction`                                                        |
| `src/modules/kundli/kundli.repo.ts`               | Modify             | `listKundlisByUserId`, `updateKundliDoshaData`                                        |
| `src/modules/kundli/kundli.service.ts`            | Modify             | `regenerateDoshaForUser`                                                              |
| `test/kundli-repo-admin.spec.ts`                  | Create             | Repo tests for the two new kundli.repo.ts functions                                   |
| `src/modules/horoscope/horoscope.repo.ts`         | Modify             | `listHoroscopesByUserId`                                                              |
| `test/horoscope-repo-admin.spec.ts`               | Create             | Repo test for `listHoroscopesByUserId`                                                |
| `src/modules/device-tokens/device-tokens.repo.ts` | Modify             | `countActiveDeviceTokensByPlatform`                                                   |
| `test/device-tokens-repo-admin.spec.ts`           | Create             | Repo test for `countActiveDeviceTokensByPlatform`                                     |
| `src/modules/admin/admin.schemas.ts`              | Create             | Zod request/response schemas                                                          |
| `src/modules/admin/admin.service.ts`              | Create             | `inspectUserByPhone`, `notifyUserByPhone`, `startRegeneration`, `getDeviceTokenStats` |
| `test/admin-service.spec.ts`                      | Create             | Service-level tests (mocked repos)                                                    |
| `src/modules/admin/admin.routes.ts`               | Create             | The 4 `/v1/admin/*` routes                                                            |
| `src/app.ts`                                      | Modify             | Mount `adminRouter`                                                                   |
| `test/admin-routes.spec.ts`                       | Create             | Route-level integration tests                                                         |

---

### Task 1: `ADMIN_FIREBASE_UIDS` env var + `requireAdmin` middleware

**Files:**

- Modify: `src/config/env.ts`, `src/middleware/auth.ts`
- Create: `test/require-admin.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/require-admin.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
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
  touchUserLastActive: state.touchUserLastActive,
}));

// Must be set BEFORE the dynamic import below triggers config/env.ts's
// module-level loadEnv() — same technique already used by other spec files
// that need a specific env value not covered by test/setup.ts's defaults.
process.env.ADMIN_FIREBASE_UIDS = 'admin-uid-1, admin-uid-2';

const { requireAdmin } = await import('../src/middleware/auth.js');
const { errorHandler } = await import('../src/middleware/error.js');

function makeApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/admin-only', requireAdmin, (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => {
  state.verifyIdToken.mockReset();
  state.findUserByFirebaseUid.mockReset();
  state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
});

describe('requireAdmin', () => {
  it('401s with no Authorization header', async () => {
    const res = await makeApp().request('/admin-only');
    expect(res.status).toBe(401);
  });

  it('401s with an invalid Firebase token', async () => {
    state.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    const res = await makeApp().request('/admin-only', {
      headers: { Authorization: 'Bearer bad' },
    });
    expect(res.status).toBe(401);
  });

  it('403s for a valid, authenticated user not in ADMIN_FIREBASE_UIDS', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('not-an-admin'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-1', firebaseUid: 'not-an-admin' }),
    );
    const res = await makeApp().request('/admin-only', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(403);
  });

  it('200s for a user whose firebaseUid is in ADMIN_FIREBASE_UIDS', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('admin-uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-1', firebaseUid: 'admin-uid-1' }),
    );
    const res = await makeApp().request('/admin-only', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
  });

  it('honors every entry in a comma-separated ADMIN_FIREBASE_UIDS list', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('admin-uid-2'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-2', firebaseUid: 'admin-uid-2' }),
    );
    const res = await makeApp().request('/admin-only', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run test/require-admin.spec.ts
```

Expect a failure — `requireAdmin` doesn't exist yet in `src/middleware/auth.ts` (import error) and `ADMIN_FIREBASE_UIDS` doesn't exist in `EnvSchema`.

- [ ] **Step 3: Write minimal implementation**

In `src/config/env.ts`, add the new field right after `TELEGRAM_WEBHOOK_SECRET` (still inside the "Operations" block, before `HOROSCOPE_ACTIVE_WINDOW_DAYS`):

```ts
    TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),

    // Firebase UIDs allowed to call the /v1/admin/* HTTP endpoints (see
    // src/middleware/auth.ts requireAdmin). Comma-separated, same
    // split/trim/filter convention as TELEGRAM_ADMIN_CHAT_IDS — deliberately
    // a separate allowlist from the Telegram one, since these are reached
    // with a normal Firebase ID token, not a Telegram chat id.
    ADMIN_FIREBASE_UIDS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),

    // Nightly horoscope batch skips users with no activity in this many days
```

In `src/middleware/auth.ts`, add the `env` import and the new middleware at the end of the file:

```ts
import type { MiddlewareHandler } from 'hono';
import { getFirebaseAuth } from '../config/firebase.js';
import { env } from '../config/env.js';
import { Errors } from '../lib/errors.js';
import { findUserByFirebaseUid, touchUserLastActive } from '../modules/users/users.repo.js';
```

...and, after the existing `requireUser` export:

```ts
/**
 * `requireUser` PLUS a Firebase-UID allowlist check — for the `/v1/admin/*`
 * HTTP admin console routes. Mirrors the Telegram admin bot's chat-ID
 * allowlist pattern (see telegram-bot.service.ts resolveTier) but keyed off
 * the caller's own Firebase UID instead of a Telegram chat ID, since these
 * routes are reached with a normal Firebase ID token, not a Telegram webhook
 * update.
 *
 * Wraps requireUser (rather than duplicating its token-verification/user-
 * lookup logic) so `c.var.user`/`c.var.firebaseToken` end up set exactly the
 * same way as on every other authenticated route.
 */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  await requireUser(c, async () => {
    const user = c.get('user');
    const adminUids = new Set(env.ADMIN_FIREBASE_UIDS);
    if (!adminUids.has(user.firebaseUid)) {
      throw Errors.forbidden('Admin access required');
    }
    await next();
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run test/require-admin.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts src/middleware/auth.ts test/require-admin.spec.ts
git commit -m "feat(admin): add ADMIN_FIREBASE_UIDS allowlist + requireAdmin middleware"
```

---

### Task 2: `admin_audit_log` table, migration, and repo

**Files:**

- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0033_*.sql` (generated), `src/modules/admin/admin.repo.ts`, `test/admin-repo.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/admin-repo.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  insert: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { insert: state.insert }, sqlClient };
});

import { logAdminAction } from '../src/modules/admin/admin.repo.js';

interface FakeInsertChain {
  values: (v: unknown) => Promise<void>;
}
function makeInsertChain() {
  const calls: { values?: unknown } = {};
  const chain: FakeInsertChain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return Promise.resolve(undefined);
    }),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.insert.mockReset();
});

describe('logAdminAction', () => {
  it('inserts one admin_audit_log row with the given fields', async () => {
    const { chain, calls } = makeInsertChain();
    state.insert.mockReturnValue(chain);

    await logAdminAction({
      adminFirebaseUid: 'admin-uid-1',
      route: 'GET /v1/admin/users/:phone/inspect',
      params: { phone: '+919999999999' },
    });

    expect(state.insert).toHaveBeenCalledTimes(1);
    expect(calls.values).toEqual({
      adminFirebaseUid: 'admin-uid-1',
      route: 'GET /v1/admin/users/:phone/inspect',
      params: { phone: '+919999999999' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run test/admin-repo.spec.ts
```

Fails — neither `adminAuditLog` nor `src/modules/admin/admin.repo.ts` exist yet.

- [ ] **Step 3: Write minimal implementation**

In `src/db/schema.ts`, add a new block immediately after the existing `telegramAdminAuditLog` block (before the `notifications` section comment):

```ts
export type TelegramAdminAuditLogRow = typeof telegramAdminAuditLog.$inferSelect;
export type NewTelegramAdminAuditLogRow = typeof telegramAdminAuditLog.$inferInsert;

/* -------------------------------------------------------------------------- */
/* admin_audit_log — who called what via the /v1/admin/* HTTP admin console    */
/* -------------------------------------------------------------------------- */

export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    adminFirebaseUid: text('admin_firebase_uid').notNull(),
    route: text('route').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    createdAtIdx: index('admin_audit_log_created_at_idx').on(table.createdAt),
  }),
);

export type AdminAuditLogRow = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLogRow = typeof adminAuditLog.$inferInsert;

/* -------------------------------------------------------------------------- */
/* notifications — push / bell notifications                                   */
```

Generate the migration:

```bash
pnpm db:generate
```

This creates `src/db/migrations/0033_<generated-name>.sql` (drizzle-kit picks the adjective-noun suffix — matches the existing `0031_regular_shard.sql`/`0032_even_menace.sql` precedent, so leave the auto-generated name as-is), a matching `src/db/migrations/meta/0033_snapshot.json`, and an updated `src/db/migrations/meta/_journal.json`. Verify the generated `.sql` file's content matches (drizzle-kit's output for this exact schema block is deterministic):

```sql
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_firebase_uid" text NOT NULL,
	"route" text NOT NULL,
	"params" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_created_at_idx" ON "admin_audit_log" USING btree ("created_at");
```

Create `src/modules/admin/admin.repo.ts`:

```ts
import { db } from '../../config/db.js';
import { adminAuditLog, type NewAdminAuditLogRow } from '../../db/schema.js';

export async function logAdminAction(entry: NewAdminAuditLogRow): Promise<void> {
  await db.insert(adminAuditLog).values(entry);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run test/admin-repo.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/migrations src/modules/admin/admin.repo.ts test/admin-repo.spec.ts
git commit -m "feat(admin): add admin_audit_log table + logAdminAction repo fn"
```

---

### Task 3: Kundli additions — `listKundlisByUserId`, `updateKundliDoshaData`, `regenerateDoshaForUser`

**Files:**

- Modify: `src/modules/kundli/kundli.repo.ts`, `src/modules/kundli/kundli.service.ts`
- Create: `test/kundli-repo-admin.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/kundli-repo-admin.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select, update: state.update }, sqlClient };
});

import { listKundlisByUserId, updateKundliDoshaData } from '../src/modules/kundli/kundli.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => Promise<unknown[]>;
}
function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return Promise.resolve(result);
    }),
  };
  return { chain, calls };
}

interface FakeUpdateChain {
  set: (patch: unknown) => FakeUpdateChain;
  where: (cond: unknown) => Promise<unknown>;
}
function makeUpdateChain() {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain: FakeUpdateChain = {
    set: vi.fn((patch: unknown) => {
      calls.set = patch;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return Promise.resolve(undefined);
    }),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.select.mockReset();
  state.update.mockReset();
});

describe('listKundlisByUserId', () => {
  it('selects every kundli row for the user, across all profiles', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'k1' }, { id: 'k2' }]);
    state.select.mockReturnValue(chain);

    const rows = await listKundlisByUserId('user-1');

    expect(rows).toEqual([{ id: 'k1' }, { id: 'k2' }]);
    const query = compile(calls.where);
    expect(query.sql).toBe('"kundlis"."user_id" = $1');
    expect(query.params).toEqual(['user-1']);
  });
});

describe('updateKundliDoshaData', () => {
  it('updates doshaData and updatedAt for the exact kundli row by id', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await updateKundliDoshaData('kundli-1', { mangal: { present: false } });

    expect(calls.set).toMatchObject({ doshaData: { mangal: { present: false } } });
    expect((calls.set as { updatedAt: Date }).updatedAt).toBeInstanceOf(Date);
    const query = compile(calls.where);
    expect(query.sql).toBe('"kundlis"."id" = $1');
    expect(query.params).toEqual(['kundli-1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run test/kundli-repo-admin.spec.ts
```

- [ ] **Step 3: Write minimal implementation**

In `src/modules/kundli/kundli.repo.ts`, add both functions right after `findKundliByUserId`:

```ts
export async function findKundliByUserId(
  userId: string,
  birthProfileId: string | null,
): Promise<KundliRow | undefined> {
  const rows = await db
    .select()
    .from(kundlis)
    .where(and(eq(kundlis.userId, userId), profileFilter(birthProfileId)))
    .limit(1);
  return rows[0];
}

/**
 * Every kundli row for this user, across all profiles (primary + additional).
 * Used by the admin diagnostic dump (GET /v1/admin/users/:phone/inspect) —
 * unlike scripts/inspect-user.ts's `.limit(1)` (which non-deterministically
 * picks an arbitrary single profile's row once a user has more than one),
 * this intentionally returns every profile's kundli.
 */
export async function listKundlisByUserId(userId: string): Promise<KundliRow[]> {
  return db.select().from(kundlis).where(eq(kundlis.userId, userId));
}

/**
 * Single-field, single-row write used by the admin 'dosha' regenerate
 * category (kundli.service.ts regenerateDoshaForUser). Scoped by kundli id
 * (not userId) — scripts/regenerate-all-doshas.ts updates by userId alone,
 * which would silently touch every profile's kundli for a multi-profile user;
 * this avoids that.
 */
export async function updateKundliDoshaData(
  kundliId: string,
  doshaData: Record<string, unknown>,
): Promise<void> {
  await db
    .update(kundlis)
    .set({ doshaData, updatedAt: new Date() })
    .where(eq(kundlis.id, kundliId));
}
```

In `src/modules/kundli/kundli.service.ts`, extend the two import blocks:

```ts
import type { ChartData, ZodiacSign } from '@aroha-astrology/shared';
```

```ts
import {
  STALE_GENERATING_MS,
  claimKundliGeneration,
  findKundliByUserId,
  markKundliFailed,
  markKundliReady,
  updateKundliDoshaData,
} from './kundli.repo.js';
```

Then add the new function right after `getKundliForUser` (before `withLiveSadeSati`):

```ts
export async function getKundliForUser(
  userId: string,
  birthProfileId: string | null,
): Promise<KundliRow | undefined> {
  return findKundliByUserId(userId, birthProfileId);
}

/**
 * Admin-console single-user dosha recompute (POST /v1/admin/users/:phone/regenerate
 * with category 'dosha'). Mirrors scripts/regenerate-all-doshas.ts's per-row
 * logic exactly — deterministic recompute from the already-stored chart, no
 * LLM call, doesn't touch horoscopes/house-insights — but scoped to one
 * kundli row via updateKundliDoshaData (see that function's docstring for why).
 *
 * Uses the NATAL Saturn longitude off the stored chart, same as the script.
 * This only affects the STORED sadeSati snapshot — the served value is always
 * recomputed live from TODAY's Saturn position on every read regardless (see
 * withLiveSadeSati below), so this doesn't change what's actually shown.
 */
export async function regenerateDoshaForUser(
  userId: string,
  birthProfileId: string | null,
): Promise<'updated' | 'skipped'> {
  const kundli = await findKundliByUserId(userId, birthProfileId);
  const chart = kundli?.chartData as unknown as ChartData | null;
  const saturn = chart?.planets?.find((p) => p.planet === 'Saturn');
  if (!kundli || !chart || !saturn) return 'skipped';

  const doshas = analyzeAllDoshas(chart, saturn.longitude);
  await updateKundliDoshaData(kundli.id, doshas as unknown as Record<string, unknown>);
  return 'updated';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run test/kundli-repo-admin.spec.ts && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/kundli/kundli.repo.ts src/modules/kundli/kundli.service.ts test/kundli-repo-admin.spec.ts
git commit -m "feat(admin): add listKundlisByUserId + single-user dosha regeneration"
```

---

### Task 4: Horoscope addition — `listHoroscopesByUserId`

**Files:**

- Modify: `src/modules/horoscope/horoscope.repo.ts`
- Create: `test/horoscope-repo-admin.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/horoscope-repo-admin.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select }, sqlClient };
});

import { listHoroscopesByUserId } from '../src/modules/horoscope/horoscope.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  orderBy: (ord: unknown) => Promise<unknown[]>;
}
function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown; orderBy?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn((ord: unknown) => {
      calls.orderBy = ord;
      return Promise.resolve(result);
    }),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.select.mockReset();
});

describe('listHoroscopesByUserId', () => {
  it('selects every horoscope row for the user, newest first', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'h1' }, { id: 'h2' }]);
    state.select.mockReturnValue(chain);

    const rows = await listHoroscopesByUserId('user-1');

    expect(rows).toEqual([{ id: 'h1' }, { id: 'h2' }]);
    const whereQuery = compile(calls.where);
    expect(whereQuery.sql).toBe('"daily_horoscopes"."user_id" = $1');
    expect(whereQuery.params).toEqual(['user-1']);
    const orderQuery = compile(calls.orderBy);
    expect(orderQuery.sql).toBe('"daily_horoscopes"."updated_at" desc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run test/horoscope-repo-admin.spec.ts
```

- [ ] **Step 3: Write minimal implementation**

In `src/modules/horoscope/horoscope.repo.ts`, add `desc` to the drizzle-orm import:

```ts
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
```

Then add the new function anywhere after `profileFilter` (e.g. right before `listRecentlyActiveUsersAfter`):

```ts
/**
 * Every horoscope row for this user across all profiles/periods, newest
 * first — exactly scripts/inspect-user.ts's own query (no birthProfileId
 * filter, since this is a diagnostic dump, not a serving path). Used by the
 * admin diagnostic dump (GET /v1/admin/users/:phone/inspect).
 */
export async function listHoroscopesByUserId(userId: string): Promise<DailyHoroscopeRow[]> {
  return db
    .select()
    .from(dailyHoroscopes)
    .where(eq(dailyHoroscopes.userId, userId))
    .orderBy(desc(dailyHoroscopes.updatedAt));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run test/horoscope-repo-admin.spec.ts && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/horoscope/horoscope.repo.ts test/horoscope-repo-admin.spec.ts
git commit -m "feat(admin): add listHoroscopesByUserId for the diagnostic dump route"
```

---

### Task 5: Device-tokens addition — `countActiveDeviceTokensByPlatform`

**Files:**

- Modify: `src/modules/device-tokens/device-tokens.repo.ts`
- Create: `test/device-tokens-repo-admin.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/device-tokens-repo-admin.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select }, sqlClient };
});

import { countActiveDeviceTokensByPlatform } from '../src/modules/device-tokens/device-tokens.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  groupBy: (col: unknown) => Promise<unknown[]>;
}
function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown; groupBy?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    groupBy: vi.fn((col: unknown) => {
      calls.groupBy = col;
      return Promise.resolve(result);
    }),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.select.mockReset();
});

describe('countActiveDeviceTokensByPlatform', () => {
  it('groups active (unrevoked) tokens by platform', async () => {
    const { chain, calls } = makeSelectChain([
      { platform: 'ios', count: 3 },
      { platform: 'android', count: 5 },
    ]);
    state.select.mockReturnValue(chain);

    const rows = await countActiveDeviceTokensByPlatform();

    expect(rows).toEqual([
      { platform: 'ios', count: 3 },
      { platform: 'android', count: 5 },
    ]);
    const query = compile(calls.where);
    expect(query.sql).toBe('"device_push_tokens"."revoked_at" is null');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run test/device-tokens-repo-admin.spec.ts
```

- [ ] **Step 3: Write minimal implementation**

In `src/modules/device-tokens/device-tokens.repo.ts`, add `count` to the import and the new function at the end of the file:

```ts
import { and, count, eq, isNull, ne, or } from 'drizzle-orm';
```

```ts
/**
 * Active (unrevoked) device-token counts grouped by platform — porting
 * scripts/count-device-tokens.ts's query (which fetches every unrevoked row
 * and reduces in JS) into a single GROUP BY, for GET /v1/admin/device-tokens/stats.
 * Deliberately NOT filtered by pushEnabled (unlike findActiveTokensForUser) —
 * this is a registration/health count, not a "would receive a push" count,
 * matching the script's own semantics exactly.
 */
export async function countActiveDeviceTokensByPlatform(): Promise<
  Array<{ platform: DevicePushTokenRow['platform']; count: number }>
> {
  return db
    .select({ platform: devicePushTokens.platform, count: count() })
    .from(devicePushTokens)
    .where(isNull(devicePushTokens.revokedAt))
    .groupBy(devicePushTokens.platform);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run test/device-tokens-repo-admin.spec.ts && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/device-tokens/device-tokens.repo.ts test/device-tokens-repo-admin.spec.ts
git commit -m "feat(admin): add countActiveDeviceTokensByPlatform"
```

---

### Task 6: `admin.schemas.ts` + `admin.service.ts`

**Files:**

- Create: `src/modules/admin/admin.schemas.ts`, `src/modules/admin/admin.service.ts`, `test/admin-service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/admin/admin.schemas.ts` first (schemas are declarative — this codebase has no dedicated `*.schemas.ts` spec files; `PrimeReportDtoSchema`/`GemstoneReportSchema` etc. are all exercised only indirectly via their route specs, same pattern followed here in Task 7):

```ts
import { z } from '@hono/zod-openapi';
import { GenderSchema, PlaceOfBirthSchema } from '../users/users.schemas.js';

/**
 * `/v1/admin/*` phone-number path param. The client must URL-encode the
 * leading `+` (as `%2B`) — Hono decodes the path segment before this schema
 * ever sees it, so the plain E.164 string (with `+`) is what's validated here.
 */
export const PhoneParamSchema = z.object({
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Must be E.164 format, e.g. +919999999999')
    .openapi({ param: { name: 'phone', in: 'path' }, example: '+919999999999' }),
});

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/users/{phone}/inspect                                        */
/* -------------------------------------------------------------------------- */

export const AdminKundliSummarySchema = z
  .object({
    birthProfileId: z.string().uuid().nullable(),
    status: z.enum(['pending', 'generating', 'ready', 'failed']),
    error: z.string().nullable(),
    updatedAt: z.string(),
    chartData: z.record(z.string(), z.unknown()).nullable(),
    dashaData: z.record(z.string(), z.unknown()).nullable(),
    yogaData: z.record(z.string(), z.unknown()).nullable(),
    doshaData: z.record(z.string(), z.unknown()).nullable(),
    ashtakavargaData: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi('AdminKundliSummary');

export const AdminHoroscopeSummarySchema = z
  .object({
    birthProfileId: z.string().uuid().nullable(),
    period: z.enum(['daily', 'tomorrow', 'weekly', 'monthly', 'yearly']),
    forDate: z.string(),
    periodKey: z.string(),
    status: z.enum(['generating', 'ready', 'failed']),
    model: z.string().nullable(),
    summary: z.string().nullable(),
    structured: z.record(z.string(), z.unknown()).nullable(),
    monthlyBreakdown: z.array(z.record(z.string(), z.unknown())).nullable(),
    error: z.string().nullable(),
    updatedAt: z.string(),
  })
  .openapi('AdminHoroscopeSummary');

export const AdminUserInspectionSchema = z
  .object({
    user: z.object({
      id: z.string().uuid(),
      displayName: z.string().nullable(),
      phoneE164: z.string().nullable(),
      gender: GenderSchema.nullable(),
      dateOfBirth: z.string().nullable(),
      timeOfBirth: z.string().nullable(),
      placeOfBirth: PlaceOfBirthSchema.nullable(),
      onboardingStatus: z.string().nullable(),
      walletBalancePaise: z.number().int(),
      unlockedHouses: z.array(z.number().int()),
      gemstoneUnlockedAt: z.string().nullable(),
      createdAt: z.string(),
      deletedAt: z.string().nullable(),
    }),
    kundlis: z.array(AdminKundliSummarySchema),
    horoscopes: z.array(AdminHoroscopeSummarySchema),
  })
  .openapi('AdminUserInspection');

export type AdminUserInspection = z.infer<typeof AdminUserInspectionSchema>;

/* -------------------------------------------------------------------------- */
/* POST /v1/admin/users/{phone}/regenerate                                    */
/* -------------------------------------------------------------------------- */

/**
 * The real, currently-supported single-user regeneration categories — found
 * by reading all 6 scripts/regenerate-*.ts scripts (see plan "Before you
 * start"): 'horoscope' (all 5 periods, scripts/regenerate-one-user.ts),
 * 'dosha' (deterministic recompute, scripts/regenerate-all-doshas.ts), and
 * 'gemstone' (scripts/regenerate-gemstone-all.ts). 'all' runs all three.
 * Per-house-insight regeneration (scripts/force-regenerate.ts) is
 * deliberately NOT a category here — see the plan's Notes section.
 */
export const AdminRegenerateCategorySchema = z
  .enum(['gemstone', 'dosha', 'horoscope', 'all'])
  .openapi('AdminRegenerateCategory');

export const AdminRegenerateBodySchema = z
  .object({ category: AdminRegenerateCategorySchema })
  .strict()
  .openapi('AdminRegenerateBody');

export const AdminRegenerateResponseSchema = z
  .object({ status: z.literal('started') })
  .openapi('AdminRegenerateResponse');

export type AdminRegenerateCategory = z.infer<typeof AdminRegenerateCategorySchema>;

/* -------------------------------------------------------------------------- */
/* POST /v1/admin/users/{phone}/notify                                        */
/* -------------------------------------------------------------------------- */

export const AdminNotifyBodySchema = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(500),
  })
  .strict()
  .openapi('AdminNotifyBody');

export const AdminNotifyResponseSchema = z
  .object({
    tokenCount: z.number().int().nonnegative(),
    success: z.number().int().nonnegative(),
    failure: z.number().int().nonnegative(),
  })
  .openapi('AdminNotifyResponse');

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/device-tokens/stats                                          */
/* -------------------------------------------------------------------------- */

export const AdminDeviceTokenStatsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    byPlatform: z.record(z.string(), z.number().int().nonnegative()),
  })
  .openapi('AdminDeviceTokenStats');
```

Now create `test/admin-service.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run test/admin-service.spec.ts
```

Fails — `src/modules/admin/admin.service.ts` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/modules/admin/admin.service.ts`:

```ts
import { logger } from '../../lib/logger.js';
import { Errors } from '../../lib/errors.js';
import type { UserRow } from '../../db/schema.js';
import { findUserByPhoneE164 } from '../users/users.repo.js';
import { resolveProfileContext, type ProfileContext } from '../birth-profiles/profile-context.js';
import { findKundliByUserId, listKundlisByUserId } from '../kundli/kundli.repo.js';
import { regenerateDoshaForUser } from '../kundli/kundli.service.js';
import { listHoroscopesByUserId } from '../horoscope/horoscope.repo.js';
import {
  HOROSCOPE_PERIODS,
  currentPeriodStart,
  requestHoroscopeGeneration,
} from '../horoscope/horoscope.service.js';
import { requestGemstoneGeneration } from '../gemstone/gemstone.service.js';
import {
  countActiveDeviceTokensByPlatform,
  findActiveTokensForUser,
} from '../device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import type { AdminRegenerateCategory, AdminUserInspection } from './admin.schemas.js';

/** Shared lookup for every admin route keyed by phone — 404s on an unknown or soft-deleted phone. */
export async function findAdminTargetUser(phone: string): Promise<UserRow> {
  const user = await findUserByPhoneE164(phone);
  if (!user || user.deletedAt !== null) {
    throw Errors.notFound(`No user found with phone ${phone}`);
  }
  return user;
}

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/users/{phone}/inspect                                        */
/* -------------------------------------------------------------------------- */

export async function inspectUserByPhone(phone: string): Promise<AdminUserInspection> {
  const user = await findAdminTargetUser(phone);

  const [kundliRows, horoscopeRows] = await Promise.all([
    listKundlisByUserId(user.id),
    listHoroscopesByUserId(user.id),
  ]);

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      phoneE164: user.phoneE164,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      timeOfBirth: user.timeOfBirth,
      placeOfBirth: user.placeOfBirth,
      onboardingStatus: user.onboardingStatus,
      walletBalancePaise: user.walletBalancePaise,
      unlockedHouses: user.unlockedHouses,
      gemstoneUnlockedAt: user.gemstoneUnlockedAt ? user.gemstoneUnlockedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
    },
    kundlis: kundliRows.map((k) => ({
      birthProfileId: k.birthProfileId,
      status: k.status,
      error: k.error,
      updatedAt: k.updatedAt.toISOString(),
      chartData: k.chartData,
      dashaData: k.dashaData,
      yogaData: k.yogaData,
      doshaData: k.doshaData,
      ashtakavargaData: k.ashtakavargaData,
    })),
    horoscopes: horoscopeRows.map((h) => ({
      birthProfileId: h.birthProfileId,
      period: h.period,
      forDate: h.forDate,
      periodKey: h.periodKey,
      status: h.status,
      model: h.model,
      summary: h.summary,
      structured: h.structured,
      monthlyBreakdown: h.monthlyBreakdown,
      error: h.error,
      updatedAt: h.updatedAt.toISOString(),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* POST /v1/admin/users/{phone}/notify                                        */
/* -------------------------------------------------------------------------- */

export interface AdminNotifyResult {
  tokenCount: number;
  success: number;
  failure: number;
}

export async function notifyUserByPhone(
  phone: string,
  title: string,
  body: string,
): Promise<AdminNotifyResult> {
  const user = await findAdminTargetUser(phone);
  // Reuses the device-tokens module's own active-token lookup — deliberately
  // more correct than scripts/notify-user-by-phone.ts's raw query (which
  // doesn't filter pushEnabled), since this actually sends a push.
  const tokens = await findActiveTokensForUser(user.id);
  if (tokens.length === 0) return { tokenCount: 0, success: 0, failure: 0 };

  const { success, failure } = await sendPushBatch(
    tokens.map((t) => t.token),
    title,
    body,
  );
  return { tokenCount: tokens.length, success, failure };
}

/* -------------------------------------------------------------------------- */
/* POST /v1/admin/users/{phone}/regenerate                                    */
/* -------------------------------------------------------------------------- */

/** Mirrors scripts/regenerate-one-user.ts: every period, force:true, one bounded attempt each (no retryForever — this runs unattended in the background). */
async function regenerateHoroscopesForUser(user: UserRow, profile: ProfileContext): Promise<void> {
  for (const period of HOROSCOPE_PERIODS) {
    try {
      await requestHoroscopeGeneration(user, profile, period, {
        forDate: currentPeriodStart(period),
        force: true,
      });
    } catch (err) {
      logger.error({ err, userId: user.id, period }, 'admin regenerate: horoscope period failed');
    }
  }
}

/** Mirrors scripts/regenerate-all-doshas.ts's per-row logic, scoped to this one user's kundli. */
async function regenerateDoshaTaskForUser(user: UserRow, profile: ProfileContext): Promise<void> {
  try {
    await regenerateDoshaForUser(user.id, profile.birthProfileId);
  } catch (err) {
    logger.error({ err, userId: user.id }, 'admin regenerate: dosha failed');
  }
}

/** Mirrors scripts/regenerate-gemstone-all.ts's per-target logic: no-op if there's no ready kundli yet. */
async function regenerateGemstoneForUser(user: UserRow, profile: ProfileContext): Promise<void> {
  const kundli = await findKundliByUserId(user.id, profile.birthProfileId);
  if (!kundli || kundli.status !== 'ready') return;
  try {
    await requestGemstoneGeneration(
      user.id,
      profile.birthProfileId,
      { chartData: kundli.chartData },
      { force: true },
    );
  } catch (err) {
    logger.error({ err, userId: user.id }, 'admin regenerate: gemstone failed');
  }
}

/**
 * Kicks off the requested category's regeneration task(s) WITHOUT awaiting
 * them — same fire-and-forget + catch-and-log convention as
 * prime-reports.service.ts's unlockReport/fireGeneration. Each task above
 * additionally catches its own errors internally, so one failing
 * period/profile never aborts the others.
 */
function dispatchRegeneration(
  user: UserRow,
  profile: ProfileContext,
  category: AdminRegenerateCategory,
): void {
  if (category === 'horoscope' || category === 'all') {
    void regenerateHoroscopesForUser(user, profile);
  }
  if (category === 'dosha' || category === 'all') {
    void regenerateDoshaTaskForUser(user, profile);
  }
  if (category === 'gemstone' || category === 'all') {
    void regenerateGemstoneForUser(user, profile);
  }
}

/**
 * Validates the target user exists (awaited — so the route can 404), then
 * fires the actual regeneration in the background and returns immediately.
 */
export async function startRegeneration(
  phone: string,
  category: AdminRegenerateCategory,
): Promise<void> {
  const user = await findAdminTargetUser(phone);
  // This admin route isn't profile-aware — always regenerates the primary/
  // self profile, matching every existing regenerate-*.ts script's behavior.
  const profile = await resolveProfileContext(user, null);
  dispatchRegeneration(user, profile, category);
}

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/device-tokens/stats                                          */
/* -------------------------------------------------------------------------- */

export interface AdminDeviceTokenStats {
  total: number;
  byPlatform: Record<string, number>;
}

export async function getDeviceTokenStats(): Promise<AdminDeviceTokenStats> {
  const rows = await countActiveDeviceTokensByPlatform();
  const byPlatform: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byPlatform[row.platform] = row.count;
    total += row.count;
  }
  return { total, byPlatform };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run test/admin-service.spec.ts && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/admin/admin.schemas.ts src/modules/admin/admin.service.ts test/admin-service.spec.ts
git commit -m "feat(admin): add admin.schemas.ts + admin.service.ts"
```

---

### Task 7: `admin.routes.ts` + mount in `app.ts`

**Files:**

- Create: `src/modules/admin/admin.routes.ts`, `test/admin-routes.spec.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Write the failing test**

Create `test/admin-routes.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';
import { Errors } from '../src/lib/errors.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
  inspectUserByPhone: vi.fn(),
  notifyUserByPhone: vi.fn(),
  startRegeneration: vi.fn().mockResolvedValue(undefined),
  getDeviceTokenStats: vi.fn(),
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
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/admin/admin.repo.js', () => ({
  logAdminAction: state.logAdminAction,
}));

vi.mock('../src/modules/admin/admin.service.js', () => ({
  inspectUserByPhone: state.inspectUserByPhone,
  notifyUserByPhone: state.notifyUserByPhone,
  startRegeneration: state.startRegeneration,
  getDeviceTokenStats: state.getDeviceTokenStats,
}));

process.env.ADMIN_FIREBASE_UIDS = 'admin-uid-1';

const { createApp } = await import('../src/app.js');

const ADMIN_AUTH = { Authorization: 'Bearer admin-token' } as const;
const NON_ADMIN_AUTH = { Authorization: 'Bearer plain-token' } as const;

function mockAsAdmin() {
  state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('admin-uid-1'));
  state.findUserByFirebaseUid.mockResolvedValueOnce(
    makeUserRow({ id: 'admin-id-1', firebaseUid: 'admin-uid-1' }),
  );
}

function mockAsNonAdmin() {
  state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('plain-uid'));
  state.findUserByFirebaseUid.mockResolvedValueOnce(
    makeUserRow({ id: 'plain-id-1', firebaseUid: 'plain-uid' }),
  );
}

beforeEach(() => {
  state.verifyIdToken.mockReset();
  state.findUserByFirebaseUid.mockReset();
  state.logAdminAction.mockReset().mockResolvedValue(undefined);
  state.inspectUserByPhone.mockReset();
  state.notifyUserByPhone.mockReset();
  state.startRegeneration.mockReset().mockResolvedValue(undefined);
  state.getDeviceTokenStats.mockReset();
});

describe('GET /v1/admin/users/:phone/inspect', () => {
  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/admin/users/+919999999999/inspect');
    expect(res.status).toBe(401);
  });

  it('403s for an authenticated non-admin', async () => {
    mockAsNonAdmin();
    const res = await createApp().request('/v1/admin/users/+919999999999/inspect', {
      headers: NON_ADMIN_AUTH,
    });
    expect(res.status).toBe(403);
    expect(state.inspectUserByPhone).not.toHaveBeenCalled();
  });

  it('404s when the service reports no such user', async () => {
    mockAsAdmin();
    state.inspectUserByPhone.mockRejectedValueOnce(
      Errors.notFound('No user found with phone +919999999999'),
    );

    const res = await createApp().request('/v1/admin/users/+919999999999/inspect', {
      headers: ADMIN_AUTH,
    });
    expect(res.status).toBe(404);
  });

  it('200s with the dump for an admin, and audits the call', async () => {
    mockAsAdmin();
    state.inspectUserByPhone.mockResolvedValueOnce({
      user: { id: 'u1' },
      kundlis: [],
      horoscopes: [],
    });

    const res = await createApp().request('/v1/admin/users/+919999999999/inspect', {
      headers: ADMIN_AUTH,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } };
    expect(body.user.id).toBe('u1');
    expect(state.inspectUserByPhone).toHaveBeenCalledWith('+919999999999');
    expect(state.logAdminAction).toHaveBeenCalledWith({
      adminFirebaseUid: 'admin-uid-1',
      route: 'GET /v1/admin/users/:phone/inspect',
      params: { phone: '+919999999999' },
    });
  });
});

describe('POST /v1/admin/users/:phone/regenerate', () => {
  it('403s for an authenticated non-admin', async () => {
    mockAsNonAdmin();
    const res = await createApp().request('/v1/admin/users/+919999999999/regenerate', {
      method: 'POST',
      headers: { ...NON_ADMIN_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'all' }),
    });
    expect(res.status).toBe(403);
    expect(state.startRegeneration).not.toHaveBeenCalled();
  });

  it('422s for an invalid category', async () => {
    mockAsAdmin();
    const res = await createApp().request('/v1/admin/users/+919999999999/regenerate', {
      method: 'POST',
      headers: { ...ADMIN_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'not-a-real-category' }),
    });
    expect(res.status).toBe(422);
    expect(state.startRegeneration).not.toHaveBeenCalled();
  });

  it("200s with {status:'started'} and audits the call", async () => {
    mockAsAdmin();
    const res = await createApp().request('/v1/admin/users/+919999999999/regenerate', {
      method: 'POST',
      headers: { ...ADMIN_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'dosha' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { status: string }).toEqual({ status: 'started' });
    expect(state.startRegeneration).toHaveBeenCalledWith('+919999999999', 'dosha');
    expect(state.logAdminAction).toHaveBeenCalledWith({
      adminFirebaseUid: 'admin-uid-1',
      route: 'POST /v1/admin/users/:phone/regenerate',
      params: { phone: '+919999999999', category: 'dosha' },
    });
  });
});

describe('POST /v1/admin/users/:phone/notify', () => {
  it('403s for an authenticated non-admin', async () => {
    mockAsNonAdmin();
    const res = await createApp().request('/v1/admin/users/+919999999999/notify', {
      method: 'POST',
      headers: { ...NON_ADMIN_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hi', body: 'there' }),
    });
    expect(res.status).toBe(403);
    expect(state.notifyUserByPhone).not.toHaveBeenCalled();
  });

  it('200s with the push result and audits the call', async () => {
    mockAsAdmin();
    state.notifyUserByPhone.mockResolvedValueOnce({ tokenCount: 2, success: 2, failure: 0 });

    const res = await createApp().request('/v1/admin/users/+919999999999/notify', {
      method: 'POST',
      headers: { ...ADMIN_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hi', body: 'there' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ tokenCount: 2, success: 2, failure: 0 });
    expect(state.notifyUserByPhone).toHaveBeenCalledWith('+919999999999', 'Hi', 'there');
    expect(state.logAdminAction).toHaveBeenCalledWith({
      adminFirebaseUid: 'admin-uid-1',
      route: 'POST /v1/admin/users/:phone/notify',
      params: { phone: '+919999999999', title: 'Hi' },
    });
  });
});

describe('GET /v1/admin/device-tokens/stats', () => {
  it('403s for an authenticated non-admin', async () => {
    mockAsNonAdmin();
    const res = await createApp().request('/v1/admin/device-tokens/stats', {
      headers: NON_ADMIN_AUTH,
    });
    expect(res.status).toBe(403);
  });

  it('200s with the stats for an admin', async () => {
    mockAsAdmin();
    state.getDeviceTokenStats.mockResolvedValueOnce({
      total: 8,
      byPlatform: { ios: 3, android: 5 },
    });

    const res = await createApp().request('/v1/admin/device-tokens/stats', { headers: ADMIN_AUTH });
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ total: 8, byPlatform: { ios: 3, android: 5 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run test/admin-routes.spec.ts
```

Fails — `src/modules/admin/admin.routes.ts` doesn't exist and nothing is mounted at `/v1/admin/*` yet (every request 404s via `notFoundHandler`).

- [ ] **Step 3: Write minimal implementation**

Create `src/modules/admin/admin.routes.ts`:

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { logAdminAction } from './admin.repo.js';
import {
  getDeviceTokenStats,
  inspectUserByPhone,
  notifyUserByPhone,
  startRegeneration,
} from './admin.service.js';
import {
  AdminDeviceTokenStatsSchema,
  AdminNotifyBodySchema,
  AdminNotifyResponseSchema,
  AdminRegenerateBodySchema,
  AdminRegenerateResponseSchema,
  AdminUserInspectionSchema,
  PhoneParamSchema,
} from './admin.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('Error');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const adminRouter = new OpenAPIHono();

const inspectRoute = createRoute({
  method: 'get',
  path: '/admin/users/{phone}/inspect',
  tags: ['Admin'],
  summary: 'Full diagnostic dump for one user by phone (profile, kundli(s), horoscopes)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: PhoneParamSchema },
  responses: {
    200: {
      description: 'User diagnostic dump',
      content: { 'application/json': { schema: AdminUserInspectionSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    404: errorResponse('No user found with this phone number'),
  },
});

adminRouter.openapi(inspectRoute, async (c) => {
  const { phone } = c.req.valid('param');
  await logAdminAction({
    adminFirebaseUid: c.get('user').firebaseUid,
    route: 'GET /v1/admin/users/:phone/inspect',
    params: { phone },
  });
  const dump = await inspectUserByPhone(phone);
  return c.json(dump, 200);
});

const regenerateRoute = createRoute({
  method: 'post',
  path: '/admin/users/{phone}/regenerate',
  tags: ['Admin'],
  summary: 'Trigger content regeneration for one user by phone (fire-and-forget)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: PhoneParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: AdminRegenerateBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Regeneration started',
      content: { 'application/json': { schema: AdminRegenerateResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    404: errorResponse('No user found with this phone number'),
    422: errorResponse('Validation failed'),
  },
});

adminRouter.openapi(regenerateRoute, async (c) => {
  const { phone } = c.req.valid('param');
  const { category } = c.req.valid('json');
  await logAdminAction({
    adminFirebaseUid: c.get('user').firebaseUid,
    route: 'POST /v1/admin/users/:phone/regenerate',
    params: { phone, category },
  });
  await startRegeneration(phone, category);
  return c.json({ status: 'started' as const }, 200);
});

const notifyRoute = createRoute({
  method: 'post',
  path: '/admin/users/{phone}/notify',
  tags: ['Admin'],
  summary: "Send a single targeted push notification to one user's registered device(s)",
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: PhoneParamSchema,
    body: { required: true, content: { 'application/json': { schema: AdminNotifyBodySchema } } },
  },
  responses: {
    200: {
      description: 'Notification result',
      content: { 'application/json': { schema: AdminNotifyResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    404: errorResponse('No user found with this phone number'),
    422: errorResponse('Validation failed'),
  },
});

adminRouter.openapi(notifyRoute, async (c) => {
  const { phone } = c.req.valid('param');
  const { title, body } = c.req.valid('json');
  await logAdminAction({
    adminFirebaseUid: c.get('user').firebaseUid,
    route: 'POST /v1/admin/users/:phone/notify',
    params: { phone, title },
  });
  const result = await notifyUserByPhone(phone, title, body);
  return c.json(result, 200);
});

const deviceTokenStatsRoute = createRoute({
  method: 'get',
  path: '/admin/device-tokens/stats',
  tags: ['Admin'],
  summary: 'Device-token counts by platform (active/unrevoked)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Device token stats',
      content: { 'application/json': { schema: AdminDeviceTokenStatsSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
  },
});

adminRouter.openapi(deviceTokenStatsRoute, async (c) => {
  await logAdminAction({
    adminFirebaseUid: c.get('user').firebaseUid,
    route: 'GET /v1/admin/device-tokens/stats',
    params: null,
  });
  const stats = await getDeviceTokenStats();
  return c.json(stats, 200);
});
```

In `src/app.ts`, add the import and mount it alongside the other `/v1` routers:

```ts
import { palmPhotoRouter } from './modules/palm/palm-photo.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { cronRouter } from './modules/cron/cron.routes.js';
```

```ts
app.route('/v1', palmPhotoRouter);
app.route('/v1', adminRouter);
// Mounted OUTSIDE /v1: the /v1 routers attach a `requireUser` wildcard that
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run test/admin-routes.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/admin/admin.routes.ts src/app.ts test/admin-routes.spec.ts
git commit -m "feat(admin): add /v1/admin/* routes and mount them in app.ts"
```

---

## Final verification (run once, after all tasks)

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Confirm:

- Test failure count is still exactly the pre-existing 9 (4 files) — no regressions, plus every new `*.spec.ts` file above passes.
- Typecheck error count is still 104 (the pre-existing, unrelated ones) — no new errors introduced by this plan's own new files.
- `pnpm lint` is clean for every new/modified file.

---

## Notes / Follow-ups (explicitly not part of this plan)

- **Thin admin web UI.** Out of scope by design — this plan is backend-only. A fast-follow could add a minimal internal page (even just Swagger UI at `/docs`, which already documents these 4 routes automatically via `.openapi()`) or a real UI later.
- **House-insight regeneration category.** `scripts/force-regenerate.ts` also regenerates all 12 per-house AI insights via `requestHouseInsightGeneration`, which this plan's `regenerate` route does NOT expose as a 5th category (the agreed category set is `gemstone | dosha | horoscope | all`). Adding a `houses` category later is a small, mechanical addition to `admin.service.ts` following the exact same `regenerate*ForUser` pattern established here.
- **Stale one-off scripts.** `scripts/inspect-user.ts` (`user.credits`, `kundli.errorMessage`, `horoscope.errorMessage` — all stale field names per "Before you start") and the other 5 `regenerate-*.ts` scripts are now superseded by the new HTTP routes for the single-user case. Recommend deleting or clearly deprecating them in a follow-up PR rather than leaving two ways to do the same thing — not done here since it wasn't requested as a task.
- **Astrologer-approval / pandit moderation / activity-log dashboard.** Out of scope — these depend on marketplace/activity-event features that don't exist on the live backend yet (only in the old, unreferenced `apps/api`). Separate initiative.
- **Rate limiting.** The 4 new routes automatically inherit the existing baseline `/v1/*` limiter (300 req/min per user/IP, `src/app.ts`) once mounted — no extra step needed. If abuse becomes a concern for `regenerate` specifically (it can trigger real LLM spend), a stricter per-route limiter (same pattern as the chat/vastu/purchase-plan routes) would be a cheap fast-follow.

## Self-review notes

Every function name, field name, and signature this plan relies on was independently re-verified against the real source a second time (not just trusted from the initial drafting pass), including: `requireUser`'s actual next()-calling behavior (confirms the `requireAdmin` composition works), `resolveProfileContext`'s exact signature (distinct from `resolveActiveProfileContext`), the exact `kundlis`/`dailyHoroscopes`/`users` column names this plan's DTOs and queries depend on, `sendPushBatch`'s real signature and return shape, `findActiveTokensForUser`/`findUserByPhoneE164`'s real signatures, and that `analyzeAllDoshas` is already imported in `kundli.service.ts` (so no duplicate import is needed there). No discrepancies found.

### Critical Files for Implementation

- `src/middleware/auth.ts` — `requireAdmin`, the security boundary for every route in this plan
- `src/modules/admin/admin.service.ts` — all business logic (inspect/notify/regenerate/stats), wired to existing modules
- `src/modules/admin/admin.routes.ts` — the 4 HTTP endpoints and their audit-logging
- `src/db/schema.ts` — `adminAuditLog` table definition (drives the Task 2 migration)
- `src/modules/kundli/kundli.service.ts` — `regenerateDoshaForUser`, the one genuinely new piece of domain logic (everything else is composition of existing functions)
