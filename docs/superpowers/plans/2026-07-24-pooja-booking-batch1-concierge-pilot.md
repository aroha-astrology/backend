# Pooja Booking Batch 1 — Concierge Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deliberately small "concierge pilot" pooja-booking subsystem — admin-vetted pandits, single-member bookings, wallet-debit-on-request, manual admin completion — reusing the existing curated pooja list rather than inventing a new catalog.

**Architecture:** Three new tables (`pooja_catalog`, `pandits`, `pooja_bookings`) live alongside the existing `users`/`birth_profiles`/`wallet_transactions` tables in `src/db/schema.ts`. A new `src/modules/pooja-bookings/` module holds the repo/service/routes/schemas, following the exact conventions already proven by `src/modules/prime-reports/`: the wallet debit at booking time reuses `unlockPrimeReport`'s atomic "balance-guarded UPDATE + ledger insert + row insert, all in one `db.transaction`" shape, and the new `refundPoojaBooking()` primitive uses the same "conditional UPDATE is the concurrency guard" idea as `claimPrimeReportGeneration`. A minimal `requireAdmin` middleware (env-var Firebase-UID allowlist, mirroring the Telegram bot's tier-resolution pattern) gates the three ops-only routes. No pandit self-onboarding, no multi-member bookings, no offerings catalog, no video-proof, no automated fulfillment tracking — see "Explicitly deferred" below.

**Tech Stack:** Hono + `@hono/zod-openapi`, Drizzle/Postgres, Firebase Auth, Vitest.

---

## Before you start

- **Working directory:** `C:\dev\aroha-astrology\jyotish-backend\.worktrees\prime-reports-batch2` — a git worktree on branch `feat/prime-reports-batch2`. This branch has been accumulating multiple unrelated feature batches (prime-reports batches 2–9, flagship-report batches, the Shagun affiliate shop, the Admin Console foundation). Do NOT merge to `main` — just commit to this branch after each task below, same as every prior batch on it.
- **Baseline `pnpm test`:** 803 passing / 9 failing, 812 total tests across 105 files (Test Files: 4 failed | 101 passed) — as of just before this plan's own work. This baseline will have shifted upward once the Shagun and Admin Console plans land first; re-check `pnpm test` before Task 1 and use the real current numbers. The 9 failures are pre-existing and unrelated to this work (`horoscope-jargon.spec.ts`, `purchase-plan-notify.spec.ts`, and others in `billing-google-play`/`health-report`/`dosha-descriptions`) — do not try to fix them, do not let them block a task. After each task below, the pass count should grow by that task's new tests with the same 9 pre-existing failures untouched.
- **Baseline `pnpm typecheck`:** 104 pre-existing errors (across `test/dosha-descriptions.spec.ts`, `test/telegram-bot.spec.ts`, `test/billing-google-play.spec.ts`, `test/helpers/mocks.ts`, and others). Pre-existing and unrelated — do not fix them. After each task, confirm no _new_ errors were introduced (the count should not grow, though it may not shrink either).
- **Next Drizzle migration number:** confirm the actual next number by listing `src/db/migrations/` before Task 1 — it will have advanced past `0033` if the Shagun and/or Admin Console plans already landed on this branch. ALWAYS generate migrations via `pnpm db:generate` after editing `schema.ts` — never hand-write migration SQL (see Task 1, Step 2, for the exact verification procedure to follow).
- **The real, existing curated pooja list** (read in full from `src/lib/astro-engine/poojaRecommendations.ts` — this is the SAME data already used by the free/AI pooja-guidance report, `reportType: 'pooja'` in `prime-reports.registry.ts`) has exactly **9 poojas**: `Satyanarayan Pooja`, `Navgraha Shanti Pooja`, `Mangal Shanti Pooja`, `Kaal Sarp Dosha Nivaran Pooja`, `Shani Shanti Pooja`, `Pitra Dosha Nivaran Pooja (Shraadh)`, `Kemdruma Dosha Nivaran Pooja`, `Grahan Dosha Nivaran Pooja`, `Guru Chandal Dosha Nivaran Pooja`. Task 8's seed script uses these exact 9 names/descriptions/deities — it does NOT invent a 50-pooja catalog like the abandoned `apps/api` reference implementation did.
- **Existing conventions this plan reuses (verified by reading the files):**
  - `unlockPrimeReport()` (`src/modules/prime-reports/prime-reports.repo.ts`) — the atomic debit-and-insert transaction pattern reused by `createPoojaBooking()`.
  - `deductWalletBalance`/`addWalletBalance` (`src/modules/users/users.repo.ts`, verified in full) — confirms the sign convention: a debit's ledger row has a **negative** `delta`, a credit/refund's ledger row has a **positive** `delta`. `refundPoojaBooking()` in Task 4 follows this exactly (a positive `delta` that negates the original booking charge). Note this plan's `createPoojaBooking`/`refundPoojaBooking` do NOT call these two generic helpers directly — they inline the same balance-guarded-update + ledger-insert logic combined with the booking row write in ONE transaction, for the same reason `unlockPrimeReport` doesn't call them either: the wallet update and the booking-row write must commit or roll back together, which isn't possible across two separate transactions.
  - `walletTransactions` table (`src/db/schema.ts`, verified: `id`, `userId`, `delta`, `reason`, `balanceAfter`, `createdAt`) — exactly the shape this plan's ledger inserts use.
  - `resolveActiveProfileContext()` (`src/modules/birth-profiles/profile-context.ts`) — resolves which birth profile (self or a saved family member) a booking is made for.
  - `requireUser` (`src/middleware/auth.ts`) — sets `c.var.user` (a `UserRow`), which `requireAdmin` (Task 2) reads.
  - `resolveTier()` (`src/modules/telegram-bot/telegram-bot.service.ts`) — the comma-separated-env-var-allowlist pattern `requireAdmin` mirrors.
  - `sendPush`/`sendPushBatch` (`src/lib/notifications/fcm.ts`) and `notifyPurchasePlanReady` (`src/modules/purchase-plan/purchase-plan.service.ts`) — the "look up active device tokens, batch-send, never let a push failure fail the underlying action" pattern.
  - `scripts/seed-coupons.ts` — the idempotent look-up-by-name-then-update-or-insert seed-script convention.
  - `src/app.ts` — routers are mounted via `app.route('/v1', someRouter)`, each router's own paths omit the `/v1` prefix.
  - `date` (for `preferredDate`, a day-scheduled not minute-scheduled column) is already imported in `src/db/schema.ts` from `drizzle-orm/pg-core` — no new import needed for it.
- **Possible naming collision with the Admin Console plan:** if `docs/superpowers/plans/2026-07-24-admin-console-foundation.md` has already landed on this branch, it introduces its OWN `requireAdmin` (in `src/middleware/auth.ts`, keyed off `ADMIN_FIREBASE_UIDS`) and its OWN `ADMIN_FIREBASE_UIDS` env var. **Before starting Task 2, check whether `requireAdmin` and `ADMIN_FIREBASE_UIDS` already exist** (`grep -rn "requireAdmin\|ADMIN_FIREBASE_UIDS" src/`). If they do, **skip Task 2 entirely and reuse the existing `requireAdmin` from `src/middleware/auth.ts`** instead of creating a second, redundant `src/middleware/admin.ts` — adjust Task 7's import accordingly (`import { requireAdmin } from '../../middleware/auth.js';` instead of `'../../middleware/admin.js'`). If they don't exist yet, proceed with Task 2 as written below.
- **Note on unrelated leftover scripts:** `scripts/seed-puja-images.ts` and `scripts/smoke-test-puja-booking.ts` already exist in this repo's `scripts/` folder, but they are leftovers from the abandoned Supabase-based `apps/api`/`apps/web` reference implementation (they import `@supabase/supabase-js`, read `apps/web/.env.local`, and reference tables like `puja_offerings`/`booking_members`/`pandit_profiles` that do not exist in this Postgres/Drizzle backend). Do NOT modify, run, or treat these as related to this plan's work — they are dead code from a different, unbuilt system.

**Explicitly deferred to a later batch (not part of this plan):**

- Pandit self-onboarding (this batch is admin-vetted roster only — no login, no self-service portal, no approval workflow beyond "an admin added the row").
- Multi-member sankalp bookings (one profile per booking only).
- An offerings/add-ons catalog.
- Video-proof-of-ritual upload requirement.
- An automated pandit-decline/reassignment flow (there is no "pandit declines" state in this batch — an admin either successfully assigns a pandit or the booking stays `requested` until manually handled).
- Pandit payouts (ops handles this manually outside the app — a known, documented gap, matching this repo's existing pattern of manual-process gaps in other batch plans).
- Real-time delivery of any kind (this is an async/scheduled physical-world service, unlike the separate astrologer-consultation batch).
- A separate ops-initiated refund route (only the customer-initiated cancel route in this batch calls `refundPoojaBooking()`; the primitive itself is written to be reusable from a future admin route, but no such route is wired up here).

---

## File structure

| File                                                        | Action                                                    | Responsibility                                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/db/schema.ts`                                          | Modify                                                    | Add `poojaCatalog`, `pandits`, `poojaBookingStatusEnum`, `poojaBookings` tables                                                     |
| `src/db/migrations/<next>_<generated>.sql`                  | Create (generated)                                        | DDL for the 3 new tables + 1 enum                                                                                                   |
| `src/config/env.ts`                                         | Modify (skip if already present — see "Before you start") | Add `ADMIN_FIREBASE_UIDS` allowlist env var                                                                                         |
| `src/middleware/admin.ts`                                   | Create (skip if already present)                          | `requireAdmin` middleware                                                                                                           |
| `test/admin-middleware.spec.ts`                             | Create (skip if already present)                          | Tests for `requireAdmin`                                                                                                            |
| `src/modules/pooja-bookings/pandits.repo.ts`                | Create                                                    | `createPandit`, `findPanditById`                                                                                                    |
| `test/pandits-repo.spec.ts`                                 | Create                                                    | Tests for the pandits repo                                                                                                          |
| `src/modules/pooja-bookings/pooja-bookings.repo.ts`         | Create                                                    | Catalog reads, atomic `createPoojaBooking`, atomic `refundPoojaBooking`, `assignPanditToBooking`, `completePoojaBooking`, list/find |
| `test/pooja-bookings-repo.spec.ts`                          | Create                                                    | Tests for the pooja-bookings repo, including the race-safety of the refund transaction                                              |
| `src/modules/pooja-bookings/pooja-bookings.service.ts`      | Create                                                    | Business logic + fire-and-forget push notifications                                                                                 |
| `test/pooja-bookings-service.spec.ts`                       | Create                                                    | Tests for the service layer                                                                                                         |
| `src/modules/pooja-bookings/pooja-bookings.schemas.ts`      | Create                                                    | Zod/OpenAPI request/response schemas                                                                                                |
| `src/modules/pooja-bookings/pooja-bookings.routes.ts`       | Create                                                    | Customer-facing routes                                                                                                              |
| `test/pooja-bookings-routes.spec.ts`                        | Create                                                    | Tests for the customer-facing routes                                                                                                |
| `src/modules/pooja-bookings/pooja-bookings.admin.routes.ts` | Create                                                    | Admin-only routes                                                                                                                   |
| `test/pooja-bookings-admin-routes.spec.ts`                  | Create                                                    | Tests for the admin routes                                                                                                          |
| `src/app.ts`                                                | Modify                                                    | Mount `poojaBookingsRouter` and `poojaBookingsAdminRouter`                                                                          |
| `scripts/seed-pooja-catalog.ts`                             | Create                                                    | Idempotent seed script using the real 9 curated pooja names                                                                         |

---

### Task 1: Database schema & migration — `pooja_catalog`, `pandits`, `pooja_bookings`

**Why:** Every later task depends on these three tables existing. This task is DDL-only — migrations are generated by `pnpm db:generate`, never hand-written, and verified by inspecting the generated file's contents.

**Files:**

- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/<next>_<generated-name>.sql` (generated, not hand-written — see Step 2)

- [ ] **Step 1: Add the three tables to `src/db/schema.ts`**

Add at the very end of the file:

```ts
/* -------------------------------------------------------------------------- */
/* pooja_catalog — the fixed list of poojas bookable via the concierge pilot. */
/* Deliberately reuses the SAME curated names/descriptions already used by    */
/* the free/AI pooja-guidance report (astro-engine/poojaRecommendations.ts)   */
/* rather than inventing a new catalog — see scripts/seed-pooja-catalog.ts.   */
/* -------------------------------------------------------------------------- */

export const poojaCatalog = pgTable(
  'pooja_catalog',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    description: text('description').notNull(),
    deity: text('deity'),
    basePricePaise: integer('base_price_paise').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    nameUnique: uniqueIndex('pooja_catalog_name_unique').on(sql`lower(${table.name})`),
  }),
);

export type PoojaCatalogRow = typeof poojaCatalog.$inferSelect;
export type NewPoojaCatalogRow = typeof poojaCatalog.$inferInsert;

/* -------------------------------------------------------------------------- */
/* pandits — the concierge pilot's admin-vetted pandit roster. Deliberately   */
/* separate from any `astrologers` table (a parallel, independent effort is   */
/* planning astrologer consultations separately) — pandits are a distinct    */
/* role, not unified with astrologers. `verified` defaults to true because,   */
/* in THIS batch, every pandit is added by an admin after off-platform        */
/* vetting — there is no self-onboarding route, so "verified" simply means    */
/* "an admin added this row", unlike the abandoned reference app's            */
/* self-signup-with-hardcoded-verified-true model, which had no real vetting  */
/* behind that flag at all. `phone` is nullable and is an ops contact number  */
/* only — NOT a login credential; there is no pandit-facing portal in this    */
/* batch.                                                                     */
/* -------------------------------------------------------------------------- */

export const pandits = pgTable('pandits', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  displayName: text('display_name').notNull(),
  phone: text('phone'),
  city: text('city').notNull(),
  languages: text('languages')
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  verified: boolean('verified').notNull().default(true),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type PanditRow = typeof pandits.$inferSelect;
export type NewPanditRow = typeof pandits.$inferInsert;

/* -------------------------------------------------------------------------- */
/* pooja_bookings — one row per booked pooja. Wallet is debited at            */
/* `requested` time (see pooja-bookings.repo.ts#createPoojaBooking); a        */
/* booking starts with `panditId: null` and no automated fulfillment          */
/* tracking beyond admin actions (assign, complete). No "pandit declines"     */
/* state in this batch.                                                      */
/* -------------------------------------------------------------------------- */

export const poojaBookingStatusEnum = pgEnum('pooja_booking_status', [
  'requested',
  'assigned',
  'completed',
  'cancelled',
  'refunded',
]);

export const poojaBookings = pgTable(
  'pooja_bookings',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** NULL = the primary/self profile; non-null = an additional profile in birth_profiles — same nullable-FK convention as prime_reports.birthProfileId. */
    birthProfileId: uuid('birth_profile_id').references(() => birthProfiles.id, {
      onDelete: 'cascade',
    }),
    poojaId: uuid('pooja_id')
      .notNull()
      .references(() => poojaCatalog.id),
    /** Nullable — a booking starts unassigned; an admin assigns a pandit afterward. */
    panditId: uuid('pandit_id').references(() => pandits.id, { onDelete: 'set null' }),
    /** Day-scheduled, not minute-scheduled — a `date` column, not `timestamp`. */
    preferredDate: date('preferred_date').notNull(),
    shipAddress: text('ship_address').notNull(),
    shipPincode: text('ship_pincode').notNull(),
    status: poojaBookingStatusEnum('status').notNull().default('requested'),
    /** Snapshot of pooja_catalog.base_price_paise at booking time — the catalog price may change later without altering what was actually charged. */
    pricePaisePaid: integer('price_paise_paid').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdx: index('pooja_bookings_user_id_idx').on(table.userId, table.createdAt),
    panditIdx: index('pooja_bookings_pandit_id_idx').on(table.panditId),
    statusIdx: index('pooja_bookings_status_idx').on(table.status),
  }),
);

export type PoojaBookingRow = typeof poojaBookings.$inferSelect;
export type NewPoojaBookingRow = typeof poojaBookings.$inferInsert;
```

(Every import this needs — `pgTable`, `uuid`, `text`, `timestamp`, `date`, `boolean`, `integer`, `index`, `uniqueIndex`, `pgEnum`, `sql` — is already imported at the top of `schema.ts`; add nothing new to the import line.)

- [ ] **Step 2: Generate and verify the migration**

Run: `pnpm db:generate`

Expected: a new migration file, a corresponding `meta/<n>_snapshot.json`, and an updated `meta/_journal.json` entry.

Open the generated `.sql` file and confirm it contains ONLY:

- `CREATE TYPE "public"."pooja_booking_status" AS ENUM('requested', 'assigned', 'completed', 'cancelled', 'refunded');`
- `CREATE TABLE "pooja_catalog" (...)` with the 7 columns above
- `CREATE TABLE "pandits" (...)` with the 8 columns above
- `CREATE TABLE "pooja_bookings" (...)` with the 13 columns above
- FK constraints: `pooja_bookings_user_id_users_id_fk`, `pooja_bookings_birth_profile_id_birth_profiles_id_fk`, `pooja_bookings_pooja_id_pooja_catalog_id_fk`, `pooja_bookings_pandit_id_pandits_id_fk`
- Indexes: `pooja_catalog_name_unique`, `pooja_bookings_user_id_idx`, `pooja_bookings_pandit_id_idx`, `pooja_bookings_status_idx`

If it contains ANY other `CREATE TABLE`/`ALTER TABLE`/`CREATE TYPE` statement for a table other than these three, STOP and report BLOCKED — do not hand-trim it; this would indicate a snapshot-drift bug, not something to patch around.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors (same pre-existing baseline).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrations/
git commit -m "feat(pooja-bookings): add pooja_catalog, pandits, pooja_bookings tables"
```

---

### Task 2: Admin auth — `ADMIN_FIREBASE_UIDS` env var + `requireAdmin` middleware

**SKIP THIS TASK ENTIRELY if `requireAdmin`/`ADMIN_FIREBASE_UIDS` already exist** (check per "Before you start" above — the Admin Console Foundation plan introduces the same thing in `src/middleware/auth.ts`). If skipping, adjust Task 7's import to `import { requireAdmin } from '../../middleware/auth.js';`.

**Why (if not already present):** The three admin-only routes in Task 7 need a gate. Mirrors the exact env-var-allowlist pattern already proven in `src/modules/telegram-bot/telegram-bot.service.ts#resolveTier` (`TELEGRAM_ADMIN_CHAT_IDS`), just keyed by Firebase UID instead of Telegram chat ID.

**Files:**

- Modify: `src/config/env.ts`
- Create: `src/middleware/admin.ts`
- Create: `test/admin-middleware.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/admin-middleware.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { UserRow } from '../src/db/schema.js';

const fakeEnv: { ADMIN_FIREBASE_UIDS: string[] } = { ADMIN_FIREBASE_UIDS: [] };
vi.mock('../src/config/env.js', () => ({
  env: fakeEnv,
  isProduction: false,
  isTest: true,
}));

const { requireAdmin } = await import('../src/middleware/admin.js');
const { errorHandler } = await import('../src/middleware/error.js');

function makeApp(user: Pick<UserRow, 'firebaseUid'>) {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('user' as never, user as never);
    await next();
  });
  app.get('/admin-only', requireAdmin, (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => {
  fakeEnv.ADMIN_FIREBASE_UIDS = [];
});

describe('requireAdmin', () => {
  it('403s when ADMIN_FIREBASE_UIDS is empty (fails closed)', async () => {
    const app = makeApp({ firebaseUid: 'uid-1' });

    const res = await app.request('/admin-only');

    expect(res.status).toBe(403);
  });

  it("403s when the signed-in user's firebaseUid is not in the allowlist", async () => {
    fakeEnv.ADMIN_FIREBASE_UIDS = ['uid-admin'];
    const app = makeApp({ firebaseUid: 'uid-1' });

    const res = await app.request('/admin-only');

    expect(res.status).toBe(403);
  });

  it("200s when the signed-in user's firebaseUid IS in the allowlist", async () => {
    fakeEnv.ADMIN_FIREBASE_UIDS = ['uid-admin', 'uid-1'];
    const app = makeApp({ firebaseUid: 'uid-1' });

    const res = await app.request('/admin-only');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/admin-middleware.spec.ts`
Expected: FAIL — `src/middleware/admin.js` does not exist yet.

- [ ] **Step 3: Add the env var and implement the middleware**

In `src/config/env.ts`, inside the `EnvSchema` object, immediately after the `HOROSCOPE_ACTIVE_WINDOW_DAYS` field (the last field before the schema's closing `})`), add:

```ts
    // Firebase UIDs allowed to call the pooja-booking concierge pilot's
    // /v1/admin/* routes (src/middleware/admin.ts#requireAdmin) — same
    // comma-separated-allowlist shape as TELEGRAM_ADMIN_CHAT_IDS, just keyed
    // by Firebase UID instead of Telegram chat id. Empty by default so admin
    // routes fail closed until explicitly configured.
    ADMIN_FIREBASE_UIDS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
```

Create `src/middleware/admin.ts`:

```ts
import type { MiddlewareHandler } from 'hono';
import { env } from '../config/env.js';
import { Errors } from '../lib/errors.js';

/**
 * Admin allowlist gate for the pooja-booking concierge pilot's ops routes
 * (POST /v1/admin/pandits, POST /v1/admin/pooja-bookings/:id/assign|complete).
 * Mirrors the env-var-allowlist pattern already proven in
 * src/modules/telegram-bot/telegram-bot.service.ts#resolveTier
 * (comma-separated env var -> Set, membership check) rather than inventing a
 * DB-backed roles table for what is, in this batch, a handful of trusted ops
 * staff.
 *
 * MUST run after `requireUser` (reads `c.var.user`, set there) — checks the
 * signed-in user's Firebase UID against ADMIN_FIREBASE_UIDS. FAILS CLOSED:
 * an unset/empty allowlist rejects every request (never open by default),
 * same failure posture as requireCronSecret.
 */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  const admins = new Set(env.ADMIN_FIREBASE_UIDS);
  if (admins.size === 0 || !admins.has(user.firebaseUid)) {
    throw Errors.forbidden('Admin access required');
  }
  await next();
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/admin-middleware.spec.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: baseline + 3 new passing (same pre-existing failures), no new typecheck errors.

- [ ] **Step 6: Commit**

```bash
git add src/config/env.ts src/middleware/admin.ts test/admin-middleware.spec.ts
git commit -m "feat(pooja-bookings): add ADMIN_FIREBASE_UIDS allowlist + requireAdmin middleware"
```

---

### Task 3: Pandits repo

**Why:** The smallest, most independent piece — admin-only creation and lookup, no self-onboarding.

**Files:**

- Create: `src/modules/pooja-bookings/pandits.repo.ts`
- Create: `test/pandits-repo.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/pandits-repo.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: { insert: state.insert, select: state.select },
    sqlClient,
  };
});

import { createPandit, findPanditById } from '../src/modules/pooja-bookings/pandits.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.insert.mockReset();
  state.select.mockReset();
});

describe('createPandit', () => {
  it('inserts the given values and returns the created row', async () => {
    const insertChain: { values: unknown; returning: () => Promise<unknown[]> } = {
      values: undefined,
      returning: vi.fn(() =>
        Promise.resolve([
          {
            id: 'pandit-1',
            displayName: 'Ravi Shastri',
            phone: '+919999999999',
            city: 'Pune',
            languages: ['hi', 'mr'],
            verified: true,
            active: true,
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-01'),
          },
        ]),
      ),
    };
    insertChain.values = vi.fn(() => insertChain);
    state.insert.mockReturnValue(insertChain);

    const row = await createPandit({
      displayName: 'Ravi Shastri',
      phone: '+919999999999',
      city: 'Pune',
      languages: ['hi', 'mr'],
      verified: true,
      active: true,
    });

    expect(insertChain.values).toHaveBeenCalledWith({
      displayName: 'Ravi Shastri',
      phone: '+919999999999',
      city: 'Pune',
      languages: ['hi', 'mr'],
      verified: true,
      active: true,
    });
    expect(row).toMatchObject({ id: 'pandit-1', displayName: 'Ravi Shastri' });
  });

  it('throws when the insert returns no row', async () => {
    const insertChain: { values: unknown; returning: () => Promise<unknown[]> } = {
      values: undefined,
      returning: vi.fn(() => Promise.resolve([])),
    };
    insertChain.values = vi.fn(() => insertChain);
    state.insert.mockReturnValue(insertChain);

    await expect(
      createPandit({
        displayName: 'Ravi Shastri',
        phone: null,
        city: 'Pune',
        languages: [],
        verified: true,
        active: true,
      }),
    ).rejects.toThrow('Failed to insert pandit');
  });
});

describe('findPanditById', () => {
  it('filters on id', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findPanditById('pandit-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"pandits"."id" = $1');
    expect(query.params).toEqual(['pandit-1']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/pandits-repo.spec.ts`
Expected: FAIL — `src/modules/pooja-bookings/pandits.repo.js` does not exist yet.

- [ ] **Step 3: Implement `src/modules/pooja-bookings/pandits.repo.ts`**

```ts
// =============================================================================
// Pandits repo — the concierge pilot's admin-vetted pandit roster. Every
// pandit is added by an admin (see pooja-bookings.admin.routes.ts) after
// off-platform vetting — there is NO self-onboarding route in this batch, so
// `verified` simply defaults to true: an admin having added the row IS the
// verification step, unlike the abandoned reference app's
// self-signup-with-hardcoded-verified-true model, which had no real vetting
// behind that flag at all.
// =============================================================================

import { eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { pandits, type PanditRow, type NewPanditRow } from '../../db/schema.js';

export async function createPandit(values: NewPanditRow): Promise<PanditRow> {
  const [row] = await db.insert(pandits).values(values).returning();
  if (!row) throw new Error('Failed to insert pandit');
  return row;
}

export async function findPanditById(id: string): Promise<PanditRow | undefined> {
  const rows = await db.select().from(pandits).where(eq(pandits.id, id)).limit(1);
  return rows[0];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/pandits-repo.spec.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's 3 new tests), no new typecheck errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pooja-bookings/pandits.repo.ts test/pandits-repo.spec.ts
git commit -m "feat(pooja-bookings): add pandits repo (admin-only creation, no self-onboarding)"
```

---

### Task 4: Pooja-bookings repo — catalog, atomic create/debit, atomic refund, assign, complete

**Why:** The core of this batch. `createPoojaBooking` reuses `unlockPrimeReport`'s proven atomic transaction shape. `refundPoojaBooking` is the genuinely new primitive — its status-flip UPDATE's `WHERE status IN ('requested','assigned')` clause is itself the concurrency guard, so two racing refund attempts on the same booking can never both succeed and double-credit the wallet.

**Files:**

- Create: `src/modules/pooja-bookings/pooja-bookings.repo.ts`
- Create: `test/pooja-bookings-repo.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/pooja-bookings-repo.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: {
      insert: state.insert,
      select: state.select,
      update: state.update,
      transaction: state.transaction,
    },
    sqlClient,
  };
});

import {
  listActivePoojas,
  findPoojaCatalogItem,
  createPoojaBooking,
  refundPoojaBooking,
  assignPanditToBooking,
  completePoojaBooking,
  findOwnedPoojaBooking,
  listPoojaBookingsForUser,
} from '../src/modules/pooja-bookings/pooja-bookings.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    limit: vi.fn(() => Promise.resolve(result)),
    orderBy: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (v: unknown[]) => void) => resolve(result),
  };
  return { chain, calls };
}

function makeUpdateChain(result: unknown[]) {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain = {
    set: vi.fn((patch: unknown) => {
      calls.set = patch;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.insert.mockReset();
  state.select.mockReset();
  state.update.mockReset();
  state.transaction.mockReset();
});

describe('listActivePoojas', () => {
  it('filters on is_active = true', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listActivePoojas();

    const query = compile(calls.where);
    expect(query.sql).toBe('"pooja_catalog"."is_active" = $1');
    expect(query.params).toEqual([true]);
  });
});

describe('findPoojaCatalogItem', () => {
  it('filters on id', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findPoojaCatalogItem('pooja-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"pooja_catalog"."id" = $1');
    expect(query.params).toEqual(['pooja-1']);
  });
});

describe('createPoojaBooking — atomic debit + row creation', () => {
  function makeTx(opts: { walletUpdateResult: unknown[]; insertResult: unknown[] }) {
    const walletUpdateChain: { set: unknown; where: unknown; returning: () => Promise<unknown[]> } =
      {
        set: undefined,
        where: undefined,
        returning: vi.fn(() => Promise.resolve(opts.walletUpdateResult)),
      };
    walletUpdateChain.set = vi.fn(() => walletUpdateChain);
    walletUpdateChain.where = vi.fn(() => walletUpdateChain);

    const insertLedgerChain = { values: vi.fn(() => Promise.resolve(undefined)) };
    const insertBookingChain: { values: unknown; returning: () => Promise<unknown[]> } = {
      values: undefined,
      returning: vi.fn(() => Promise.resolve(opts.insertResult)),
    };
    insertBookingChain.values = vi.fn(() => insertBookingChain);

    let insertCallCount = 0;
    const tx = {
      update: vi.fn(() => walletUpdateChain),
      insert: vi.fn((_table: unknown) => {
        insertCallCount++;
        // First insert() call is the wallet ledger row, second is the
        // pooja_bookings row — matches createPoojaBooking's call order.
        return insertCallCount === 1 ? insertLedgerChain : insertBookingChain;
      }),
    };
    return { tx, insertBookingChain };
  }

  const INPUT = {
    userId: 'user-1',
    birthProfileId: null,
    poojaId: 'pooja-1',
    preferredDate: '2026-08-01',
    shipAddress: '123 MG Road',
    shipPincode: '560001',
    notes: null,
    pricePaise: 110000,
  };

  it('returns undefined without inserting a booking when the wallet balance is insufficient', async () => {
    const { tx } = makeTx({ walletUpdateResult: [], insertResult: [] });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await createPoojaBooking(INPUT);

    expect(result).toBeUndefined();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('debits the wallet, writes a ledger row, and returns the newly created requested booking', async () => {
    const { tx, insertBookingChain } = makeTx({
      walletUpdateResult: [{ walletBalancePaise: 390000 }],
      insertResult: [{ id: 'booking-1', status: 'requested', pricePaisePaid: 110000 }],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await createPoojaBooking(INPUT);

    expect(insertBookingChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        poojaId: 'pooja-1',
        panditId: null,
        status: 'requested',
        pricePaisePaid: 110000,
      }),
    );
    expect(result).toMatchObject({ id: 'booking-1', status: 'requested' });
  });
});

describe('refundPoojaBooking — atomic refund + status flip', () => {
  function makeTx(opts: { bookingUpdateResult: unknown[]; userUpdateResult: unknown[] }) {
    const bookingWhereCalls: unknown[] = [];
    const bookingUpdateChain: {
      set: unknown;
      where: unknown;
      returning: () => Promise<unknown[]>;
    } = {
      set: undefined,
      where: undefined,
      returning: vi.fn(() => Promise.resolve(opts.bookingUpdateResult)),
    };
    bookingUpdateChain.set = vi.fn(() => bookingUpdateChain);
    bookingUpdateChain.where = vi.fn((cond: unknown) => {
      bookingWhereCalls.push(cond);
      return bookingUpdateChain;
    });

    const userUpdateChain: { set: unknown; where: unknown; returning: () => Promise<unknown[]> } = {
      set: undefined,
      where: undefined,
      returning: vi.fn(() => Promise.resolve(opts.userUpdateResult)),
    };
    userUpdateChain.set = vi.fn(() => userUpdateChain);
    userUpdateChain.where = vi.fn(() => userUpdateChain);

    const insertLedgerChain = { values: vi.fn(() => Promise.resolve(undefined)) };

    let updateCallCount = 0;
    const tx = {
      update: vi.fn((_table: unknown) => {
        updateCallCount++;
        // First update() call is pooja_bookings (the status-flip claim),
        // second is users (the wallet credit) — matches refundPoojaBooking's
        // call order.
        return updateCallCount === 1 ? bookingUpdateChain : userUpdateChain;
      }),
      insert: vi.fn(() => insertLedgerChain),
    };
    return { tx, userUpdateChain, insertLedgerChain, bookingWhereCalls };
  }

  it('returns undefined without touching the wallet when the booking is not in a refundable status', async () => {
    const { tx, userUpdateChain, insertLedgerChain } = makeTx({
      bookingUpdateResult: [],
      userUpdateResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await refundPoojaBooking('booking-1', 'user-1');

    expect(result).toBeUndefined();
    expect(userUpdateChain.set).not.toHaveBeenCalled();
    expect(insertLedgerChain.values).not.toHaveBeenCalled();
  });

  it("scopes the status-flip UPDATE's WHERE to this booking id, this owner, and status IN ('requested','assigned') — the race-safety guard", async () => {
    const { tx, bookingWhereCalls } = makeTx({ bookingUpdateResult: [], userUpdateResult: [] });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    await refundPoojaBooking('booking-1', 'user-1');

    const query = compile(bookingWhereCalls[0]);
    expect(query.sql).toBe(
      '("pooja_bookings"."id" = $1 and "pooja_bookings"."user_id" = $2 and "pooja_bookings"."status" in ($3, $4))',
    );
    expect(query.params).toEqual(['booking-1', 'user-1', 'requested', 'assigned']);
  });

  it('credits the wallet, writes a ledger row, and returns the refunded booking on success', async () => {
    const { tx } = makeTx({
      bookingUpdateResult: [
        { id: 'booking-1', userId: 'user-1', pricePaisePaid: 110000, status: 'refunded' },
      ],
      userUpdateResult: [{ walletBalancePaise: 500000 }],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await refundPoojaBooking('booking-1', 'user-1');

    expect(result).toMatchObject({ id: 'booking-1', status: 'refunded' });
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });

  it('throws instead of silently no-op-ing if the booking is refundable but its owning user row has vanished', async () => {
    const { tx } = makeTx({
      bookingUpdateResult: [
        { id: 'booking-1', userId: 'user-1', pricePaisePaid: 110000, status: 'refunded' },
      ],
      userUpdateResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    await expect(refundPoojaBooking('booking-1', 'user-1')).rejects.toThrow(
      'refundPoojaBooking: user user-1 not found while crediting refund for booking booking-1',
    );
  });
});

describe('assignPanditToBooking', () => {
  it("scopes the UPDATE's WHERE to this booking id and status = 'requested' (the claim guard)", async () => {
    const { chain, calls } = makeUpdateChain([]);
    state.update.mockReturnValue(chain);

    await assignPanditToBooking('booking-1', 'pandit-1');

    expect(calls.set).toMatchObject({ panditId: 'pandit-1', status: 'assigned' });
    const query = compile(calls.where);
    expect(query.sql).toBe('("pooja_bookings"."id" = $1 and "pooja_bookings"."status" = $2)');
    expect(query.params).toEqual(['booking-1', 'requested']);
  });

  it('returns the updated row on success', async () => {
    const { chain } = makeUpdateChain([
      { id: 'booking-1', status: 'assigned', panditId: 'pandit-1' },
    ]);
    state.update.mockReturnValue(chain);

    const result = await assignPanditToBooking('booking-1', 'pandit-1');

    expect(result).toMatchObject({ id: 'booking-1', status: 'assigned' });
  });
});

describe('completePoojaBooking', () => {
  it("scopes the UPDATE's WHERE to this booking id and status = 'assigned' (the claim guard)", async () => {
    const { chain, calls } = makeUpdateChain([]);
    state.update.mockReturnValue(chain);

    await completePoojaBooking('booking-1');

    expect(calls.set).toMatchObject({ status: 'completed' });
    const query = compile(calls.where);
    expect(query.sql).toBe('("pooja_bookings"."id" = $1 and "pooja_bookings"."status" = $2)');
    expect(query.params).toEqual(['booking-1', 'assigned']);
  });
});

describe('findOwnedPoojaBooking', () => {
  it('filters on id and user_id', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findOwnedPoojaBooking('booking-1', 'user-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('("pooja_bookings"."id" = $1 and "pooja_bookings"."user_id" = $2)');
    expect(query.params).toEqual(['booking-1', 'user-1']);
  });
});

describe('listPoojaBookingsForUser', () => {
  it('filters on user_id and orders newest-first', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listPoojaBookingsForUser('user-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"pooja_bookings"."user_id" = $1');
    expect(query.params).toEqual(['user-1']);
    expect(chain.orderBy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/pooja-bookings-repo.spec.ts`
Expected: FAIL — `src/modules/pooja-bookings/pooja-bookings.repo.js` does not exist yet.

- [ ] **Step 3: Implement `src/modules/pooja-bookings/pooja-bookings.repo.ts`**

```ts
// =============================================================================
// Pooja-bookings repo — the concierge pilot's booking primitives. Wallet
// debit-at-request and refund-on-cancel both follow the exact atomic
// transaction shape already proven in prime-reports.repo.ts#unlockPrimeReport
// (conditional balance-guarded UPDATE + walletTransactions ledger insert +
// row write, all in one db.transaction). assignPanditToBooking /
// completePoojaBooking use the same "conditional UPDATE as a claim" idea as
// prime-reports.repo.ts#claimPrimeReportGeneration: the WHERE clause itself
// is the concurrency guard, so two racing admin actions on the same booking
// can never both succeed.
// =============================================================================

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  poojaCatalog,
  poojaBookings,
  users,
  walletTransactions,
  type PoojaCatalogRow,
  type PoojaBookingRow,
} from '../../db/schema.js';

export async function listActivePoojas(): Promise<PoojaCatalogRow[]> {
  return db.select().from(poojaCatalog).where(eq(poojaCatalog.isActive, true));
}

export async function findPoojaCatalogItem(poojaId: string): Promise<PoojaCatalogRow | undefined> {
  const rows = await db.select().from(poojaCatalog).where(eq(poojaCatalog.id, poojaId)).limit(1);
  return rows[0];
}

export interface CreatePoojaBookingInput {
  userId: string;
  birthProfileId: string | null;
  poojaId: string;
  preferredDate: string;
  shipAddress: string;
  shipPincode: string;
  notes: string | null;
  pricePaise: number;
}

/**
 * Atomically debits `pricePaise` from the wallet AND creates the booking row
 * (status 'requested') in one transaction — same balance-guarded-UPDATE +
 * ledger-insert + row-insert shape as unlockPrimeReport
 * (prime-reports.repo.ts), minus the pre-existence check (a user CAN book
 * the same pooja more than once — there is no uniqueness constraint on
 * pooja_bookings, unlike prime_reports). Returns undefined when the wallet
 * balance is insufficient; the whole transaction (charge + ledger row +
 * booking insert) rolls back before this resolves, so an insufficient-balance
 * attempt never partially charges.
 */
export async function createPoojaBooking(
  input: CreatePoojaBookingInput,
): Promise<PoojaBookingRow | undefined> {
  return db.transaction(async (tx) => {
    const [charged] = await tx
      .update(users)
      .set({ walletBalancePaise: sql`${users.walletBalancePaise} - ${input.pricePaise}` })
      .where(and(eq(users.id, input.userId), gte(users.walletBalancePaise, input.pricePaise)))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!charged) return undefined;

    await tx.insert(walletTransactions).values({
      userId: input.userId,
      delta: -input.pricePaise,
      reason: `pooja_booking:${input.poojaId}`,
      balanceAfter: charged.walletBalancePaise,
    });

    const [row] = await tx
      .insert(poojaBookings)
      .values({
        userId: input.userId,
        birthProfileId: input.birthProfileId,
        poojaId: input.poojaId,
        panditId: null,
        preferredDate: input.preferredDate,
        shipAddress: input.shipAddress,
        shipPincode: input.shipPincode,
        status: 'requested',
        pricePaisePaid: input.pricePaise,
        requestedAt: new Date(),
        notes: input.notes,
      })
      .returning();
    return row;
  });
}

/**
 * Atomically refunds a booking that is still `requested` or `assigned`:
 * flips it to `refunded`, credits `pricePaisePaid` back to the wallet, and
 * writes a POSITIVE-delta walletTransactions ledger row (a credit negates
 * the original booking charge's negative delta — same sign convention as
 * users.repo.ts#addWalletBalance). The booking's status UPDATE is issued
 * FIRST and doubles as the concurrency guard: its WHERE clause only matches
 * rows currently in ('requested', 'assigned'), so if two refund attempts
 * race (e.g. a double-tap on cancel), Postgres serializes them on the row
 * lock — the first commits the status flip, the second's WHERE no longer
 * matches (status is already 'refunded') and it returns zero rows, so the
 * wallet can never be credited twice for the same booking.
 *
 * `userId` scopes the refund to a specific owner (the customer-initiated
 * cancel route). Returns undefined if the booking doesn't exist, isn't owned
 * by `userId`, or is no longer in a refundable status.
 */
export async function refundPoojaBooking(
  bookingId: string,
  userId: string,
): Promise<PoojaBookingRow | undefined> {
  return db.transaction(async (tx) => {
    const [refunded] = await tx
      .update(poojaBookings)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(
        and(
          eq(poojaBookings.id, bookingId),
          eq(poojaBookings.userId, userId),
          inArray(poojaBookings.status, ['requested', 'assigned']),
        ),
      )
      .returning();
    if (!refunded) return undefined;

    const [credited] = await tx
      .update(users)
      .set({
        walletBalancePaise: sql`${users.walletBalancePaise} + ${refunded.pricePaisePaid}`,
      })
      .where(eq(users.id, refunded.userId))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!credited) {
      throw new Error(
        `refundPoojaBooking: user ${refunded.userId} not found while crediting refund for booking ${bookingId}`,
      );
    }

    await tx.insert(walletTransactions).values({
      userId: refunded.userId,
      delta: refunded.pricePaisePaid,
      reason: `pooja_booking_refund:${bookingId}`,
      balanceAfter: credited.walletBalancePaise,
    });

    return refunded;
  });
}

/**
 * Admin action: assigns a pandit to a booking still in `requested` status.
 * The WHERE clause's `status = 'requested'` check is itself the concurrency
 * guard (same "conditional UPDATE as a claim" idea as
 * prime-reports.repo.ts#claimPrimeReportGeneration) — returns undefined if
 * the booking has already been assigned, or was cancelled/refunded out from
 * under the admin since the previous state read.
 */
export async function assignPanditToBooking(
  bookingId: string,
  panditId: string,
): Promise<PoojaBookingRow | undefined> {
  const now = new Date();
  const [row] = await db
    .update(poojaBookings)
    .set({ panditId, status: 'assigned', assignedAt: now, updatedAt: now })
    .where(and(eq(poojaBookings.id, bookingId), eq(poojaBookings.status, 'requested')))
    .returning();
  return row;
}

/**
 * Admin action: manual completion acknowledgment — no automated fulfillment
 * tracking or video-proof requirement in this batch (a trust-the-admin/
 * ops-process step). Same conditional-UPDATE-as-claim guard, requiring
 * `status = 'assigned'`.
 */
export async function completePoojaBooking(
  bookingId: string,
): Promise<PoojaBookingRow | undefined> {
  const now = new Date();
  const [row] = await db
    .update(poojaBookings)
    .set({ status: 'completed', completedAt: now, updatedAt: now })
    .where(and(eq(poojaBookings.id, bookingId), eq(poojaBookings.status, 'assigned')))
    .returning();
  return row;
}

export async function findOwnedPoojaBooking(
  bookingId: string,
  userId: string,
): Promise<PoojaBookingRow | undefined> {
  const rows = await db
    .select()
    .from(poojaBookings)
    .where(and(eq(poojaBookings.id, bookingId), eq(poojaBookings.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function listPoojaBookingsForUser(userId: string): Promise<PoojaBookingRow[]> {
  return db
    .select()
    .from(poojaBookings)
    .where(eq(poojaBookings.userId, userId))
    .orderBy(desc(poojaBookings.createdAt));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/pooja-bookings-repo.spec.ts`
Expected: PASS (all cases, including the race-safety WHERE-clause assertion).

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pooja-bookings/pooja-bookings.repo.ts test/pooja-bookings-repo.spec.ts
git commit -m "feat(pooja-bookings): add pooja-bookings repo (atomic debit + race-safe refund)"
```

---

### Task 5: Pooja-bookings service layer + push notifications

**Why:** Wires the repo functions into the business logic the routes will call — resolving price from the catalog server-side (never trusting a client-supplied price), and firing a best-effort push notification on `assigned`/`completed`/`refunded`, following the exact fire-and-forget-with-error-logging convention already used in `prime-reports.service.ts`.

**Files:**

- Create: `src/modules/pooja-bookings/pooja-bookings.service.ts`
- Create: `test/pooja-bookings-service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/pooja-bookings-service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfileContext } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  findPoojaCatalogItem: vi.fn(),
  createPoojaBooking: vi.fn(),
  refundPoojaBooking: vi.fn(),
  assignPanditToBooking: vi.fn(),
  completePoojaBooking: vi.fn(),
  listPoojaBookingsForUser: vi.fn(),
  listActivePoojas: vi.fn(),
  findPanditById: vi.fn(),
  findActiveTokensForUser: vi.fn(),
  sendPushBatch: vi.fn(),
}));

vi.mock('../src/modules/pooja-bookings/pooja-bookings.repo.js', () => ({
  findPoojaCatalogItem: state.findPoojaCatalogItem,
  createPoojaBooking: state.createPoojaBooking,
  refundPoojaBooking: state.refundPoojaBooking,
  assignPanditToBooking: state.assignPanditToBooking,
  completePoojaBooking: state.completePoojaBooking,
  listPoojaBookingsForUser: state.listPoojaBookingsForUser,
  listActivePoojas: state.listActivePoojas,
}));

vi.mock('../src/modules/pooja-bookings/pandits.repo.js', () => ({
  findPanditById: state.findPanditById,
}));

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  findActiveTokensForUser: state.findActiveTokensForUser,
}));

vi.mock('../src/lib/notifications/fcm.js', () => ({
  sendPushBatch: state.sendPushBatch,
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  bookPooja,
  cancelBooking,
  listMyBookings,
  adminAssignPandit,
  adminCompleteBooking,
  listCatalog,
} = await import('../src/modules/pooja-bookings/pooja-bookings.service.js');
const { logger } = await import('../src/lib/logger.js');

const BOOK_INPUT = {
  poojaId: 'pooja-1',
  preferredDate: '2026-08-01',
  shipAddress: '123 MG Road',
  shipPincode: '560001',
};

beforeEach(() => {
  vi.clearAllMocks();
  state.findActiveTokensForUser.mockResolvedValue([{ token: 'tok-1' }]);
  state.sendPushBatch.mockResolvedValue({ success: 1, failure: 0 });
});

describe('bookPooja', () => {
  it('returns unknown_pooja without touching the wallet when the pooja does not exist', async () => {
    state.findPoojaCatalogItem.mockResolvedValueOnce(undefined);

    const result = await bookPooja('user-1', makeProfileContext(), BOOK_INPUT);

    expect(result).toEqual({ outcome: 'unknown_pooja' });
    expect(state.createPoojaBooking).not.toHaveBeenCalled();
  });

  it('returns unknown_pooja when the pooja exists but is inactive', async () => {
    state.findPoojaCatalogItem.mockResolvedValueOnce({
      id: 'pooja-1',
      isActive: false,
      basePricePaise: 110000,
    });

    const result = await bookPooja('user-1', makeProfileContext(), BOOK_INPUT);

    expect(result).toEqual({ outcome: 'unknown_pooja' });
  });

  it('charges the catalog price (never a client-supplied one) and returns the booking on success', async () => {
    state.findPoojaCatalogItem.mockResolvedValueOnce({
      id: 'pooja-1',
      isActive: true,
      basePricePaise: 110000,
    });
    state.createPoojaBooking.mockResolvedValueOnce({ id: 'booking-1', status: 'requested' });

    const result = await bookPooja(
      'user-1',
      makeProfileContext({ birthProfileId: 'profile-a' }),
      BOOK_INPUT,
    );

    expect(state.createPoojaBooking).toHaveBeenCalledWith({
      userId: 'user-1',
      birthProfileId: 'profile-a',
      poojaId: 'pooja-1',
      preferredDate: '2026-08-01',
      shipAddress: '123 MG Road',
      shipPincode: '560001',
      notes: null,
      pricePaise: 110000,
    });
    expect(result).toEqual({
      outcome: 'booked',
      booking: { id: 'booking-1', status: 'requested' },
    });
  });

  it('returns insufficient_balance when createPoojaBooking returns undefined', async () => {
    state.findPoojaCatalogItem.mockResolvedValueOnce({
      id: 'pooja-1',
      isActive: true,
      basePricePaise: 110000,
    });
    state.createPoojaBooking.mockResolvedValueOnce(undefined);

    const result = await bookPooja('user-1', makeProfileContext(), BOOK_INPUT);

    expect(result).toEqual({ outcome: 'insufficient_balance' });
  });
});

describe('cancelBooking', () => {
  it('returns undefined and sends no notification when the booking is not refundable', async () => {
    state.refundPoojaBooking.mockResolvedValueOnce(undefined);

    const result = await cancelBooking('booking-1', 'user-1');

    expect(result).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });

  it('fires a refunded push notification on success', async () => {
    state.refundPoojaBooking.mockResolvedValueOnce({
      id: 'booking-1',
      userId: 'user-1',
      status: 'refunded',
    });

    const result = await cancelBooking('booking-1', 'user-1');
    expect(result).toMatchObject({ id: 'booking-1', status: 'refunded' });

    // Notification is fire-and-forget — flush microtasks before asserting.
    await Promise.resolve();
    await Promise.resolve();
    expect(state.findActiveTokensForUser).toHaveBeenCalledWith('user-1');
    expect(state.sendPushBatch).toHaveBeenCalledWith(
      ['tok-1'],
      expect.any(String),
      expect.any(String),
      { type: 'pooja_booking_refunded', bookingId: 'booking-1' },
    );
  });

  it('logs (never throws) when the notification push fails', async () => {
    state.refundPoojaBooking.mockResolvedValueOnce({
      id: 'booking-1',
      userId: 'user-1',
      status: 'refunded',
    });
    state.sendPushBatch.mockRejectedValueOnce(new Error('FCM down'));

    await expect(cancelBooking('booking-1', 'user-1')).resolves.toMatchObject({ id: 'booking-1' });
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'pooja-bookings:push failed',
    );
  });
});

describe('listMyBookings', () => {
  it('delegates to listPoojaBookingsForUser', async () => {
    state.listPoojaBookingsForUser.mockResolvedValueOnce([{ id: 'booking-1' }]);

    const result = await listMyBookings('user-1');

    expect(state.listPoojaBookingsForUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([{ id: 'booking-1' }]);
  });
});

describe('listCatalog', () => {
  it('delegates to listActivePoojas', async () => {
    state.listActivePoojas.mockResolvedValueOnce([{ id: 'pooja-1' }]);

    const result = await listCatalog();

    expect(result).toEqual([{ id: 'pooja-1' }]);
  });
});

describe('adminAssignPandit', () => {
  it('returns unknown_pandit without assigning when the pandit does not exist', async () => {
    state.findPanditById.mockResolvedValueOnce(undefined);

    const result = await adminAssignPandit('booking-1', 'pandit-1');

    expect(result).toBe('unknown_pandit');
    expect(state.assignPanditToBooking).not.toHaveBeenCalled();
  });

  it('returns unknown_pandit when the pandit exists but is inactive', async () => {
    state.findPanditById.mockResolvedValueOnce({ id: 'pandit-1', active: false });

    const result = await adminAssignPandit('booking-1', 'pandit-1');

    expect(result).toBe('unknown_pandit');
  });

  it('assigns and fires an assigned push notification on success', async () => {
    state.findPanditById.mockResolvedValueOnce({
      id: 'pandit-1',
      displayName: 'Ravi Shastri',
      active: true,
    });
    state.assignPanditToBooking.mockResolvedValueOnce({
      id: 'booking-1',
      userId: 'user-1',
      status: 'assigned',
    });

    const result = await adminAssignPandit('booking-1', 'pandit-1');

    expect(result).toMatchObject({ id: 'booking-1', status: 'assigned' });
    await Promise.resolve();
    await Promise.resolve();
    expect(state.sendPushBatch).toHaveBeenCalledWith(
      ['tok-1'],
      expect.any(String),
      expect.stringContaining('Ravi Shastri'),
      { type: 'pooja_booking_assigned', bookingId: 'booking-1' },
    );
  });

  it('returns undefined without notifying when the booking is no longer requested', async () => {
    state.findPanditById.mockResolvedValueOnce({
      id: 'pandit-1',
      displayName: 'Ravi',
      active: true,
    });
    state.assignPanditToBooking.mockResolvedValueOnce(undefined);

    const result = await adminAssignPandit('booking-1', 'pandit-1');

    expect(result).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });
});

describe('adminCompleteBooking', () => {
  it('completes and fires a completed push notification on success', async () => {
    state.completePoojaBooking.mockResolvedValueOnce({
      id: 'booking-1',
      userId: 'user-1',
      status: 'completed',
    });

    const result = await adminCompleteBooking('booking-1');

    expect(result).toMatchObject({ id: 'booking-1', status: 'completed' });
    await Promise.resolve();
    await Promise.resolve();
    expect(state.sendPushBatch).toHaveBeenCalledWith(
      ['tok-1'],
      expect.any(String),
      expect.any(String),
      { type: 'pooja_booking_completed', bookingId: 'booking-1' },
    );
  });

  it('returns undefined without notifying when the booking is not currently assigned', async () => {
    state.completePoojaBooking.mockResolvedValueOnce(undefined);

    const result = await adminCompleteBooking('booking-1');

    expect(result).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/pooja-bookings-service.spec.ts`
Expected: FAIL — `src/modules/pooja-bookings/pooja-bookings.service.js` does not exist yet.

- [ ] **Step 3: Implement `src/modules/pooja-bookings/pooja-bookings.service.ts`**

```ts
// =============================================================================
// Pooja-bookings service — business logic on top of the repo layer: resolves
// the pooja catalog price at booking time (never trusts a client-supplied
// price), wires the customer-cancel route to refundPoojaBooking(), and fires
// a best-effort push notification on every status transition
// (assigned/completed/refunded). Notification sends follow the exact
// fire-and-forget-with-error-logging convention already used in
// prime-reports.service.ts (`void doThing().catch((err) => logger.error(...))`)
// — a failed push never fails the underlying booking action.
// =============================================================================

import { logger } from '../../lib/logger.js';
import { findActiveTokensForUser } from '../device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import {
  createPoojaBooking,
  refundPoojaBooking,
  assignPanditToBooking,
  completePoojaBooking,
  findPoojaCatalogItem,
  listPoojaBookingsForUser,
  listActivePoojas,
} from './pooja-bookings.repo.js';
import { findPanditById } from './pandits.repo.js';
import type { PoojaBookingRow, PoojaCatalogRow } from '../../db/schema.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';

async function notifyBookingStatus(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  const tokens = await findActiveTokensForUser(userId);
  if (tokens.length === 0) return;
  await sendPushBatch(
    tokens.map((t) => t.token),
    title,
    body,
    data,
  );
}

function fireNotify(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>,
): void {
  void notifyBookingStatus(userId, title, body, data).catch((err: unknown) => {
    logger.error({ err, userId }, 'pooja-bookings:push failed');
  });
}

export async function listCatalog(): Promise<PoojaCatalogRow[]> {
  return listActivePoojas();
}

export interface BookPoojaInput {
  poojaId: string;
  preferredDate: string;
  shipAddress: string;
  shipPincode: string;
  notes?: string | null;
}

export type BookPoojaResult =
  | { outcome: 'booked'; booking: PoojaBookingRow }
  | { outcome: 'unknown_pooja' }
  | { outcome: 'insufficient_balance' };

/**
 * Resolves the pooja's current price from the catalog at booking time (never
 * trusts a client-supplied price) and debits the wallet atomically via
 * createPoojaBooking.
 */
export async function bookPooja(
  userId: string,
  profile: ProfileContext,
  input: BookPoojaInput,
): Promise<BookPoojaResult> {
  const pooja = await findPoojaCatalogItem(input.poojaId);
  if (!pooja || !pooja.isActive) return { outcome: 'unknown_pooja' };

  const booking = await createPoojaBooking({
    userId,
    birthProfileId: profile.birthProfileId,
    poojaId: pooja.id,
    preferredDate: input.preferredDate,
    shipAddress: input.shipAddress,
    shipPincode: input.shipPincode,
    notes: input.notes ?? null,
    pricePaise: pooja.basePricePaise,
  });
  if (!booking) return { outcome: 'insufficient_balance' };
  return { outcome: 'booked', booking };
}

export async function cancelBooking(
  bookingId: string,
  userId: string,
): Promise<PoojaBookingRow | undefined> {
  const refunded = await refundPoojaBooking(bookingId, userId);
  if (refunded) {
    fireNotify(
      refunded.userId,
      'Pooja booking cancelled',
      'Your pooja booking was cancelled and the amount has been refunded to your wallet.',
      { type: 'pooja_booking_refunded', bookingId: refunded.id },
    );
  }
  return refunded;
}

export async function listMyBookings(userId: string): Promise<PoojaBookingRow[]> {
  return listPoojaBookingsForUser(userId);
}

export type AssignPanditResult = PoojaBookingRow | 'unknown_pandit' | undefined;

export async function adminAssignPandit(
  bookingId: string,
  panditId: string,
): Promise<AssignPanditResult> {
  const pandit = await findPanditById(panditId);
  if (!pandit || !pandit.active) return 'unknown_pandit';

  const updated = await assignPanditToBooking(bookingId, panditId);
  if (updated) {
    fireNotify(
      updated.userId,
      'Pandit assigned to your pooja',
      `${pandit.displayName} has been assigned to your upcoming pooja.`,
      { type: 'pooja_booking_assigned', bookingId: updated.id },
    );
  }
  return updated;
}

export async function adminCompleteBooking(
  bookingId: string,
): Promise<PoojaBookingRow | undefined> {
  const updated = await completePoojaBooking(bookingId);
  if (updated) {
    fireNotify(
      updated.userId,
      'Your pooja is complete',
      'Your booked pooja has been marked complete. Thank you!',
      { type: 'pooja_booking_completed', bookingId: updated.id },
    );
  }
  return updated;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/pooja-bookings-service.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pooja-bookings/pooja-bookings.service.ts test/pooja-bookings-service.spec.ts
git commit -m "feat(pooja-bookings): add service layer with fire-and-forget push notifications"
```

---

### Task 6: Customer-facing routes + `app.ts` mounting

**Why:** The customer surface: browse the catalog, book (debits wallet), cancel (refunds), and view booking history. Follows the `.openapi()`/`createRoute`/`errorResponse` conventions from `prime-reports.routes.ts`.

**Files:**

- Create: `src/modules/pooja-bookings/pooja-bookings.schemas.ts`
- Create: `src/modules/pooja-bookings/pooja-bookings.routes.ts`
- Create: `test/pooja-bookings-routes.spec.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Write the failing test**

Create `test/pooja-bookings-routes.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeProfileContext, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  listCatalog: vi.fn(),
  bookPooja: vi.fn(),
  cancelBooking: vi.fn(),
  listMyBookings: vi.fn(),
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

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: state.resolveActiveProfileContext,
}));

vi.mock('../src/modules/pooja-bookings/pooja-bookings.service.js', () => ({
  listCatalog: state.listCatalog,
  bookPooja: state.bookPooja,
  cancelBooking: state.cancelBooking,
  listMyBookings: state.listMyBookings,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token', 'Content-Type': 'application/json' } as const;

function makeBookingRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-23T00:00:00Z');
  return {
    id: 'booking-1',
    poojaId: 'pooja-1',
    panditId: null,
    preferredDate: '2026-08-01',
    shipAddress: '123 MG Road',
    shipPincode: '560001',
    status: 'requested',
    pricePaisePaid: 110000,
    requestedAt: now,
    assignedAt: null,
    completedAt: null,
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.resolveActiveProfileContext.mockReset().mockResolvedValue(makeProfileContext());
  state.listCatalog.mockReset();
  state.bookPooja.mockReset();
  state.cancelBooking.mockReset();
  state.listMyBookings.mockReset();
});

describe('GET /v1/pooja-bookings/catalog', () => {
  it('200s with the active catalog', async () => {
    state.listCatalog.mockResolvedValueOnce([
      {
        id: 'pooja-1',
        name: 'Satyanarayan Pooja',
        description: 'A traditional pooja for prosperity.',
        deity: 'Lord Vishnu',
        basePricePaise: 110000,
        durationMinutes: 90,
        isActive: true,
        createdAt: new Date('2026-01-01'),
      },
    ]);

    const res = await createApp().request('/v1/pooja-bookings/catalog', { headers: AUTH });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([
      {
        id: 'pooja-1',
        name: 'Satyanarayan Pooja',
        description: 'A traditional pooja for prosperity.',
        deity: 'Lord Vishnu',
        basePricePaise: 110000,
        durationMinutes: 90,
      },
    ]);
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/pooja-bookings/catalog');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/pooja-bookings', () => {
  const BODY = {
    poojaId: '11111111-1111-1111-1111-111111111111',
    preferredDate: '2026-08-01',
    shipAddress: '123 MG Road',
    shipPincode: '560001',
  };

  it('201s with the created booking', async () => {
    state.bookPooja.mockResolvedValueOnce({ outcome: 'booked', booking: makeBookingRow() });

    const res = await createApp().request('/v1/pooja-bookings', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(BODY),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe('booking-1');
    expect(body.status).toBe('requested');
    expect(state.bookPooja).toHaveBeenCalledWith('id-1', expect.anything(), BODY);
  });

  it('404s for an unknown or inactive pooja', async () => {
    state.bookPooja.mockResolvedValueOnce({ outcome: 'unknown_pooja' });

    const res = await createApp().request('/v1/pooja-bookings', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(BODY),
    });

    expect(res.status).toBe(404);
  });

  it('409s when the wallet balance is insufficient', async () => {
    state.bookPooja.mockResolvedValueOnce({ outcome: 'insufficient_balance' });

    const res = await createApp().request('/v1/pooja-bookings', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(BODY),
    });

    expect(res.status).toBe(409);
  });

  it('422s on an invalid shipPincode', async () => {
    const res = await createApp().request('/v1/pooja-bookings', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ ...BODY, shipPincode: 'abc' }),
    });

    expect(res.status).toBe(422);
    expect(state.bookPooja).not.toHaveBeenCalled();
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/pooja-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BODY),
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/pooja-bookings/:id/cancel', () => {
  it('200s with the refunded booking', async () => {
    state.cancelBooking.mockResolvedValueOnce(makeBookingRow({ status: 'refunded' }));

    const res = await createApp().request(
      '/v1/pooja-bookings/11111111-1111-1111-1111-111111111111/cancel',
      { method: 'POST', headers: AUTH },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('refunded');
    expect(state.cancelBooking).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      'id-1',
    );
  });

  it('409s when the booking is not found, not owned, or no longer cancellable', async () => {
    state.cancelBooking.mockResolvedValueOnce(undefined);

    const res = await createApp().request(
      '/v1/pooja-bookings/11111111-1111-1111-1111-111111111111/cancel',
      { method: 'POST', headers: AUTH },
    );

    expect(res.status).toBe(409);
  });
});

describe('GET /v1/pooja-bookings/me', () => {
  it("200s with the caller's booking history", async () => {
    state.listMyBookings.mockResolvedValueOnce([makeBookingRow()]);

    const res = await createApp().request('/v1/pooja-bookings/me', { headers: AUTH });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.id).toBe('booking-1');
    expect(state.listMyBookings).toHaveBeenCalledWith('id-1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/pooja-bookings-routes.spec.ts`
Expected: FAIL — the schemas/routes modules and the `/v1/pooja-bookings/*` mounts don't exist yet.

- [ ] **Step 3: Implement the schemas, routes, and mount them**

Create `src/modules/pooja-bookings/pooja-bookings.schemas.ts`:

```ts
import { z } from '@hono/zod-openapi';

export const PoojaCatalogItemSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string(),
    deity: z.string().nullable(),
    basePricePaise: z.number().int(),
    durationMinutes: z.number().int(),
  })
  .openapi('PoojaCatalogItem');

export const PoojaCatalogListSchema = z
  .object({ items: z.array(PoojaCatalogItemSchema) })
  .openapi('PoojaCatalogList');

export const PoojaBookingStatusSchema = z.enum([
  'requested',
  'assigned',
  'completed',
  'cancelled',
  'refunded',
]);

export const PoojaBookingDtoSchema = z
  .object({
    id: z.string().uuid(),
    poojaId: z.string().uuid(),
    panditId: z.string().uuid().nullable(),
    preferredDate: z.string(),
    shipAddress: z.string(),
    shipPincode: z.string(),
    status: PoojaBookingStatusSchema,
    pricePaisePaid: z.number().int(),
    requestedAt: z.string(),
    assignedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .openapi('PoojaBookingDto');

export const PoojaBookingListSchema = z
  .object({ items: z.array(PoojaBookingDtoSchema) })
  .openapi('PoojaBookingList');

export const CreatePoojaBookingRequestSchema = z
  .object({
    poojaId: z.string().uuid(),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'preferredDate must be YYYY-MM-DD'),
    shipAddress: z.string().min(1).max(500),
    shipPincode: z.string().regex(/^\d{6}$/, 'shipPincode must be a 6-digit Indian PIN code'),
    notes: z.string().max(1000).optional(),
  })
  .openapi('CreatePoojaBookingRequest');

export const BookingIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const AssignPanditRequestSchema = z
  .object({ panditId: z.string().uuid() })
  .openapi('AssignPanditRequest');

export const CreatePanditRequestSchema = z
  .object({
    displayName: z.string().min(1).max(200),
    phone: z.string().max(20).optional(),
    city: z.string().min(1).max(100),
    languages: z.array(z.string().min(1)).default([]),
  })
  .openapi('CreatePanditRequest');

export const PanditDtoSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string(),
    phone: z.string().nullable(),
    city: z.string(),
    languages: z.array(z.string()),
    verified: z.boolean(),
    active: z.boolean(),
    createdAt: z.string(),
  })
  .openapi('PanditDto');
```

Create `src/modules/pooja-bookings/pooja-bookings.routes.ts`:

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { listCatalog, bookPooja, cancelBooking, listMyBookings } from './pooja-bookings.service.js';
import type { PoojaBookingRow } from '../../db/schema.js';
import {
  PoojaCatalogListSchema,
  PoojaBookingDtoSchema,
  PoojaBookingListSchema,
  CreatePoojaBookingRequestSchema,
  BookingIdParamSchema,
} from './pooja-bookings.schemas.js';

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

export const poojaBookingsRouter = new OpenAPIHono();

function toBookingDto(row: PoojaBookingRow) {
  return {
    id: row.id,
    poojaId: row.poojaId,
    panditId: row.panditId,
    preferredDate: row.preferredDate,
    shipAddress: row.shipAddress,
    shipPincode: row.shipPincode,
    status: row.status,
    pricePaisePaid: row.pricePaisePaid,
    requestedAt: row.requestedAt.toISOString(),
    assignedAt: row.assignedAt ? row.assignedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    notes: row.notes,
  };
}

const catalogRoute = createRoute({
  method: 'get',
  path: '/pooja-bookings/catalog',
  tags: ['Pooja Bookings'],
  summary: 'List active poojas available for booking',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Active pooja catalog',
      content: { 'application/json': { schema: PoojaCatalogListSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

poojaBookingsRouter.openapi(catalogRoute, async (c) => {
  const items = await listCatalog();
  return c.json(
    {
      items: items.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        deity: p.deity,
        basePricePaise: p.basePricePaise,
        durationMinutes: p.durationMinutes,
      })),
    },
    200,
  );
});

const createBookingRoute = createRoute({
  method: 'post',
  path: '/pooja-bookings',
  tags: ['Pooja Bookings'],
  summary: 'Book a pooja for the active profile (debits wallet immediately)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    body: { content: { 'application/json': { schema: CreatePoojaBookingRequestSchema } } },
  },
  responses: {
    201: {
      description: 'Booking created',
      content: { 'application/json': { schema: PoojaBookingDtoSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Unknown or inactive pooja'),
    409: errorResponse('Insufficient wallet balance'),
    422: errorResponse('Invalid request body'),
  },
});

poojaBookingsRouter.openapi(createBookingRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const profile = await resolveActiveProfileContext(user);

  const result = await bookPooja(user.id, profile, body);

  if (result.outcome === 'unknown_pooja') {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Unknown or inactive pooja.' } }, 404);
  }
  if (result.outcome === 'insufficient_balance') {
    return c.json(
      { error: { code: 'CONFLICT', message: 'Insufficient wallet balance to book this pooja.' } },
      409,
    );
  }
  return c.json(toBookingDto(result.booking), 201);
});

const cancelBookingRoute = createRoute({
  method: 'post',
  path: '/pooja-bookings/{id}/cancel',
  tags: ['Pooja Bookings'],
  summary: 'Cancel a booking still in requested/assigned status and refund the wallet',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: { params: BookingIdParamSchema },
  responses: {
    200: {
      description: 'Booking cancelled and refunded',
      content: { 'application/json': { schema: PoojaBookingDtoSchema } },
    },
    401: errorResponse('Unauthorized'),
    409: errorResponse('Booking not found, not owned by you, or no longer cancellable'),
  },
});

poojaBookingsRouter.openapi(cancelBookingRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');

  const refunded = await cancelBooking(id, user.id);
  if (!refunded) {
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message: 'Booking not found, not owned by you, or no longer cancellable.',
        },
      },
      409,
    );
  }
  return c.json(toBookingDto(refunded), 200);
});

const myBookingsRoute = createRoute({
  method: 'get',
  path: '/pooja-bookings/me',
  tags: ['Pooja Bookings'],
  summary: "The signed-in user's own pooja booking history",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Booking history',
      content: { 'application/json': { schema: PoojaBookingListSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

poojaBookingsRouter.openapi(myBookingsRoute, async (c) => {
  const user = c.get('user');
  const bookings = await listMyBookings(user.id);
  return c.json({ items: bookings.map(toBookingDto) }, 200);
});
```

In `src/app.ts`, add the import (alongside the other module router imports, e.g. right after the `palmPhotoRouter` import):

```ts
import { poojaBookingsRouter } from './modules/pooja-bookings/pooja-bookings.routes.js';
```

And add the mount (right after `app.route('/v1', palmPhotoRouter);`):

```ts
app.route('/v1', poojaBookingsRouter);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/pooja-bookings-routes.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pooja-bookings/pooja-bookings.schemas.ts src/modules/pooja-bookings/pooja-bookings.routes.ts test/pooja-bookings-routes.spec.ts src/app.ts
git commit -m "feat(pooja-bookings): add customer-facing routes (catalog, book, cancel, history)"
```

---

### Task 7: Admin-facing routes + `app.ts` mounting

**Why:** The three ops actions: add a pre-vetted pandit, assign one to a booking, and manually acknowledge completion. Gated by `requireAdmin` from Task 2 (or reused from the Admin Console plan if that landed first — see "Before you start").

**Files:**

- Create: `src/modules/pooja-bookings/pooja-bookings.admin.routes.ts`
- Create: `test/pooja-bookings-admin-routes.spec.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Write the failing test**

Create `test/pooja-bookings-admin-routes.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';
import type * as EnvModule from '../src/config/env.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  createPandit: vi.fn(),
  adminAssignPandit: vi.fn(),
  adminCompleteBooking: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

// Partial mock: keep every real env field (many other routers read env.*
// during app.ts creation) and only override ADMIN_FIREBASE_UIDS — same
// importOriginal technique already used in test/telegram-bot.spec.ts for a
// different module.
vi.mock('../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    ...actual,
    env: { ...actual.env, ADMIN_FIREBASE_UIDS: ['admin-uid'] },
  };
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

vi.mock('../src/modules/pooja-bookings/pandits.repo.js', () => ({
  createPandit: state.createPandit,
}));

vi.mock('../src/modules/pooja-bookings/pooja-bookings.service.js', () => ({
  adminAssignPandit: state.adminAssignPandit,
  adminCompleteBooking: state.adminCompleteBooking,
}));

const { createApp } = await import('../src/app.js');

const ADMIN_AUTH = {
  Authorization: 'Bearer admin-token',
  'Content-Type': 'application/json',
} as const;

function setSignedInUser(firebaseUid: string) {
  state.verifyIdToken.mockResolvedValue(makeDecodedToken(firebaseUid));
  state.findUserByFirebaseUid.mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid }));
}

beforeEach(() => {
  state.verifyIdToken.mockReset();
  state.findUserByFirebaseUid.mockReset();
  state.createPandit.mockReset();
  state.adminAssignPandit.mockReset();
  state.adminCompleteBooking.mockReset();
  setSignedInUser('admin-uid');
});

describe('POST /v1/admin/pandits', () => {
  const BODY = { displayName: 'Ravi Shastri', city: 'Pune', languages: ['hi', 'mr'] };

  it('201s with the created pandit for an admin caller', async () => {
    state.createPandit.mockResolvedValueOnce({
      id: 'pandit-1',
      displayName: 'Ravi Shastri',
      phone: null,
      city: 'Pune',
      languages: ['hi', 'mr'],
      verified: true,
      active: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    const res = await createApp().request('/v1/admin/pandits', {
      method: 'POST',
      headers: ADMIN_AUTH,
      body: JSON.stringify(BODY),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; verified: boolean };
    expect(body.id).toBe('pandit-1');
    expect(body.verified).toBe(true);
    expect(state.createPandit).toHaveBeenCalledWith({
      displayName: 'Ravi Shastri',
      phone: null,
      city: 'Pune',
      languages: ['hi', 'mr'],
      verified: true,
      active: true,
    });
  });

  it('403s for a signed-in user who is not on the admin allowlist', async () => {
    setSignedInUser('not-an-admin');

    const res = await createApp().request('/v1/admin/pandits', {
      method: 'POST',
      headers: ADMIN_AUTH,
      body: JSON.stringify(BODY),
    });

    expect(res.status).toBe(403);
    expect(state.createPandit).not.toHaveBeenCalled();
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/admin/pandits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BODY),
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/admin/pooja-bookings/:id/assign', () => {
  it('200s with the assigned booking for an admin caller', async () => {
    state.adminAssignPandit.mockResolvedValueOnce({
      id: 'booking-1',
      poojaId: 'pooja-1',
      panditId: 'pandit-1',
      preferredDate: '2026-08-01',
      shipAddress: '123 MG Road',
      shipPincode: '560001',
      status: 'assigned',
      pricePaisePaid: 110000,
      requestedAt: new Date('2026-07-20'),
      assignedAt: new Date('2026-07-23'),
      completedAt: null,
      notes: null,
    });

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/assign',
      {
        method: 'POST',
        headers: ADMIN_AUTH,
        body: JSON.stringify({ panditId: '22222222-2222-2222-2222-222222222222' }),
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; panditId: string | null };
    expect(body.status).toBe('assigned');
    expect(body.panditId).toBe('pandit-1');
    expect(state.adminAssignPandit).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    );
  });

  it('404s for an unknown or inactive pandit', async () => {
    state.adminAssignPandit.mockResolvedValueOnce('unknown_pandit');

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/assign',
      {
        method: 'POST',
        headers: ADMIN_AUTH,
        body: JSON.stringify({ panditId: '22222222-2222-2222-2222-222222222222' }),
      },
    );

    expect(res.status).toBe(404);
  });

  it('409s when the booking is not found or not currently requested', async () => {
    state.adminAssignPandit.mockResolvedValueOnce(undefined);

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/assign',
      {
        method: 'POST',
        headers: ADMIN_AUTH,
        body: JSON.stringify({ panditId: '22222222-2222-2222-2222-222222222222' }),
      },
    );

    expect(res.status).toBe(409);
  });

  it('403s for a non-admin caller', async () => {
    setSignedInUser('not-an-admin');

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/assign',
      {
        method: 'POST',
        headers: ADMIN_AUTH,
        body: JSON.stringify({ panditId: '22222222-2222-2222-2222-222222222222' }),
      },
    );

    expect(res.status).toBe(403);
  });
});

describe('POST /v1/admin/pooja-bookings/:id/complete', () => {
  it('200s with the completed booking for an admin caller', async () => {
    state.adminCompleteBooking.mockResolvedValueOnce({
      id: 'booking-1',
      poojaId: 'pooja-1',
      panditId: 'pandit-1',
      preferredDate: '2026-08-01',
      shipAddress: '123 MG Road',
      shipPincode: '560001',
      status: 'completed',
      pricePaisePaid: 110000,
      requestedAt: new Date('2026-07-20'),
      assignedAt: new Date('2026-07-21'),
      completedAt: new Date('2026-08-01'),
      notes: null,
    });

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/complete',
      { method: 'POST', headers: ADMIN_AUTH },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('completed');
  });

  it('409s when the booking is not found or not currently assigned', async () => {
    state.adminCompleteBooking.mockResolvedValueOnce(undefined);

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/complete',
      { method: 'POST', headers: ADMIN_AUTH },
    );

    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/pooja-bookings-admin-routes.spec.ts`
Expected: FAIL — `src/modules/pooja-bookings/pooja-bookings.admin.routes.js` doesn't exist yet and `/v1/admin/*` isn't mounted for this feature.

- [ ] **Step 3: Implement `pooja-bookings.admin.routes.ts` and mount it**

Create `src/modules/pooja-bookings/pooja-bookings.admin.routes.ts`. **Import `requireAdmin` from wherever it actually ended up** — `../../middleware/admin.js` if Task 2 was run in this plan, or `../../middleware/auth.js` if it was skipped because the Admin Console plan's `requireAdmin` already exists (see "Before you start"):

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/admin.js'; // or '../../middleware/auth.js' — see note above
import { createPandit } from './pandits.repo.js';
import { adminAssignPandit, adminCompleteBooking } from './pooja-bookings.service.js';
import type { PoojaBookingRow } from '../../db/schema.js';
import {
  CreatePanditRequestSchema,
  PanditDtoSchema,
  AssignPanditRequestSchema,
  PoojaBookingDtoSchema,
  BookingIdParamSchema,
} from './pooja-bookings.schemas.js';

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

export const poojaBookingsAdminRouter = new OpenAPIHono();

function toBookingDto(row: PoojaBookingRow) {
  return {
    id: row.id,
    poojaId: row.poojaId,
    panditId: row.panditId,
    preferredDate: row.preferredDate,
    shipAddress: row.shipAddress,
    shipPincode: row.shipPincode,
    status: row.status,
    pricePaisePaid: row.pricePaisePaid,
    requestedAt: row.requestedAt.toISOString(),
    assignedAt: row.assignedAt ? row.assignedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    notes: row.notes,
  };
}

const createPanditRoute = createRoute({
  method: 'post',
  path: '/admin/pandits',
  tags: ['Admin — Pooja Bookings'],
  summary: 'Admin-only: add a pre-vetted pandit to the roster (no self-onboarding in this batch)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAdmin] as const,
  request: {
    body: { content: { 'application/json': { schema: CreatePanditRequestSchema } } },
  },
  responses: {
    201: {
      description: 'Pandit created',
      content: { 'application/json': { schema: PanditDtoSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    422: errorResponse('Invalid request body'),
  },
});

poojaBookingsAdminRouter.openapi(createPanditRoute, async (c) => {
  const body = c.req.valid('json');
  const pandit = await createPandit({
    displayName: body.displayName,
    phone: body.phone ?? null,
    city: body.city,
    languages: body.languages,
    verified: true,
    active: true,
  });
  return c.json(
    {
      id: pandit.id,
      displayName: pandit.displayName,
      phone: pandit.phone,
      city: pandit.city,
      languages: pandit.languages,
      verified: pandit.verified,
      active: pandit.active,
      createdAt: pandit.createdAt.toISOString(),
    },
    201,
  );
});

const assignRoute = createRoute({
  method: 'post',
  path: '/admin/pooja-bookings/{id}/assign',
  tags: ['Admin — Pooja Bookings'],
  summary: 'Admin-only: assign a pandit to a requested booking',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAdmin] as const,
  request: {
    params: BookingIdParamSchema,
    body: { content: { 'application/json': { schema: AssignPanditRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Booking assigned',
      content: { 'application/json': { schema: PoojaBookingDtoSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    404: errorResponse('Unknown or inactive pandit'),
    409: errorResponse('Booking not found or not currently requested'),
  },
});

poojaBookingsAdminRouter.openapi(assignRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { panditId } = c.req.valid('json');

  const result = await adminAssignPandit(id, panditId);
  if (result === 'unknown_pandit') {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Unknown or inactive pandit.' } }, 404);
  }
  if (!result) {
    return c.json(
      { error: { code: 'CONFLICT', message: 'Booking not found or not currently requested.' } },
      409,
    );
  }
  return c.json(toBookingDto(result), 200);
});

const completeRoute = createRoute({
  method: 'post',
  path: '/admin/pooja-bookings/{id}/complete',
  tags: ['Admin — Pooja Bookings'],
  summary:
    'Admin-only: manually acknowledge a pooja was performed — a trust-the-admin/ops-process step, no video-proof requirement in this batch',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAdmin] as const,
  request: { params: BookingIdParamSchema },
  responses: {
    200: {
      description: 'Booking marked complete',
      content: { 'application/json': { schema: PoojaBookingDtoSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    409: errorResponse('Booking not found or not currently assigned'),
  },
});

poojaBookingsAdminRouter.openapi(completeRoute, async (c) => {
  const { id } = c.req.valid('param');
  const result = await adminCompleteBooking(id);
  if (!result) {
    return c.json(
      { error: { code: 'CONFLICT', message: 'Booking not found or not currently assigned.' } },
      409,
    );
  }
  return c.json(toBookingDto(result), 200);
});
```

In `src/app.ts`, add the import (right after `poojaBookingsRouter`'s import):

```ts
import { poojaBookingsAdminRouter } from './modules/pooja-bookings/pooja-bookings.admin.routes.js';
```

And add the mount (right after `app.route('/v1', poojaBookingsRouter);`):

```ts
app.route('/v1', poojaBookingsAdminRouter);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/pooja-bookings-admin-routes.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pooja-bookings/pooja-bookings.admin.routes.ts test/pooja-bookings-admin-routes.spec.ts src/app.ts
git commit -m "feat(pooja-bookings): add admin routes (add pandit, assign, complete)"
```

---

### Task 8: Seed script — `pooja_catalog` from the existing curated pooja list

**Why:** Populates `pooja_catalog` with the real 9 poojas already defined in `src/lib/astro-engine/poojaRecommendations.ts` — a deliberate synergy with the existing free/AI pooja-guidance report, not a new invented catalog. Mirrors `scripts/seed-coupons.ts`'s idempotent look-up-then-update-or-insert convention exactly. Like `seed-coupons.ts`, this is an ops script with no automated test (it requires a live `DATABASE_URL`) — this is a deliberate, precedented deviation from TDD for ops-runbook scripts, not an oversight.

**Files:**

- Create: `scripts/seed-pooja-catalog.ts`

- [ ] **Step 1: Implement `scripts/seed-pooja-catalog.ts`**

```ts
/**
 * Seeds the pooja_catalog table for the concierge-pilot pooja-booking batch,
 * reusing the exact same curated pooja names/descriptions already used by
 * the free/AI pooja-guidance report
 * (src/lib/astro-engine/poojaRecommendations.ts) — deliberately NOT
 * inventing a new 50-pooja catalog (see the old, abandoned apps/api
 * reference implementation for what that looked like).
 * Idempotent — re-running updates existing rows by (lowercased) name instead
 * of duplicating, same convention as scripts/seed-coupons.ts.
 * Usage: npx tsx scripts/seed-pooja-catalog.ts
 */
import { db } from '../src/config/db.js';
import { poojaCatalog } from '../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';

const SEED_POOJAS = [
  {
    name: 'Satyanarayan Pooja',
    description:
      'A traditional pooja performed for overall prosperity, harmony, and removing obstacles — suitable for anyone regardless of specific chart afflictions.',
    deity: 'Lord Vishnu',
    basePricePaise: 110000,
    durationMinutes: 90,
  },
  {
    name: 'Navgraha Shanti Pooja',
    description:
      'Propitiates all nine planetary deities together to support overall balance and ease the impact of any planetary weaknesses.',
    deity: 'The nine planets (Navagraha)',
    basePricePaise: 210000,
    durationMinutes: 120,
  },
  {
    name: 'Mangal Shanti Pooja',
    description:
      'Traditionally performed to pacify Mars and ease the effects associated with Mangal Dosha, particularly ahead of marriage.',
    deity: 'Lord Hanuman / Mangal (Mars)',
    basePricePaise: 150000,
    durationMinutes: 90,
  },
  {
    name: 'Kaal Sarp Dosha Nivaran Pooja',
    description:
      'Traditionally performed (often at a Shiva temple such as Trimbakeshwar) to ease the effects associated with Kaal Sarp Dosha.',
    deity: 'Lord Shiva',
    basePricePaise: 510000,
    durationMinutes: 180,
  },
  {
    name: 'Shani Shanti Pooja',
    description:
      "Traditionally performed during Sade Sati to seek Saturn's grace and ease the intensity of this transit period.",
    deity: 'Lord Shani (Saturn) / Hanuman',
    basePricePaise: 180000,
    durationMinutes: 90,
  },
  {
    name: 'Pitra Dosha Nivaran Pooja (Shraadh)',
    description:
      'Traditionally performed to honor ancestors and ease the effects associated with Pitra Dosha.',
    deity: 'Ancestors / Lord Vishnu',
    basePricePaise: 310000,
    durationMinutes: 120,
  },
  {
    name: 'Kemdruma Dosha Nivaran Pooja',
    description:
      'Traditionally performed to strengthen the Moon and ease the effects associated with Kemdruma Dosha.',
    deity: 'Chandra (Moon)',
    basePricePaise: 150000,
    durationMinutes: 90,
  },
  {
    name: 'Grahan Dosha Nivaran Pooja',
    description:
      'Traditionally performed to ease the effects associated with Grahan (eclipse) Dosha.',
    deity: 'Sun/Moon and Rahu-Ketu',
    basePricePaise: 180000,
    durationMinutes: 90,
  },
  {
    name: 'Guru Chandal Dosha Nivaran Pooja',
    description:
      'Traditionally performed to strengthen Jupiter and ease the effects associated with Guru Chandal Dosha.',
    deity: 'Lord Brihaspati (Jupiter)',
    basePricePaise: 180000,
    durationMinutes: 90,
  },
] as const;

async function main() {
  for (const p of SEED_POOJAS) {
    const [existing] = await db
      .select({ id: poojaCatalog.id })
      .from(poojaCatalog)
      .where(sql`lower(${poojaCatalog.name}) = lower(${p.name})`)
      .limit(1);

    if (existing) {
      await db
        .update(poojaCatalog)
        .set({
          description: p.description,
          deity: p.deity,
          basePricePaise: p.basePricePaise,
          durationMinutes: p.durationMinutes,
          isActive: true,
        })
        .where(eq(poojaCatalog.id, existing.id));
      console.log(`Updated pooja ${p.name}`);
    } else {
      await db.insert(poojaCatalog).values(p);
      console.log(`Inserted pooja ${p.name}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors (same baseline as before this task).

- [ ] **Step 3: Run it against a real (dev/staging) database once, manually, to confirm it inserts the 9 rows and is idempotent on a second run**

Run: `npx tsx scripts/seed-pooja-catalog.ts` (requires `DATABASE_URL` pointed at a migrated database — Task 1's migration must already be applied there). Run it a second time and confirm the console output switches from "Inserted pooja ..." to "Updated pooja ..." for all 9 rows, with no duplicate rows created (verify via `SELECT count(*) FROM pooja_catalog;` = 9).

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-pooja-catalog.ts
git commit -m "feat(pooja-bookings): add idempotent seed script for pooja_catalog"
```

---

## After all 8 tasks: final review checklist (not a subagent task)

- `pnpm test && pnpm typecheck && pnpm lint` all clean — same pre-existing test failures and same (or fewer) pre-existing typecheck errors, no new ones.
- `GET /v1/pooja-bookings/catalog` returns exactly the 9 poojas seeded in Task 8 once Task 8's script has been run against the target database.
- Every admin route (`POST /v1/admin/pandits`, `POST /v1/admin/pooja-bookings/:id/assign`, `POST /v1/admin/pooja-bookings/:id/complete`) 403s for a non-allowlisted caller and fails closed when `ADMIN_FIREBASE_UIDS` is unset.
- `refundPoojaBooking()`'s status-flip UPDATE is confirmed to be the sole concurrency guard (re-read the docstring and the Task 4 test asserting the exact `WHERE ... status IN ('requested','assigned')` clause) — no separate row-level lock or advisory lock was needed or added.
- Confirm the deferred-items list (pandit self-onboarding, multi-member sankalp, offerings/add-ons, video-proof, automated decline/reassignment, pandit payouts, real-time delivery) is NOT accidentally implemented by any task above — this batch is intentionally the small concierge pilot.
- Do NOT merge `feat/prime-reports-batch2` to `main` — continue accumulating on this branch as with every prior batch on it.
