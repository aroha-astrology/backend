# Astrologer Marketplace — Batch 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the foundation of a human-astrologer consultation marketplace — admin-curated astrologer profiles, a public directory, and a scheduled-callback booking request/confirm/complete flow with wallet-only upfront payment — with ZERO live video/audio/chat delivery mechanism (that is an explicitly separate, later batch).

**Architecture:** Two new tables (`astrologers`, `astrologer_bookings`) follow this codebase's existing profile-scoped/wallet-ledger conventions exactly (`prime_reports`'s nullable `birthProfileId` pattern, `unlockPrimeReport`'s atomic debit-transaction pattern). A booking is requested (wallet debited upfront, same "charge on request" model as prime-reports' "charge on unlock"), then an admin manually confirms it and later marks it complete — standing in for the astrologer's own action, since there is no astrologer self-service portal or live-call infra in this batch. A brand-new `refundBooking()` primitive (prime-reports has no refund path at all) lets a customer cancel a still-`requested` booking and get an atomic wallet credit. A new `requireAdmin` HTTP middleware gates the admin routes, mirroring the Telegram bot's proven comma-separated env-var allowlist pattern.

**Tech Stack:** Hono + `@hono/zod-openapi`, Drizzle/Postgres, Firebase Auth, Vitest (mocked-`db` unit-test style — this codebase has no live-Postgres integration test suite).

---

## Before you start

**⚠️ Naming collision with two other in-flight plans on this same branch — read this before Task 1.** Two other plans on `feat/prime-reports-batch2` (the Admin Console Foundation plan and the Pooja Booking Batch 1 plan) each also introduce a `requireAdmin` HTTP middleware:

- Admin Console Foundation → `requireAdmin` in `src/middleware/auth.ts`, keyed off `ADMIN_FIREBASE_UIDS` (Firebase UID allowlist).
- Pooja Booking Batch 1 → `requireAdmin` in `src/middleware/admin.ts`, ALSO keyed off `ADMIN_FIREBASE_UIDS` — that plan explicitly checks whether the Admin Console version already landed first and reuses it instead of creating a redundant second one.
- **This plan (as originally drafted) independently proposes YET ANOTHER `requireAdmin`**, in `src/middleware/require-admin.ts`, keyed off a THIRD, differently-shaped env var (`ASTROLOGER_ADMIN_EMAILS`, an email allowlist instead of a Firebase UID allowlist).

**Before starting Task 1, check what already exists**: `grep -rn "requireAdmin\|ADMIN_FIREBASE_UIDS\|ASTROLOGER_ADMIN_EMAILS" src/`. If `requireAdmin` already exists (from either of the other two plans), **skip Task 1 entirely and reuse the existing one** — import it from wherever it actually lives (`../../middleware/auth.js` or `../../middleware/admin.js`), and adjust Task 4's admin routes to use `[requireUser, requireAdmin] as const` with that import instead of creating `src/middleware/require-admin.ts`. Do NOT ship three separate admin allowlists (UID/UID/email) gating three different feature areas — that's a real ops footgun (an admin added to one allowlist silently can't use the others). If none of the other plans have landed yet when this one is implemented, proceed with Task 1 as written below, but flag in the commit message that this is the FIRST of what should become one shared admin-auth mechanism, and note for whoever implements the other two plans that they should reuse this one instead of adding a third/fourth.

**Working directory:** `C:\dev\aroha-astrology\jyotish-backend\.worktrees\prime-reports-batch2` — an existing git worktree on branch `feat/prime-reports-batch2`. **Do NOT merge to `main`** — this branch is being used to accumulate multiple batches, merged once at the end in a single step. All file paths below are relative to this working directory.

**Baseline measured directly (2026-07-24), before any of this plan's work:**

- `pnpm test` → **803 passing / 9 failing** (101 of 105 test files passing, 4 files failing) — as of just before this plan's own work; this will have shifted upward once the Shagun/Admin Console/Pooja Booking plans land first — re-check `pnpm test` before Task 1 and use the real current numbers. The 9 pre-existing failures are unrelated to this plan — do not try to fix them, do not let them block your tasks:
  - `test/billing-google-play.spec.ts` (3 failures)
  - `test/health-report.spec.ts` (2 failures)
  - `test/horoscope-jargon.spec.ts` (3 failures)
  - `test/purchase-plan-notify.spec.ts` (1 failure)
- `pnpm typecheck` → **104 pre-existing errors**, none in files this plan touches. Notably `test/helpers/mocks.ts:7` already has a structural-type error (`makeUserRow`'s return object is missing some fields compared to the current `UserRow` type) — this is pre-existing drift, not something to fix here. Reusing `makeUserRow` in this plan's new test files does NOT add any NEW typecheck errors (the error is reported once, at its declaration site, not per call site).
- The next Drizzle migration number was **0033** as of this plan being drafted — confirm the actual next number by listing `src/db/migrations/` before Task 2, since it will have advanced if other plans landed first.
- Every existing multi-middleware route in this codebase already proves the `middleware: [A, B, ...] as const` array-chaining pattern works (verified: `src/modules/astro/astro.routes.ts` uses `[requireUser, llmRateLimit, requireConsent] as const` in 5 places; `palm-photo.routes.ts` uses `[requireUser, palmPhotoUploadRateLimit] as const`) — this plan's `[requireUser, requireAdmin] as const` on admin routes follows the exact same proven pattern.
- `users.email` (verified in `src/db/schema.ts`) is a nullable `text` column — this plan's `requireAdmin` (if Task 1 is not skipped per the collision note above) reads it via `c.get('user').email`.
- `pnpm db:generate` requires a reachable Postgres per your local `.env`'s `DATABASE_URL`, same as every other schema change in this repo.

**Explicitly deferred to a later batch (do not build any of this here):**

- **Live video/audio/chat delivery of any kind.** This batch only gets the booking mechanics working end-to-end with a manual "admin marks it done" completion step (`adminCompleteBooking`) — the actual consultation happens by whatever off-platform means (e.g. a phone call the astrologer makes directly), same as the old `apps/api` CRM-tool astrologers already did.
- **Astrologer self-onboarding.** No signup/claim route in this batch — profiles are admin-created only (`POST /v1/admin/astrologers`).
- **Real-time availability/calendar slots.** v1 uses a free-text `preferredTimeWindow` (e.g. `"weekday evenings IST"`), not bookable time slots.
- **Astrologer payouts.** A known gap — ops handles this manually outside the app for now, same as this repo already handles other manual processes.
- **Ratings/reviews.**
- **Auto-refund once a booking is `confirmed`/`completed`.** `refundBooking()` is only ever invoked while status is still `requested` — a customer who wants out of an already-confirmed session has no in-app path in this batch.

---

## File structure

| File                                                   | Action                                                               | Responsibility                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/db/schema.ts`                                     | Modify                                                               | Add `astrologers`, `astrologerBookings` tables + `astrologerBookingStatusEnum`        |
| `src/db/migrations/<next>_<generated>.sql` (+ `meta/`) | Create (generated)                                                   | DDL for the two new tables                                                            |
| `src/config/env.ts`                                    | Modify (skip if reusing an existing admin gate — see collision note) | Add `ASTROLOGER_ADMIN_EMAILS` allowlist env var                                       |
| `src/middleware/require-admin.ts`                      | Create (skip if reusing an existing admin gate)                      | HTTP admin gate (email allowlist)                                                     |
| `test/require-admin.spec.ts`                           | Create (skip if reusing an existing admin gate)                      | Middleware unit tests                                                                 |
| `src/modules/astrologers/astrologers.repo.ts`          | Create                                                               | DB access + the two atomic transactions (`requestAstrologerBooking`, `refundBooking`) |
| `test/astrologers-repo.spec.ts`                        | Create                                                               | Repo-layer tests (mocked `db`)                                                        |
| `src/modules/astrologers/astrologers.schemas.ts`       | Create                                                               | Zod/OpenAPI request+response schemas                                                  |
| `src/modules/astrologers/astrologers.service.ts`       | Create                                                               | DTO mapping, business logic, notifications                                            |
| `test/astrologers-service.spec.ts`                     | Create                                                               | Service-layer tests (mocked repo)                                                     |
| `src/modules/astrologers/astrologers.routes.ts`        | Create                                                               | `.openapi()` routes, mounted at `/v1`                                                 |
| `src/app.ts`                                           | Modify                                                               | Mount `astrologersRouter`                                                             |
| `test/astrologers-routes.spec.ts`                      | Create                                                               | Route-layer tests (full app, mocked service)                                          |

---

### Task 1: `requireAdmin` middleware + `ASTROLOGER_ADMIN_EMAILS`

**SKIP THIS TASK ENTIRELY if a `requireAdmin` middleware already exists on this branch** (check per the collision note in "Before you start"). If skipping, note in Task 4 which import path to use instead.

**Why (if not skipped):** No shared/HTTP admin-auth module exists anywhere in this codebase today — every existing admin-style action (coupon issuance, broadcasts, user deletion) is done exclusively through the Telegram admin bot's own chat-id tier check in `src/modules/telegram-bot/telegram-bot.service.ts#resolveTier`, gated by the `TELEGRAM_ADMIN_CHAT_IDS` env-var allowlist. This task builds the minimal HTTP equivalent, adapted to emails since HTTP routes are authenticated by Firebase user, not a Telegram chat id.

**Files:**

- Modify: `src/config/env.ts`
- Create: `src/middleware/require-admin.ts`
- Create: `test/require-admin.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/require-admin.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const fakeEnv = { ASTROLOGER_ADMIN_EMAILS: ['admin@aroha.app'] };
vi.mock('../src/config/env.js', () => ({
  env: fakeEnv,
  isProduction: false,
  isTest: true,
}));

const { requireAdmin } = await import('../src/middleware/require-admin.js');
const { errorHandler } = await import('../src/middleware/error.js');

function makeApp(email: string | null) {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('user' as never, { email } as never);
    await next();
  });
  app.use('*', requireAdmin);
  app.get('/ping', (c) => c.text('ok'));
  return app;
}

beforeEach(() => {
  fakeEnv.ASTROLOGER_ADMIN_EMAILS = ['admin@aroha.app'];
});

describe('requireAdmin', () => {
  it('allows a user whose email is on the allowlist', async () => {
    const app = makeApp('admin@aroha.app');
    const res = await app.request('/ping');
    expect(res.status).toBe(200);
  });

  it('is case-insensitive on the email match', async () => {
    const app = makeApp('Admin@Aroha.App');
    const res = await app.request('/ping');
    expect(res.status).toBe(200);
  });

  it('403s a user whose email is not on the allowlist', async () => {
    const app = makeApp('someone-else@example.com');
    const res = await app.request('/ping');
    expect(res.status).toBe(403);
  });

  it('403s a user with no email on file', async () => {
    const app = makeApp(null);
    const res = await app.request('/ping');
    expect(res.status).toBe(403);
  });

  it('fails closed when the allowlist is empty (unset env var)', async () => {
    fakeEnv.ASTROLOGER_ADMIN_EMAILS = [];
    const app = makeApp('admin@aroha.app');
    const res = await app.request('/ping');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/require-admin.spec.ts`
Expected: FAIL — `src/middleware/require-admin.js` does not exist yet.

- [ ] **Step 3: Add the env var**

In `src/config/env.ts`, add just before the closing `})` of the `EnvSchema` object (after `HOROSCOPE_ACTIVE_WINDOW_DAYS`):

```ts
    // --- Astrologer marketplace (Batch 1: admin-curated roster) ------------
    // Allowlist of admin emails permitted to manage astrologer profiles and
    // manually confirm/complete bookings via the HTTP admin routes
    // (src/middleware/require-admin.ts) — same comma-separated allowlist
    // convention as TELEGRAM_ADMIN_CHAT_IDS, adapted to emails since this is
    // the first HTTP-facing (not Telegram-facing) admin gate in this codebase.
    ASTROLOGER_ADMIN_EMAILS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
```

- [ ] **Step 4: Implement `src/middleware/require-admin.ts`**

```ts
import type { MiddlewareHandler } from 'hono';
import { env } from '../config/env.js';
import { Errors } from '../lib/errors.js';

/**
 * Email allowlist gate for admin-only HTTP routes — the first HTTP-facing
 * admin gate in this codebase. Every other admin-style action (coupon
 * issuance, broadcasts, user deletion) is done exclusively via the Telegram
 * admin bot's own chat-id tier check (telegram-bot.service.ts#resolveTier);
 * no shared HTTP admin module exists anywhere else (verified before writing
 * this file). Mirrors that same comma-separated env-var-allowlist pattern
 * (see TELEGRAM_ADMIN_CHAT_IDS in config/env.ts), adapted to emails since
 * HTTP routes are authenticated by Firebase user, not a Telegram chat id.
 *
 * MUST run after `requireUser` (reads `c.get('user')`) — every admin route
 * chains `middleware: [requireUser, requireAdmin] as const`.
 *
 * FAILS CLOSED, like requireCronSecret/requireTelegramWebhookSecret: a user
 * with no email on file, or an empty/unset ASTROLOGER_ADMIN_EMAILS, is never
 * treated as admin.
 */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  const email = user.email?.toLowerCase();
  const allowlist = new Set(env.ASTROLOGER_ADMIN_EMAILS);
  if (!email || !allowlist.has(email)) {
    throw Errors.forbidden('Admin access required');
  }
  await next();
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test test/require-admin.spec.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: baseline + 5 new passing, same pre-existing failures, no new typecheck errors.

- [ ] **Step 7: Commit**

```bash
git add src/config/env.ts src/middleware/require-admin.ts test/require-admin.spec.ts
git commit -m "feat(admin): add requireAdmin HTTP middleware (email allowlist)"
```

---

### Task 2: `astrologers` + `astrologer_bookings` schema, migration, and repo layer

**Why:** This is the data foundation — two tables plus the two atomic transactions (`requestAstrologerBooking` for the upfront wallet debit, `refundBooking` for the brand-new refund primitive). `requestAstrologerBooking` mirrors `unlockPrimeReport`'s balance-guarded-UPDATE + ledger-insert + row-insert transaction pattern; `refundBooking` is genuinely new (prime-reports never refunds) and is race-safe via a compare-and-swap on the booking's own `status` column.

**Files:**

- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/<next>_<generated-name>.sql` (generated, not hand-written)
- Create: `src/modules/astrologers/astrologers.repo.ts`
- Create: `test/astrologers-repo.spec.ts`

- [ ] **Step 1: Add the tables to `src/db/schema.ts`**

Add at the end of the file. All imports used below (`pgTable`, `uuid`, `text`, `timestamp`, `boolean`, `integer`, `index`, `pgEnum`, `sql`) are already imported at the top of `schema.ts` — add nothing new to the import line.

```ts
/* -------------------------------------------------------------------------- */
/* astrologers — admin-curated marketplace roster (Batch 1: FOUNDATION)        */
/* -------------------------------------------------------------------------- */

/**
 * A bookable human astrologer's public profile. `userId` is nullable: this
 * v1 roster is entirely admin-curated (see requireAdmin / POST
 * /v1/admin/astrologers) — an admin can add a real astrologer's profile
 * without that astrologer ever signing up for an Aroha account themselves.
 * A future self-service batch would populate `userId` when/if an astrologer
 * claims or creates their own account; nothing in this batch requires it.
 * `onDelete: 'set null'` so deleting the linked user account (if any) never
 * cascades into deleting the public profile or its booking history.
 */
export const astrologers = pgTable(
  'astrologers',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    /** Simple free-form tags (e.g. 'career', 'marriage', 'health', 'vedic', 'tarot') — no separate taxonomy table in v1. */
    specialties: text('specialties')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    languages: text('languages')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    photoUrl: text('photo_url'),
    /** Flat price per booking, NOT per-minute — there is no live-call infra to meter minutes against in this batch. */
    ratePaisePerSession: integer('rate_paise_per_session').notNull(),
    verified: boolean('verified').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    // Backs the public directory listing (GET /v1/astrologers), which only
    // ever shows verified && active rows.
    verifiedActiveIdx: index('astrologers_verified_active_idx').on(table.verified, table.active),
  }),
);

export type AstrologerRow = typeof astrologers.$inferSelect;
export type NewAstrologerRow = typeof astrologers.$inferInsert;

export const astrologerBookingStatusEnum = pgEnum('astrologer_booking_status', [
  'requested',
  'confirmed',
  'completed',
  'declined',
  'cancelled',
  'refunded',
]);

/**
 * A scheduled-callback booking request between a customer and an astrologer.
 * Wallet-only payment: `pricePaisePaid` is charged upfront the moment a
 * booking is REQUESTED (see requestAstrologerBooking in astrologers.repo.ts)
 * — the same "charge on unlock/request, not on fulfillment" model
 * prime_reports uses. There is no live video/chat delivery in this batch;
 * `confirmed`/`completed` are both set by an admin manually
 * (POST /v1/admin/astrologers/bookings/{bookingId}/confirm|complete) since
 * there is no astrologer self-service portal and no automated
 * call-completion signal without real telephony/video infra.
 */
export const astrologerBookings = pgTable(
  'astrologer_bookings',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // RESTRICT, not CASCADE: booking history must survive even if an
    // astrologer row is ever hard-deleted (no delete route exists in this
    // batch, but this keeps the invariant safe for whenever one is added).
    astrologerId: uuid('astrologer_id')
      .notNull()
      .references(() => astrologers.id, { onDelete: 'restrict' }),
    /** NULL = the primary/self profile; non-null = an additional profile in birth_profiles — same convention as prime_reports.birthProfileId. */
    birthProfileId: uuid('birth_profile_id').references(() => birthProfiles.id, {
      onDelete: 'cascade',
    }),
    /** Free-form v1 scheduling, e.g. "weekday evenings IST" — real bookable calendar slots are a later batch. */
    preferredTimeWindow: text('preferred_time_window').notNull(),
    status: astrologerBookingStatusEnum('status').notNull().default('requested'),
    /** Snapshot of what was actually charged (astrologers.ratePaisePerSession at request time) — protects the historical record if the astrologer's rate later changes. */
    pricePaisePaid: integer('price_paise_paid').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** The customer's message to the astrologer at booking time. */
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdx: index('astrologer_bookings_user_id_idx').on(table.userId),
    astrologerIdx: index('astrologer_bookings_astrologer_id_idx').on(table.astrologerId),
  }),
);

export type AstrologerBookingRow = typeof astrologerBookings.$inferSelect;
export type NewAstrologerBookingRow = typeof astrologerBookings.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`

Expected: a new migration file, a new `src/db/migrations/meta/<n>_snapshot.json`, and an updated `meta/_journal.json` entry.

Open the generated `.sql` file and confirm it contains ONLY:

- `CREATE TYPE "public"."astrologer_booking_status" AS ENUM(...)` with exactly the 6 values above
- `CREATE TABLE "astrologers" (...)` with its 12 columns
- `CREATE TABLE "astrologer_bookings" (...)` with its 13 columns
- 4 FK constraints: `astrologers_user_id_users_id_fk` (ON DELETE set null), `astrologer_bookings_user_id_users_id_fk` (ON DELETE cascade), `astrologer_bookings_astrologer_id_astrologers_id_fk` (ON DELETE restrict/no action), `astrologer_bookings_birth_profile_id_birth_profiles_id_fk` (ON DELETE cascade)
- 3 indexes: `astrologers_verified_active_idx`, `astrologer_bookings_user_id_idx`, `astrologer_bookings_astrologer_id_idx`

If it contains ANY other `CREATE TABLE`/`ALTER TABLE`/`CREATE TYPE` statement for a table other than these two, STOP and report BLOCKED — do not hand-trim it; this would indicate a snapshot-drift bug, not something to patch around.

- [ ] **Step 3: Write the failing repo test**

Create `test/astrologers-repo.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: {
      select: state.select,
      insert: state.insert,
      update: state.update,
      transaction: state.transaction,
    },
    sqlClient,
  };
});

import {
  completeBooking,
  confirmBooking,
  findAstrologerById,
  findOwnedBooking,
  insertAstrologer,
  listBookableAstrologers,
  listBookingsForUser,
  refundBooking,
  requestAstrologerBooking,
  updateAstrologer,
} from '../src/modules/astrologers/astrologers.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
  state.update.mockReset();
  state.transaction.mockReset();
});

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  limit: (n: number) => Promise<unknown[]>;
  orderBy: (col: unknown) => Promise<unknown[]>;
}

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    limit: vi.fn(() => Promise.resolve(result)),
    orderBy: vi.fn(() => Promise.resolve(result)),
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

function makeInsertChain(result: unknown[]) {
  const calls: { values?: unknown } = {};
  const chain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

describe('listBookableAstrologers', () => {
  it('filters on verified = true AND active = true', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listBookableAstrologers();

    const query = compile(calls.where);
    expect(query.sql).toBe('("astrologers"."verified" = $1 and "astrologers"."active" = $2)');
    expect(query.params).toEqual([true, true]);
  });
});

describe('findAstrologerById', () => {
  it('filters on id', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'astro-1' }]);
    state.select.mockReturnValue(chain);

    const row = await findAstrologerById('astro-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"astrologers"."id" = $1');
    expect(query.params).toEqual(['astro-1']);
    expect(row).toEqual({ id: 'astro-1' });
  });
});

describe('insertAstrologer / updateAstrologer', () => {
  it('inserts and returns the new row', async () => {
    const { chain, calls } = makeInsertChain([{ id: 'astro-1', displayName: 'Guru Ji' }]);
    state.insert.mockReturnValue(chain);

    const row = await insertAstrologer({
      userId: null,
      displayName: 'Guru Ji',
      ratePaisePerSession: 50000,
    } as never);

    expect(calls.values).toMatchObject({ displayName: 'Guru Ji' });
    expect(row).toEqual({ id: 'astro-1', displayName: 'Guru Ji' });
  });

  it('updates by id and stamps updatedAt', async () => {
    const { chain, calls } = makeUpdateChain([{ id: 'astro-1', verified: true }]);
    state.update.mockReturnValue(chain);

    const row = await updateAstrologer('astro-1', { verified: true });

    expect(calls.set).toMatchObject({ verified: true });
    expect((calls.set as { updatedAt: Date }).updatedAt).toBeInstanceOf(Date);
    const query = compile(calls.where);
    expect(query.sql).toBe('"astrologers"."id" = $1');
    expect(query.params).toEqual(['astro-1']);
    expect(row).toEqual({ id: 'astro-1', verified: true });
  });
});

describe('requestAstrologerBooking — atomic debit + booking creation', () => {
  function makeTx(opts: {
    astrologer: unknown[];
    walletUpdateResult: unknown[];
    bookingInsertResult: unknown[];
  }) {
    const astrologerSelect = makeSelectChain(opts.astrologer);
    const walletUpdate = makeUpdateChain(opts.walletUpdateResult);
    const ledgerInsert = { values: vi.fn(() => Promise.resolve(undefined)) };
    const bookingInsert = makeInsertChain(opts.bookingInsertResult);

    let insertCallCount = 0;
    const tx = {
      select: vi.fn(() => astrologerSelect.chain),
      update: vi.fn(() => walletUpdate.chain),
      insert: vi.fn(() => {
        insertCallCount++;
        return insertCallCount === 1 ? ledgerInsert : bookingInsert.chain;
      }),
    };
    return { tx, astrologerSelect, walletUpdate, ledgerInsert, bookingInsert };
  }

  it("returns 'not_bookable' without charging when the astrologer doesn't exist", async () => {
    const { tx } = makeTx({ astrologer: [], walletUpdateResult: [], bookingInsertResult: [] });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await requestAstrologerBooking('user-1', 'astro-1', null, 'evenings', null);

    expect(result).toBe('not_bookable');
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns 'not_bookable' without charging when the astrologer is not verified", async () => {
    const { tx } = makeTx({
      astrologer: [{ ratePaisePerSession: 50000, verified: false, active: true }],
      walletUpdateResult: [],
      bookingInsertResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await requestAstrologerBooking('user-1', 'astro-1', null, 'evenings', null);

    expect(result).toBe('not_bookable');
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns 'not_bookable' without charging when the astrologer is not active", async () => {
    const { tx } = makeTx({
      astrologer: [{ ratePaisePerSession: 50000, verified: true, active: false }],
      walletUpdateResult: [],
      bookingInsertResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await requestAstrologerBooking('user-1', 'astro-1', null, 'evenings', null);

    expect(result).toBe('not_bookable');
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("returns 'insufficient_balance' without inserting a booking when the wallet balance is too low", async () => {
    const { tx } = makeTx({
      astrologer: [{ ratePaisePerSession: 50000, verified: true, active: true }],
      walletUpdateResult: [],
      bookingInsertResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await requestAstrologerBooking('user-1', 'astro-1', null, 'evenings', null);

    expect(result).toBe('insufficient_balance');
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('debits the wallet at the astrologer CURRENT rate, writes a ledger row, and returns the new requested booking', async () => {
    const { tx, ledgerInsert, bookingInsert, walletUpdate } = makeTx({
      astrologer: [{ ratePaisePerSession: 75000, verified: true, active: true }],
      walletUpdateResult: [{ walletBalancePaise: 25000 }],
      bookingInsertResult: [{ id: 'booking-1', status: 'requested', pricePaisePaid: 75000 }],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await requestAstrologerBooking(
      'user-1',
      'astro-1',
      'profile-a',
      'weekday evenings IST',
      'Please focus on career',
    );

    expect(result).toMatchObject({ id: 'booking-1', status: 'requested', pricePaisePaid: 75000 });
    expect(ledgerInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', delta: -75000, balanceAfter: 25000 }),
    );
    expect(bookingInsert.calls.values).toMatchObject({
      userId: 'user-1',
      astrologerId: 'astro-1',
      birthProfileId: 'profile-a',
      preferredTimeWindow: 'weekday evenings IST',
      status: 'requested',
      pricePaisePaid: 75000,
      notes: 'Please focus on career',
    });

    const walletQuery = compile(walletUpdate.calls.where);
    expect(walletQuery.sql).toBe('("users"."id" = $1 and "users"."wallet_balance_paise" >= $2)');
    expect(walletQuery.params).toEqual(['user-1', 75000]);
  });
});

describe('refundBooking — atomic CAS + wallet credit (a genuinely new primitive)', () => {
  function makeTx(opts: { bookingCasResult: unknown[]; walletCreditResult: unknown[] }) {
    const bookingUpdate = makeUpdateChain(opts.bookingCasResult);
    const walletUpdate = makeUpdateChain(opts.walletCreditResult);
    const ledgerInsert = { values: vi.fn(() => Promise.resolve(undefined)) };

    let updateCallCount = 0;
    const tx = {
      update: vi.fn(() => {
        updateCallCount++;
        return updateCallCount === 1 ? bookingUpdate.chain : walletUpdate.chain;
      }),
      insert: vi.fn(() => ledgerInsert),
    };
    return { tx, bookingUpdate, walletUpdate, ledgerInsert };
  }

  it('returns undefined without touching the wallet when the booking is not "requested" (CAS miss)', async () => {
    const { tx, walletUpdate, ledgerInsert } = makeTx({
      bookingCasResult: [],
      walletCreditResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await refundBooking('booking-1', 'user-1');

    expect(result).toBeUndefined();
    expect(walletUpdate.chain.set).not.toHaveBeenCalled();
    expect(ledgerInsert.values).not.toHaveBeenCalled();
  });

  it('scopes the CAS to (id, userId, status=requested) — ownership + state fence in one WHERE', async () => {
    const { tx, bookingUpdate } = makeTx({ bookingCasResult: [], walletCreditResult: [] });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    await refundBooking('booking-1', 'user-1');

    const query = compile(bookingUpdate.calls.where);
    expect(query.sql).toBe(
      '("astrologer_bookings"."id" = $1 and "astrologer_bookings"."user_id" = $2 and "astrologer_bookings"."status" = $3)',
    );
    expect(query.params).toEqual(['booking-1', 'user-1', 'requested']);
    expect(bookingUpdate.calls.set).toMatchObject({ status: 'refunded' });
  });

  it('credits the wallet the EXACT original price and writes a ledger row with the negated delta, on a CAS hit', async () => {
    const { tx, walletUpdate, ledgerInsert } = makeTx({
      bookingCasResult: [
        { id: 'booking-1', userId: 'user-1', status: 'refunded', pricePaisePaid: 75000 },
      ],
      walletCreditResult: [{ walletBalancePaise: 175000 }],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await refundBooking('booking-1', 'user-1');

    expect(result).toMatchObject({ id: 'booking-1', status: 'refunded', pricePaisePaid: 75000 });
    const walletQuery = compile(walletUpdate.calls.where);
    expect(walletQuery.sql).toBe('"users"."id" = $1');
    expect(walletQuery.params).toEqual(['user-1']);
    expect(ledgerInsert.values).toHaveBeenCalledWith({
      userId: 'user-1',
      delta: 75000,
      reason: 'astrologer_booking_refund:booking-1',
      balanceAfter: 175000,
    });
  });

  it('throws (never silently swallows) if the wallet credit UPDATE somehow matches no user row after a CAS hit', async () => {
    const { tx } = makeTx({
      bookingCasResult: [{ id: 'booking-1', userId: 'user-1', pricePaisePaid: 75000 }],
      walletCreditResult: [],
    });
    state.transaction.mockImplementationOnce((cb: (tx: unknown) => unknown) => cb(tx));

    await expect(refundBooking('booking-1', 'user-1')).rejects.toThrow(
      'refundBooking: user user-1 not found mid-transaction',
    );
  });
});

describe('confirmBooking / completeBooking', () => {
  it('confirmBooking scopes to status=requested and sets confirmedAt', async () => {
    const { chain, calls } = makeUpdateChain([{ id: 'booking-1', status: 'confirmed' }]);
    state.update.mockReturnValue(chain);

    const row = await confirmBooking('booking-1');

    expect((calls.set as { confirmedAt: Date }).confirmedAt).toBeInstanceOf(Date);
    expect(calls.set).toMatchObject({ status: 'confirmed' });
    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("astrologer_bookings"."id" = $1 and "astrologer_bookings"."status" = $2)',
    );
    expect(query.params).toEqual(['booking-1', 'requested']);
    expect(row).toEqual({ id: 'booking-1', status: 'confirmed' });
  });

  it('confirmBooking returns undefined when the booking is not currently requested', async () => {
    const { chain } = makeUpdateChain([]);
    state.update.mockReturnValue(chain);

    const row = await confirmBooking('booking-1');

    expect(row).toBeUndefined();
  });

  it('completeBooking scopes to status=confirmed and sets completedAt', async () => {
    const { chain, calls } = makeUpdateChain([{ id: 'booking-1', status: 'completed' }]);
    state.update.mockReturnValue(chain);

    const row = await completeBooking('booking-1');

    expect((calls.set as { completedAt: Date }).completedAt).toBeInstanceOf(Date);
    const query = compile(calls.where);
    expect(query.params).toEqual(['booking-1', 'confirmed']);
    expect(row).toEqual({ id: 'booking-1', status: 'completed' });
  });
});

describe('listBookingsForUser / findOwnedBooking', () => {
  it('listBookingsForUser filters on userId', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listBookingsForUser('user-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"astrologer_bookings"."user_id" = $1');
    expect(query.params).toEqual(['user-1']);
  });

  it('findOwnedBooking filters on (id, userId)', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'booking-1', userId: 'user-1' }]);
    state.select.mockReturnValue(chain);

    const row = await findOwnedBooking('booking-1', 'user-1');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("astrologer_bookings"."id" = $1 and "astrologer_bookings"."user_id" = $2)',
    );
    expect(query.params).toEqual(['booking-1', 'user-1']);
    expect(row).toEqual({ id: 'booking-1', userId: 'user-1' });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test test/astrologers-repo.spec.ts`
Expected: FAIL — `src/modules/astrologers/astrologers.repo.js` does not exist yet.

- [ ] **Step 5: Implement `src/modules/astrologers/astrologers.repo.ts`**

```ts
// =============================================================================
// Astrologers module repo — Batch 1 (foundation): admin-curated astrologer
// profiles + scheduled-callback booking requests, wallet-only payment, no
// live video/chat delivery mechanism yet (see astrologers.service.ts's file
// header for the full list of what's deferred to a later batch).
//
// requestAstrologerBooking() mirrors the atomic debit-then-insert transaction
// pattern from prime-reports.repo.ts#unlockPrimeReport (balance-guarded
// UPDATE + walletTransactions ledger insert + row insert, all in one Drizzle
// transaction) — EXCEPT bookings are repeatable (a customer can book the
// same astrologer more than once), so there is no "already exists" dedupe
// check and no unique-violation race to catch on the final INSERT.
//
// refundBooking() is a genuinely NEW primitive — prime_reports has no refund
// path at all (unlocked reports never refund). It is race-safe via a
// compare-and-swap on the booking's own status column (the UPDATE's
// `WHERE status = 'requested'` IS the fence — see its own doc comment).
// =============================================================================

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  astrologerBookings,
  astrologers,
  users,
  walletTransactions,
  type AstrologerBookingRow,
  type AstrologerRow,
  type NewAstrologerRow,
} from '../../db/schema.js';

export async function listBookableAstrologers(): Promise<AstrologerRow[]> {
  return db
    .select()
    .from(astrologers)
    .where(and(eq(astrologers.verified, true), eq(astrologers.active, true)))
    .orderBy(desc(astrologers.createdAt));
}

export async function findAstrologerById(id: string): Promise<AstrologerRow | undefined> {
  const rows = await db.select().from(astrologers).where(eq(astrologers.id, id)).limit(1);
  return rows[0];
}

export async function insertAstrologer(patch: NewAstrologerRow): Promise<AstrologerRow> {
  const [row] = await db.insert(astrologers).values(patch).returning();
  return row!;
}

const ASTROLOGER_UPDATABLE_FIELDS = [
  'displayName',
  'bio',
  'specialties',
  'languages',
  'photoUrl',
  'ratePaisePerSession',
  'verified',
  'active',
] as const;

export type AstrologerUpdatePatch = Partial<
  Pick<NewAstrologerRow, (typeof ASTROLOGER_UPDATABLE_FIELDS)[number]>
>;

export async function updateAstrologer(
  id: string,
  patch: AstrologerUpdatePatch,
): Promise<AstrologerRow | undefined> {
  const [row] = await db
    .update(astrologers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(astrologers.id, id))
    .returning();
  return row;
}

/**
 * Atomically debits the customer's wallet AND creates the booking row (status
 * 'requested') in one transaction — mirrors unlockPrimeReport's pattern.
 * Re-reads the astrologer's CURRENT rate/verified/active state inside the
 * transaction (both to snapshot the exact price charged and to guard
 * against booking an astrologer an admin just deactivated) rather than
 * trusting a value resolved earlier by the caller.
 *
 * Returns:
 * - the new booking row on success
 * - 'not_bookable' if the astrologer doesn't exist, isn't verified, or isn't active
 * - 'insufficient_balance' if the wallet balance guard on the UPDATE fails
 *   (same `WHERE walletBalancePaise >= price` guard as unlockPrimeReport —
 *   Postgres row-level locking on that UPDATE is what makes this safe against
 *   two concurrent booking requests double-spending the same balance).
 */
export async function requestAstrologerBooking(
  userId: string,
  astrologerId: string,
  birthProfileId: string | null,
  preferredTimeWindow: string,
  notes: string | null,
): Promise<AstrologerBookingRow | 'not_bookable' | 'insufficient_balance'> {
  return db.transaction(async (tx) => {
    const [astrologer] = await tx
      .select({
        ratePaisePerSession: astrologers.ratePaisePerSession,
        verified: astrologers.verified,
        active: astrologers.active,
      })
      .from(astrologers)
      .where(eq(astrologers.id, astrologerId))
      .limit(1);
    if (!astrologer || !astrologer.verified || !astrologer.active) return 'not_bookable';

    const price = astrologer.ratePaisePerSession;

    const [charged] = await tx
      .update(users)
      .set({ walletBalancePaise: sql`${users.walletBalancePaise} - ${price}` })
      .where(and(eq(users.id, userId), gte(users.walletBalancePaise, price)))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!charged) return 'insufficient_balance';

    await tx.insert(walletTransactions).values({
      userId,
      delta: -price,
      reason: `astrologer_booking_request:${astrologerId}`,
      balanceAfter: charged.walletBalancePaise,
    });

    const [row] = await tx
      .insert(astrologerBookings)
      .values({
        userId,
        astrologerId,
        birthProfileId,
        preferredTimeWindow,
        status: 'requested',
        pricePaisePaid: price,
        notes,
      })
      .returning();
    return row!;
  });
}

/**
 * Cancels a REQUESTED booking and credits the customer's wallet back the
 * exact amount originally charged, recording a matching wallet_transactions
 * ledger row (delta = +pricePaisePaid — the exact negative of the original
 * debit's delta). A genuinely NEW primitive: prime_reports has no refund
 * path (unlocked reports never refund).
 *
 * Only callable while status is 'requested' — confirmed/completed bookings
 * do NOT auto-refund in this batch (known limitation, see
 * astrologers.service.ts's file header).
 *
 * Race-safe via a compare-and-swap on the booking row itself, NOT a
 * claim-token: the `WHERE status = 'requested'` clause on the booking
 * UPDATE IS the fence. Two concurrent cancel calls for the same booking
 * both enter this function, but Postgres serializes their row-level
 * UPDATEs on that row — only the first to commit actually flips the row to
 * 'refunded' and gets a `.returning()` row back; the second's UPDATE
 * matches zero rows (status is no longer 'requested' by the time its
 * UPDATE runs) and this function returns `undefined` for it WITHOUT
 * crediting the wallet a second time — the wallet credit + ledger insert
 * only run after the CAS above already succeeded, so a losing/no-op call
 * never touches the wallet at all.
 */
export async function refundBooking(
  bookingId: string,
  userId: string,
): Promise<AstrologerBookingRow | undefined> {
  return db.transaction(async (tx) => {
    const [cancelled] = await tx
      .update(astrologerBookings)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(
        and(
          eq(astrologerBookings.id, bookingId),
          eq(astrologerBookings.userId, userId),
          eq(astrologerBookings.status, 'requested'),
        ),
      )
      .returning();
    if (!cancelled) return undefined;

    const [credited] = await tx
      .update(users)
      .set({ walletBalancePaise: sql`${users.walletBalancePaise} + ${cancelled.pricePaisePaid}` })
      .where(eq(users.id, userId))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    // astrologer_bookings.user_id is NOT NULL and FKs to users.id ON DELETE
    // CASCADE, so if the booking row above matched, its owning user row is
    // guaranteed to still exist — this branch is unreachable in practice,
    // guarded defensively rather than silently swallowed.
    if (!credited) {
      throw new Error(`refundBooking: user ${userId} not found mid-transaction`);
    }

    await tx.insert(walletTransactions).values({
      userId,
      delta: cancelled.pricePaisePaid,
      reason: `astrologer_booking_refund:${bookingId}`,
      balanceAfter: credited.walletBalancePaise,
    });

    return cancelled;
  });
}

/** Admin manually confirms a REQUESTED booking on the astrologer's behalf (no astrologer self-service portal in this batch). Scoped by current status so an already-confirmed/completed/cancelled/refunded/declined booking can't be re-confirmed. */
export async function confirmBooking(bookingId: string): Promise<AstrologerBookingRow | undefined> {
  const [row] = await db
    .update(astrologerBookings)
    .set({ status: 'confirmed', confirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(astrologerBookings.id, bookingId), eq(astrologerBookings.status, 'requested')))
    .returning();
  return row;
}

/** Admin manually marks a CONFIRMED booking complete — the acknowledgment that the off-platform consultation happened, since there is no automated call-completion signal without live telephony/video infra. Scoped by current status, same reasoning as confirmBooking. */
export async function completeBooking(
  bookingId: string,
): Promise<AstrologerBookingRow | undefined> {
  const [row] = await db
    .update(astrologerBookings)
    .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(astrologerBookings.id, bookingId), eq(astrologerBookings.status, 'confirmed')))
    .returning();
  return row;
}

export async function listBookingsForUser(userId: string): Promise<AstrologerBookingRow[]> {
  return db
    .select()
    .from(astrologerBookings)
    .where(eq(astrologerBookings.userId, userId))
    .orderBy(desc(astrologerBookings.createdAt));
}

export async function findOwnedBooking(
  bookingId: string,
  userId: string,
): Promise<AstrologerBookingRow | undefined> {
  const rows = await db
    .select()
    .from(astrologerBookings)
    .where(and(eq(astrologerBookings.id, bookingId), eq(astrologerBookings.userId, userId)))
    .limit(1);
  return rows[0];
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test test/astrologers-repo.spec.ts`
Expected: PASS (all cases).

Note: these are mocked-`db` unit tests (this codebase has no live-Postgres integration suite). They prove the exact WHERE-clause fence and the ledger math are correct; the actual cross-transaction serialization guarantee comes from Postgres's row-level locking on `UPDATE`, which is standard behavior, not something a mocked-driver test can exercise directly — the same limitation applies to `prime-reports.repo.ts`'s analogous tests.

- [ ] **Step 7: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/db/migrations/ src/modules/astrologers/astrologers.repo.ts test/astrologers-repo.spec.ts
git commit -m "feat(astrologers): add astrologers/astrologer_bookings schema + repo layer"
```

---

### Task 3: `astrologers.schemas.ts` + `astrologers.service.ts`

**Why:** Zod/OpenAPI schemas for the request/response shapes, plus the service layer: DTO mapping, the `createBooking`/`cancelBooking` business logic (which decides 404 vs 409 outcomes), admin CRUD wrappers, and `notifyBookingStatus` — a fire-and-forget push notification following the exact `notifyPurchasePlanReady` convention in `purchase-plan.service.ts`.

**Files:**

- Create: `src/modules/astrologers/astrologers.schemas.ts`
- Create: `src/modules/astrologers/astrologers.service.ts`
- Create: `test/astrologers-service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/astrologers-service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AstrologerBookingRow, AstrologerRow } from '../src/db/schema.js';
import { makeProfileContext } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  findAstrologerById: vi.fn(),
  requestAstrologerBooking: vi.fn(),
  findOwnedBooking: vi.fn(),
  refundBooking: vi.fn(),
  confirmBooking: vi.fn(),
  completeBooking: vi.fn(),
  insertAstrologer: vi.fn(),
  updateAstrologer: vi.fn(),
  listBookableAstrologers: vi.fn(),
  listBookingsForUser: vi.fn(),
  findActiveTokensForUser: vi.fn(),
  sendPushBatch: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/modules/astrologers/astrologers.repo.js', () => ({
  findAstrologerById: state.findAstrologerById,
  requestAstrologerBooking: state.requestAstrologerBooking,
  findOwnedBooking: state.findOwnedBooking,
  refundBooking: state.refundBooking,
  confirmBooking: state.confirmBooking,
  completeBooking: state.completeBooking,
  insertAstrologer: state.insertAstrologer,
  updateAstrologer: state.updateAstrologer,
  listBookableAstrologers: state.listBookableAstrologers,
  listBookingsForUser: state.listBookingsForUser,
}));

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  findActiveTokensForUser: state.findActiveTokensForUser,
}));

vi.mock('../src/lib/notifications/fcm.js', () => ({
  sendPushBatch: state.sendPushBatch,
}));

const {
  createBooking,
  cancelBooking,
  adminCreateAstrologer,
  adminUpdateAstrologer,
  adminConfirmBooking,
  adminCompleteBooking,
  notifyBookingStatus,
  toAstrologerDto,
  toBookingDto,
} = await import('../src/modules/astrologers/astrologers.service.js');

function makeAstrologerRow(overrides: Partial<AstrologerRow> = {}): AstrologerRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'astro-1',
    userId: null,
    displayName: 'Guru Ji',
    bio: null,
    specialties: ['career'],
    languages: ['en'],
    photoUrl: null,
    ratePaisePerSession: 50000,
    verified: true,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeBookingRow(overrides: Partial<AstrologerBookingRow> = {}): AstrologerBookingRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'booking-1',
    userId: 'user-1',
    astrologerId: 'astro-1',
    birthProfileId: null,
    preferredTimeWindow: 'weekday evenings IST',
    status: 'requested',
    pricePaisePaid: 50000,
    requestedAt: now,
    confirmedAt: null,
    completedAt: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(state).forEach((fn) => fn.mockReset());
});

describe('createBooking', () => {
  it("returns 'astrologer_not_found' without attempting a debit when the astrologer doesn't exist", async () => {
    state.findAstrologerById.mockResolvedValueOnce(undefined);

    const result = await createBooking('user-1', 'astro-1', makeProfileContext(), {
      preferredTimeWindow: 'evenings',
    });

    expect(result).toEqual({ outcome: 'astrologer_not_found' });
    expect(state.requestAstrologerBooking).not.toHaveBeenCalled();
  });

  it("bundles 'not_bookable' and 'insufficient_balance' into one conflict outcome", async () => {
    state.findAstrologerById.mockResolvedValueOnce(makeAstrologerRow());
    state.requestAstrologerBooking.mockResolvedValueOnce('insufficient_balance');

    const result = await createBooking('user-1', 'astro-1', makeProfileContext(), {
      preferredTimeWindow: 'evenings',
    });

    expect(result).toEqual({ outcome: 'not_bookable_or_insufficient_balance' });
  });

  it('passes the resolved profile birthProfileId through, defaulting notes to null', async () => {
    state.findAstrologerById.mockResolvedValueOnce(makeAstrologerRow());
    const booking = makeBookingRow();
    state.requestAstrologerBooking.mockResolvedValueOnce(booking);

    const result = await createBooking(
      'user-1',
      'astro-1',
      makeProfileContext({ birthProfileId: 'profile-a' }),
      { preferredTimeWindow: 'weekday evenings IST' },
    );

    expect(state.requestAstrologerBooking).toHaveBeenCalledWith(
      'user-1',
      'astro-1',
      'profile-a',
      'weekday evenings IST',
      null,
    );
    expect(result).toEqual({ outcome: 'created', booking });
  });
});

describe('cancelBooking', () => {
  it("returns 'not_found' when the booking doesn't belong to this user", async () => {
    state.findOwnedBooking.mockResolvedValueOnce(undefined);

    const result = await cancelBooking('astro-1', 'booking-1', 'user-1');

    expect(result).toEqual({ outcome: 'not_found' });
    expect(state.refundBooking).not.toHaveBeenCalled();
  });

  it("returns 'not_found' when the booking belongs to a DIFFERENT astrologer than the URL's :id", async () => {
    state.findOwnedBooking.mockResolvedValueOnce(makeBookingRow({ astrologerId: 'astro-OTHER' }));

    const result = await cancelBooking('astro-1', 'booking-1', 'user-1');

    expect(result).toEqual({ outcome: 'not_found' });
    expect(state.refundBooking).not.toHaveBeenCalled();
  });

  it("returns 'not_cancellable' without calling refundBooking when already confirmed", async () => {
    state.findOwnedBooking.mockResolvedValueOnce(makeBookingRow({ status: 'confirmed' }));

    const result = await cancelBooking('astro-1', 'booking-1', 'user-1');

    expect(result).toEqual({ outcome: 'not_cancellable' });
    expect(state.refundBooking).not.toHaveBeenCalled();
  });

  it("returns 'not_cancellable' when refundBooking loses the CAS race despite the pre-check seeing 'requested'", async () => {
    state.findOwnedBooking.mockResolvedValueOnce(makeBookingRow({ status: 'requested' }));
    state.refundBooking.mockResolvedValueOnce(undefined);

    const result = await cancelBooking('astro-1', 'booking-1', 'user-1');

    expect(result).toEqual({ outcome: 'not_cancellable' });
  });

  it('refunds, fires a notification, and returns the updated booking on success', async () => {
    state.findOwnedBooking.mockResolvedValueOnce(makeBookingRow({ status: 'requested' }));
    const refunded = makeBookingRow({ status: 'refunded' });
    state.refundBooking.mockResolvedValueOnce(refunded);
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    const result = await cancelBooking('astro-1', 'booking-1', 'user-1');

    expect(result).toEqual({ outcome: 'refunded', booking: refunded });
    expect(state.refundBooking).toHaveBeenCalledWith('booking-1', 'user-1');
  });
});

describe('adminCreateAstrologer', () => {
  it('defaults optional fields (specialties/languages to [], verified to false, active to true)', async () => {
    state.insertAstrologer.mockResolvedValueOnce(makeAstrologerRow());

    await adminCreateAstrologer({ displayName: 'Guru Ji', ratePaisePerSession: 50000 });

    expect(state.insertAstrologer).toHaveBeenCalledWith({
      userId: null,
      displayName: 'Guru Ji',
      bio: null,
      specialties: [],
      languages: [],
      photoUrl: null,
      ratePaisePerSession: 50000,
      verified: false,
      active: true,
    });
  });
});

describe('adminUpdateAstrologer', () => {
  it('throws NOT_FOUND when the astrologer id does not exist', async () => {
    state.updateAstrologer.mockResolvedValueOnce(undefined);

    await expect(adminUpdateAstrologer('astro-1', { verified: true })).rejects.toThrow(
      'Astrologer not found',
    );
  });

  it('only forwards defined fields to the repo patch', async () => {
    state.updateAstrologer.mockResolvedValueOnce(makeAstrologerRow({ verified: true }));

    await adminUpdateAstrologer('astro-1', { verified: true });

    expect(state.updateAstrologer).toHaveBeenCalledWith('astro-1', { verified: true });
  });
});

describe('adminConfirmBooking / adminCompleteBooking', () => {
  it('adminConfirmBooking throws CONFLICT when the booking is not requested', async () => {
    state.confirmBooking.mockResolvedValueOnce(undefined);

    await expect(adminConfirmBooking('booking-1')).rejects.toThrow(
      'Booking is not in a confirmable state (must be "requested")',
    );
  });

  it('adminConfirmBooking notifies the customer and returns the row on success', async () => {
    const confirmed = makeBookingRow({ status: 'confirmed', confirmedAt: new Date() });
    state.confirmBooking.mockResolvedValueOnce(confirmed);
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    const row = await adminConfirmBooking('booking-1');

    expect(row).toEqual(confirmed);
  });

  it('adminCompleteBooking throws CONFLICT when the booking is not confirmed', async () => {
    state.completeBooking.mockResolvedValueOnce(undefined);

    await expect(adminCompleteBooking('booking-1')).rejects.toThrow(
      'Booking is not in a completable state (must be "confirmed")',
    );
  });
});

describe('notifyBookingStatus', () => {
  it('sends a push with status-specific copy to all active tokens', async () => {
    state.findActiveTokensForUser.mockResolvedValueOnce([{ token: 'tok-abc' }]);

    await notifyBookingStatus('user-1', 'booking-1', 'confirmed');

    expect(state.sendPushBatch).toHaveBeenCalledWith(
      ['tok-abc'],
      expect.any(String),
      expect.any(String),
      {
        type: 'astrologer_booking_status',
        bookingId: 'booking-1',
        status: 'confirmed',
        navigate: '/astrologers/bookings',
      },
    );
  });

  it('sends nothing when the user has no active tokens', async () => {
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    await notifyBookingStatus('user-1', 'booking-1', 'completed');

    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });

  it('never throws even when sendPushBatch rejects', async () => {
    state.findActiveTokensForUser.mockResolvedValueOnce([{ token: 'tok-abc' }]);
    state.sendPushBatch.mockRejectedValueOnce(new Error('FCM down'));

    await expect(notifyBookingStatus('user-1', 'booking-1', 'refunded')).resolves.toBeUndefined();
  });
});

describe('toAstrologerDto / toBookingDto', () => {
  it('formats Date fields as ISO strings and passes through nullable fields as-is', () => {
    const dto = toAstrologerDto(makeAstrologerRow());
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.bio).toBeNull();
  });

  it('formats unset confirmedAt/completedAt as null', () => {
    const dto = toBookingDto(makeBookingRow());
    expect(dto.confirmedAt).toBeNull();
    expect(dto.completedAt).toBeNull();
    expect(dto.requestedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/astrologers-service.spec.ts`
Expected: FAIL — `src/modules/astrologers/astrologers.schemas.js` / `astrologers.service.js` do not exist yet.

- [ ] **Step 3: Implement `src/modules/astrologers/astrologers.schemas.ts`**

```ts
import { z } from '@hono/zod-openapi';

export const AstrologerSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string(),
    bio: z.string().nullable(),
    specialties: z.array(z.string()),
    languages: z.array(z.string()),
    photoUrl: z.string().nullable(),
    ratePaisePerSession: z.number().int(),
    verified: z.boolean(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Astrologer');

export type AstrologerDto = z.infer<typeof AstrologerSchema>;

export const AstrologerBookingStatusSchema = z
  .enum(['requested', 'confirmed', 'completed', 'declined', 'cancelled', 'refunded'])
  .openapi('AstrologerBookingStatus');

export const AstrologerBookingSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    astrologerId: z.string().uuid(),
    birthProfileId: z.string().uuid().nullable(),
    preferredTimeWindow: z.string(),
    status: AstrologerBookingStatusSchema,
    pricePaisePaid: z.number().int(),
    requestedAt: z.string(),
    confirmedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('AstrologerBooking');

export type AstrologerBookingDto = z.infer<typeof AstrologerBookingSchema>;

export const AstrologerIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' }, example: 'a1b2c3d4-...' }),
});

export const CancelBookingParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' }, example: 'a1b2c3d4-...' }),
  bookingId: z
    .string()
    .uuid()
    .openapi({ param: { name: 'bookingId', in: 'path' }, example: 'b1c2d3e4-...' }),
});

export const BookingIdParamSchema = z.object({
  bookingId: z
    .string()
    .uuid()
    .openapi({ param: { name: 'bookingId', in: 'path' }, example: 'b1c2d3e4-...' }),
});

export const CreateBookingBodySchema = z
  .object({
    preferredTimeWindow: z.string().min(1).max(200),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .openapi('CreateAstrologerBookingBody');

export type CreateBookingBody = z.infer<typeof CreateBookingBodySchema>;

export const CreateAstrologerBodySchema = z
  .object({
    userId: z.string().uuid().optional(),
    displayName: z.string().min(1).max(120),
    bio: z.string().max(4000).optional(),
    specialties: z.array(z.string().min(1).max(60)).max(20).optional(),
    languages: z.array(z.string().min(1).max(60)).max(20).optional(),
    photoUrl: z.string().url().max(2048).optional(),
    ratePaisePerSession: z.number().int().positive(),
    verified: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .openapi('CreateAstrologerBody');

export type CreateAstrologerBody = z.infer<typeof CreateAstrologerBodySchema>;

export const UpdateAstrologerBodySchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    bio: z.string().max(4000).optional(),
    specialties: z.array(z.string().min(1).max(60)).max(20).optional(),
    languages: z.array(z.string().min(1).max(60)).max(20).optional(),
    photoUrl: z.string().url().max(2048).optional(),
    ratePaisePerSession: z.number().int().positive().optional(),
    verified: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .openapi('UpdateAstrologerBody');

export type UpdateAstrologerBody = z.infer<typeof UpdateAstrologerBodySchema>;
```

- [ ] **Step 4: Implement `src/modules/astrologers/astrologers.service.ts`**

```ts
// =============================================================================
// Astrologers module service — Batch 1 (FOUNDATION): astrologer profiles +
// admin-curated roster + scheduled-callback booking request/confirm/complete,
// wallet-only payment (no astrologer payout automation).
//
// Explicitly deferred to a later batch (do not build here):
//   - Live video/audio/chat delivery of any kind. This batch only gets the
//     booking mechanics working end-to-end with a manual "admin marks it
//     done" completion step (adminCompleteBooking) — the actual consultation
//     happens by whatever off-platform means (e.g. a phone call the
//     astrologer makes directly), same as the old apps/api CRM-tool
//     astrologers already did.
//   - Astrologer self-onboarding (no signup/claim route — profiles are
//     admin-created only, see adminCreateAstrologer).
//   - Real-time availability/calendar slots — v1 uses a free-text
//     `preferredTimeWindow`, not bookable time slots.
//   - Astrologer payouts — a known gap; ops handles this manually outside
//     the app for now.
//   - Ratings/reviews.
//   - Auto-refund once a booking is confirmed/completed — refundBooking()
//     (astrologers.repo.ts) is only ever invoked while status is still
//     'requested'; a customer who wants to cancel an already-confirmed
//     session has no in-app path in this batch (known limitation).
// =============================================================================

import type { AstrologerBookingRow, AstrologerRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import { findActiveTokensForUser } from '../device-tokens/device-tokens.repo.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';
import {
  confirmBooking,
  completeBooking,
  findAstrologerById,
  findOwnedBooking,
  insertAstrologer,
  listBookableAstrologers,
  listBookingsForUser,
  refundBooking,
  requestAstrologerBooking,
  updateAstrologer,
  type AstrologerUpdatePatch,
} from './astrologers.repo.js';
import type {
  AstrologerBookingDto,
  AstrologerDto,
  CreateAstrologerBody,
  CreateBookingBody,
  UpdateAstrologerBody,
} from './astrologers.schemas.js';

export function toAstrologerDto(row: AstrologerRow): AstrologerDto {
  return {
    id: row.id,
    displayName: row.displayName,
    bio: row.bio,
    specialties: row.specialties,
    languages: row.languages,
    photoUrl: row.photoUrl,
    ratePaisePerSession: row.ratePaisePerSession,
    verified: row.verified,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toBookingDto(row: AstrologerBookingRow): AstrologerBookingDto {
  return {
    id: row.id,
    userId: row.userId,
    astrologerId: row.astrologerId,
    birthProfileId: row.birthProfileId,
    preferredTimeWindow: row.preferredTimeWindow,
    status: row.status,
    pricePaisePaid: row.pricePaisePaid,
    requestedAt: row.requestedAt.toISOString(),
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDirectory(): Promise<AstrologerRow[]> {
  return listBookableAstrologers();
}

export async function listMyBookings(userId: string): Promise<AstrologerBookingRow[]> {
  return listBookingsForUser(userId);
}

export type CreateBookingResult =
  | { outcome: 'created'; booking: AstrologerBookingRow }
  | { outcome: 'astrologer_not_found' }
  | { outcome: 'not_bookable_or_insufficient_balance' };

/**
 * Debits the customer's wallet upfront and creates the booking in
 * 'requested' status — mirrors how prime-reports charges upfront on unlock.
 * Looks the astrologer up first (a plain read, outside the debit
 * transaction) purely to tell "no such astrologer" (404) apart from "exists
 * but isn't bookable, or the wallet balance is too low" (409) — both of
 * those latter cases collapse into ONE outcome bucket here, same as
 * prime-reports.service.ts#unlockReport bundles "already unlocked" and
 * "insufficient balance" into one 409. There is a benign TOCTOU window
 * between this lookup and the repo transaction's own re-check — that's
 * fine, since the repo transaction re-validates verified/active/price
 * atomically anyway (see requestAstrologerBooking's doc comment); this
 * lookup exists only to pick the right HTTP status, not to guard the charge.
 */
export async function createBooking(
  userId: string,
  astrologerId: string,
  profile: ProfileContext,
  body: CreateBookingBody,
): Promise<CreateBookingResult> {
  const astrologer = await findAstrologerById(astrologerId);
  if (!astrologer) return { outcome: 'astrologer_not_found' };

  const result = await requestAstrologerBooking(
    userId,
    astrologerId,
    profile.birthProfileId,
    body.preferredTimeWindow,
    body.notes ?? null,
  );
  if (result === 'not_bookable' || result === 'insufficient_balance') {
    return { outcome: 'not_bookable_or_insufficient_balance' };
  }
  return { outcome: 'created', booking: result };
}

export type CancelBookingResult =
  | { outcome: 'refunded'; booking: AstrologerBookingRow }
  | { outcome: 'not_found' }
  | { outcome: 'not_cancellable' };

/**
 * Customer-initiated cancel. Pre-checks ownership + astrologer match +
 * current status (via findOwnedBooking) so the route can tell "no such
 * booking / not yours / wrong astrologer in the URL" (404) apart from
 * "exists but isn't in a cancellable state" (409) — the atomic
 * refundBooking() call itself only distinguishes success/failure, not WHY
 * it failed, so this pre-check is what supplies the 404 vs 409 split. A
 * benign race (status changes between the pre-check and the CAS inside
 * refundBooking) still resolves safely to 'not_cancellable' — see
 * refundBooking's own doc comment for why that's race-safe.
 */
export async function cancelBooking(
  astrologerId: string,
  bookingId: string,
  userId: string,
): Promise<CancelBookingResult> {
  const existing = await findOwnedBooking(bookingId, userId);
  if (!existing || existing.astrologerId !== astrologerId) return { outcome: 'not_found' };
  if (existing.status !== 'requested') return { outcome: 'not_cancellable' };

  const refunded = await refundBooking(bookingId, userId);
  if (!refunded) return { outcome: 'not_cancellable' };

  void notifyBookingStatus(userId, bookingId, 'refunded').catch(() => {
    /* already logged inside notifyBookingStatus */
  });
  return { outcome: 'refunded', booking: refunded };
}

export async function adminCreateAstrologer(body: CreateAstrologerBody): Promise<AstrologerRow> {
  return insertAstrologer({
    userId: body.userId ?? null,
    displayName: body.displayName,
    bio: body.bio ?? null,
    specialties: body.specialties ?? [],
    languages: body.languages ?? [],
    photoUrl: body.photoUrl ?? null,
    ratePaisePerSession: body.ratePaisePerSession,
    verified: body.verified ?? false,
    active: body.active ?? true,
  });
}

const ADMIN_UPDATE_FIELDS = [
  'displayName',
  'bio',
  'specialties',
  'languages',
  'photoUrl',
  'ratePaisePerSession',
  'verified',
  'active',
] as const;

function buildAstrologerPatch(body: UpdateAstrologerBody): AstrologerUpdatePatch {
  const out: AstrologerUpdatePatch = {};
  for (const key of ADMIN_UPDATE_FIELDS) {
    const value = (body as Record<string, unknown>)[key];
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/** userId is deliberately NOT patchable here — the linked account (if any) is set at creation time only in this batch. */
export async function adminUpdateAstrologer(
  id: string,
  body: UpdateAstrologerBody,
): Promise<AstrologerRow> {
  const row = await updateAstrologer(id, buildAstrologerPatch(body));
  if (!row) throw Errors.notFound('Astrologer not found');
  return row;
}

/** Admin manually confirms a REQUESTED booking on the astrologer's behalf — see this file's header for why (no astrologer self-service portal in this batch). */
export async function adminConfirmBooking(bookingId: string): Promise<AstrologerBookingRow> {
  const row = await confirmBooking(bookingId);
  if (!row) throw Errors.conflict('Booking is not in a confirmable state (must be "requested")');
  void notifyBookingStatus(row.userId, row.id, 'confirmed').catch(() => {
    /* already logged inside notifyBookingStatus */
  });
  return row;
}

/** Admin manually marks a CONFIRMED booking complete — the acknowledgment that the off-platform consultation happened (see this file's header — no automated call-completion signal without live telephony/video infra). */
export async function adminCompleteBooking(bookingId: string): Promise<AstrologerBookingRow> {
  const row = await completeBooking(bookingId);
  if (!row) throw Errors.conflict('Booking is not in a completable state (must be "confirmed")');
  void notifyBookingStatus(row.userId, row.id, 'completed').catch(() => {
    /* already logged inside notifyBookingStatus */
  });
  return row;
}

type BookingNotificationStatus = 'confirmed' | 'completed' | 'refunded';

const NOTIFICATION_COPY: Record<BookingNotificationStatus, { title: string; body: string }> = {
  confirmed: {
    title: '🔮 Your astrologer session is confirmed',
    body: 'Your astrologer has confirmed your booking — they will reach out to you at your preferred time.',
  },
  completed: {
    title: '✅ Your astrologer session is complete',
    body: 'Your consultation has been marked complete. We hope it was helpful!',
  },
  refunded: {
    title: '💰 Your booking was refunded',
    body: 'Your astrologer booking was cancelled and the amount has been credited back to your Aroha wallet.',
  },
};

/**
 * Best-effort push notification on a booking status transition. Follows the
 * same fire-and-forget, never-throws contract as `notifyPurchasePlanReady`
 * in purchase-plan.service.ts. Exported so it can be unit-tested in
 * isolation.
 */
export async function notifyBookingStatus(
  userId: string,
  bookingId: string,
  status: BookingNotificationStatus,
): Promise<void> {
  try {
    const tokens = await findActiveTokensForUser(userId);
    if (tokens.length === 0) return;
    const copy = NOTIFICATION_COPY[status];
    await sendPushBatch(
      tokens.map((t) => t.token),
      copy.title,
      copy.body,
      {
        type: 'astrologer_booking_status',
        bookingId,
        status,
        navigate: '/astrologers/bookings',
      },
    );
    logger.info({ userId, bookingId, status }, 'astrologer-booking:push sent');
  } catch (err) {
    logger.warn({ err, userId, bookingId, status }, 'astrologer-booking:push failed');
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test test/astrologers-service.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/astrologers/astrologers.schemas.ts src/modules/astrologers/astrologers.service.ts test/astrologers-service.spec.ts
git commit -m "feat(astrologers): add schemas + service layer (booking/cancel logic, notifications)"
```

---

### Task 4: `astrologers.routes.ts` + mount in `app.ts`

**Why:** Wires the routes per the spec — public directory, customer booking/cancel/history, and admin create/update/confirm/complete — following `.openapi()`/`createRoute`/`errorResponse` conventions from `prime-reports.routes.ts`.

**Files:**

- Create: `src/modules/astrologers/astrologers.routes.ts`
- Modify: `src/app.ts`
- Create: `test/astrologers-routes.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/astrologers-routes.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeProfileContext, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  listDirectory: vi.fn(),
  createBooking: vi.fn(),
  cancelBooking: vi.fn(),
  listMyBookings: vi.fn(),
  adminCreateAstrologer: vi.fn(),
  adminUpdateAstrologer: vi.fn(),
  adminConfirmBooking: vi.fn(),
  adminCompleteBooking: vi.fn(),
  toAstrologerDto: vi.fn(),
  toBookingDto: vi.fn(),
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

vi.mock('../src/modules/astrologers/astrologers.service.js', () => ({
  listDirectory: state.listDirectory,
  createBooking: state.createBooking,
  cancelBooking: state.cancelBooking,
  listMyBookings: state.listMyBookings,
  adminCreateAstrologer: state.adminCreateAstrologer,
  adminUpdateAstrologer: state.adminUpdateAstrologer,
  adminConfirmBooking: state.adminConfirmBooking,
  adminCompleteBooking: state.adminCompleteBooking,
  toAstrologerDto: state.toAstrologerDto,
  toBookingDto: state.toBookingDto,
}));

process.env.ASTROLOGER_ADMIN_EMAILS = 'admin@aroha.app';

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token', 'Content-Type': 'application/json' } as const;

const ASTROLOGER_DTO = {
  id: 'astro-1',
  displayName: 'Guru Ji',
  bio: null,
  specialties: ['career'],
  languages: ['en'],
  photoUrl: null,
  ratePaisePerSession: 50000,
  verified: true,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const BOOKING_DTO = {
  id: 'booking-1',
  userId: 'id-1',
  astrologerId: 'astro-1',
  birthProfileId: null,
  preferredTimeWindow: 'weekday evenings IST',
  status: 'requested',
  pricePaisePaid: 50000,
  requestedAt: '2026-01-01T00:00:00.000Z',
  confirmedAt: null,
  completedAt: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.resolveActiveProfileContext.mockReset().mockResolvedValue(makeProfileContext());
  state.listDirectory.mockReset();
  state.createBooking.mockReset();
  state.cancelBooking.mockReset();
  state.listMyBookings.mockReset();
  state.adminCreateAstrologer.mockReset();
  state.adminUpdateAstrologer.mockReset();
  state.adminConfirmBooking.mockReset();
  state.adminCompleteBooking.mockReset();
  state.toAstrologerDto.mockReset().mockReturnValue(ASTROLOGER_DTO);
  state.toBookingDto.mockReset().mockReturnValue(BOOKING_DTO);
});

describe('GET /v1/astrologers', () => {
  it('200s with the mapped directory', async () => {
    state.listDirectory.mockResolvedValueOnce([{ id: 'astro-1' }]);

    const res = await createApp().request('/v1/astrologers', { headers: AUTH });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([ASTROLOGER_DTO]);
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/astrologers');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/astrologers/:id/book', () => {
  function book(body: unknown) {
    return createApp().request('/v1/astrologers/astro-1/book', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(body),
    });
  }

  it('201s with the created booking', async () => {
    state.createBooking.mockResolvedValueOnce({ outcome: 'created', booking: { id: 'booking-1' } });

    const res = await book({ preferredTimeWindow: 'weekday evenings IST' });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(BOOKING_DTO);
    expect(state.createBooking).toHaveBeenCalledWith(
      'id-1',
      'astro-1',
      expect.objectContaining({ birthProfileId: null }),
      { preferredTimeWindow: 'weekday evenings IST' },
    );
  });

  it('404s when the astrologer does not exist', async () => {
    state.createBooking.mockResolvedValueOnce({ outcome: 'astrologer_not_found' });

    const res = await book({ preferredTimeWindow: 'evenings' });

    expect(res.status).toBe(404);
  });

  it('409s when the astrologer is not bookable or the wallet balance is insufficient', async () => {
    state.createBooking.mockResolvedValueOnce({ outcome: 'not_bookable_or_insufficient_balance' });

    const res = await book({ preferredTimeWindow: 'evenings' });

    expect(res.status).toBe(409);
  });

  it('422s when preferredTimeWindow is missing', async () => {
    const res = await book({});
    expect(res.status).toBe(422);
    expect(state.createBooking).not.toHaveBeenCalled();
  });
});

describe('POST /v1/astrologers/:id/bookings/:bookingId/cancel', () => {
  function cancel() {
    return createApp().request('/v1/astrologers/astro-1/bookings/booking-1/cancel', {
      method: 'POST',
      headers: AUTH,
    });
  }

  it('200s with the refunded booking', async () => {
    state.cancelBooking.mockResolvedValueOnce({
      outcome: 'refunded',
      booking: { id: 'booking-1', status: 'refunded' },
    });

    const res = await cancel();

    expect(res.status).toBe(200);
    expect(state.cancelBooking).toHaveBeenCalledWith('astro-1', 'booking-1', 'id-1');
  });

  it('404s when the booking is not found (or not owned)', async () => {
    state.cancelBooking.mockResolvedValueOnce({ outcome: 'not_found' });

    const res = await cancel();

    expect(res.status).toBe(404);
  });

  it('409s when the booking is not in a cancellable state', async () => {
    state.cancelBooking.mockResolvedValueOnce({ outcome: 'not_cancellable' });

    const res = await cancel();

    expect(res.status).toBe(409);
  });
});

describe('GET /v1/astrologers/bookings/me', () => {
  it("200s with the caller's own booking history — and is not shadowed by the /astrologers/{id}/... routes", async () => {
    state.listMyBookings.mockResolvedValueOnce([{ id: 'booking-1' }]);

    const res = await createApp().request('/v1/astrologers/bookings/me', { headers: AUTH });

    expect(res.status).toBe(200);
    expect(state.listMyBookings).toHaveBeenCalledWith('id-1');
    expect(await res.json()).toEqual([BOOKING_DTO]);
  });
});

describe('POST /v1/admin/astrologers', () => {
  it('201s for an allowlisted admin', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', email: 'admin@aroha.app' }),
    );
    state.adminCreateAstrologer.mockResolvedValueOnce({ id: 'astro-1' });

    const res = await createApp().request('/v1/admin/astrologers', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ displayName: 'Guru Ji', ratePaisePerSession: 50000 }),
    });

    expect(res.status).toBe(201);
  });

  it('403s for a non-admin user', async () => {
    const res = await createApp().request('/v1/admin/astrologers', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ displayName: 'Guru Ji', ratePaisePerSession: 50000 }),
    });

    expect(res.status).toBe(403);
    expect(state.adminCreateAstrologer).not.toHaveBeenCalled();
  });
});

describe('PATCH /v1/admin/astrologers/:id', () => {
  it('200s for an allowlisted admin', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', email: 'admin@aroha.app' }),
    );
    state.adminUpdateAstrologer.mockResolvedValueOnce({ id: 'astro-1', verified: true });

    const res = await createApp().request('/v1/admin/astrologers/astro-1', {
      method: 'PATCH',
      headers: AUTH,
      body: JSON.stringify({ verified: true }),
    });

    expect(res.status).toBe(200);
    expect(state.adminUpdateAstrologer).toHaveBeenCalledWith('astro-1', { verified: true });
  });
});

describe('POST /v1/admin/astrologers/bookings/:bookingId/confirm', () => {
  it('200s for an allowlisted admin', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', email: 'admin@aroha.app' }),
    );
    state.adminConfirmBooking.mockResolvedValueOnce({ id: 'booking-1', status: 'confirmed' });

    const res = await createApp().request('/v1/admin/astrologers/bookings/booking-1/confirm', {
      method: 'POST',
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect(state.adminConfirmBooking).toHaveBeenCalledWith('booking-1');
  });
});

describe('POST /v1/admin/astrologers/bookings/:bookingId/complete', () => {
  it('200s for an allowlisted admin', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', email: 'admin@aroha.app' }),
    );
    state.adminCompleteBooking.mockResolvedValueOnce({ id: 'booking-1', status: 'completed' });

    const res = await createApp().request('/v1/admin/astrologers/bookings/booking-1/complete', {
      method: 'POST',
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect(state.adminCompleteBooking).toHaveBeenCalledWith('booking-1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/astrologers-routes.spec.ts`
Expected: FAIL — `src/modules/astrologers/astrologers.routes.js` does not exist yet, and `astrologersRouter` is not mounted.

- [ ] **Step 3: Implement `src/modules/astrologers/astrologers.routes.ts`**

Import `requireAdmin` from wherever it actually ended up per the collision note in "Before you start" (`../../middleware/require-admin.js` if Task 1 was run, or the existing shared location if reused):

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/require-admin.js'; // or wherever the shared one lives — see "Before you start"
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import {
  adminCompleteBooking,
  adminConfirmBooking,
  adminCreateAstrologer,
  adminUpdateAstrologer,
  cancelBooking,
  createBooking,
  listDirectory,
  listMyBookings,
  toAstrologerDto,
  toBookingDto,
} from './astrologers.service.js';
import {
  AstrologerBookingSchema,
  AstrologerIdParamSchema,
  AstrologerSchema,
  BookingIdParamSchema,
  CancelBookingParamSchema,
  CreateAstrologerBodySchema,
  CreateBookingBodySchema,
  UpdateAstrologerBodySchema,
} from './astrologers.schemas.js';

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

export const astrologersRouter = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Customer-facing routes
// ---------------------------------------------------------------------------

const listRoute = createRoute({
  method: 'get',
  path: '/astrologers',
  tags: ['Astrologers'],
  summary: 'Browse the verified, active astrologer directory',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Astrologer directory',
      content: { 'application/json': { schema: z.array(AstrologerSchema) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

astrologersRouter.openapi(listRoute, async (c) => {
  const rows = await listDirectory();
  return c.json(rows.map(toAstrologerDto), 200);
});

const bookRoute = createRoute({
  method: 'post',
  path: '/astrologers/{id}/book',
  tags: ['Astrologers'],
  summary: 'Request a scheduled-callback booking with an astrologer (wallet debited upfront)',
  description:
    'No live video/chat delivery exists yet — the astrologer follows up off-platform ' +
    '(e.g. a direct phone call) once an admin confirms the booking.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    params: AstrologerIdParamSchema,
    body: { required: true, content: { 'application/json': { schema: CreateBookingBodySchema } } },
  },
  responses: {
    201: {
      description: 'Booking requested',
      content: { 'application/json': { schema: AstrologerBookingSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Astrologer not found'),
    409: errorResponse('Astrologer is not bookable, or wallet balance is insufficient'),
    422: errorResponse('Validation failed'),
  },
});

astrologersRouter.openapi(bookRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const profile = await resolveActiveProfileContext(user);

  const result = await createBooking(user.id, id, profile, body);
  if (result.outcome === 'astrologer_not_found') {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Astrologer not found' } }, 404);
  }
  if (result.outcome === 'not_bookable_or_insufficient_balance') {
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message: 'Astrologer is not bookable, or wallet balance is insufficient.',
        },
      },
      409,
    );
  }
  return c.json(toBookingDto(result.booking), 201);
});

const cancelRoute = createRoute({
  method: 'post',
  path: '/astrologers/{id}/bookings/{bookingId}/cancel',
  tags: ['Astrologers'],
  summary: 'Cancel a REQUESTED (not yet confirmed) booking and refund the wallet',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: { params: CancelBookingParamSchema },
  responses: {
    200: {
      description: 'Booking cancelled and refunded',
      content: { 'application/json': { schema: AstrologerBookingSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Booking not found'),
    409: errorResponse('Booking is not in a cancellable state (must be "requested")'),
  },
});

astrologersRouter.openapi(cancelRoute, async (c) => {
  const user = c.get('user');
  const { id, bookingId } = c.req.valid('param');
  const result = await cancelBooking(id, bookingId, user.id);
  if (result.outcome === 'not_found') {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }
  if (result.outcome === 'not_cancellable') {
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message: 'Booking is not in a cancellable state (must be "requested").',
        },
      },
      409,
    );
  }
  return c.json(toBookingDto(result.booking), 200);
});

// Registered alongside the /astrologers/{id}/... routes above — Hono's
// router matches this literal path over param routes at the same segment
// position regardless of declaration order (static segments always win
// over param segments in Hono's trie router), so `GET /astrologers/bookings/me`
// can never be shadowed by, e.g., a hypothetical future `GET /astrologers/{id}`.
// Covered explicitly by a routes test (see test/astrologers-routes.spec.ts).
const myBookingsRoute = createRoute({
  method: 'get',
  path: '/astrologers/bookings/me',
  tags: ['Astrologers'],
  summary: "The caller's own astrologer-booking history",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Booking history',
      content: { 'application/json': { schema: z.array(AstrologerBookingSchema) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

astrologersRouter.openapi(myBookingsRoute, async (c) => {
  const user = c.get('user');
  const rows = await listMyBookings(user.id);
  return c.json(rows.map(toBookingDto), 200);
});

// ---------------------------------------------------------------------------
// Admin-only routes (requireAdmin — admin-curated roster, no self-onboarding
// or astrologer self-service portal in this batch)
// ---------------------------------------------------------------------------

const adminCreateRoute = createRoute({
  method: 'post',
  path: '/admin/astrologers',
  tags: ['Astrologers Admin'],
  summary: 'Create an astrologer profile (admin-curated roster — no self-onboarding in this batch)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAdmin] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateAstrologerBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Astrologer profile created',
      content: { 'application/json': { schema: AstrologerSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    422: errorResponse('Validation failed'),
  },
});

astrologersRouter.openapi(adminCreateRoute, async (c) => {
  const body = c.req.valid('json');
  const row = await adminCreateAstrologer(body);
  return c.json(toAstrologerDto(row), 201);
});

const adminUpdateRoute = createRoute({
  method: 'patch',
  path: '/admin/astrologers/{id}',
  tags: ['Astrologers Admin'],
  summary: 'Update an astrologer profile (e.g. toggle verified/active)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAdmin] as const,
  request: {
    params: AstrologerIdParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: UpdateAstrologerBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'The updated astrologer profile',
      content: { 'application/json': { schema: AstrologerSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('Astrologer not found'),
    422: errorResponse('Validation failed'),
  },
});

astrologersRouter.openapi(adminUpdateRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const row = await adminUpdateAstrologer(id, body);
  return c.json(toAstrologerDto(row), 200);
});

const adminConfirmRoute = createRoute({
  method: 'post',
  path: '/admin/astrologers/bookings/{bookingId}/confirm',
  tags: ['Astrologers Admin'],
  summary:
    "Admin manually confirms a REQUESTED booking on the astrologer's behalf (no astrologer self-service portal in this batch)",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAdmin] as const,
  request: { params: BookingIdParamSchema },
  responses: {
    200: {
      description: 'Booking confirmed',
      content: { 'application/json': { schema: AstrologerBookingSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    409: errorResponse('Booking is not in a confirmable state (must be "requested")'),
  },
});

astrologersRouter.openapi(adminConfirmRoute, async (c) => {
  const { bookingId } = c.req.valid('param');
  const row = await adminConfirmBooking(bookingId);
  return c.json(toBookingDto(row), 200);
});

const adminCompleteRoute = createRoute({
  method: 'post',
  path: '/admin/astrologers/bookings/{bookingId}/complete',
  tags: ['Astrologers Admin'],
  summary:
    'Admin manually marks a CONFIRMED booking complete — the acknowledgment that the off-platform consultation happened (no automated call-completion signal without live telephony/video infra)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAdmin] as const,
  request: { params: BookingIdParamSchema },
  responses: {
    200: {
      description: 'Booking completed',
      content: { 'application/json': { schema: AstrologerBookingSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    409: errorResponse('Booking is not in a completable state (must be "confirmed")'),
  },
});

astrologersRouter.openapi(adminCompleteRoute, async (c) => {
  const { bookingId } = c.req.valid('param');
  const row = await adminCompleteBooking(bookingId);
  return c.json(toBookingDto(row), 200);
});
```

- [ ] **Step 4: Mount the router in `src/app.ts`**

Add the import alongside the other module routers:

```ts
import { astrologersRouter } from './modules/astrologers/astrologers.routes.js';
```

Add the mount call after `app.route('/v1', palmPhotoRouter);` and before the `/internal` mounts:

```ts
app.route('/v1', palmPhotoRouter);
app.route('/v1', astrologersRouter);
// Mounted OUTSIDE /v1: ...
app.route('/internal', cronRouter);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test test/astrologers-routes.spec.ts`
Expected: PASS (all cases, including the `GET /v1/astrologers/bookings/me` case proving no route-shadowing by `/astrologers/{id}/...`).

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this batch's new tests), no new typecheck errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/astrologers/astrologers.routes.ts src/app.ts test/astrologers-routes.spec.ts
git commit -m "feat(astrologers): add routes (directory, booking, admin roster/confirm/complete)"
```

---

### Task 5: Final controller review (not a subagent task)

The controller (not a dispatched subagent) reviews the full diff holistically for:

- [ ] `pnpm test && pnpm typecheck && pnpm lint` all clean — same pre-existing failures, zero new typecheck/lint errors.
- [ ] `refundBooking()`'s CAS fence (`WHERE id = ? AND userId = ? AND status = 'requested'`) is the ONLY gate on the wallet credit — re-read `astrologers.repo.ts` once more to confirm the wallet `UPDATE` and `walletTransactions` insert are unreachable unless that CAS `.returning()` produced a row.
- [ ] `requestAstrologerBooking()` re-reads `verified`/`active`/`ratePaisePerSession` INSIDE the transaction (never trusts a value resolved by the service layer beforehand) — confirm `astrologers.service.ts#createBooking`'s pre-check is documented as existing ONLY to pick 404 vs 409, not as a financial guard.
- [ ] Every status transition (`requested → confirmed`, `confirmed → completed`, `requested → refunded`) is scoped by the CURRENT status in its `WHERE` clause — confirm none of `confirmBooking`/`completeBooking`/`refundBooking` can resurrect a `declined`/`cancelled`/`refunded` booking.
- [ ] `requireAdmin` fails closed (empty/unset allowlist, or a user missing the identifying field, both reject) and is chained AFTER `requireUser` on every admin route (`middleware: [requireUser, requireAdmin] as const`).
- [ ] Confirm which `requireAdmin` actually got used per the collision note in "Before you start" — if this plan's own Task 1 was skipped in favor of an existing one, confirm `astrologers.routes.ts`'s import path was updated accordingly and that `ASTROLOGER_ADMIN_EMAILS` was NOT introduced as a third redundant allowlist.
- [ ] The deferred-scope list (live delivery, self-onboarding, calendar slots, payouts, ratings/reviews, auto-refund-after-confirm) is stated in `astrologers.service.ts`'s file header AND in this plan document's "Before you start" section — confirm nothing in the implementation silently tries to half-build any of those.
- [ ] No placeholders, no `TODO`s, no stub functions anywhere in the diff.
- [ ] `git log --oneline` on this branch shows the commits from Tasks 1–4 in order, each with a passing test suite at the time it was made.

Do NOT merge to `main` — this branch is accumulating multiple batches, to be merged once at the end in a single step.

---

### Critical Files for Implementation

- `src/db/schema.ts` — the `astrologers` / `astrologer_bookings` table definitions and `astrologerBookingStatusEnum`; every other file depends on the exact shapes defined here.
- `src/modules/astrologers/astrologers.repo.ts` — contains the two atomic transactions (`requestAstrologerBooking`, `refundBooking`) that are the financial correctness core of this batch.
- `src/modules/astrologers/astrologers.service.ts` — the 404-vs-409 outcome logic for booking/cancellation and the deferred-scope documentation for the whole batch.
- `src/modules/astrologers/astrologers.routes.ts` — wires HTTP status codes to service outcomes and gates admin routes with `requireAdmin`.
- `src/middleware/require-admin.ts` — the new admin-auth primitive this batch depends on (see the collision note above — this may end up being reused/shared rather than newly created).
