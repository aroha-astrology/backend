# Astrologer Marketplace — Batch 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the foundation of a human-astrologer consultation marketplace — admin-curated astrologer profiles, a public directory, a scheduled-callback booking request/confirm/complete flow with wallet-only upfront payment, a self-serve login portal (Firebase Auth) for admin-invited astrologers, and real two-sided text chat between a customer and their assigned astrologer on a confirmed booking.

**Architecture:** Two new tables (`astrologers`, `astrologer_bookings`) follow this codebase's existing profile-scoped/wallet-ledger conventions exactly (`prime_reports`'s nullable `birthProfileId` pattern, `unlockPrimeReport`'s atomic debit-transaction pattern). A booking is requested (wallet debited upfront, same "charge on request" model as prime-reports' "charge on unlock"), then an admin manually confirms it and later marks it complete — standing in for the astrologer's own action, since there is no live-call infra in this batch. A brand-new `refundBooking()` primitive (prime-reports has no refund path at all) lets a customer cancel a still-`requested` booking and get an atomic wallet credit. Admin routes are gated by the canonical `requireAdmin` HTTP middleware (see "Before you start"). On top of the booking foundation, this plan also adds a `provider_accounts` table linking an admin-invited astrologer's Firebase login to their `astrologers` row, a self-serve `/v1/provider/*` API surface (`requireProvider`), and a shared, polymorphic `booking_messages` table + `/v1/bookings/{bookingType}/{bookingId}/messages` module (`requireUserOrProvider`) giving the customer and their assigned astrologer real text chat on a booking, with a simple server-side-polling SSE stream for near-real-time delivery — no websocket/pub-sub infra, consistent with this being a "Batch 1 foundation." The `booking_messages` table is deliberately built to also carry `pooja_bookings` chat once that table exists (Pooja Booking Batch 1, implemented right after this plan), via a `bookingType` discriminator switch that is a small, localized extension point, not a rewrite.

**Tech Stack:** Hono + `@hono/zod-openapi`, Drizzle/Postgres, Firebase Auth, Vitest (mocked-`db` unit-test style — this codebase has no live-Postgres integration test suite).

---

## Before you start

**`requireAdmin` is canonical and lives elsewhere — this plan does not define it.** Four plans share `feat/prime-reports-batch2`, and their implementation order is now fixed: **Admin Console Foundation → Shagun Affiliate Shop → Astrologer Marketplace Batch 1 (this plan) → Pooja Booking Batch 1.** By the time this plan is implemented, `requireAdmin` already exists at `src/middleware/auth.ts`, added by the Admin Console Foundation plan (`docs/superpowers/plans/2026-07-24-admin-console-foundation.md`), keyed off the `ADMIN_FIREBASE_UIDS` env var (a Firebase-UID allowlist, comma-separated, same convention as `TELEGRAM_ADMIN_CHAT_IDS`). This plan imports and reuses it directly — `import { requireAdmin } from '../../middleware/auth.js';` — no new admin-auth env var, middleware file, or test file is created by this plan. (An earlier draft of this plan independently proposed a third, email-allowlist-shaped `requireAdmin`; that has been removed. Do not reintroduce it.)

**Important shape note, verified against the real `requireAdmin` implementation:** `requireAdmin` _wraps_ `requireUser` internally (`await requireUser(c, async () => { ...admin check...; await next(); })`) rather than expecting to be chained after it. Every admin route in this plan therefore uses `middleware: [requireAdmin] as const` — **not** `[requireUser, requireAdmin]`. Chaining `requireUser` in front of it would still technically work (Firebase token verification would just run twice), but it is redundant and inconsistent with how the Admin Console Foundation plan's own admin routes call it (`middleware: [requireAdmin] as const`, verified at that plan's Task 7, `admin.routes.ts`). Match that exactly.

**Working directory:** `C:\dev\aroha-astrology\jyotish-backend\.worktrees\prime-reports-batch2` — an existing git worktree on branch `feat/prime-reports-batch2`. **Do NOT merge to `main`** — this branch is being used to accumulate multiple batches, merged once at the end in a single step. All file paths below are relative to this working directory.

**Baseline measured directly (2026-07-24), before any of this plan's work:**

- `pnpm test` → **803 passing / 9 failing** (101 of 105 test files passing, 4 files failing) — as of just before this plan's own work; this will have shifted upward once the Admin Console/Shagun plans land first — re-check `pnpm test` before Task 1 and use the real current numbers. The 9 pre-existing failures are unrelated to this plan — do not try to fix them, do not let them block your tasks:
  - `test/billing-google-play.spec.ts` (3 failures)
  - `test/health-report.spec.ts` (2 failures)
  - `test/horoscope-jargon.spec.ts` (3 failures)
  - `test/purchase-plan-notify.spec.ts` (1 failure)
- `pnpm typecheck` → **104 pre-existing errors**, none in files this plan touches. Notably `test/helpers/mocks.ts:7` already has a structural-type error (`makeUserRow`'s return object is missing some fields compared to the current `UserRow` type) — this is pre-existing drift, not something to fix here. Reusing `makeUserRow` in this plan's new test files does NOT add any NEW typecheck errors (the error is reported once, at its declaration site, not per call site).
- The next Drizzle migration number was **0033** as of this plan being drafted — confirm the actual next number by listing `src/db/migrations/` before Task 1, since it will have advanced (Admin Console Foundation alone consumes 0033) by the time this plan actually runs. This plan generates THREE migrations of its own, in task order (`astrologers`/`astrologer_bookings`, then `provider_accounts`, then `booking_messages`) — always re-list `src/db/migrations/` immediately before each `pnpm db:generate` call rather than assuming a fixed number.
- Every existing multi-middleware route in this codebase already proves the `middleware: [A, B, ...] as const` array-chaining pattern works (verified: `src/modules/astro/astro.routes.ts` uses `[requireUser, llmRateLimit, requireConsent] as const` in 5 places; `palm-photo.routes.ts` uses `[requireUser, palmPhotoUploadRateLimit] as const`) — customer-facing routes in this plan use `[requireUser] as const` (or `[requireUserOrProvider] as const` for the messaging routes) following that same pattern. Admin routes use `[requireAdmin] as const` alone — see the shape note above for why `requireUser` is NOT separately prepended there.
- `requireFirebaseToken`/`requireUser` (verified in full, `src/middleware/auth.ts`) share a private `extractBearer(header)` helper and call `getFirebaseAuth().verifyIdToken(token)` (`src/config/firebase.ts`) inside a try/catch that throws `Errors.unauthorized(...)` on any failure. `requireUser` additionally looks up `findUserByFirebaseUid(uid)` (`src/modules/users/users.repo.ts`), 401s if not found or `deletedAt !== null`, then `c.set('user', user)`. `requireProvider`/`requireUserOrProvider` (this plan, new — Task 5) reuse `extractBearer` and `getFirebaseAuth()` the same way, but do NOT call `requireUser` itself — a provider has no `users` row, so `requireUser` would always 401 it; see Task 5's doc comments for the full reasoning.
- `sendPush(deviceToken, title, body, data?): Promise<boolean>` and `sendPushBatch(tokens: string[], title, body, data?): Promise<{success, failure}>` (verified, `src/lib/notifications/fcm.ts`) both never throw — failures are swallowed and logged, matching every existing fire-and-forget push call site this plan follows.
- The chat SSE pattern this plan's messaging routes copy (`src/modules/astro/astro.routes.ts`'s `POST /chat`, verified in full) declares its `.openapi()` response as `200: { content: { 'text/event-stream': { schema: z.any() } } }`, resolves `const signal = c.req.raw.signal;` before calling `streamSSE(c, async (stream) => { ... })` (from `hono/streaming`), and checks `signal.aborted || stream.aborted` before every `await stream.writeSSE(...)` call — this plan's `GET .../messages/stream` route follows the exact same shape.
- `node:crypto`'s `randomBytes` is already imported this way elsewhere in this codebase (`src/lib/crypto/field-encryption.ts`: `import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';`) — this plan's admin-invite route imports `randomBytes` the same way, not the default-export `crypto.randomBytes(...)` style used in a couple of older files (`src/modules/users/users.repo.ts`).
- `src/types/hono.d.ts` (verified in full — the entire file) declares Hono's `ContextVariableMap` (`firebaseToken`, `user`, `activeProfileId`, `requestId`). This plan adds a `provider` entry to it (Task 5) so `c.set('provider', ...)`/`c.get('provider')` typecheck the same way `c.set('user', ...)` already does.
- `device_push_tokens.userId` (verified, `src/db/schema.ts`) is a `NOT NULL` FK to `users.id`. A `provider_accounts` row is deliberately NOT a `users` row, so there is currently no schema-level way for a provider to register a push token — `findActiveTokensForUser(provider.id)` is safe to call (a plain `SELECT ... WHERE user_id = ?`, no FK check on reads) but will always return `[]` in this batch. The best-effort provider-push attempt in `messaging.service.ts` (Task 9) is written defensively for forward-compatibility, not because it can do anything yet — see the new "guaranteed push delivery to providers" deferred bullet below.
- `pnpm db:generate` requires a reachable Postgres per your local `.env`'s `DATABASE_URL`, same as every other schema change in this repo.

**Explicitly deferred to a later batch (do not build any of this here):**

- **Provider self-registration.** Still admin-invite-only (`POST /v1/admin/astrologers/{id}/invite`) — there is no signup/claim flow for astrologers themselves in this batch.
- **Real-time availability/calendar slots.** v1 uses a free-text `preferredTimeWindow` (e.g. `"weekday evenings IST"`), not bookable time slots.
- **Astrologer payouts.** A known gap — ops handles this manually outside the app for now, same as this repo already handles other manual processes.
- **Ratings/reviews.**
- **Auto-refund once a booking is `confirmed`/`completed`.** `refundBooking()` is only ever invoked while status is still `requested` — a customer who wants out of an already-confirmed session has no in-app path in this batch.
- **Typing indicators / read receipts beyond the single `readAt` timestamp.** `booking_messages.readAt` is set in bulk by `markMessagesRead`; there is no per-message delivery/seen UI signal beyond that.
- **File/image attachments in chat.** Text-only `body` field; no upload/media pipeline in this batch.
- **Guaranteed push delivery to providers.** No dedicated provider mobile app yet — the SSE/poll stream while the portal is open is the only channel guaranteed to reach a logged-in provider; push is best-effort only, and only if they happen to have a registered device token (see the `device_push_tokens` FK note above — in practice, none will in this batch).
- **The actual provider portal frontend UI.** This plan is backend API only (`jyotish-backend`), matching every other plan in this 4-plan batch — the portal's UI is separate, later, unblocked work in the `frontend` repo.

---

## File structure

| File                                                   | Action              | Responsibility                                                                                                                                                                         |
| ------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/db/schema.ts`                                     | Modify              | Add `astrologers`/`astrologerBookings`/`astrologerBookingStatusEnum`, `providerAccounts`/`providerKindEnum`, `bookingMessages`/`bookingMessageTypeEnum`/`bookingMessageSenderRoleEnum` |
| `src/db/migrations/<next>_<generated>.sql` (+ `meta/`) | Create (generated)  | DDL for `astrologers` + `astrologer_bookings` (Task 1)                                                                                                                                 |
| `src/modules/astrologers/astrologers.repo.ts`          | Create, then Modify | DB access + the two atomic transactions (`requestAstrologerBooking`, `refundBooking`); later modified to add `listBookingsForAstrologer` (Task 6) and `findBookingById` (Task 9)       |
| `test/astrologers-repo.spec.ts`                        | Create, then Modify | Repo-layer tests (mocked `db`)                                                                                                                                                         |
| `src/modules/astrologers/astrologers.schemas.ts`       | Create, then Modify | Zod/OpenAPI request+response schemas; later modified to add `InviteAstrologerBodySchema`/`InviteAstrologerResponseSchema` (Task 7)                                                     |
| `src/modules/astrologers/astrologers.service.ts`       | Create, then Modify | DTO mapping, business logic, notifications; later modified to add `adminInviteAstrologer` (Task 7)                                                                                     |
| `test/astrologers-service.spec.ts`                     | Create, then Modify | Service-layer tests (mocked repo)                                                                                                                                                      |
| `src/modules/astrologers/astrologers.routes.ts`        | Create, then Modify | `.openapi()` routes, mounted at `/v1`; later modified to add the admin invite route (Task 7)                                                                                           |
| `src/app.ts`                                           | Modify              | Mount `astrologersRouter` (Task 3), `providerRouter` (Task 7), `messagingRouter` (Task 10)                                                                                             |
| `test/astrologers-routes.spec.ts`                      | Create, then Modify | Route-layer tests (full app, mocked service)                                                                                                                                           |
| `src/db/migrations/<next>_<generated>.sql` (+ `meta/`) | Create (generated)  | DDL for `provider_accounts` (Task 4)                                                                                                                                                   |
| `src/modules/providers/provider-accounts.repo.ts`      | Create              | `findProviderAccountByFirebaseUid`, `findProviderAccountByKindAndRefId`, `createProviderAccount`                                                                                       |
| `test/provider-accounts-repo.spec.ts`                  | Create              | Repo-layer tests (mocked `db`)                                                                                                                                                         |
| `src/middleware/auth.ts`                               | Modify              | Add `requireProvider`, `requireUserOrProvider` (canonical `requireAdmin` already lives here, added by the Admin Console Foundation plan)                                               |
| `src/types/hono.d.ts`                                  | Modify              | Add `provider` to `ContextVariableMap`                                                                                                                                                 |
| `test/require-provider.spec.ts`                        | Create              | Middleware unit tests                                                                                                                                                                  |
| `src/modules/providers/provider.schemas.ts`            | Create              | Zod/OpenAPI schemas for `/v1/provider/*`                                                                                                                                               |
| `src/modules/providers/provider.service.ts`            | Create              | `getProviderMe`, `listProviderBookings`                                                                                                                                                |
| `test/provider-service.spec.ts`                        | Create              | Service-layer tests (mocked repo)                                                                                                                                                      |
| `src/modules/providers/provider.routes.ts`             | Create              | `GET /v1/provider/me`, `GET /v1/provider/bookings`                                                                                                                                     |
| `test/provider-routes.spec.ts`                         | Create              | Route-layer tests (full app, mocked service)                                                                                                                                           |
| `src/db/migrations/<next>_<generated>.sql` (+ `meta/`) | Create (generated)  | DDL for `booking_messages` (Task 8)                                                                                                                                                    |
| `src/modules/messaging/messaging.repo.ts`              | Create              | `createMessage`, `listMessagesForBooking`, `markMessagesRead`                                                                                                                          |
| `test/messaging-repo.spec.ts`                          | Create              | Repo-layer tests (mocked `db`)                                                                                                                                                         |
| `src/modules/messaging/messaging.schemas.ts`           | Create              | Zod/OpenAPI schemas for the messaging routes                                                                                                                                           |
| `src/modules/messaging/messaging.service.ts`           | Create              | `sendMessage`, `listMessages` — authorization + push notification                                                                                                                      |
| `test/messaging-service.spec.ts`                       | Create              | Service-layer tests (mocked repo)                                                                                                                                                      |
| `src/modules/messaging/messaging.routes.ts`            | Create              | `POST`/`GET .../messages`, `GET .../messages/stream` (SSE)                                                                                                                             |
| `test/messaging-routes.spec.ts`                        | Create              | Route-layer tests (full app, mocked service)                                                                                                                                           |

---

### Task 1: `astrologers` + `astrologer_bookings` schema, migration, and repo layer

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

### Task 2: `astrologers.schemas.ts` + `astrologers.service.ts`

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

### Task 3: `astrologers.routes.ts` + mount in `app.ts`

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

// requireAdmin (src/middleware/auth.ts) is keyed off ADMIN_FIREBASE_UIDS, an
// allowlist of firebaseUid values — NOT email. The default beforeEach mock
// below resolves firebaseUid: 'uid-1', which is deliberately NOT on this
// allowlist, so every test is non-admin unless it explicitly overrides
// findUserByFirebaseUid to return firebaseUid: 'admin-uid-1'.
process.env.ADMIN_FIREBASE_UIDS = 'admin-uid-1';

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
      makeUserRow({ id: 'id-1', firebaseUid: 'admin-uid-1' }),
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
      makeUserRow({ id: 'id-1', firebaseUid: 'admin-uid-1' }),
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
      makeUserRow({ id: 'id-1', firebaseUid: 'admin-uid-1' }),
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
      makeUserRow({ id: 'id-1', firebaseUid: 'admin-uid-1' }),
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

Import both `requireUser` and the canonical `requireAdmin` from the SAME module, `src/middleware/auth.ts` — see "Before you start" for why `requireAdmin` is not re-chained after `requireUser` on admin routes (it wraps `requireUser` internally):

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin, requireUser } from '../../middleware/auth.js';
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
  middleware: [requireAdmin] as const,
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
  middleware: [requireAdmin] as const,
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
  middleware: [requireAdmin] as const,
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
  middleware: [requireAdmin] as const,
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

### Task 4: `provider_accounts` schema, migration, and repo

**Why:** The data foundation for the self-serve provider portal — a `provider_accounts` row links an admin-invited astrologer's Firebase login to their `astrologers` row, polymorphically (no DB-level FK to `astrologers`/`pandits`, validated at the service layer instead), the same reasoning `astrologer_bookings`' own optional refs already use elsewhere in this codebase.

**Files:**

- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/<next>_<generated-name>.sql` (generated, not hand-written)
- Create: `src/modules/providers/provider-accounts.repo.ts`
- Create: `test/provider-accounts-repo.spec.ts`

- [ ] **Step 1: Add the table to `src/db/schema.ts`**

Add at the end of the file, after `astrologerBookings`/`AstrologerBookingRow`/`NewAstrologerBookingRow`. All imports used below (`pgTable`, `uuid`, `text`, `timestamp`, `index`, `uniqueIndex`, `pgEnum`, `sql`) are already imported at the top of `schema.ts` — add nothing new to the import line.

```ts
/* -------------------------------------------------------------------------- */
/* provider_accounts — self-serve login for admin-invited astrologers/pandits  */
/* -------------------------------------------------------------------------- */

export const providerKindEnum = pgEnum('provider_kind', ['astrologer', 'pandit']);

/**
 * Links a Firebase-authenticated login to EITHER an `astrologers` row or a
 * (future) `pandits` row, without needing both tables to exist at once — no
 * DB-level FK to either, polymorphic-by-convention (validated at the service
 * layer), same reasoning `astrologer_bookings` already uses for its own
 * optional refs. Rows are created exclusively via the admin-invite flow
 * (POST /v1/admin/astrologers/{id}/invite, astrologers.service.ts) — there is
 * no self-registration in this batch.
 */
export const providerAccounts = pgTable(
  'provider_accounts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    kind: providerKindEnum('kind').notNull(),
    /** Points at astrologers.id or pandits.id depending on `kind`. No DB-level FK — polymorphic, validated at the service layer, same reasoning as booking_messages.bookingId below. */
    refId: uuid('ref_id').notNull(),
    firebaseUid: text('firebase_uid').notNull(),
    /** Denormalized snapshot of the astrologer/pandit's display name at invite time, so /provider/me doesn't need a join. */
    displayName: text('display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    firebaseUidUnique: uniqueIndex('provider_accounts_firebase_uid_unique').on(table.firebaseUid),
    refIdx: index('provider_accounts_ref_idx').on(table.kind, table.refId),
  }),
);

export type ProviderAccountRow = typeof providerAccounts.$inferSelect;
export type NewProviderAccountRow = typeof providerAccounts.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

Re-list `src/db/migrations/` first to confirm the actual next number (see "Before you start"), then run: `pnpm db:generate`

Expected: a new migration file, a new `src/db/migrations/meta/<n>_snapshot.json`, and an updated `meta/_journal.json` entry.

Open the generated `.sql` file and confirm it contains ONLY:

- `CREATE TYPE "public"."provider_kind" AS ENUM('astrologer', 'pandit')`
- `CREATE TABLE "provider_accounts" (...)` with its 6 columns
- 1 unique index (`provider_accounts_firebase_uid_unique`) and 1 regular index (`provider_accounts_ref_idx`)
- NO foreign key constraints (deliberately polymorphic — see the table's doc comment)

If it contains ANY other `CREATE TABLE`/`ALTER TABLE`/`CREATE TYPE` statement, STOP and report BLOCKED — do not hand-trim it.

- [ ] **Step 3: Write the failing repo test**

Create `test/provider-accounts-repo.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: { select: state.select, insert: state.insert },
    sqlClient,
  };
});

import {
  createProviderAccount,
  findProviderAccountByFirebaseUid,
  findProviderAccountByKindAndRefId,
} from '../src/modules/providers/provider-accounts.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
});

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  limit: (n: number) => Promise<unknown[]>;
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

describe('findProviderAccountByFirebaseUid', () => {
  it('filters on firebaseUid', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'provider-1', firebaseUid: 'fb-uid-1' }]);
    state.select.mockReturnValue(chain);

    const row = await findProviderAccountByFirebaseUid('fb-uid-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"provider_accounts"."firebase_uid" = $1');
    expect(query.params).toEqual(['fb-uid-1']);
    expect(row).toEqual({ id: 'provider-1', firebaseUid: 'fb-uid-1' });
  });

  it('returns undefined when no row matches', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const row = await findProviderAccountByFirebaseUid('missing-uid');

    expect(row).toBeUndefined();
  });
});

describe('findProviderAccountByKindAndRefId', () => {
  it('filters on (kind, refId)', async () => {
    const { chain, calls } = makeSelectChain([
      { id: 'provider-1', kind: 'astrologer', refId: 'astro-1' },
    ]);
    state.select.mockReturnValue(chain);

    const row = await findProviderAccountByKindAndRefId('astrologer', 'astro-1');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("provider_accounts"."kind" = $1 and "provider_accounts"."ref_id" = $2)',
    );
    expect(query.params).toEqual(['astrologer', 'astro-1']);
    expect(row).toEqual({ id: 'provider-1', kind: 'astrologer', refId: 'astro-1' });
  });
});

describe('createProviderAccount', () => {
  it('inserts and returns the new row', async () => {
    const { chain, calls } = makeInsertChain([
      {
        id: 'provider-1',
        kind: 'astrologer',
        refId: 'astro-1',
        firebaseUid: 'fb-uid-1',
        displayName: 'Guru Ji',
      },
    ]);
    state.insert.mockReturnValue(chain);

    const row = await createProviderAccount({
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-uid-1',
      displayName: 'Guru Ji',
    });

    expect(calls.values).toMatchObject({
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-uid-1',
    });
    expect(row).toMatchObject({ id: 'provider-1', displayName: 'Guru Ji' });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test test/provider-accounts-repo.spec.ts`
Expected: FAIL — `src/modules/providers/provider-accounts.repo.js` does not exist yet.

- [ ] **Step 5: Implement `src/modules/providers/provider-accounts.repo.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  providerAccounts,
  type NewProviderAccountRow,
  type ProviderAccountRow,
} from '../../db/schema.js';

export async function findProviderAccountByFirebaseUid(
  firebaseUid: string,
): Promise<ProviderAccountRow | undefined> {
  const rows = await db
    .select()
    .from(providerAccounts)
    .where(eq(providerAccounts.firebaseUid, firebaseUid))
    .limit(1);
  return rows[0];
}

export async function findProviderAccountByKindAndRefId(
  kind: 'astrologer' | 'pandit',
  refId: string,
): Promise<ProviderAccountRow | undefined> {
  const rows = await db
    .select()
    .from(providerAccounts)
    .where(and(eq(providerAccounts.kind, kind), eq(providerAccounts.refId, refId)))
    .limit(1);
  return rows[0];
}

export async function createProviderAccount(
  input: NewProviderAccountRow,
): Promise<ProviderAccountRow> {
  const [row] = await db.insert(providerAccounts).values(input).returning();
  return row!;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test test/provider-accounts-repo.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/db/migrations/ src/modules/providers/provider-accounts.repo.ts test/provider-accounts-repo.spec.ts
git commit -m "feat(providers): add provider_accounts schema + repo layer"
```

---

### Task 5: `requireProvider` / `requireUserOrProvider` middleware

**Why:** Two new auth gates for the provider portal. `requireProvider` is a parallel to `requireUser`, not a superset of it — a provider has no `users` row, so `requireUser` would always 401 a provider. `requireUserOrProvider` is for the shared messaging endpoints (reachable by a customer or their assigned provider): it tries a customer match first, then falls back to a provider match, setting exactly one of `c.var.user` / `c.var.provider`.

**Files:**

- Modify: `src/middleware/auth.ts`
- Modify: `src/types/hono.d.ts`
- Create: `test/require-provider.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/require-provider.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';
import type { ProviderAccountRow } from '../src/db/schema.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
  findProviderAccountByFirebaseUid: vi.fn(),
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

vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByFirebaseUid: state.findProviderAccountByFirebaseUid,
}));

const { requireProvider, requireUserOrProvider } = await import('../src/middleware/auth.js');
const { errorHandler } = await import('../src/middleware/error.js');

function makeProviderApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/provider-only', requireProvider, (c) => c.json({ provider: c.get('provider') }));
  return app;
}

function makeEitherApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/either', requireUserOrProvider, (c) =>
    c.json({ user: c.get('user'), provider: c.get('provider') }),
  );
  return app;
}

function makeProviderAccountRow(overrides: Partial<ProviderAccountRow> = {}): ProviderAccountRow {
  return {
    id: 'provider-1',
    kind: 'astrologer',
    refId: 'astro-1',
    firebaseUid: 'provider-uid-1',
    displayName: 'Guru Ji',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  state.verifyIdToken.mockReset();
  state.findUserByFirebaseUid.mockReset();
  state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
  state.findProviderAccountByFirebaseUid.mockReset();
});

describe('requireProvider', () => {
  it('401s with no Authorization header', async () => {
    const res = await makeProviderApp().request('/provider-only');
    expect(res.status).toBe(401);
  });

  it('401s with an invalid Firebase token', async () => {
    state.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    const res = await makeProviderApp().request('/provider-only', {
      headers: { Authorization: 'Bearer bad' },
    });
    expect(res.status).toBe(401);
  });

  it('401s when no provider_accounts row matches the token uid', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('provider-uid-1'));
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(undefined);
    const res = await makeProviderApp().request('/provider-only', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(401);
  });

  it('200s and sets c.var.provider when a matching provider account exists', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('provider-uid-1'));
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(makeProviderAccountRow());
    const res = await makeProviderApp().request('/provider-only', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider: { id: 'provider-1', kind: 'astrologer', refId: 'astro-1', displayName: 'Guru Ji' },
    });
  });
});

describe('requireUserOrProvider', () => {
  it('401s with no Authorization header', async () => {
    const res = await makeEitherApp().request('/either');
    expect(res.status).toBe(401);
  });

  it('401s with an invalid Firebase token', async () => {
    state.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    const res = await makeEitherApp().request('/either', {
      headers: { Authorization: 'Bearer bad' },
    });
    expect(res.status).toBe(401);
  });

  it('sets c.var.user (not provider) when a matching, non-deleted user exists', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('user-uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-1', firebaseUid: 'user-uid-1' }),
    );
    const res = await makeEitherApp().request('/either', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ id: 'id-1' });
    expect(body.provider).toBeUndefined();
    expect(state.findProviderAccountByFirebaseUid).not.toHaveBeenCalled();
  });

  it('falls back to c.var.provider when no user matches but a provider account does', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('provider-uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(makeProviderAccountRow());
    const res = await makeEitherApp().request('/either', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toEqual({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
    });
    expect(body.user).toBeUndefined();
  });

  it('treats a soft-deleted user as no match and falls back to the provider lookup', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('shared-uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-1', firebaseUid: 'shared-uid-1', deletedAt: new Date() }),
    );
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(makeProviderAccountRow());
    const res = await makeEitherApp().request('/either', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBeDefined();
  });

  it('401s when neither a user nor a provider account matches', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('nobody-uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(undefined);
    const res = await makeEitherApp().request('/either', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/require-provider.spec.ts`
Expected: FAIL — `requireProvider`/`requireUserOrProvider` don't exist yet in `src/middleware/auth.ts`.

- [ ] **Step 3: Add `provider` to `src/types/hono.d.ts`**

```ts
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { ProviderAccountRow, UserRow } from '../db/schema.js';

declare module 'hono' {
  interface ContextVariableMap {
    /** Decoded Firebase ID token claims (set by requireFirebaseToken). */
    firebaseToken: DecodedIdToken;
    /** The application user row matching the Firebase UID (set by requireUser). */
    user: UserRow;
    /**
     * `user.activeProfileId`, mirrored onto the context for cheap access
     * (set by requireUser — no extra query, it's already on the loaded row).
     * null = the primary/self profile; non-null = an additional profile in
     * birth_profiles. Route handlers that need the full resolved birth data
     * should call resolveActiveProfileContext(c.var.user) themselves — this
     * is just the raw pointer.
     */
    activeProfileId: string | null;
    /**
     * The authenticated provider account (set by requireProvider, or by
     * requireUserOrProvider when the caller turns out to be a provider, not
     * a customer). NOT the raw DB row — no firebaseUid/createdAt in the
     * request context, just what routes actually need.
     */
    provider: Pick<ProviderAccountRow, 'id' | 'kind' | 'refId' | 'displayName'>;
    /** Short request id, on every log line and on the X-Request-Id header. */
    requestId: string;
  }
}

export {};
```

- [ ] **Step 4: Add the two middlewares to `src/middleware/auth.ts`**

Add the import alongside the existing ones at the top of the file (by the time this task runs, `auth.ts` already has `getFirebaseAuth`, `Errors`, `findUserByFirebaseUid`/`touchUserLastActive`, `env`, and the `requireAdmin` export — all added by the Admin Console Foundation plan; this task only adds the one new import below and the two new exports at the end of the file):

```ts
import { findProviderAccountByFirebaseUid } from '../modules/providers/provider-accounts.repo.js';
```

...and, at the end of the file:

```ts
/**
 * Verifies the Firebase ID token AND looks up the matching provider_accounts
 * row (an admin-invited astrologer/pandit's login — see
 * provider-accounts.repo.ts). 401 if either step fails. The provider is
 * exposed at `c.var.provider` as a plain `{ id, kind, refId, displayName }`
 * object (not the raw DB row).
 *
 * Deliberately does NOT reuse requireUser: a provider has no `users` row, so
 * requireUser would always 401 it. This is a parallel gate, not a superset.
 */
export const requireProvider: MiddlewareHandler = async (c, next) => {
  const token = extractBearer(c.req.header('authorization'));
  if (!token) throw Errors.unauthorized('Missing or malformed Authorization header');

  let decodedUid: string;
  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    c.set('firebaseToken', decoded);
    decodedUid = decoded.uid;
  } catch {
    throw Errors.unauthorized('Invalid or expired ID token');
  }

  const account = await findProviderAccountByFirebaseUid(decodedUid);
  if (!account) {
    throw Errors.unauthorized('No provider account for this token.');
  }
  c.set('provider', {
    id: account.id,
    kind: account.kind,
    refId: account.refId,
    displayName: account.displayName,
  });

  await next();
};

/**
 * For endpoints reachable by EITHER a customer or their assigned provider —
 * the booking-messages routes (messaging.routes.ts). Verifies the token once,
 * then tries a customer match first (findUserByFirebaseUid, same
 * not-deleted check requireUser uses), falling back to a provider match
 * (findProviderAccountByFirebaseUid) if no user matches. 401 if neither
 * matches. Sets exactly ONE of `c.var.user` / `c.var.provider` — callers
 * must branch on which one is present (see messaging.routes.ts#resolveCaller).
 */
export const requireUserOrProvider: MiddlewareHandler = async (c, next) => {
  const token = extractBearer(c.req.header('authorization'));
  if (!token) throw Errors.unauthorized('Missing or malformed Authorization header');

  let decodedUid: string;
  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    c.set('firebaseToken', decoded);
    decodedUid = decoded.uid;
  } catch {
    throw Errors.unauthorized('Invalid or expired ID token');
  }

  const user = await findUserByFirebaseUid(decodedUid);
  if (user && user.deletedAt === null) {
    c.set('user', user);
    c.set('activeProfileId', user.activeProfileId);
    const isStale =
      !user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > LAST_ACTIVE_THROTTLE_MS;
    if (isStale) {
      void touchUserLastActive(user.id).catch(() => {});
    }
    await next();
    return;
  }

  const account = await findProviderAccountByFirebaseUid(decodedUid);
  if (!account) {
    throw Errors.unauthorized('No active account for this token.');
  }
  c.set('provider', {
    id: account.id,
    kind: account.kind,
    refId: account.refId,
    displayName: account.displayName,
  });

  await next();
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test test/require-provider.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 7: Commit**

```bash
git add src/middleware/auth.ts src/types/hono.d.ts test/require-provider.spec.ts
git commit -m "feat(providers): add requireProvider + requireUserOrProvider middleware"
```

---

### Task 6: `provider.schemas.ts` + `provider.service.ts`

**Why:** The service layer behind `GET /v1/provider/me` and `GET /v1/provider/bookings`. Requires one new repo query, `listBookingsForAstrologer` (mirrors `listBookingsForUser` exactly, filtered by `astrologerId` instead of `userId`), added to the existing `astrologers.repo.ts`.

**Files:**

- Modify: `src/modules/astrologers/astrologers.repo.ts`
- Modify: `test/astrologers-repo.spec.ts`
- Create: `src/modules/providers/provider.schemas.ts`
- Create: `src/modules/providers/provider.service.ts`
- Create: `test/provider-service.spec.ts`

- [ ] **Step 1: Write the failing test for `listBookingsForAstrologer`**

Add to `test/astrologers-repo.spec.ts` — add `listBookingsForAstrologer` to the existing import block at the top of the file (alongside `listBookingsForUser` etc.), then add this new `describe` block at the end of the file:

```ts
describe('listBookingsForAstrologer', () => {
  it('filters on astrologerId, newest first', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listBookingsForAstrologer('astro-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"astrologer_bookings"."astrologer_id" = $1');
    expect(query.params).toEqual(['astro-1']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/astrologers-repo.spec.ts`
Expected: FAIL — `listBookingsForAstrologer` is not exported yet.

- [ ] **Step 3: Add `listBookingsForAstrologer` to `astrologers.repo.ts`**

Add after `listBookingsForUser`:

```ts
export async function listBookingsForAstrologer(
  astrologerId: string,
): Promise<AstrologerBookingRow[]> {
  return db
    .select()
    .from(astrologerBookings)
    .where(eq(astrologerBookings.astrologerId, astrologerId))
    .orderBy(desc(astrologerBookings.createdAt));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/astrologers-repo.spec.ts`
Expected: PASS (all cases, including the new one).

- [ ] **Step 5: Write the failing test for `provider.service.ts`**

Create `test/provider-service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AstrologerBookingRow, AstrologerRow } from '../src/db/schema.js';

const state = vi.hoisted(() => ({
  findAstrologerById: vi.fn(),
  listBookingsForAstrologer: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/modules/astrologers/astrologers.repo.js', () => ({
  findAstrologerById: state.findAstrologerById,
  listBookingsForAstrologer: state.listBookingsForAstrologer,
}));

const { getProviderMe, listProviderBookings } =
  await import('../src/modules/providers/provider.service.js');

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
  state.findAstrologerById.mockReset();
  state.listBookingsForAstrologer.mockReset();
});

describe('getProviderMe', () => {
  it('inlines the full astrologer profile when kind is astrologer', async () => {
    state.findAstrologerById.mockResolvedValueOnce(makeAstrologerRow());

    const result = await getProviderMe({
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
    });

    expect(state.findAstrologerById).toHaveBeenCalledWith('astro-1');
    expect(result).toMatchObject({
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
      astrologer: expect.objectContaining({ id: 'astro-1', displayName: 'Guru Ji' }),
    });
  });

  it('returns astrologer: null when the astrologer row is somehow missing', async () => {
    state.findAstrologerById.mockResolvedValueOnce(undefined);

    const result = await getProviderMe({
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
    });

    expect(result.astrologer).toBeNull();
  });
});

describe('listProviderBookings', () => {
  it("lists the astrologer's own bookings when kind is astrologer", async () => {
    const booking = makeBookingRow();
    state.listBookingsForAstrologer.mockResolvedValueOnce([booking]);

    const result = await listProviderBookings({ kind: 'astrologer', refId: 'astro-1' });

    expect(state.listBookingsForAstrologer).toHaveBeenCalledWith('astro-1');
    expect(result).toEqual([expect.objectContaining({ id: 'booking-1', astrologerId: 'astro-1' })]);
  });

  it("returns an empty list for kind 'pandit' (no pooja_bookings repo query exists yet)", async () => {
    const result = await listProviderBookings({ kind: 'pandit', refId: 'pandit-1' });

    expect(result).toEqual([]);
    expect(state.listBookingsForAstrologer).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test test/provider-service.spec.ts`
Expected: FAIL — `src/modules/providers/provider.schemas.js` / `provider.service.js` do not exist yet.

- [ ] **Step 7: Implement `src/modules/providers/provider.schemas.ts`**

```ts
import { z } from '@hono/zod-openapi';
import { AstrologerSchema } from '../astrologers/astrologers.schemas.js';

export const ProviderKindSchema = z.enum(['astrologer', 'pandit']).openapi('ProviderKind');

export const ProviderMeSchema = z
  .object({
    kind: ProviderKindSchema,
    refId: z.string().uuid(),
    displayName: z.string(),
    /** Populated when kind === 'astrologer'; null otherwise (no pandit profile table exists yet). */
    astrologer: AstrologerSchema.nullable(),
  })
  .openapi('ProviderMe');

export type ProviderMeDto = z.infer<typeof ProviderMeSchema>;
```

- [ ] **Step 8: Implement `src/modules/providers/provider.service.ts`**

```ts
// =============================================================================
// Provider module service — Batch 1 addition: self-serve login/portal for
// admin-invited astrologers (see astrologers.service.ts#adminInviteAstrologer
// and requireProvider in src/middleware/auth.ts). `kind: 'pandit'` already
// flows through the type system (providerAccounts.kind), but there is no
// pandit profile/booking table yet — listProviderBookings below leaves an
// explicit extension point for the Pooja Booking Batch 1 plan rather than
// stubbing a fake pandit branch.
// =============================================================================

import { findAstrologerById, listBookingsForAstrologer } from '../astrologers/astrologers.repo.js';
import { toAstrologerDto, toBookingDto } from '../astrologers/astrologers.service.js';
import type { AstrologerBookingDto } from '../astrologers/astrologers.schemas.js';
import type { ProviderMeDto } from './provider.schemas.js';

export interface ProviderIdentity {
  kind: 'astrologer' | 'pandit';
  refId: string;
  displayName: string;
}

/**
 * GET /v1/provider/me. When kind === 'astrologer', also fetches and inlines
 * the full astrologer profile (astrologers.repo.ts#findAstrologerById) so the
 * portal doesn't need a second round-trip.
 */
export async function getProviderMe(provider: ProviderIdentity): Promise<ProviderMeDto> {
  const astrologer =
    provider.kind === 'astrologer' ? ((await findAstrologerById(provider.refId)) ?? null) : null;
  return {
    kind: provider.kind,
    refId: provider.refId,
    displayName: provider.displayName,
    astrologer: astrologer ? toAstrologerDto(astrologer) : null,
  };
}

/** GET /v1/provider/bookings. */
export async function listProviderBookings(
  provider: Pick<ProviderIdentity, 'kind' | 'refId'>,
): Promise<AstrologerBookingDto[]> {
  if (provider.kind === 'astrologer') {
    const rows = await listBookingsForAstrologer(provider.refId);
    return rows.map(toBookingDto);
  }
  // TODO(pooja-booking plan): add a kind === 'pandit' branch here listing
  // pooja_bookings by panditId, once that table/repo exists.
  return [];
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm test test/provider-service.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 10: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 11: Commit**

```bash
git add src/modules/astrologers/astrologers.repo.ts test/astrologers-repo.spec.ts src/modules/providers/provider.schemas.ts src/modules/providers/provider.service.ts test/provider-service.spec.ts
git commit -m "feat(providers): add provider.service.ts (GET /provider/me, /provider/bookings)"
```

---

### Task 7: `provider.routes.ts` + admin invite route + mount

**Why:** Wires the two provider-portal routes, plus the admin action that actually creates a provider login (`POST /v1/admin/astrologers/{id}/invite`, added alongside the existing admin routes in `astrologers.routes.ts`).

**Files:**

- Modify: `src/modules/astrologers/astrologers.schemas.ts`
- Modify: `src/modules/astrologers/astrologers.service.ts`
- Modify: `src/modules/astrologers/astrologers.routes.ts`
- Modify: `test/astrologers-service.spec.ts`
- Modify: `test/astrologers-routes.spec.ts`
- Create: `src/modules/providers/provider.routes.ts`
- Create: `test/provider-routes.spec.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Write the failing service-layer test for `adminInviteAstrologer`**

Add to `test/astrologers-service.spec.ts`. First, extend the existing `vi.hoisted` `state` object and the `astrologers.repo.js` mock with nothing new (invite doesn't touch the repo's booking/astrologer CRUD beyond `findAstrologerById`, already mocked). Add two new mocks and two new imports:

```ts
// Add to the existing `state = vi.hoisted(() => ({ ... }))` object:
  createUser: vi.fn(),
  findProviderAccountByKindAndRefId: vi.fn(),
  createProviderAccount: vi.fn(),

// Add two new vi.mock() calls, alongside the existing ones:
vi.mock('../src/config/firebase.js', () => ({
  getFirebaseAuth: () => ({ createUser: state.createUser }),
}));

vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByKindAndRefId: state.findProviderAccountByKindAndRefId,
  createProviderAccount: state.createProviderAccount,
}));

// Add `adminInviteAstrologer` to the existing destructured import from
// '../src/modules/astrologers/astrologers.service.js'.
```

Then add this new `describe` block:

```ts
describe('adminInviteAstrologer', () => {
  it('404s when the astrologer does not exist', async () => {
    state.findAstrologerById.mockResolvedValueOnce(undefined);

    await expect(adminInviteAstrologer('astro-1', 'guru@example.com')).rejects.toThrow(
      'Astrologer not found',
    );
    expect(state.createUser).not.toHaveBeenCalled();
  });

  it('409s when the astrologer has already been invited', async () => {
    state.findAstrologerById.mockResolvedValueOnce(makeAstrologerRow());
    state.findProviderAccountByKindAndRefId.mockResolvedValueOnce({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-1',
      displayName: 'Guru Ji',
      createdAt: new Date(),
    });

    await expect(adminInviteAstrologer('astro-1', 'guru@example.com')).rejects.toThrow(
      'Astrologer has already been invited',
    );
    expect(state.createUser).not.toHaveBeenCalled();
  });

  it('creates a Firebase user + provider_accounts row and returns the temporary credentials', async () => {
    state.findAstrologerById.mockResolvedValueOnce(makeAstrologerRow({ displayName: 'Guru Ji' }));
    state.findProviderAccountByKindAndRefId.mockResolvedValueOnce(undefined);
    state.createUser.mockResolvedValueOnce({ uid: 'fb-new-uid-1' });
    state.createProviderAccount.mockResolvedValueOnce({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-new-uid-1',
      displayName: 'Guru Ji',
      createdAt: new Date(),
    });

    const result = await adminInviteAstrologer('astro-1', 'guru@example.com');

    expect(state.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'guru@example.com' }),
    );
    expect(state.createProviderAccount).toHaveBeenCalledWith({
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-new-uid-1',
      displayName: 'Guru Ji',
    });
    expect(result.email).toBe('guru@example.com');
    expect(typeof result.temporaryPassword).toBe('string');
    expect(result.temporaryPassword.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/astrologers-service.spec.ts`
Expected: FAIL — `adminInviteAstrologer` is not exported yet.

- [ ] **Step 3: Add the invite schemas to `astrologers.schemas.ts`**

Add at the end of the file:

```ts
export const InviteAstrologerBodySchema = z
  .object({
    email: z.string().email(),
  })
  .strict()
  .openapi('InviteAstrologerBody');

export type InviteAstrologerBody = z.infer<typeof InviteAstrologerBodySchema>;

export const InviteAstrologerResponseSchema = z
  .object({
    email: z.string().email(),
    temporaryPassword: z.string(),
  })
  .openapi('InviteAstrologerResponse');

export type InviteAstrologerResponse = z.infer<typeof InviteAstrologerResponseSchema>;
```

- [ ] **Step 4: Add `adminInviteAstrologer` to `astrologers.service.ts`**

Add these imports at the top of the file, alongside the existing ones:

```ts
import { randomBytes } from 'node:crypto';
import { getFirebaseAuth } from '../../config/firebase.js';
import {
  createProviderAccount,
  findProviderAccountByKindAndRefId,
} from '../providers/provider-accounts.repo.js';
```

Add the function, after `adminUpdateAstrologer`:

```ts
/**
 * Self-serve provider portal admin-invite flow (see requireProvider,
 * src/middleware/auth.ts). Generates a one-time temporary password and
 * creates BOTH a Firebase Auth user and the linking provider_accounts row.
 * Ops relays the returned credentials to the astrologer off-platform
 * (phone/WhatsApp) — same manual-relay pattern this file's header already
 * documents for astrologer payouts; there is no in-app credential delivery
 * in this batch.
 */
export async function adminInviteAstrologer(
  astrologerId: string,
  email: string,
): Promise<InviteAstrologerResponse> {
  const astrologer = await findAstrologerById(astrologerId);
  if (!astrologer) throw Errors.notFound('Astrologer not found');

  const existing = await findProviderAccountByKindAndRefId('astrologer', astrologerId);
  if (existing) throw Errors.conflict('Astrologer has already been invited');

  const temporaryPassword = randomBytes(12).toString('base64url');
  const createdUser = await getFirebaseAuth().createUser({ email, password: temporaryPassword });

  await createProviderAccount({
    kind: 'astrologer',
    refId: astrologerId,
    firebaseUid: createdUser.uid,
    displayName: astrologer.displayName,
  });

  return { email, temporaryPassword };
}
```

Add `InviteAstrologerResponse` to the existing `import type { ... } from './astrologers.schemas.js';` block.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test test/astrologers-service.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Write the failing route-layer tests**

Add to `test/astrologers-routes.spec.ts` — add `adminInviteAstrologer: state.adminInviteAstrologer` (and `adminInviteAstrologer: vi.fn()` in the hoisted `state` object) to the `astrologers.service.js` mock and destructured import, then add:

```ts
describe('POST /v1/admin/astrologers/:id/invite', () => {
  it('200s for an allowlisted admin and returns the temporary credentials', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'admin-uid-1' }),
    );
    state.adminInviteAstrologer.mockResolvedValueOnce({
      email: 'guru@example.com',
      temporaryPassword: 'a-temp-password',
    });

    const res = await createApp().request('/v1/admin/astrologers/astro-1/invite', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ email: 'guru@example.com' }),
    });

    expect(res.status).toBe(200);
    expect(state.adminInviteAstrologer).toHaveBeenCalledWith('astro-1', 'guru@example.com');
    expect(await res.json()).toEqual({
      email: 'guru@example.com',
      temporaryPassword: 'a-temp-password',
    });
  });

  it('403s for a non-admin user', async () => {
    const res = await createApp().request('/v1/admin/astrologers/astro-1/invite', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ email: 'guru@example.com' }),
    });

    expect(res.status).toBe(403);
    expect(state.adminInviteAstrologer).not.toHaveBeenCalled();
  });
});
```

Create `test/provider-routes.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findProviderAccountByFirebaseUid: vi.fn(),
  getProviderMe: vi.fn(),
  listProviderBookings: vi.fn(),
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

vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByFirebaseUid: state.findProviderAccountByFirebaseUid,
}));

vi.mock('../src/modules/providers/provider.service.js', () => ({
  getProviderMe: state.getProviderMe,
  listProviderBookings: state.listProviderBookings,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token' } as const;

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue({ uid: 'provider-uid-1' });
  state.findProviderAccountByFirebaseUid.mockReset().mockResolvedValue({
    id: 'provider-1',
    kind: 'astrologer',
    refId: 'astro-1',
    firebaseUid: 'provider-uid-1',
    displayName: 'Guru Ji',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
  state.getProviderMe.mockReset();
  state.listProviderBookings.mockReset();
});

describe('GET /v1/provider/me', () => {
  it("200s with the caller's own identity + profile", async () => {
    state.getProviderMe.mockResolvedValueOnce({
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
      astrologer: null,
    });

    const res = await createApp().request('/v1/provider/me', { headers: AUTH });

    expect(res.status).toBe(200);
    expect(state.getProviderMe).toHaveBeenCalledWith({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
    });
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/provider/me');
    expect(res.status).toBe(401);
  });

  it('401s when no provider_accounts row matches', async () => {
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(undefined);
    const res = await createApp().request('/v1/provider/me', { headers: AUTH });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/provider/bookings', () => {
  it("200s with the caller's own booking list", async () => {
    state.listProviderBookings.mockResolvedValueOnce([{ id: 'booking-1' }]);

    const res = await createApp().request('/v1/provider/bookings', { headers: AUTH });

    expect(res.status).toBe(200);
    expect(state.listProviderBookings).toHaveBeenCalledWith({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
    });
    expect(await res.json()).toEqual([{ id: 'booking-1' }]);
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `pnpm test test/astrologers-routes.spec.ts test/provider-routes.spec.ts`
Expected: FAIL — the invite route doesn't exist yet, and `src/modules/providers/provider.routes.js` doesn't exist yet.

- [ ] **Step 8: Add the admin invite route to `astrologers.routes.ts`**

Add `InviteAstrologerBodySchema`, `InviteAstrologerResponseSchema` to the existing `import { ... } from './astrologers.schemas.js';` block, and `adminInviteAstrologer` to the existing `import { ... } from './astrologers.service.js';` block. Then add, after `adminUpdateRoute`'s handler:

```ts
const adminInviteRoute = createRoute({
  method: 'post',
  path: '/admin/astrologers/{id}/invite',
  tags: ['Astrologers Admin'],
  summary: 'Invite an existing astrologer profile to the self-serve provider portal',
  description:
    'Creates a Firebase Auth login + provider_accounts row and returns a one-time ' +
    'temporary password — ops relays it to the astrologer off-platform (phone/WhatsApp).',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: AstrologerIdParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: InviteAstrologerBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Invite created — temporary credentials to relay off-platform',
      content: { 'application/json': { schema: InviteAstrologerResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('Astrologer not found'),
    409: errorResponse('Astrologer has already been invited'),
    422: errorResponse('Validation failed'),
  },
});

astrologersRouter.openapi(adminInviteRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { email } = c.req.valid('json');
  const result = await adminInviteAstrologer(id, email);
  return c.json(result, 200);
});
```

- [ ] **Step 9: Implement `src/modules/providers/provider.routes.ts`**

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireProvider } from '../../middleware/auth.js';
import { AstrologerBookingSchema } from '../astrologers/astrologers.schemas.js';
import { getProviderMe, listProviderBookings } from './provider.service.js';
import { ProviderMeSchema } from './provider.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('ProviderError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const providerRouter = new OpenAPIHono();

const meRoute = createRoute({
  method: 'get',
  path: '/provider/me',
  tags: ['Provider'],
  summary: "The logged-in provider's own identity + profile",
  security: [{ bearerAuth: [] }],
  middleware: [requireProvider] as const,
  responses: {
    200: {
      description: 'Provider identity + profile',
      content: { 'application/json': { schema: ProviderMeSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

providerRouter.openapi(meRoute, async (c) => {
  const provider = c.get('provider');
  const result = await getProviderMe(provider);
  return c.json(result, 200);
});

const bookingsRoute = createRoute({
  method: 'get',
  path: '/provider/bookings',
  tags: ['Provider'],
  summary: "The logged-in provider's own booking list",
  security: [{ bearerAuth: [] }],
  middleware: [requireProvider] as const,
  responses: {
    200: {
      description: 'Booking list',
      content: { 'application/json': { schema: z.array(AstrologerBookingSchema) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

providerRouter.openapi(bookingsRoute, async (c) => {
  const provider = c.get('provider');
  const rows = await listProviderBookings(provider);
  return c.json(rows, 200);
});
```

- [ ] **Step 10: Mount the router in `src/app.ts`**

Add the import alongside the other module routers:

```ts
import { providerRouter } from './modules/providers/provider.routes.js';
```

Add the mount call after `app.route('/v1', astrologersRouter);`:

```ts
app.route('/v1', astrologersRouter);
app.route('/v1', providerRouter);
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `pnpm test test/astrologers-routes.spec.ts test/astrologers-service.spec.ts test/provider-routes.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 12: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 13: Commit**

```bash
git add src/modules/astrologers/astrologers.schemas.ts src/modules/astrologers/astrologers.service.ts src/modules/astrologers/astrologers.routes.ts src/modules/providers/provider.routes.ts src/app.ts test/astrologers-service.spec.ts test/astrologers-routes.spec.ts test/provider-routes.spec.ts
git commit -m "feat(providers): add admin invite route + provider portal routes"
```

---

### Task 8: `booking_messages` schema, migration, and repo

**Why:** The data foundation for booking chat — a single, polymorphic table (`bookingType` discriminator) shared by astrologer bookings today and pooja bookings once that table exists (Pooja Booking Batch 1, implemented right after this plan).

**Files:**

- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/<next>_<generated-name>.sql` (generated, not hand-written)
- Create: `src/modules/messaging/messaging.repo.ts`
- Create: `test/messaging-repo.spec.ts`

- [ ] **Step 1: Add the table to `src/db/schema.ts`**

Add at the end of the file, after `providerAccounts`/`ProviderAccountRow`/`NewProviderAccountRow`. All imports used below (`pgTable`, `uuid`, `text`, `timestamp`, `index`, `pgEnum`, `sql`) are already imported at the top of `schema.ts`.

```ts
/* -------------------------------------------------------------------------- */
/* booking_messages — shared chat between a customer and their provider       */
/* -------------------------------------------------------------------------- */

export const bookingMessageTypeEnum = pgEnum('booking_message_type', ['astrologer', 'pooja']);
export const bookingMessageSenderRoleEnum = pgEnum('booking_message_sender_role', [
  'customer',
  'provider',
]);

/**
 * A single chat message on a booking. Polymorphic across booking types
 * (`bookingType`/`bookingId` point at either astrologer_bookings.id or, once
 * it exists, pooja_bookings.id — no DB-level FK, validated at the service
 * layer, same reasoning as astrologer_bookings' own optional refs). Only the
 * `astrologer` bookingType is wired up end-to-end in this batch — see
 * messaging.service.ts#resolveBookingParty for the extension point the
 * Pooja Booking Batch 1 plan adds a second branch to.
 */
export const bookingMessages = pgTable(
  'booking_messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    bookingType: bookingMessageTypeEnum('booking_type').notNull(),
    /** Points at astrologer_bookings.id or pooja_bookings.id depending on bookingType. No DB-level FK — polymorphic, validated at the service layer. */
    bookingId: uuid('booking_id').notNull(),
    senderRole: bookingMessageSenderRoleEnum('sender_role').notNull(),
    /** Set when senderRole = 'customer'. */
    senderUserId: uuid('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Set when senderRole = 'provider' — points at provider_accounts.id. No DB-level FK (same polymorphic reasoning). */
    senderProviderAccountId: uuid('sender_provider_account_id'),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    bookingIdx: index('booking_messages_booking_idx').on(
      table.bookingType,
      table.bookingId,
      table.createdAt,
    ),
  }),
);

export type BookingMessageRow = typeof bookingMessages.$inferSelect;
export type NewBookingMessageRow = typeof bookingMessages.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

Re-list `src/db/migrations/` first to confirm the actual next number, then run: `pnpm db:generate`

Expected: a new migration file, a new `src/db/migrations/meta/<n>_snapshot.json`, and an updated `meta/_journal.json` entry.

Open the generated `.sql` file and confirm it contains ONLY:

- `CREATE TYPE "public"."booking_message_type" AS ENUM('astrologer', 'pooja')`
- `CREATE TYPE "public"."booking_message_sender_role" AS ENUM('customer', 'provider')`
- `CREATE TABLE "booking_messages" (...)` with its 9 columns
- 1 FK constraint (`booking_messages_sender_user_id_users_id_fk`, ON DELETE set null) — NOT one for `booking_id` or `sender_provider_account_id` (deliberately polymorphic, no FK)
- 1 index (`booking_messages_booking_idx`)

If it contains ANY other `CREATE TABLE`/`ALTER TABLE`/`CREATE TYPE` statement, STOP and report BLOCKED — do not hand-trim it.

- [ ] **Step 3: Write the failing repo test**

Create `test/messaging-repo.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: { select: state.select, insert: state.insert, update: state.update },
    sqlClient,
  };
});

import {
  createMessage,
  listMessagesForBooking,
  markMessagesRead,
} from '../src/modules/messaging/messaging.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
  state.update.mockReset();
});

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown } = {};
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn(() => Promise.resolve(result)),
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

function makeUpdateChain() {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain = {
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

describe('createMessage', () => {
  it('inserts and returns the new row', async () => {
    const row = { id: 'msg-1', bookingType: 'astrologer', bookingId: 'booking-1', body: 'hi' };
    const { chain, calls } = makeInsertChain([row]);
    state.insert.mockReturnValue(chain);

    const result = await createMessage({
      bookingType: 'astrologer',
      bookingId: 'booking-1',
      senderRole: 'customer',
      senderUserId: 'user-1',
      senderProviderAccountId: null,
      body: 'hi',
    } as never);

    expect(calls.values).toMatchObject({ bookingId: 'booking-1', body: 'hi' });
    expect(result).toEqual(row);
  });
});

describe('listMessagesForBooking', () => {
  it('filters on (bookingType, bookingId), oldest first, with no after filter', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listMessagesForBooking('astrologer', 'booking-1');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("booking_messages"."booking_type" = $1 and "booking_messages"."booking_id" = $2)',
    );
    expect(query.params).toEqual(['astrologer', 'booking-1']);
  });

  it('adds a createdAt > after filter when options.after is given', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);
    const after = new Date('2026-01-01T00:00:00Z');

    await listMessagesForBooking('astrologer', 'booking-1', { after });

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("booking_messages"."booking_type" = $1 and "booking_messages"."booking_id" = $2 and "booking_messages"."created_at" > $3)',
    );
    expect(query.params).toEqual(['astrologer', 'booking-1', after]);
  });
});

describe('markMessagesRead', () => {
  it("stamps readAt on the OTHER role's unread messages when the reader is the customer", async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await markMessagesRead('astrologer', 'booking-1', 'customer');

    expect((calls.set as { readAt: Date }).readAt).toBeInstanceOf(Date);
    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("booking_messages"."booking_type" = $1 and "booking_messages"."booking_id" = $2 and "booking_messages"."sender_role" = $3 and "booking_messages"."read_at" is null)',
    );
    expect(query.params).toEqual(['astrologer', 'booking-1', 'provider']);
  });

  it("stamps readAt on the customer's messages when the reader is the provider", async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await markMessagesRead('astrologer', 'booking-1', 'provider');

    const query = compile(calls.where);
    expect(query.params).toEqual(['astrologer', 'booking-1', 'customer']);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test test/messaging-repo.spec.ts`
Expected: FAIL — `src/modules/messaging/messaging.repo.js` does not exist yet.

- [ ] **Step 5: Implement `src/modules/messaging/messaging.repo.ts`**

```ts
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  bookingMessages,
  type BookingMessageRow,
  type NewBookingMessageRow,
} from '../../db/schema.js';

export async function createMessage(input: NewBookingMessageRow): Promise<BookingMessageRow> {
  const [row] = await db.insert(bookingMessages).values(input).returning();
  return row!;
}

export interface ListMessagesOptions {
  after?: Date;
}

/**
 * Oldest-first (chat transcript order). The SSE stream
 * (messaging.routes.ts) uses `options.after` to poll only for rows newer
 * than the last one it already sent.
 */
export async function listMessagesForBooking(
  bookingType: 'astrologer' | 'pooja',
  bookingId: string,
  options: ListMessagesOptions = {},
): Promise<BookingMessageRow[]> {
  const conditions = [
    eq(bookingMessages.bookingType, bookingType),
    eq(bookingMessages.bookingId, bookingId),
  ];
  if (options.after) {
    conditions.push(gt(bookingMessages.createdAt, options.after));
  }
  return db
    .select()
    .from(bookingMessages)
    .where(and(...conditions))
    .orderBy(asc(bookingMessages.createdAt));
}

/**
 * Marks every UNREAD message from the OTHER role as read — a customer
 * marking-read stamps the provider's messages (and vice versa), never their
 * own.
 */
export async function markMessagesRead(
  bookingType: 'astrologer' | 'pooja',
  bookingId: string,
  readerRole: 'customer' | 'provider',
): Promise<void> {
  const otherRole = readerRole === 'customer' ? 'provider' : 'customer';
  await db
    .update(bookingMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(bookingMessages.bookingType, bookingType),
        eq(bookingMessages.bookingId, bookingId),
        eq(bookingMessages.senderRole, otherRole),
        isNull(bookingMessages.readAt),
      ),
    );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test test/messaging-repo.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/db/migrations/ src/modules/messaging/messaging.repo.ts test/messaging-repo.spec.ts
git commit -m "feat(messaging): add booking_messages schema + repo layer"
```

---

### Task 9: `messaging.schemas.ts` + `messaging.service.ts`

**Why:** Authorization + business logic for booking chat. Requires one new repo query, `findBookingById` (unscoped by userId — messaging authorization needs to load a booking on behalf of EITHER party, unlike the existing `findOwnedBooking` which is customer-scoped), added to `astrologers.repo.ts`.

**Files:**

- Modify: `src/modules/astrologers/astrologers.repo.ts`
- Modify: `test/astrologers-repo.spec.ts`
- Create: `src/modules/messaging/messaging.schemas.ts`
- Create: `src/modules/messaging/messaging.service.ts`
- Create: `test/messaging-service.spec.ts`

- [ ] **Step 1: Write the failing test for `findBookingById`**

Add `findBookingById` to the existing import block at the top of `test/astrologers-repo.spec.ts`, then add:

```ts
describe('findBookingById', () => {
  it('filters on id only (unscoped by userId — used by messaging authorization, which must load a booking on behalf of either party)', async () => {
    const { chain, calls } = makeSelectChain([{ id: 'booking-1', astrologerId: 'astro-1' }]);
    state.select.mockReturnValue(chain);

    const row = await findBookingById('booking-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"astrologer_bookings"."id" = $1');
    expect(query.params).toEqual(['booking-1']);
    expect(row).toEqual({ id: 'booking-1', astrologerId: 'astro-1' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/astrologers-repo.spec.ts`
Expected: FAIL — `findBookingById` is not exported yet.

- [ ] **Step 3: Add `findBookingById` to `astrologers.repo.ts`**

Add after `findOwnedBooking`:

```ts
/** Unscoped by userId — used by messaging authorization (messaging.service.ts), which must load a booking on behalf of EITHER its customer or its assigned astrologer, not just the customer. */
export async function findBookingById(
  bookingId: string,
): Promise<AstrologerBookingRow | undefined> {
  const rows = await db
    .select()
    .from(astrologerBookings)
    .where(eq(astrologerBookings.id, bookingId))
    .limit(1);
  return rows[0];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/astrologers-repo.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Write the failing service-layer test**

Create `test/messaging-service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  findBookingById: vi.fn(),
  findProviderAccountByKindAndRefId: vi.fn(),
  createMessage: vi.fn(),
  listMessagesForBooking: vi.fn(),
  markMessagesRead: vi.fn(),
  findActiveTokensForUser: vi.fn(),
  sendPushBatch: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/modules/astrologers/astrologers.repo.js', () => ({
  findBookingById: state.findBookingById,
}));

vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByKindAndRefId: state.findProviderAccountByKindAndRefId,
}));

vi.mock('../src/modules/messaging/messaging.repo.js', () => ({
  createMessage: state.createMessage,
  listMessagesForBooking: state.listMessagesForBooking,
  markMessagesRead: state.markMessagesRead,
}));

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  findActiveTokensForUser: state.findActiveTokensForUser,
}));

vi.mock('../src/lib/notifications/fcm.js', () => ({
  sendPushBatch: state.sendPushBatch,
}));

const { listMessages, sendMessage } = await import('../src/modules/messaging/messaging.service.js');

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    userId: 'user-1',
    astrologerId: 'astro-1',
    birthProfileId: null,
    preferredTimeWindow: 'evenings',
    status: 'confirmed',
    pricePaisePaid: 50000,
    requestedAt: new Date('2026-01-01T00:00:00Z'),
    confirmedAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    bookingType: 'astrologer',
    bookingId: 'booking-1',
    senderRole: 'customer',
    senderUserId: 'user-1',
    senderProviderAccountId: null,
    body: 'hello',
    readAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(state).forEach((fn) => fn.mockReset());
});

describe('sendMessage', () => {
  it('rejects an unknown bookingType with a 400', async () => {
    await expect(
      sendMessage({ role: 'customer', userId: 'user-1' }, 'not-a-real-type', 'booking-1', 'hi'),
    ).rejects.toThrow('Invalid booking type: not-a-real-type');
    expect(state.findBookingById).not.toHaveBeenCalled();
  });

  it("rejects bookingType 'pooja' — not yet implemented (extension point for the Pooja Booking plan)", async () => {
    await expect(
      sendMessage({ role: 'customer', userId: 'user-1' }, 'pooja', 'booking-1', 'hi'),
    ).rejects.toThrow('pooja booking chat not yet available');
  });

  it('404s when the astrologer booking does not exist', async () => {
    state.findBookingById.mockResolvedValueOnce(undefined);

    await expect(
      sendMessage({ role: 'customer', userId: 'user-1' }, 'astrologer', 'booking-1', 'hi'),
    ).rejects.toThrow('Booking not found');
  });

  it("403s a customer who isn't the booking's own userId", async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking({ userId: 'someone-else' }));

    await expect(
      sendMessage({ role: 'customer', userId: 'user-1' }, 'astrologer', 'booking-1', 'hi'),
    ).rejects.toThrow('Not your booking');
  });

  it("403s a provider who isn't the booking's assigned astrologer", async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking({ astrologerId: 'astro-OTHER' }));

    await expect(
      sendMessage(
        {
          role: 'provider',
          providerId: 'provider-1',
          providerKind: 'astrologer',
          providerRefId: 'astro-1',
        },
        'astrologer',
        'booking-1',
        'hi',
      ),
    ).rejects.toThrow('Not your assigned booking');
  });

  it('inserts the message, notifies the provider, and returns the DTO when the customer sends it', async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking());
    state.createMessage.mockResolvedValueOnce(makeMessage());
    state.findProviderAccountByKindAndRefId.mockResolvedValueOnce({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-1',
      displayName: 'Guru Ji',
      createdAt: new Date(),
    });
    state.findActiveTokensForUser.mockResolvedValueOnce([{ token: 'tok-1' }]);

    const dto = await sendMessage(
      { role: 'customer', userId: 'user-1' },
      'astrologer',
      'booking-1',
      'hello',
    );

    expect(state.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingType: 'astrologer',
        bookingId: 'booking-1',
        senderRole: 'customer',
        senderUserId: 'user-1',
        senderProviderAccountId: null,
        body: 'hello',
      }),
    );
    expect(dto).toMatchObject({ id: 'msg-1', body: 'hello' });
  });

  it('inserts the message and notifies the customer when the provider sends it', async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking());
    state.createMessage.mockResolvedValueOnce(
      makeMessage({
        senderRole: 'provider',
        senderUserId: null,
        senderProviderAccountId: 'provider-1',
      }),
    );
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    await sendMessage(
      {
        role: 'provider',
        providerId: 'provider-1',
        providerKind: 'astrologer',
        providerRefId: 'astro-1',
      },
      'astrologer',
      'booking-1',
      'hello back',
    );

    expect(state.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderRole: 'provider',
        senderUserId: null,
        senderProviderAccountId: 'provider-1',
      }),
    );
    expect(state.findActiveTokensForUser).toHaveBeenCalledWith('user-1');
  });
});

describe('listMessages', () => {
  it("returns the transcript and marks the OTHER party's messages read, for an authorized customer", async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking());
    state.listMessagesForBooking.mockResolvedValueOnce([makeMessage()]);

    const rows = await listMessages(
      { role: 'customer', userId: 'user-1' },
      'astrologer',
      'booking-1',
    );

    expect(rows).toHaveLength(1);
    expect(state.markMessagesRead).toHaveBeenCalledWith('astrologer', 'booking-1', 'customer');
  });

  it("403s a provider who isn't the booking's assigned astrologer", async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking({ astrologerId: 'astro-OTHER' }));

    await expect(
      listMessages(
        {
          role: 'provider',
          providerId: 'provider-1',
          providerKind: 'astrologer',
          providerRefId: 'astro-1',
        },
        'astrologer',
        'booking-1',
      ),
    ).rejects.toThrow('Not your assigned booking');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test test/messaging-service.spec.ts`
Expected: FAIL — `src/modules/messaging/messaging.schemas.js` / `messaging.service.js` do not exist yet.

- [ ] **Step 7: Implement `src/modules/messaging/messaging.schemas.ts`**

```ts
import { z } from '@hono/zod-openapi';

export const BookingTypeSchema = z.enum(['astrologer', 'pooja']).openapi('BookingType');
export type BookingType = z.infer<typeof BookingTypeSchema>;

export const BookingMessageSchema = z
  .object({
    id: z.string().uuid(),
    bookingType: BookingTypeSchema,
    bookingId: z.string().uuid(),
    senderRole: z.enum(['customer', 'provider']),
    body: z.string(),
    readAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('BookingMessage');

export type BookingMessageDto = z.infer<typeof BookingMessageSchema>;

export const SendMessageBodySchema = z
  .object({
    body: z.string().min(1).max(4000),
  })
  .strict()
  .openapi('SendMessageBody');

export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;

// bookingType is deliberately a plain string here, NOT BookingTypeSchema
// (an enum) — an invalid value must reach the service layer and get a
// deliberate 400 via Errors.badRequest (see
// messaging.service.ts#assertValidBookingType), not the framework's default
// 422 zod-validation-failure path a z.enum() path param would trigger.
export const MessagingParamSchema = z.object({
  bookingType: z
    .string()
    .openapi({ param: { name: 'bookingType', in: 'path' }, example: 'astrologer' }),
  bookingId: z
    .string()
    .uuid()
    .openapi({ param: { name: 'bookingId', in: 'path' }, example: 'b1c2d3e4-...' }),
});
```

- [ ] **Step 8: Implement `src/modules/messaging/messaging.service.ts`**

```ts
// =============================================================================
// Messaging module service — Batch 1 addition: shared, polymorphic booking
// chat between a customer and their assigned provider. `bookingType` is a
// discriminator switch (`'astrologer' | 'pooja'`) — the astrologer branch is
// fully implemented here; the pooja branch is a deliberate, localized
// early-return for the Pooja Booking Batch 1 plan (implemented right after
// this one) to extend — see resolveBookingParty below, which is the ONLY
// function that loads booking data differently per bookingType. sendMessage
// and listMessages themselves stay bookingType-agnostic and need no changes.
// assertCallerIsParty and notifyOtherParty DO need two small edits each (each
// currently hardcodes the literal 'astrologer' once) — see the Pooja Booking
// Batch 1 plan's Task 10, which replaces that literal with the resolved
// party's own providerKind rather than adding new bookingType-specific logic.
// =============================================================================

import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import { findActiveTokensForUser } from '../device-tokens/device-tokens.repo.js';
import { findBookingById } from '../astrologers/astrologers.repo.js';
import { findProviderAccountByKindAndRefId } from '../providers/provider-accounts.repo.js';
import type { AstrologerBookingRow, BookingMessageRow } from '../../db/schema.js';
import { createMessage, listMessagesForBooking, markMessagesRead } from './messaging.repo.js';
import type { BookingMessageDto, BookingType } from './messaging.schemas.js';

export type Caller =
  | { role: 'customer'; userId: string }
  | {
      role: 'provider';
      providerId: string;
      providerKind: 'astrologer' | 'pandit';
      providerRefId: string;
    };

/** Narrows `bookingType` for callers — asserts, doesn't just check, so TypeScript propagates the narrowing to the caller's local variable. */
export function assertValidBookingType(bookingType: string): asserts bookingType is BookingType {
  if (bookingType !== 'astrologer' && bookingType !== 'pooja') {
    throw Errors.badRequest(`Invalid booking type: ${bookingType}`);
  }
}

interface ResolvedParty {
  booking: AstrologerBookingRow;
  customerUserId: string;
  providerRefId: string;
}

/**
 * Loads the underlying booking and resolves who its two chat participants
 * are, so callers can be authorized against it.
 *
 * `bookingType === 'pooja'` intentionally throws — this `if`/`throw` is the
 * exact extension point the Pooja Booking Batch 1 plan turns into a second
 * branch (loading from a pooja_bookings repo query instead). That plan's
 * Task 10 also makes two small follow-on edits elsewhere in this file
 * (assertCallerIsParty and notifyOtherParty each hardcode the literal
 * 'astrologer' once) — see that task for the exact diff.
 */
async function resolveBookingParty(
  bookingType: BookingType,
  bookingId: string,
): Promise<ResolvedParty> {
  if (bookingType === 'pooja') {
    throw Errors.badRequest('pooja booking chat not yet available');
  }
  const booking = await findBookingById(bookingId);
  if (!booking) throw Errors.notFound('Booking not found');
  return { booking, customerUserId: booking.userId, providerRefId: booking.astrologerId };
}

function assertCallerIsParty(caller: Caller, party: ResolvedParty): void {
  if (caller.role === 'customer') {
    if (party.customerUserId !== caller.userId) throw Errors.forbidden('Not your booking');
    return;
  }
  if (caller.providerKind !== 'astrologer' || party.providerRefId !== caller.providerRefId) {
    throw Errors.forbidden('Not your assigned booking');
  }
}

export function toMessageDto(row: BookingMessageRow): BookingMessageDto {
  return {
    id: row.id,
    bookingType: row.bookingType,
    bookingId: row.bookingId,
    senderRole: row.senderRole,
    body: row.body,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function sendMessage(
  caller: Caller,
  bookingType: string,
  bookingId: string,
  body: string,
): Promise<BookingMessageDto> {
  assertValidBookingType(bookingType);
  const party = await resolveBookingParty(bookingType, bookingId);
  assertCallerIsParty(caller, party);

  const row = await createMessage({
    bookingType,
    bookingId,
    senderRole: caller.role,
    senderUserId: caller.role === 'customer' ? caller.userId : null,
    senderProviderAccountId: caller.role === 'provider' ? caller.providerId : null,
    body,
  });

  void notifyOtherParty(caller, party).catch((err) => {
    logger.warn({ err, bookingType, bookingId }, 'messaging:notifyOtherParty failed');
  });

  return toMessageDto(row);
}

export async function listMessages(
  caller: Caller,
  bookingType: string,
  bookingId: string,
): Promise<BookingMessageDto[]> {
  assertValidBookingType(bookingType);
  const party = await resolveBookingParty(bookingType, bookingId);
  assertCallerIsParty(caller, party);

  const rows = await listMessagesForBooking(bookingType, bookingId);
  void markMessagesRead(bookingType, bookingId, caller.role).catch((err) => {
    logger.warn({ err, bookingType, bookingId }, 'messaging:markMessagesRead failed');
  });
  return rows.map(toMessageDto);
}

/**
 * Best-effort push on a new message to whichever party did NOT send it.
 *
 * If the recipient is the customer: a normal, reliable sendPushBatch call —
 * same as every other customer-facing notification in this codebase.
 *
 * If the recipient is the provider: ALSO attempted via sendPushBatch, but
 * this is explicitly best-effort and, in practice, always a no-op in this
 * batch — providers have no dedicated mobile app and no route to register a
 * device token yet, and device_push_tokens.userId is a NOT NULL FK to
 * users.id (a provider_accounts row is not a users row) — see this plan's
 * "Before you start". The SSE/poll stream (messaging.routes.ts) is the only
 * channel actually guaranteed to reach a provider, and only while their
 * portal tab is open. This is intentionally left as a documented "still
 * deferred" item, not silently assumed to work.
 */
async function notifyOtherParty(caller: Caller, party: ResolvedParty): Promise<void> {
  if (caller.role === 'customer') {
    const account = await findProviderAccountByKindAndRefId('astrologer', party.providerRefId);
    if (!account) return;
    const tokens = await findActiveTokensForUser(account.id);
    if (tokens.length === 0) return;
    await sendPushBatch(
      tokens.map((t) => t.token),
      '💬 New message from your customer',
      'You have a new message on a booking.',
      { type: 'booking_message', bookingId: party.booking.id },
    );
    return;
  }

  const tokens = await findActiveTokensForUser(party.customerUserId);
  if (tokens.length === 0) return;
  await sendPushBatch(
    tokens.map((t) => t.token),
    '💬 New message from your astrologer',
    'You have a new message on your booking.',
    { type: 'booking_message', bookingId: party.booking.id },
  );
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm test test/messaging-service.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 10: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 11: Commit**

```bash
git add src/modules/astrologers/astrologers.repo.ts test/astrologers-repo.spec.ts src/modules/messaging/messaging.schemas.ts src/modules/messaging/messaging.service.ts test/messaging-service.spec.ts
git commit -m "feat(messaging): add messaging.service.ts (authorization, sendMessage/listMessages, push)"
```

---

### Task 10: `messaging.routes.ts` (incl. SSE) + mount in `app.ts`

**Why:** Wires the three messaging endpoints — send, list, and the SSE stream — following the same `.openapi()`/`streamSSE` conventions this plan's "Before you start" verified against `astro.routes.ts`'s `/chat` route.

**Files:**

- Create: `src/modules/messaging/messaging.routes.ts`
- Modify: `src/app.ts`
- Create: `test/messaging-routes.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `test/messaging-routes.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  findProviderAccountByFirebaseUid: vi.fn(),
  sendMessage: vi.fn(),
  listMessages: vi.fn(),
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

vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByFirebaseUid: state.findProviderAccountByFirebaseUid,
}));

vi.mock('../src/modules/messaging/messaging.service.js', () => ({
  sendMessage: state.sendMessage,
  listMessages: state.listMessages,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token', 'Content-Type': 'application/json' } as const;

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.findProviderAccountByFirebaseUid.mockReset();
  state.sendMessage.mockReset();
  state.listMessages.mockReset();
});

describe('POST /v1/bookings/:bookingType/:bookingId/messages', () => {
  it('201s with the created message when the caller is the customer', async () => {
    state.sendMessage.mockResolvedValueOnce({ id: 'msg-1', body: 'hi' });

    const res = await createApp().request('/v1/bookings/astrologer/booking-1/messages', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ body: 'hi' }),
    });

    expect(res.status).toBe(201);
    expect(state.sendMessage).toHaveBeenCalledWith(
      { role: 'customer', userId: 'id-1' },
      'astrologer',
      'booking-1',
      'hi',
    );
  });

  it("201s with the created message when the caller is the assigned provider (no matching 'user' row)", async () => {
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'uid-1',
      displayName: 'Guru Ji',
      createdAt: new Date(),
    });
    state.sendMessage.mockResolvedValueOnce({ id: 'msg-2', body: 'hi back' });

    const res = await createApp().request('/v1/bookings/astrologer/booking-1/messages', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ body: 'hi back' }),
    });

    expect(res.status).toBe(201);
    expect(state.sendMessage).toHaveBeenCalledWith(
      {
        role: 'provider',
        providerId: 'provider-1',
        providerKind: 'astrologer',
        providerRefId: 'astro-1',
      },
      'astrologer',
      'booking-1',
      'hi back',
    );
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/bookings/astrologer/booking-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'hi' }),
    });
    expect(res.status).toBe(401);
  });

  it('422s when body is missing', async () => {
    const res = await createApp().request('/v1/bookings/astrologer/booking-1/messages', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
    expect(state.sendMessage).not.toHaveBeenCalled();
  });
});

describe('GET /v1/bookings/:bookingType/:bookingId/messages', () => {
  it('200s with the transcript', async () => {
    state.listMessages.mockResolvedValueOnce([{ id: 'msg-1', body: 'hi' }]);

    const res = await createApp().request('/v1/bookings/astrologer/booking-1/messages', {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect(state.listMessages).toHaveBeenCalledWith(
      { role: 'customer', userId: 'id-1' },
      'astrologer',
      'booking-1',
    );
    expect(await res.json()).toEqual([{ id: 'msg-1', body: 'hi' }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/messaging-routes.spec.ts`
Expected: FAIL — `src/modules/messaging/messaging.routes.js` does not exist yet, and `messagingRouter` is not mounted.

- [ ] **Step 3: Implement `src/modules/messaging/messaging.routes.ts`**

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import type { Context } from 'hono';
import { requireUserOrProvider } from '../../middleware/auth.js';
import type { UserRow } from '../../db/schema.js';
import { listMessagesForBooking } from './messaging.repo.js';
import {
  assertValidBookingType,
  listMessages,
  sendMessage,
  toMessageDto,
  type Caller,
} from './messaging.service.js';
import {
  BookingMessageSchema,
  MessagingParamSchema,
  SendMessageBodySchema,
} from './messaging.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('MessagingError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const messagingRouter = new OpenAPIHono();

/**
 * requireUserOrProvider sets exactly ONE of c.var.user / c.var.provider —
 * ContextVariableMap declares both as always-present, so `user` is read as
 * `| undefined` here purely to detect which one the middleware actually set.
 */
function resolveCaller(c: Context): Caller {
  const user = c.get('user') as UserRow | undefined;
  if (user) return { role: 'customer', userId: user.id };
  const provider = c.get('provider');
  return {
    role: 'provider',
    providerId: provider.id,
    providerKind: provider.kind,
    providerRefId: provider.refId,
  };
}

const sendRoute = createRoute({
  method: 'post',
  path: '/bookings/{bookingType}/{bookingId}/messages',
  tags: ['Messaging'],
  summary: 'Send a chat message on a booking (customer or their assigned provider)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUserOrProvider] as const,
  request: {
    params: MessagingParamSchema,
    body: { required: true, content: { 'application/json': { schema: SendMessageBodySchema } } },
  },
  responses: {
    201: {
      description: 'Message sent',
      content: { 'application/json': { schema: BookingMessageSchema } },
    },
    400: errorResponse('Invalid booking type'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not your booking'),
    404: errorResponse('Booking not found'),
    422: errorResponse('Validation failed'),
  },
});

messagingRouter.openapi(sendRoute, async (c) => {
  const { bookingType, bookingId } = c.req.valid('param');
  const { body } = c.req.valid('json');
  const caller = resolveCaller(c);
  const dto = await sendMessage(caller, bookingType, bookingId, body);
  return c.json(dto, 201);
});

// Returns the FULL transcript, unpaginated, in this batch — a real
// limit/cursor query-param contract was left unspecified by this plan's
// source spec ("paginated list, newest-last") and is deliberately NOT
// invented here to avoid a shape mismatch with what the Pooja Booking Batch
// 1 plan's own agent might independently assume for the same route (it only
// needs to match this route's PATH and DB schema, not a pagination cursor
// shape neither plan has actually pinned down). Flagged as an open question
// in this plan's own review notes — add real pagination in a follow-up once
// a concrete contract is agreed, if transcript length ever becomes a
// problem in practice.
const listRoute = createRoute({
  method: 'get',
  path: '/bookings/{bookingType}/{bookingId}/messages',
  tags: ['Messaging'],
  summary:
    'List a booking chat transcript, oldest first (unpaginated in this batch — see comment above)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUserOrProvider] as const,
  request: { params: MessagingParamSchema },
  responses: {
    200: {
      description: 'Chat transcript',
      content: { 'application/json': { schema: z.array(BookingMessageSchema) } },
    },
    400: errorResponse('Invalid booking type'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not your booking'),
    404: errorResponse('Booking not found'),
  },
});

messagingRouter.openapi(listRoute, async (c) => {
  const { bookingType, bookingId } = c.req.valid('param');
  const caller = resolveCaller(c);
  const rows = await listMessages(caller, bookingType, bookingId);
  return c.json(rows, 200);
});

const MESSAGING_POLL_INTERVAL_MS = 2000;

/**
 * SSE stream — deliberately SIMPLE SERVER-SIDE POLLING, not a websocket or
 * pub/sub system (this codebase has no pub/sub infra at all). Every ~2s,
 * re-queries listMessagesForBooking for rows newer than the last one already
 * sent and writes each as a `message` SSE event, until the client
 * disconnects or the request is aborted. This is a "Batch 1 foundation"
 * tradeoff, not an oversight — see this plan's "Explicitly deferred" list.
 */
const streamRoute = createRoute({
  method: 'get',
  path: '/bookings/{bookingType}/{bookingId}/messages/stream',
  tags: ['Messaging'],
  summary: 'SSE stream of new booking chat messages (simple polling under the hood)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUserOrProvider] as const,
  request: { params: MessagingParamSchema },
  responses: {
    200: {
      description: 'SSE stream of new messages',
      content: { 'text/event-stream': { schema: z.any() } },
    },
    400: errorResponse('Invalid booking type'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not your booking'),
    404: errorResponse('Booking not found'),
  },
});

messagingRouter.openapi(streamRoute, async (c) => {
  const { bookingType, bookingId } = c.req.valid('param');
  const caller = resolveCaller(c);
  // Authorize (+ validate bookingType, + mark the OTHER party's existing
  // messages read as a side effect of opening the chat view) BEFORE the SSE
  // upgrade — a 403/404/400 must happen as a normal JSON error response, not
  // after the response has already switched to text/event-stream.
  await listMessages(caller, bookingType, bookingId);
  // Already validated by the call above (it throws on an invalid value) —
  // this just informs TypeScript so the polling loop below can call
  // listMessagesForBooking with a narrowed `bookingType`.
  assertValidBookingType(bookingType);

  const signal = c.req.raw.signal;

  return streamSSE(c, async (stream) => {
    let lastSeenAt = new Date();
    while (!signal.aborted && !stream.aborted) {
      const fresh = await listMessagesForBooking(bookingType, bookingId, { after: lastSeenAt });
      for (const row of fresh) {
        if (signal.aborted || stream.aborted) break;
        await stream.writeSSE({ event: 'message', data: JSON.stringify(toMessageDto(row)) });
        lastSeenAt = row.createdAt;
      }
      if (signal.aborted || stream.aborted) break;
      await stream.sleep(MESSAGING_POLL_INTERVAL_MS);
    }
  });
});
```

- [ ] **Step 4: Mount the router in `src/app.ts`**

Add the import alongside the other module routers:

```ts
import { messagingRouter } from './modules/messaging/messaging.routes.js';
```

Add the mount call after `app.route('/v1', providerRouter);`:

```ts
app.route('/v1', providerRouter);
app.route('/v1', messagingRouter);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test test/messaging-routes.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this batch's new tests), no new typecheck errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/messaging/messaging.routes.ts src/app.ts test/messaging-routes.spec.ts
git commit -m "feat(messaging): add messaging routes (send/list/SSE stream)"
```

---

### Task 11: Final controller review (not a subagent task)

The controller (not a dispatched subagent) reviews the full diff holistically for:

- [ ] `pnpm test && pnpm typecheck && pnpm lint` all clean — same pre-existing failures, zero new typecheck/lint errors.
- [ ] `refundBooking()`'s CAS fence (`WHERE id = ? AND userId = ? AND status = 'requested'`) is the ONLY gate on the wallet credit — re-read `astrologers.repo.ts` once more to confirm the wallet `UPDATE` and `walletTransactions` insert are unreachable unless that CAS `.returning()` produced a row.
- [ ] `requestAstrologerBooking()` re-reads `verified`/`active`/`ratePaisePerSession` INSIDE the transaction (never trusts a value resolved by the service layer beforehand) — confirm `astrologers.service.ts#createBooking`'s pre-check is documented as existing ONLY to pick 404 vs 409, not as a financial guard.
- [ ] Every status transition (`requested → confirmed`, `confirmed → completed`, `requested → refunded`) is scoped by the CURRENT status in its `WHERE` clause — confirm none of `confirmBooking`/`completeBooking`/`refundBooking` can resurrect a `declined`/`cancelled`/`refunded` booking.
- [ ] `requireAdmin` is imported from `src/middleware/auth.ts` everywhere in this plan's own files (`astrologers.routes.ts`) — confirm no second/third admin-auth mechanism was reintroduced, and that every admin route uses `middleware: [requireAdmin] as const` (NOT `[requireUser, requireAdmin]` — `requireAdmin` already wraps `requireUser` internally, see "Before you start").
- [ ] `requireProvider`/`requireUserOrProvider` never call `requireUser` internally (they're parallel gates, not wrappers) — confirm a provider hitting a `requireProvider` route never triggers a spurious `users` table lookup, and that `requireUserOrProvider` sets exactly ONE of `c.var.user`/`c.var.provider`, never both, never neither (on success).
- [ ] `messaging.service.ts#resolveBookingParty`'s `bookingType === 'pooja'` branch is a single, isolated `throw`, and it is the ONLY function that loads booking data differently per `bookingType` — confirm `messaging.routes.ts` and `sendMessage`/`listMessages` themselves stay `bookingType`-agnostic. `assertCallerIsParty` and `notifyOtherParty` each hardcode the literal `'astrologer'` once (a real, documented exception to "nothing else special-cases this") — confirm the Pooja Booking Batch 1 plan's Task 10 replaces both literals with the resolved party's own `providerKind` rather than adding new `bookingType`-specific branches, so its extension is still a small, localized edit overall.
- [ ] `POST /v1/admin/astrologers/{id}/invite`'s 404/409 checks (astrologer doesn't exist / already invited) both run BEFORE `getFirebaseAuth().createUser(...)` is called — confirm `adminInviteAstrologer` can't create an orphaned Firebase user with no matching `provider_accounts` row on a race or a bad astrologer id.
- [ ] The deferred-scope list (self-onboarding, calendar slots, payouts, ratings/reviews, auto-refund-after-confirm, typing/read-receipts, attachments, guaranteed provider push, portal frontend UI) is stated in `astrologers.service.ts`'s / `messaging.service.ts`'s file headers AND in this plan document's "Before you start" section — confirm nothing in the implementation silently tries to half-build any of those.
- [ ] No placeholders, no `TODO`s except the one explicitly required by this plan (`// TODO(pooja-booking plan): add a kind === 'pandit' branch...` in `provider.service.ts`), no stub functions anywhere in the diff.
- [ ] `git log --oneline` on this branch shows the commits from Tasks 1–10 in order, each with a passing test suite at the time it was made.

Do NOT merge to `main` — this branch is accumulating multiple batches, to be merged once at the end in a single step.

---

### Critical Files for Implementation

- `src/db/schema.ts` — every table this batch defines (`astrologers`/`astrologer_bookings`/`astrologerBookingStatusEnum`, `provider_accounts`/`providerKindEnum`, `booking_messages`/`bookingMessageTypeEnum`/`bookingMessageSenderRoleEnum`); every other file depends on the exact shapes defined here.
- `src/modules/astrologers/astrologers.repo.ts` — contains the two atomic transactions (`requestAstrologerBooking`, `refundBooking`) that are the financial correctness core of this batch, plus the booking-lookup functions (`findOwnedBooking`, `findBookingById`, `listBookingsForAstrologer`) the provider portal and messaging module both build on.
- `src/modules/astrologers/astrologers.service.ts` — the 404-vs-409 outcome logic for booking/cancellation, `adminInviteAstrologer`, and the deferred-scope documentation for the whole batch.
- `src/modules/astrologers/astrologers.routes.ts` — wires HTTP status codes to service outcomes and gates admin routes with `requireAdmin`.
- `src/middleware/auth.ts` — canonical `requireAdmin` (added by the Admin Console Foundation plan, reused here) plus this plan's own `requireProvider`/`requireUserOrProvider` — the security boundary for every route in this plan.
- `src/modules/messaging/messaging.service.ts` — authorization (who may read/write a booking's chat) and the `bookingType` extension point the Pooja Booking Batch 1 plan builds on directly.
- `src/modules/messaging/messaging.routes.ts` — the SSE polling implementation; the one place in this batch doing anything other than plain request/response HTTP.
