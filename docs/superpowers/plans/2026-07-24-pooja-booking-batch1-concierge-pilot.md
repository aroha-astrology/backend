# Pooja Booking Batch 1 — Concierge Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deliberately small "concierge pilot" pooja-booking subsystem — admin-vetted pandits, single-member bookings, wallet-debit-on-request, manual admin completion — reusing the existing curated pooja list rather than inventing a new catalog.

**Architecture:** Three new tables (`pooja_catalog`, `pandits`, `pooja_bookings`) live alongside the existing `users`/`birth_profiles`/`wallet_transactions` tables in `src/db/schema.ts`. A new `src/modules/pooja-bookings/` module holds the repo/service/routes/schemas, following the exact conventions already proven by `src/modules/prime-reports/`: the wallet debit at booking time reuses `unlockPrimeReport`'s atomic "balance-guarded UPDATE + ledger insert + row insert, all in one `db.transaction`" shape, and the new `refundPoojaBooking()` primitive uses the same "conditional UPDATE is the concurrency guard" idea as `claimPrimeReportGeneration`. The three ops-only routes are gated by the canonical `requireAdmin` middleware from `src/middleware/auth.ts` — built by the Admin Console Foundation plan, reused here directly rather than redefined. Pandits also get real accounts and genuine chat with their customers: instead of building a second provider-auth/messaging system, this plan adds a pandit-specific invite endpoint and a `pooja` branch on top of the shared `provider_accounts`/`booking_messages` infrastructure built by the Astrologer Marketplace Batch 1 plan (see "Provider accounts and chat for pandits" near the end). No pandit self-onboarding, no multi-member bookings, no offerings catalog, no video-proof, no automated fulfillment tracking — see "Explicitly deferred" below.

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
  - `requireUser` (`src/middleware/auth.ts`) — sets `c.var.user` (a `UserRow`). `requireAdmin` (also in `src/middleware/auth.ts`, built by the Admin Console Foundation plan and reused as-is — not built by this plan) calls `requireUser`'s logic INTERNALLY and reads `c.var.user` itself — it is not re-chained after `requireUser` on a route. Every admin route in this plan uses `middleware: [requireAdmin] as const` only, NEVER `[requireUser, requireAdmin]` (that would run the user-lookup twice and is the wrong pattern — see Task 6 and Task 8 for the corrected form).
  - `resolveTier()` (`src/modules/telegram-bot/telegram-bot.service.ts`) — the comma-separated-env-var-allowlist pattern `requireAdmin` mirrors.
  - `sendPush`/`sendPushBatch` (`src/lib/notifications/fcm.ts`) and `notifyPurchasePlanReady` (`src/modules/purchase-plan/purchase-plan.service.ts`) — the "look up active device tokens, batch-send, never let a push failure fail the underlying action" pattern.
  - `scripts/seed-coupons.ts` — the idempotent look-up-by-name-then-update-or-insert seed-script convention.
  - `src/app.ts` — routers are mounted via `app.route('/v1', someRouter)`, each router's own paths omit the `/v1` prefix.
  - `date` (for `preferredDate`, a day-scheduled not minute-scheduled column) is already imported in `src/db/schema.ts` from `drizzle-orm/pg-core` — no new import needed for it.
- **Admin auth is built by a different plan, not this one.** Implementation order across the four plans accumulating on this branch is fixed: **Admin Console Foundation → Shagun Affiliate Shop → Astrologer Marketplace Batch 1 → Pooja Booking Batch 1 (this plan, implemented last)**. By the time this plan is implemented, the Admin Console Foundation plan has already added `requireAdmin` (keyed off `ADMIN_FIREBASE_UIDS`) to `src/middleware/auth.ts`. This plan's admin-only routes (Task 6) import and reuse that `requireAdmin` directly — there is no `src/middleware/admin.ts` and no `ADMIN_FIREBASE_UIDS`-defining task in this plan.
- **Provider auth and chat for pandits are built on top of a different plan, not this one.** The Astrologer Marketplace Batch 1 plan (implemented immediately before this one) builds a shared `provider_accounts` table, `requireProvider`/`requireUserOrProvider` middleware, `src/modules/providers/`, and `src/modules/messaging/` — see "Provider accounts and chat for pandits" near the end of this plan for the exact contract this plan builds on top of.
- **Note on unrelated leftover scripts:** `scripts/seed-puja-images.ts` and `scripts/smoke-test-puja-booking.ts` already exist in this repo's `scripts/` folder, but they are leftovers from the abandoned Supabase-based `apps/api`/`apps/web` reference implementation (they import `@supabase/supabase-js`, read `apps/web/.env.local`, and reference tables like `puja_offerings`/`booking_members`/`pandit_profiles` that do not exist in this Postgres/Drizzle backend). Do NOT modify, run, or treat these as related to this plan's work — they are dead code from a different, unbuilt system.

**Explicitly deferred to a later batch (not part of this plan):**

- Pandit self-onboarding (this batch is admin-vetted roster only — no self-service portal, no approval workflow beyond "an admin added the row". A pandit DOES get a real login now — see "Provider accounts and chat for pandits" near the end — but strictly admin-invite-only, never a self-signup flow: a pandit gets an account only after an admin both adds their roster row AND calls the invite endpoint).
- Multi-member sankalp bookings (one profile per booking only).
- An offerings/add-ons catalog.
- Video-proof-of-ritual upload requirement.
- An automated pandit-decline/reassignment flow (there is no "pandit declines" state in this batch — an admin either successfully assigns a pandit or the booking stays `requested` until manually handled).
- Pandit payouts (ops handles this manually outside the app — a known, documented gap, matching this repo's existing pattern of manual-process gaps in other batch plans).
- A separate ops-initiated refund route (only the customer-initiated cancel route in this batch calls `refundPoojaBooking()`; the primitive itself is written to be reusable from a future admin route, but no such route is wired up here).
- Typing indicators and read receipts beyond the shared messaging system's `readAt` timestamp (no "seen" ticks, no live typing state).
- File/image attachments in chat (text-only messages, same as the shared messaging system's astrologer-consultation branch).
- Guaranteed push delivery to pandits for new messages (best-effort only via `sendPush`/`sendPushBatch` — same caveat as every other push-notification path in this and the Marketplace plan).
- The actual pandit-facing or customer-facing chat UI (this plan, like every other plan in this batch of four, ships backend API only — no frontend/portal work).

---

## File structure

| File                                                        | Action                                                                    | Responsibility                                                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/db/schema.ts`                                          | Modify                                                                    | Add `poojaCatalog`, `pandits`, `poojaBookingStatusEnum`, `poojaBookings` tables                                                                                            |
| `src/db/migrations/<next>_<generated>.sql`                  | Create (generated)                                                        | DDL for the 3 new tables + 1 enum                                                                                                                                          |
| `src/modules/pooja-bookings/pandits.repo.ts`                | Create                                                                    | `createPandit`, `findPanditById`                                                                                                                                           |
| `test/pandits-repo.spec.ts`                                 | Create                                                                    | Tests for the pandits repo                                                                                                                                                 |
| `src/modules/pooja-bookings/pooja-bookings.repo.ts`         | Create                                                                    | Catalog reads, atomic `createPoojaBooking`, atomic `refundPoojaBooking`, `assignPanditToBooking`, `completePoojaBooking`, list/find                                        |
| `test/pooja-bookings-repo.spec.ts`                          | Create                                                                    | Tests for the pooja-bookings repo, including the race-safety of the refund transaction                                                                                     |
| `src/modules/pooja-bookings/pooja-bookings.service.ts`      | Create                                                                    | Business logic + fire-and-forget push notifications                                                                                                                        |
| `test/pooja-bookings-service.spec.ts`                       | Create                                                                    | Tests for the service layer                                                                                                                                                |
| `src/modules/pooja-bookings/pooja-bookings.schemas.ts`      | Create                                                                    | Zod/OpenAPI request/response schemas                                                                                                                                       |
| `src/modules/pooja-bookings/pooja-bookings.routes.ts`       | Create                                                                    | Customer-facing routes                                                                                                                                                     |
| `test/pooja-bookings-routes.spec.ts`                        | Create                                                                    | Tests for the customer-facing routes                                                                                                                                       |
| `src/modules/pooja-bookings/pooja-bookings.admin.routes.ts` | Create                                                                    | Admin-only routes                                                                                                                                                          |
| `test/pooja-bookings-admin-routes.spec.ts`                  | Create                                                                    | Tests for the admin routes                                                                                                                                                 |
| `src/app.ts`                                                | Modify                                                                    | Mount `poojaBookingsRouter` and `poojaBookingsAdminRouter`                                                                                                                 |
| `scripts/seed-pooja-catalog.ts`                             | Create                                                                    | Idempotent seed script using the real 9 curated pooja names                                                                                                                |
| `src/db/schema.ts`                                          | Modify (again, in the new tasks below)                                    | Add nullable `email` column to `pandits`; update the now-stale "NOT a login credential" comment                                                                            |
| `src/db/migrations/<next>_<generated>.sql`                  | Create (generated, again)                                                 | DDL for `pandits.email`                                                                                                                                                    |
| `src/modules/pooja-bookings/pandits.repo.ts`                | Modify (again)                                                            | Add `updatePanditEmail`                                                                                                                                                    |
| `test/pandits-repo.spec.ts`                                 | Modify (again)                                                            | Add coverage for `updatePanditEmail`                                                                                                                                       |
| `src/modules/pooja-bookings/pooja-bookings.schemas.ts`      | Modify (again)                                                            | Add `PanditIdParamSchema`, `InvitePanditRequestSchema`, `InvitePanditResponseSchema`                                                                                       |
| `src/modules/pooja-bookings/pooja-bookings.service.ts`      | Modify (again)                                                            | Add `invitePandit`                                                                                                                                                         |
| `test/pooja-bookings-service.spec.ts`                       | Modify (again)                                                            | Add coverage for `invitePandit`                                                                                                                                            |
| `src/modules/pooja-bookings/pooja-bookings.admin.routes.ts` | Modify (again)                                                            | Add `POST /v1/admin/pandits/{id}/invite`                                                                                                                                   |
| `test/pandits-invite-route.spec.ts`                         | Create                                                                    | Tests for the pandit invite endpoint                                                                                                                                       |
| `src/modules/pooja-bookings/pooja-bookings.repo.ts`         | Modify (again)                                                            | Add `listPoojaBookingsForPandit` and `findPoojaBookingById` for the provider-bookings and messaging extensions                                                             |
| `test/pooja-bookings-repo.spec.ts`                          | Modify (again)                                                            | Add coverage for `listPoojaBookingsForPandit` and `findPoojaBookingById`                                                                                                   |
| `src/modules/providers/provider.service.ts`                 | Modify — created by the Astrologer Marketplace Batch 1 plan, not this one | Add the `kind === 'pandit'` branch to `listProviderBookings`, and broaden its return type from `AstrologerBookingDto[]` to include the new local `toPoojaBookingDto` shape |
| `test/provider-service.spec.ts`                             | Modify — created by the Astrologer Marketplace Batch 1 plan, not this one | Replace the "empty list for kind pandit" case with real pandit-branch coverage                                                                                             |
| `src/modules/messaging/messaging.service.ts`                | Modify — created by the Astrologer Marketplace Batch 1 plan, not this one | Add a `pooja` branch to `resolveBookingParty`; generalize the `'astrologer'`-literal checks in `assertCallerIsParty` and `notifyOtherParty`                                |
| `test/messaging-service.spec.ts`                            | Modify — created by the Astrologer Marketplace Batch 1 plan, not this one | Replace the "rejects bookingType pooja" case with real pooja-branch coverage                                                                                               |

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

### Task 2: Pandits repo

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

### Task 3: Pooja-bookings repo — catalog, atomic create/debit, atomic refund, assign, complete

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

### Task 4: Pooja-bookings service layer + push notifications

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

### Task 5: Customer-facing routes + `app.ts` mounting

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

### Task 6: Admin-facing routes + `app.ts` mounting

**Why:** The three ops actions: add a pre-vetted pandit, assign one to a booking, and manually acknowledge completion. Gated by the canonical `requireAdmin` from `src/middleware/auth.ts`, built by the Admin Console Foundation plan and reused here directly (see "Before you start").

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

Create `src/modules/pooja-bookings/pooja-bookings.admin.routes.ts`, importing `requireAdmin` from `src/middleware/auth.ts` (the canonical middleware built by the Admin Console Foundation plan — see "Before you start"). `requireAdmin` already wraps `requireUser` internally, so this file imports `requireAdmin` only — do NOT also import or chain `requireUser` here:

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
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
  middleware: [requireAdmin] as const,
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
  middleware: [requireAdmin] as const,
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
  middleware: [requireAdmin] as const,
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

### Task 7: Seed script — `pooja_catalog` from the existing curated pooja list

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

## Provider accounts and chat for pandits

**DEPENDENCY:** these tasks require the Astrologer Marketplace Batch 1 plan's provider-auth/messaging tasks to be implemented first (they create `provider_accounts`, `requireProvider`, `requireUserOrProvider`, `src/modules/providers/`, and `src/modules/messaging/`). Implementation order for the 4 plans on this branch: **Admin Console Foundation → Shagun Affiliate Shop → Astrologer Marketplace Batch 1 → Pooja Booking Batch 1 (this plan, last)**.

**What already exists by the time these tasks run** (built by the Astrologer Marketplace Batch 1 plan — do not recreate any of it, reuse it exactly as named below):

- Table `provider_accounts` (`src/db/schema.ts`): `providerKindEnum = pgEnum('provider_kind', ['astrologer', 'pandit'])`; `providerAccounts` table with columns `id, kind, refId (uuid, no FK — polymorphic, points at astrologers.id or pandits.id depending on kind), firebaseUid (unique), displayName, createdAt`.
- `src/modules/providers/provider-accounts.repo.ts`: `findProviderAccountByFirebaseUid`, `findProviderAccountByKindAndRefId`, `createProviderAccount`.
- `src/middleware/auth.ts`: `requireProvider` (verifies the Firebase token, looks up `provider_accounts` by uid, sets `c.var.provider = { id, kind, refId, displayName }`) and `requireUserOrProvider` (tries `findUserByFirebaseUid` first, falls back to a provider lookup, sets whichever matched — after this middleware exactly one of `c.var.user` / `c.var.provider` is set, never both).
- `src/modules/providers/provider.routes.ts` + `provider.service.ts`: `GET /v1/provider/me` and `GET /v1/provider/bookings` (both `requireProvider`), the latter carrying an explicit `// TODO(pooja-booking plan): add a kind === 'pandit' branch here` marker inside its bookings-listing logic.
- Table `booking_messages` (`src/db/schema.ts`): `bookingMessageTypeEnum = pgEnum('booking_message_type', ['astrologer', 'pooja'])`, `bookingMessageSenderRoleEnum = pgEnum(..., ['customer', 'provider'])`; `bookingMessages` table with `id, bookingType, bookingId (uuid, no FK), senderRole, senderUserId (nullable FK→users), senderProviderAccountId (nullable uuid, no FK), body, readAt (nullable), createdAt`.
- `src/modules/messaging/` (`messaging.schemas.ts`, `messaging.repo.ts`, `messaging.service.ts`, `messaging.routes.ts`): repo has `createMessage`, `listMessagesForBooking`, `markMessagesRead`. Service has `sendMessage(caller, bookingType, bookingId, body)` and `listMessages(caller, bookingType, bookingId)`, which authorize the caller against the actual booking's customer/provider, then (for `sendMessage`) fire-and-forget push-notify the other party via `sendPush`/`sendPushBatch`. The astrologer plan's implementation currently throws `Errors.badRequest('pooja booking chat not yet available')` for `bookingType === 'pooja'`, structured as a small, obviously-extend-me early-return branch — not a full rewrite. Routes already mounted: `POST/GET /v1/bookings/:bookingType/:bookingId/messages`, `GET /v1/bookings/:bookingType/:bookingId/messages/stream` (SSE, server-side polling of the messages table).

**Why pandits get this at all:** the project owner decided pandits get real Firebase accounts and genuine chat with their customer, the same tier as astrologers — not an admin-relay, not magic links. Rather than build a second provider-auth/messaging stack, this plan's job is narrow: (1) a pandit-specific invite endpoint that provisions a `provider_accounts` row (Task 8), and (2) a `pooja` branch on each of the two shared functions above (Tasks 9 and 10). Unlike astrologer consultations (live back-and-forth during a paid session), pooja-booking chat is lower-frequency and logistics-oriented — confirming address/timing, sharing prep instructions, arranging a video call if the customer wants one — but it is the exact same generic messaging primitive underneath, just used less chattily. That's a usage-pattern difference, not a code difference — it's the reason this plan is content to reuse the shared mechanism rather than build a second one, not a reason to special-case it.

**A note on Tasks 9 and 10 specifically:** `provider.service.ts` and `messaging.service.ts` are owned by (and created by) the Astrologer Marketplace Batch 1 plan. Everything reused below — table/column names, middleware names, repo/service/route function names and signatures — comes from that plan's actual, implemented code, quoted verbatim in Tasks 9 and 10 below (not paraphrased, and not a guess at their shape). Both extension points turned out to need one small additional generalization beyond the single documented TODO/early-return line — `provider.service.ts#listProviderBookings`'s return type was pinned to `AstrologerBookingDto[]` and needed broadening, and `messaging.service.ts#assertCallerIsParty`/`notifyOtherParty` each hardcoded the literal `'astrologer'` in one place and needed it replaced with the resolved party's own `providerKind` — both are called out explicitly in Tasks 9 and 10 below, with the real before/after code, not left as an open assumption:

- Task 9: when `provider.kind === 'pandit'`, the bookings list comes from this plan's own `listPoojaBookingsForPandit(provider.refId)`, newest first.
- Task 10: for `bookingType === 'pooja'`, the caller is authorized as either the booking's customer (`booking.userId === user.id`) or its assigned pandit (`booking.panditId === provider.refId`, only when the caller is a provider of `kind === 'pandit'`), then proceeds through the same create/list/push-notify logic already used for `bookingType === 'astrologer'`.

---

### Task 8: Pandit login provisioning — `pandits.email` + `POST /v1/admin/pandits/{id}/invite`

**Why:** Gives pandits a real account. Mirrors the astrologer invite endpoint from the Marketplace Batch 1 plan exactly: 404 for an unknown pandit, 409 if already invited, otherwise a Firebase user + a `provider_accounts` row, with a one-time temporary password handed back to ops to relay off-platform (there is no email-sending integration in this batch — same manual-relay gap already documented elsewhere in this plan, e.g. pandit payouts). `pandits.phone` stays an ops-only contact number; `pandits.email`, added by this task, is the address the login gets created under — populated at invite time, not at roster-creation time, since a pandit can sit on the roster for a while before an admin decides to invite them.

**Files:**

- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/<next>_<generated>.sql` (generated)
- Modify: `src/modules/pooja-bookings/pandits.repo.ts`
- Modify: `test/pandits-repo.spec.ts`
- Modify: `src/modules/pooja-bookings/pooja-bookings.schemas.ts`
- Modify: `src/modules/pooja-bookings/pooja-bookings.service.ts`
- Modify: `test/pooja-bookings-service.spec.ts`
- Modify: `src/modules/pooja-bookings/pooja-bookings.admin.routes.ts`
- Create: `test/pandits-invite-route.spec.ts`

- [ ] **Step 1: Add the `email` column to `pandits` in `src/db/schema.ts`**

Replace the `pandits` comment block and add an `email` field right after `phone`:

```ts
/* -------------------------------------------------------------------------- */
/* pandits — the concierge pilot's admin-vetted pandit roster. Deliberately   */
/* separate from any `astrologers` table (a parallel, independent effort is   */
/* planning astrologer consultations separately) — pandits are a distinct    */
/* role, not unified with astrologers. `verified` defaults to true because,   */
/* in THIS batch, every pandit is added by an admin after off-platform        */
/* vetting — there is no self-onboarding route, so "verified" simply means    */
/* "an admin added this row", unlike the abandoned reference app's            */
/* self-signup-with-hardcoded-verified-true model, which had no real vetting  */
/* behind that flag at all. `phone` is nullable and remains an ops contact    */
/* number only — never a login credential. `email` is ALSO nullable, but for  */
/* a different reason: pandits now DO get a real login (Firebase Auth, via    */
/* POST /admin/pandits/:id/invite — see pooja-bookings.admin.routes.ts),      */
/* provisioned admin-invite-only, same as the roster itself. `email` is       */
/* populated at invite time from whatever address the admin supplies there,  */
/* not at roster-creation time — a pandit can sit on the roster a while with  */
/* no login before an admin decides to invite them.                          */
/* -------------------------------------------------------------------------- */

export const pandits = pgTable('pandits', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  displayName: text('display_name').notNull(),
  phone: text('phone'),
  email: text('email'),
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
```

- [ ] **Step 2: Generate and verify the migration**

Run: `pnpm db:generate`

Open the generated `.sql` file and confirm it contains ONLY:

- `ALTER TABLE "pandits" ADD COLUMN "email" text;`

If it contains any other statement, STOP and report BLOCKED — same snapshot-drift caution as Task 1, Step 2.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors (same baseline as before this task).

- [ ] **Step 4: Write the failing test for `updatePanditEmail`**

In `test/pandits-repo.spec.ts`, change the top of the file (the hoisted mock state, the `db.js` mock, and the repo import) from:

```ts
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
```

to:

```ts
const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: { insert: state.insert, select: state.select, update: state.update },
    sqlClient,
  };
});

import {
  createPandit,
  findPanditById,
  updatePanditEmail,
} from '../src/modules/pooja-bookings/pandits.repo.js';
```

Add `state.update.mockReset();` to the existing `beforeEach`:

```ts
beforeEach(() => {
  state.insert.mockReset();
  state.select.mockReset();
  state.update.mockReset();
});
```

Then append this to the end of the file:

```ts
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

describe('updatePanditEmail', () => {
  it("scopes the UPDATE's WHERE to this pandit id and sets the email", async () => {
    const { chain, calls } = makeUpdateChain([]);
    state.update.mockReturnValue(chain);

    await updatePanditEmail('pandit-1', 'ravi.shastri@example.com');

    expect(calls.set).toMatchObject({ email: 'ravi.shastri@example.com' });
    const query = compile(calls.where);
    expect(query.sql).toBe('"pandits"."id" = $1');
    expect(query.params).toEqual(['pandit-1']);
  });

  it('returns the updated row on success', async () => {
    const { chain } = makeUpdateChain([{ id: 'pandit-1', email: 'ravi.shastri@example.com' }]);
    state.update.mockReturnValue(chain);

    const result = await updatePanditEmail('pandit-1', 'ravi.shastri@example.com');

    expect(result).toMatchObject({ id: 'pandit-1', email: 'ravi.shastri@example.com' });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm test test/pandits-repo.spec.ts`
Expected: FAIL — `updatePanditEmail` is not exported yet.

- [ ] **Step 6: Implement `updatePanditEmail` in `src/modules/pooja-bookings/pandits.repo.ts`**

Append to the file (imports are unchanged — `eq` and `db` are already imported):

```ts
export async function updatePanditEmail(id: string, email: string): Promise<PanditRow | undefined> {
  const [row] = await db
    .update(pandits)
    .set({ email, updatedAt: new Date() })
    .where(eq(pandits.id, id))
    .returning();
  return row;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm test test/pandits-repo.spec.ts`
Expected: PASS (all cases, including the two new `updatePanditEmail` cases).

- [ ] **Step 8: Write the failing test for `invitePandit` (service layer)**

In `test/pooja-bookings-service.spec.ts`, extend the hoisted `state` object and add three new `vi.mock` calls. Change:

```ts
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
```

to:

```ts
const state = vi.hoisted(() => ({
  findPoojaCatalogItem: vi.fn(),
  createPoojaBooking: vi.fn(),
  refundPoojaBooking: vi.fn(),
  assignPanditToBooking: vi.fn(),
  completePoojaBooking: vi.fn(),
  listPoojaBookingsForUser: vi.fn(),
  listActivePoojas: vi.fn(),
  findPanditById: vi.fn(),
  updatePanditEmail: vi.fn(),
  findActiveTokensForUser: vi.fn(),
  sendPushBatch: vi.fn(),
  findProviderAccountByKindAndRefId: vi.fn(),
  createProviderAccount: vi.fn(),
  createFirebaseUser: vi.fn(),
}));
```

Update the `pandits.repo.js` mock to also export `updatePanditEmail`:

```ts
vi.mock('../src/modules/pooja-bookings/pandits.repo.js', () => ({
  findPanditById: state.findPanditById,
  updatePanditEmail: state.updatePanditEmail,
}));
```

Add two new `vi.mock` calls (alongside the existing ones):

```ts
vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByKindAndRefId: state.findProviderAccountByKindAndRefId,
  createProviderAccount: state.createProviderAccount,
}));

vi.mock('../src/config/firebase.js', () => ({
  getFirebaseAuth: () => ({ createUser: state.createFirebaseUser }),
}));
```

Add `invitePandit` to the destructured import from the module under test:

```ts
const {
  bookPooja,
  cancelBooking,
  listMyBookings,
  adminAssignPandit,
  adminCompleteBooking,
  listCatalog,
  invitePandit,
} = await import('../src/modules/pooja-bookings/pooja-bookings.service.js');
```

Then append this to the end of the file:

```ts
describe('invitePandit', () => {
  it('returns unknown_pandit when the pandit does not exist', async () => {
    state.findPanditById.mockResolvedValueOnce(undefined);

    const result = await invitePandit('pandit-1', 'ravi.shastri@example.com');

    expect(result).toEqual({ outcome: 'unknown_pandit' });
    expect(state.createFirebaseUser).not.toHaveBeenCalled();
  });

  it('returns already_invited when a provider_accounts row already exists for this pandit', async () => {
    state.findPanditById.mockResolvedValueOnce({ id: 'pandit-1', displayName: 'Ravi Shastri' });
    state.findProviderAccountByKindAndRefId.mockResolvedValueOnce({ id: 'pa-1' });

    const result = await invitePandit('pandit-1', 'ravi.shastri@example.com');

    expect(result).toEqual({ outcome: 'already_invited' });
    expect(state.findProviderAccountByKindAndRefId).toHaveBeenCalledWith('pandit', 'pandit-1');
    expect(state.createFirebaseUser).not.toHaveBeenCalled();
  });

  it('creates the Firebase user, records the email, creates the provider account, and returns the temporary password', async () => {
    state.findPanditById.mockResolvedValueOnce({ id: 'pandit-1', displayName: 'Ravi Shastri' });
    state.findProviderAccountByKindAndRefId.mockResolvedValueOnce(undefined);
    state.createFirebaseUser.mockResolvedValueOnce({ uid: 'firebase-uid-1' });

    const result = await invitePandit('pandit-1', 'ravi.shastri@example.com');

    expect(state.createFirebaseUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ravi.shastri@example.com' }),
    );
    expect(state.updatePanditEmail).toHaveBeenCalledWith('pandit-1', 'ravi.shastri@example.com');
    expect(state.createProviderAccount).toHaveBeenCalledWith({
      kind: 'pandit',
      refId: 'pandit-1',
      firebaseUid: 'firebase-uid-1',
      displayName: 'Ravi Shastri',
    });
    expect(result).toEqual({
      outcome: 'invited',
      email: 'ravi.shastri@example.com',
      temporaryPassword: expect.any(String),
    });
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `pnpm test test/pooja-bookings-service.spec.ts`
Expected: FAIL — `invitePandit` is not exported yet.

- [ ] **Step 10: Implement `invitePandit` in `src/modules/pooja-bookings/pooja-bookings.service.ts`**

Change the import block from:

```ts
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
```

to:

```ts
import crypto from 'node:crypto';
import { logger } from '../../lib/logger.js';
import { findActiveTokensForUser } from '../device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import { getFirebaseAuth } from '../../config/firebase.js';
import {
  findProviderAccountByKindAndRefId,
  createProviderAccount,
} from '../providers/provider-accounts.repo.js';
import {
  createPoojaBooking,
  refundPoojaBooking,
  assignPanditToBooking,
  completePoojaBooking,
  findPoojaCatalogItem,
  listPoojaBookingsForUser,
  listActivePoojas,
} from './pooja-bookings.repo.js';
import { findPanditById, updatePanditEmail } from './pandits.repo.js';
import type { PoojaBookingRow, PoojaCatalogRow } from '../../db/schema.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';
```

Then append this to the end of the file:

```ts
export type InvitePanditResult =
  | { outcome: 'invited'; email: string; temporaryPassword: string }
  | { outcome: 'unknown_pandit' }
  | { outcome: 'already_invited' };

/**
 * Provisions a real login for a pandit: a Firebase Auth user plus a shared
 * `provider_accounts` row (kind: 'pandit') — mirrors the astrologer invite
 * endpoint from the Marketplace Batch 1 plan exactly. `email` is supplied by
 * the calling admin at invite time (see pooja-bookings.admin.routes.ts) and
 * is persisted onto the pandit's own row via updatePanditEmail so there is a
 * durable record of what address the login was created under. The temporary
 * password is generated here (never chosen by the pandit) and returned once
 * for ops to relay off-platform — same manual-relay gap already documented
 * for pandit payouts elsewhere in this plan; there is no email-sending
 * integration in this batch.
 */
export async function invitePandit(panditId: string, email: string): Promise<InvitePanditResult> {
  const pandit = await findPanditById(panditId);
  if (!pandit) return { outcome: 'unknown_pandit' };

  const existing = await findProviderAccountByKindAndRefId('pandit', panditId);
  if (existing) return { outcome: 'already_invited' };

  const temporaryPassword = crypto.randomBytes(18).toString('base64url');
  const created = await getFirebaseAuth().createUser({ email, password: temporaryPassword });

  await updatePanditEmail(panditId, email);
  await createProviderAccount({
    kind: 'pandit',
    refId: panditId,
    firebaseUid: created.uid,
    displayName: pandit.displayName,
  });

  return { outcome: 'invited', email, temporaryPassword };
}
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `pnpm test test/pooja-bookings-service.spec.ts`
Expected: PASS (all cases, including the three new `invitePandit` cases).

- [ ] **Step 12: Write the failing test for the invite route**

Create `test/pandits-invite-route.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';
import type * as EnvModule from '../src/config/env.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  invitePandit: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

// Partial mock: keep every real env field and only override
// ADMIN_FIREBASE_UIDS — same importOriginal technique already used in
// test/pooja-bookings-admin-routes.spec.ts.
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
  createPandit: vi.fn(),
}));

vi.mock('../src/modules/pooja-bookings/pooja-bookings.service.js', () => ({
  adminAssignPandit: vi.fn(),
  adminCompleteBooking: vi.fn(),
  invitePandit: state.invitePandit,
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
  state.invitePandit.mockReset();
  setSignedInUser('admin-uid');
});

describe('POST /v1/admin/pandits/:id/invite', () => {
  const BODY = { email: 'ravi.shastri@example.com' };

  it('200s with the temporary password for an admin caller', async () => {
    state.invitePandit.mockResolvedValueOnce({
      outcome: 'invited',
      email: 'ravi.shastri@example.com',
      temporaryPassword: 'tmp-pw-123',
    });

    const res = await createApp().request(
      '/v1/admin/pandits/11111111-1111-1111-1111-111111111111/invite',
      { method: 'POST', headers: ADMIN_AUTH, body: JSON.stringify(BODY) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; temporaryPassword: string };
    expect(body).toEqual({ email: 'ravi.shastri@example.com', temporaryPassword: 'tmp-pw-123' });
    expect(state.invitePandit).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      'ravi.shastri@example.com',
    );
  });

  it('404s for an unknown pandit', async () => {
    state.invitePandit.mockResolvedValueOnce({ outcome: 'unknown_pandit' });

    const res = await createApp().request(
      '/v1/admin/pandits/11111111-1111-1111-1111-111111111111/invite',
      { method: 'POST', headers: ADMIN_AUTH, body: JSON.stringify(BODY) },
    );

    expect(res.status).toBe(404);
  });

  it('409s when the pandit already has a provider account', async () => {
    state.invitePandit.mockResolvedValueOnce({ outcome: 'already_invited' });

    const res = await createApp().request(
      '/v1/admin/pandits/11111111-1111-1111-1111-111111111111/invite',
      { method: 'POST', headers: ADMIN_AUTH, body: JSON.stringify(BODY) },
    );

    expect(res.status).toBe(409);
  });

  it('403s for a non-admin caller', async () => {
    setSignedInUser('not-an-admin');

    const res = await createApp().request(
      '/v1/admin/pandits/11111111-1111-1111-1111-111111111111/invite',
      { method: 'POST', headers: ADMIN_AUTH, body: JSON.stringify(BODY) },
    );

    expect(res.status).toBe(403);
    expect(state.invitePandit).not.toHaveBeenCalled();
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request(
      '/v1/admin/pandits/11111111-1111-1111-1111-111111111111/invite',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(BODY),
      },
    );
    expect(res.status).toBe(401);
  });

  it('422s on an invalid email', async () => {
    const res = await createApp().request(
      '/v1/admin/pandits/11111111-1111-1111-1111-111111111111/invite',
      { method: 'POST', headers: ADMIN_AUTH, body: JSON.stringify({ email: 'not-an-email' }) },
    );
    expect(res.status).toBe(422);
    expect(state.invitePandit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 13: Run the test to verify it fails**

Run: `pnpm test test/pandits-invite-route.spec.ts`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 14: Add the schemas and the route**

In `src/modules/pooja-bookings/pooja-bookings.schemas.ts`, append:

```ts
export const PanditIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const InvitePanditRequestSchema = z
  .object({ email: z.string().email() })
  .openapi('InvitePanditRequest');

export const InvitePanditResponseSchema = z
  .object({
    email: z.string().email(),
    temporaryPassword: z.string(),
  })
  .openapi('InvitePanditResponse');
```

In `src/modules/pooja-bookings/pooja-bookings.admin.routes.ts`, change the imports from:

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
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
```

to:

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { createPandit } from './pandits.repo.js';
import { adminAssignPandit, adminCompleteBooking, invitePandit } from './pooja-bookings.service.js';
import type { PoojaBookingRow } from '../../db/schema.js';
import {
  CreatePanditRequestSchema,
  PanditDtoSchema,
  AssignPanditRequestSchema,
  PoojaBookingDtoSchema,
  BookingIdParamSchema,
  PanditIdParamSchema,
  InvitePanditRequestSchema,
  InvitePanditResponseSchema,
} from './pooja-bookings.schemas.js';
```

Then append this to the end of the file (after the existing `completeRoute` handler):

```ts
const invitePanditRoute = createRoute({
  method: 'post',
  path: '/admin/pandits/{id}/invite',
  tags: ['Admin — Pooja Bookings'],
  summary:
    'Admin-only: provision a real login for a pandit (Firebase Auth + a shared provider_accounts row) — mirrors the astrologer invite endpoint from the Marketplace Batch 1 plan',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: PanditIdParamSchema,
    body: { content: { 'application/json': { schema: InvitePanditRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Pandit invited — relay the temporary password to them off-platform',
      content: { 'application/json': { schema: InvitePanditResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    404: errorResponse('Unknown pandit'),
    409: errorResponse('This pandit already has a provider account'),
    422: errorResponse('Invalid request body'),
  },
});

poojaBookingsAdminRouter.openapi(invitePanditRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { email } = c.req.valid('json');

  const result = await invitePandit(id, email);
  if (result.outcome === 'unknown_pandit') {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Unknown pandit.' } }, 404);
  }
  if (result.outcome === 'already_invited') {
    return c.json(
      { error: { code: 'CONFLICT', message: 'This pandit already has a provider account.' } },
      409,
    );
  }
  return c.json({ email: result.email, temporaryPassword: result.temporaryPassword }, 200);
});
```

- [ ] **Step 15: Run the test to verify it passes**

Run: `pnpm test test/pandits-invite-route.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 16: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 17: Commit**

```bash
git add src/db/schema.ts src/db/migrations/ src/modules/pooja-bookings/pandits.repo.ts test/pandits-repo.spec.ts src/modules/pooja-bookings/pooja-bookings.schemas.ts src/modules/pooja-bookings/pooja-bookings.service.ts test/pooja-bookings-service.spec.ts src/modules/pooja-bookings/pooja-bookings.admin.routes.ts test/pandits-invite-route.spec.ts
git commit -m "feat(pooja-bookings): add pandit login provisioning (pandits.email + invite endpoint)"
```

---

### Task 9: Extend `GET /v1/provider/bookings` with a `kind === 'pandit'` branch

**Why:** So a pandit signed in through the shared provider-portal auth can see their own assigned poojas. This plan owns the new `listPoojaBookingsForPandit` query (fully concrete, TDD'd below), plus a real (not assumed) patch to `provider.service.ts`'s TODO marker — see Step 3, which quotes and edits the actual `provider.service.ts` code from the Astrologer Marketplace Batch 1 plan's Task 6. Step 3 also patches `provider.routes.ts`'s `GET /v1/provider/bookings` response schema, which was pinned to `z.array(AstrologerBookingSchema)` — needed or the pandit branch's differently-shaped rows fail `pnpm typecheck` against that route's declared response type, and the OpenAPI doc would misdescribe the pandit response shape.

**Files:**

- Modify: `src/modules/pooja-bookings/pooja-bookings.repo.ts`
- Modify: `test/pooja-bookings-repo.spec.ts`
- Modify: `src/modules/providers/provider.service.ts` (created by the Astrologer Marketplace Batch 1 plan, not this one)
- Modify: `test/provider-service.spec.ts` (created by the Astrologer Marketplace Batch 1 plan's Task 6, not this one)
- Modify: `src/modules/providers/provider.routes.ts` (created by the Astrologer Marketplace Batch 1 plan's Task 7, not this one)

- [ ] **Step 1: Write the failing test for `listPoojaBookingsForPandit`**

In `test/pooja-bookings-repo.spec.ts`, add `listPoojaBookingsForPandit` to the existing import from the module under test:

```ts
import {
  listActivePoojas,
  findPoojaCatalogItem,
  createPoojaBooking,
  refundPoojaBooking,
  assignPanditToBooking,
  completePoojaBooking,
  findOwnedPoojaBooking,
  listPoojaBookingsForUser,
  listPoojaBookingsForPandit,
} from '../src/modules/pooja-bookings/pooja-bookings.repo.js';
```

Then append this to the end of the file:

```ts
describe('listPoojaBookingsForPandit', () => {
  it('filters on pandit_id and orders newest-first', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listPoojaBookingsForPandit('pandit-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"pooja_bookings"."pandit_id" = $1');
    expect(query.params).toEqual(['pandit-1']);
    expect(chain.orderBy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/pooja-bookings-repo.spec.ts`
Expected: FAIL — `listPoojaBookingsForPandit` is not exported yet.

- [ ] **Step 3: Implement `listPoojaBookingsForPandit` and wire it into the provider-bookings branch**

Append to `src/modules/pooja-bookings/pooja-bookings.repo.ts` (no new imports needed — `eq` and `desc` are already imported):

```ts
/**
 * Newest-first list of a pandit's assigned/completed/cancelled bookings —
 * powers the `kind === 'pandit'` branch of the shared
 * GET /v1/provider/bookings route (src/modules/providers/provider.service.ts,
 * built by the Astrologer Marketplace Batch 1 plan). Same shape as
 * listPoojaBookingsForUser, just scoped by pandit_id instead of user_id.
 */
export async function listPoojaBookingsForPandit(panditId: string): Promise<PoojaBookingRow[]> {
  return db
    .select()
    .from(poojaBookings)
    .where(eq(poojaBookings.panditId, panditId))
    .orderBy(desc(poojaBookings.createdAt));
}
```

**Verified against the real `provider.service.ts`** (Astrologer Marketplace Batch 1 plan, Task 6, Step 8 — quoted here exactly, not paraphrased):

```ts
import { findAstrologerById, listBookingsForAstrologer } from '../astrologers/astrologers.repo.js';
import { toAstrologerDto, toBookingDto } from '../astrologers/astrologers.service.js';
import type { AstrologerBookingDto } from '../astrologers/astrologers.schemas.js';
import type { ProviderMeDto } from './provider.schemas.js';

export interface ProviderIdentity {
  kind: 'astrologer' | 'pandit';
  refId: string;
  displayName: string;
}

// ... getProviderMe unchanged ...

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

It's a plain `if`/return (not a switch or lookup table), and the return type is currently pinned to `AstrologerBookingDto[]` — a pandit branch returning pooja-booking DTOs needs that type broadened too, not just the new branch. In `src/modules/providers/provider.service.ts`, change the imports from:

```ts
import { findAstrologerById, listBookingsForAstrologer } from '../astrologers/astrologers.repo.js';
import { toAstrologerDto, toBookingDto } from '../astrologers/astrologers.service.js';
import type { AstrologerBookingDto } from '../astrologers/astrologers.schemas.js';
import type { ProviderMeDto } from './provider.schemas.js';
```

to:

```ts
import { findAstrologerById, listBookingsForAstrologer } from '../astrologers/astrologers.repo.js';
import { toAstrologerDto, toBookingDto } from '../astrologers/astrologers.service.js';
import { listPoojaBookingsForPandit } from '../pooja-bookings/pooja-bookings.repo.js';
import type { AstrologerBookingDto } from '../astrologers/astrologers.schemas.js';
import type { PoojaBookingRow } from '../../db/schema.js';
import type { ProviderMeDto } from './provider.schemas.js';
```

Then replace `listProviderBookings` (leave `getProviderMe` untouched) with:

```ts
/**
 * DTO mapper for a pooja booking returned by GET /v1/provider/bookings for a
 * pandit provider. Same field shape as PoojaBookingDtoSchema
 * (pooja-bookings.schemas.ts) and the toBookingDto already duplicated
 * locally in pooja-bookings.routes.ts / pooja-bookings.admin.routes.ts — kept
 * local here too rather than newly exported from the pooja-bookings module,
 * matching that existing per-file convention instead of introducing a new
 * cross-module shared export for it.
 */
function toPoojaBookingDto(row: PoojaBookingRow) {
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

/** GET /v1/provider/bookings. */
export async function listProviderBookings(
  provider: Pick<ProviderIdentity, 'kind' | 'refId'>,
): Promise<(AstrologerBookingDto | ReturnType<typeof toPoojaBookingDto>)[]> {
  if (provider.kind === 'astrologer') {
    const rows = await listBookingsForAstrologer(provider.refId);
    return rows.map(toBookingDto);
  }
  const rows = await listPoojaBookingsForPandit(provider.refId);
  return rows.map(toPoojaBookingDto);
}
```

In `test/provider-service.spec.ts` (Astrologer Marketplace Batch 1 plan, Task 6, Step 5 — quoted exactly), add `listPoojaBookingsForPandit` to the hoisted state and mock it. Change:

```ts
const state = vi.hoisted(() => ({
  findAstrologerById: vi.fn(),
  listBookingsForAstrologer: vi.fn(),
}));
```

to:

```ts
const state = vi.hoisted(() => ({
  findAstrologerById: vi.fn(),
  listBookingsForAstrologer: vi.fn(),
  listPoojaBookingsForPandit: vi.fn(),
}));
```

Add a new mock alongside the existing `astrologers.repo.js` mock:

```ts
vi.mock('../src/modules/pooja-bookings/pooja-bookings.repo.js', () => ({
  listPoojaBookingsForPandit: state.listPoojaBookingsForPandit,
}));
```

Add `state.listPoojaBookingsForPandit.mockReset();` to the existing `beforeEach`. Add a fixture helper next to `makeBookingRow`:

```ts
function makePoojaBookingRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'pooja-booking-1',
    userId: 'user-1',
    birthProfileId: null,
    poojaId: 'pooja-1',
    panditId: 'pandit-1',
    preferredDate: '2026-08-01',
    shipAddress: '123 MG Road',
    shipPincode: '560001',
    status: 'assigned',
    pricePaisePaid: 110000,
    requestedAt: now,
    assignedAt: now,
    completedAt: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
```

Replace the existing `"returns an empty list for kind 'pandit' (no pooja_bookings repo query exists yet)"` test (that behavior no longer holds once this task lands) with:

```ts
it("lists the pandit's own pooja bookings when kind is pandit", async () => {
  const booking = makePoojaBookingRow();
  state.listPoojaBookingsForPandit.mockResolvedValueOnce([booking]);

  const result = await listProviderBookings({ kind: 'pandit', refId: 'pandit-1' });

  expect(state.listPoojaBookingsForPandit).toHaveBeenCalledWith('pandit-1');
  expect(state.listBookingsForAstrologer).not.toHaveBeenCalled();
  expect(result).toEqual([
    expect.objectContaining({ id: 'pooja-booking-1', panditId: 'pandit-1' }),
  ]);
});
```

**Also patch `provider.routes.ts`'s response schema.** Verified against the real file (Astrologer Marketplace Batch 1 plan, Task 7, Step 9 — quoted exactly): `GET /v1/provider/bookings`'s declared 200 response is `z.array(AstrologerBookingSchema)`, hardcoded to the astrologer shape:

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireProvider } from '../../middleware/auth.js';
import { AstrologerBookingSchema } from '../astrologers/astrologers.schemas.js';
import { getProviderMe, listProviderBookings } from './provider.service.js';
import { ProviderMeSchema } from './provider.schemas.js';
```

```ts
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
```

Left as-is, this doesn't just misdescribe the OpenAPI doc for a pandit caller — `listProviderBookings`'s now-broadened return type no longer matches what this route's declared response schema infers, so `c.json(rows, 200)` fails `pnpm typecheck`. In `src/modules/providers/provider.routes.ts`, change the import from:

```ts
import { AstrologerBookingSchema } from '../astrologers/astrologers.schemas.js';
```

to:

```ts
import { AstrologerBookingSchema } from '../astrologers/astrologers.schemas.js';
import { PoojaBookingDtoSchema } from '../pooja-bookings/pooja-bookings.schemas.js';
```

Then change the response schema from:

```ts
      content: { 'application/json': { schema: z.array(AstrologerBookingSchema) } },
```

to:

```ts
      content: {
        'application/json': {
          schema: z.array(z.union([AstrologerBookingSchema, PoojaBookingDtoSchema])),
        },
      },
```

Nothing else in `provider.routes.ts` changes — `bookingsRoute`'s handler already just forwards `listProviderBookings(provider)`'s result verbatim via `c.json(rows, 200)`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/pooja-bookings-repo.spec.ts`
Expected: PASS (all cases, including the new `listPoojaBookingsForPandit` case).

Also run: `pnpm test test/provider-service.spec.ts test/provider-routes.spec.ts`
Expected: PASS (all cases, including the updated pandit-branch case).

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pooja-bookings/pooja-bookings.repo.ts test/pooja-bookings-repo.spec.ts src/modules/providers/provider.service.ts test/provider-service.spec.ts src/modules/providers/provider.routes.ts
git commit -m "feat(pooja-bookings): add pandit branch to GET /v1/provider/bookings"
```

---

### Task 10: Extend the messaging service for `bookingType === 'pooja'`

**Why:** Turns on real chat between a customer and their assigned pandit, reusing the shared messaging primitive built by the Astrologer Marketplace Batch 1 plan rather than a second system. As with Task 9, the concrete edit target (`messaging.service.ts`) is owned by that plan — Step 3 below quotes and edits its actual code (Task 9, Step 8) rather than guessing its shape. Framing note: unlike astrologer consultations (live back-and-forth during a paid session), pooja-booking chat is lower-frequency and logistics-oriented — confirming address/timing, sharing prep instructions, arranging a video call if the customer wants one. That's purely a usage-pattern difference; the code is identical, which is exactly why this task extends the existing primitive instead of building a pooja-specific one.

**Files:**

- Modify: `src/modules/pooja-bookings/pooja-bookings.repo.ts`
- Modify: `test/pooja-bookings-repo.spec.ts`
- Modify: `src/modules/messaging/messaging.service.ts` (created by the Astrologer Marketplace Batch 1 plan, not this one)
- Modify: `test/messaging-service.spec.ts` (created by the Astrologer Marketplace Batch 1 plan's Task 9, not this one)

- [ ] **Step 1: Write the failing test for `findPoojaBookingById`**

Unlike `findOwnedPoojaBooking` (owner-scoped, used by the customer-facing cancel route), the messaging branch needs an unscoped lookup by id, since it must authorize the caller as _either_ the booking's customer _or_ its assigned pandit — it can't filter by `user_id` up front. In `test/pooja-bookings-repo.spec.ts`, add `findPoojaBookingById` to the existing import from the module under test:

```ts
import {
  listActivePoojas,
  findPoojaCatalogItem,
  createPoojaBooking,
  refundPoojaBooking,
  assignPanditToBooking,
  completePoojaBooking,
  findOwnedPoojaBooking,
  findPoojaBookingById,
  listPoojaBookingsForUser,
  listPoojaBookingsForPandit,
} from '../src/modules/pooja-bookings/pooja-bookings.repo.js';
```

Then append this to the end of the file:

```ts
describe('findPoojaBookingById', () => {
  it('filters on id only (no owner scoping — the messaging branch authorizes customer OR pandit)', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findPoojaBookingById('booking-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('"pooja_bookings"."id" = $1');
    expect(query.params).toEqual(['booking-1']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/pooja-bookings-repo.spec.ts`
Expected: FAIL — `findPoojaBookingById` is not exported yet.

- [ ] **Step 3: Implement `findPoojaBookingById` and wire it into the messaging service's `pooja` branch**

Append to `src/modules/pooja-bookings/pooja-bookings.repo.ts` (no new imports needed):

```ts
/**
 * Unscoped-by-owner lookup, used by the shared messaging service's `pooja`
 * branch (src/modules/messaging/messaging.service.ts, built by the
 * Astrologer Marketplace Batch 1 plan) to authorize a chat participant who
 * may be EITHER the booking's customer OR its assigned pandit — unlike
 * findOwnedPoojaBooking, which only ever checks one specific user_id.
 */
export async function findPoojaBookingById(
  bookingId: string,
): Promise<PoojaBookingRow | undefined> {
  const rows = await db
    .select()
    .from(poojaBookings)
    .where(eq(poojaBookings.id, bookingId))
    .limit(1);
  return rows[0];
}
```

**Verified against the real `messaging.service.ts`** (Astrologer Marketplace Batch 1 plan, Task 9, Step 8 — quoted exactly). There is no `loadBookingParticipants` helper; the real extension point is `resolveBookingParty`, which currently throws for `bookingType === 'pooja'`:

```ts
interface ResolvedParty {
  booking: AstrologerBookingRow;
  customerUserId: string;
  providerRefId: string;
}

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
```

Two things to correct here, both real, not hypothetical:

1. `resolveBookingParty`'s `pooja` branch is indeed the intended extension point (matches `bookingMessages`'s own doc comment in `src/db/schema.ts`, "see `messaging.service.ts#resolveBookingParty` for the extension point the Pooja Booking Batch 1 plan adds a second branch to").
2. `assertCallerIsParty` hardcodes `caller.providerKind !== 'astrologer'`. Left as-is, a signed-in `pandit` provider would ALWAYS fail this check regardless of what `resolveBookingParty` returns — the astrologer literal must become a comparison against the resolved party's own kind. This is a genuinely necessary second edit, not a scope-creep addition: without it, pandit chat cannot work. `notifyOtherParty` (below) similarly hardcodes `'astrologer'` twice (for the push lookup and the push copy) and needs the same generalization. `resolveBookingParty` stays the ONLY function that loads booking data differently per `bookingType`; these two are edited only to replace a literal `'astrologer'` with the resolved party's own `providerKind` — no new `bookingType`-specific branching is added to either.

In `src/modules/messaging/messaging.service.ts`, change the type-only import from:

```ts
import type { AstrologerBookingRow, BookingMessageRow } from '../../db/schema.js';
```

to:

```ts
import type { AstrologerBookingRow, BookingMessageRow, PoojaBookingRow } from '../../db/schema.js';
```

and add a new import alongside the existing ones:

```ts
import { findPoojaBookingById } from '../pooja-bookings/pooja-bookings.repo.js';
```

Then replace `ResolvedParty`, `resolveBookingParty`, and `assertCallerIsParty` with:

```ts
interface ResolvedParty {
  booking: AstrologerBookingRow | PoojaBookingRow;
  customerUserId: string;
  /** What assertCallerIsParty checks the caller's own providerKind against — 'astrologer' for bookingType 'astrologer', 'pandit' for bookingType 'pooja'. */
  providerKind: 'astrologer' | 'pandit';
  /** Null when a pooja booking hasn't been assigned a pandit yet. assertCallerIsParty fails closed in that case (no caller.providerRefId can equal null), same as any other mismatch — no extra null-check needed there. */
  providerRefId: string | null;
}

async function resolveBookingParty(
  bookingType: BookingType,
  bookingId: string,
): Promise<ResolvedParty> {
  if (bookingType === 'pooja') {
    const booking = await findPoojaBookingById(bookingId);
    if (!booking) throw Errors.notFound('Booking not found');
    return {
      booking,
      customerUserId: booking.userId,
      providerKind: 'pandit',
      providerRefId: booking.panditId,
    };
  }
  const booking = await findBookingById(bookingId);
  if (!booking) throw Errors.notFound('Booking not found');
  return {
    booking,
    customerUserId: booking.userId,
    providerKind: 'astrologer',
    providerRefId: booking.astrologerId,
  };
}

function assertCallerIsParty(caller: Caller, party: ResolvedParty): void {
  if (caller.role === 'customer') {
    if (party.customerUserId !== caller.userId) throw Errors.forbidden('Not your booking');
    return;
  }
  if (caller.providerKind !== party.providerKind || party.providerRefId !== caller.providerRefId) {
    throw Errors.forbidden('Not your assigned booking');
  }
}
```

`sendMessage` and `listMessages` themselves call `resolveBookingParty`/`assertCallerIsParty` and otherwise stay `bookingType`-agnostic — no changes needed to either function.

`notifyOtherParty` hardcodes `'astrologer'` for the provider-account lookup kind and the push copy text; it also needs a null guard now that `party.providerRefId` can be `null` (an unassigned pooja booking has nobody to notify on the provider side yet). Replace it with:

```ts
async function notifyOtherParty(caller: Caller, party: ResolvedParty): Promise<void> {
  if (caller.role === 'customer') {
    if (!party.providerRefId) return; // no provider assigned yet — nobody to notify
    const account = await findProviderAccountByKindAndRefId(
      party.providerKind,
      party.providerRefId,
    );
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
    party.providerKind === 'pandit'
      ? '💬 New message from your pandit'
      : '💬 New message from your astrologer',
    'You have a new message on your booking.',
    { type: 'booking_message', bookingId: party.booking.id },
  );
}
```

In `test/messaging-service.spec.ts` (Astrologer Marketplace Batch 1 plan, Task 9, Step 5 — quoted exactly), add `findPoojaBookingById` to the hoisted state and mock it. Change:

```ts
const state = vi.hoisted(() => ({
  findBookingById: vi.fn(),
  findProviderAccountByKindAndRefId: vi.fn(),
  createMessage: vi.fn(),
  listMessagesForBooking: vi.fn(),
  markMessagesRead: vi.fn(),
  findActiveTokensForUser: vi.fn(),
  sendPushBatch: vi.fn(),
}));
```

to:

```ts
const state = vi.hoisted(() => ({
  findBookingById: vi.fn(),
  findPoojaBookingById: vi.fn(),
  findProviderAccountByKindAndRefId: vi.fn(),
  createMessage: vi.fn(),
  listMessagesForBooking: vi.fn(),
  markMessagesRead: vi.fn(),
  findActiveTokensForUser: vi.fn(),
  sendPushBatch: vi.fn(),
}));
```

Add a new mock alongside the existing `astrologers.repo.js` one:

```ts
vi.mock('../src/modules/pooja-bookings/pooja-bookings.repo.js', () => ({
  findPoojaBookingById: state.findPoojaBookingById,
}));
```

Add a `makePoojaBooking` fixture next to the existing `makeBooking`:

```ts
function makePoojaBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pooja-booking-1',
    userId: 'user-1',
    birthProfileId: null,
    poojaId: 'pooja-1',
    panditId: 'pandit-1',
    preferredDate: '2026-08-01',
    shipAddress: '123 MG Road',
    shipPincode: '560001',
    status: 'assigned',
    pricePaisePaid: 110000,
    requestedAt: new Date('2026-01-01T00:00:00Z'),
    assignedAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
```

`beforeEach` already does `Object.values(state).forEach((fn) => fn.mockReset())`, so the new `findPoojaBookingById` mock is reset automatically — no change needed there. Replace the existing `"rejects bookingType 'pooja' — not yet implemented (extension point for the Pooja Booking plan)"` test (that behavior no longer holds once this task lands) with:

```ts
describe('sendMessage / listMessages — bookingType: pooja', () => {
  it('sendMessage succeeds for the booking customer', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking());
    state.createMessage.mockResolvedValueOnce(
      makeMessage({ bookingType: 'pooja', bookingId: 'pooja-booking-1' }),
    );
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    const dto = await sendMessage(
      { role: 'customer', userId: 'user-1' },
      'pooja',
      'pooja-booking-1',
      'hello',
    );

    expect(state.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ bookingType: 'pooja', bookingId: 'pooja-booking-1' }),
    );
    expect(dto).toMatchObject({ body: 'hello' });
  });

  it("sendMessage succeeds for the booking's assigned pandit", async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking());
    state.createMessage.mockResolvedValueOnce(
      makeMessage({ bookingType: 'pooja', bookingId: 'pooja-booking-1', senderRole: 'provider' }),
    );
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    await sendMessage(
      {
        role: 'provider',
        providerId: 'provider-1',
        providerKind: 'pandit',
        providerRefId: 'pandit-1',
      },
      'pooja',
      'pooja-booking-1',
      'namaste',
    );

    expect(state.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ senderRole: 'provider', senderProviderAccountId: 'provider-1' }),
    );
  });

  it('rejects a caller who is neither the customer nor the assigned pandit', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking());

    await expect(
      sendMessage(
        {
          role: 'provider',
          providerId: 'provider-2',
          providerKind: 'pandit',
          providerRefId: 'pandit-OTHER',
        },
        'pooja',
        'pooja-booking-1',
        'hi',
      ),
    ).rejects.toThrow('Not your assigned booking');
  });

  it('rejects an astrologer provider even if the refId happens to collide', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking());

    await expect(
      sendMessage(
        {
          role: 'provider',
          providerId: 'provider-3',
          providerKind: 'astrologer',
          providerRefId: 'pandit-1',
        },
        'pooja',
        'pooja-booking-1',
        'hi',
      ),
    ).rejects.toThrow('Not your assigned booking');
  });

  it('rejects any provider when the pooja booking has no pandit assigned yet', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking({ panditId: null }));

    await expect(
      sendMessage(
        {
          role: 'provider',
          providerId: 'provider-1',
          providerKind: 'pandit',
          providerRefId: 'pandit-1',
        },
        'pooja',
        'pooja-booking-1',
        'hi',
      ),
    ).rejects.toThrow('Not your assigned booking');
  });

  it('404s when the pooja booking does not exist', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(undefined);

    await expect(
      sendMessage({ role: 'customer', userId: 'user-1' }, 'pooja', 'missing-booking', 'hi'),
    ).rejects.toThrow('Booking not found');
  });

  it('listMessages returns the transcript for the assigned pandit', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking());
    state.listMessagesForBooking.mockResolvedValueOnce([
      makeMessage({ bookingType: 'pooja', bookingId: 'pooja-booking-1' }),
    ]);

    const rows = await listMessages(
      {
        role: 'provider',
        providerId: 'provider-1',
        providerKind: 'pandit',
        providerRefId: 'pandit-1',
      },
      'pooja',
      'pooja-booking-1',
    );

    expect(rows).toHaveLength(1);
    expect(state.markMessagesRead).toHaveBeenCalledWith('pooja', 'pooja-booking-1', 'provider');
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test test/pooja-bookings-repo.spec.ts`
Expected: PASS (all cases, including the new `findPoojaBookingById` case).

Also run: `pnpm test test/messaging-service.spec.ts`
Expected: PASS (all cases, including the new pooja-branch cases).

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no new typecheck errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pooja-bookings/pooja-bookings.repo.ts test/pooja-bookings-repo.spec.ts src/modules/messaging/messaging.service.ts test/messaging-service.spec.ts
git commit -m "feat(pooja-bookings): implement pooja-booking chat via the shared messaging service"
```

---

## After all 10 tasks: final review checklist (not a subagent task)

- `pnpm test && pnpm typecheck && pnpm lint` all clean — same pre-existing test failures and same (or fewer) pre-existing typecheck errors, no new ones.
- `GET /v1/pooja-bookings/catalog` returns exactly the 9 poojas seeded in Task 7 once Task 7's script has been run against the target database.
- Every admin route (`POST /v1/admin/pandits`, `POST /v1/admin/pandits/:id/invite`, `POST /v1/admin/pooja-bookings/:id/assign`, `POST /v1/admin/pooja-bookings/:id/complete`) 403s for a non-allowlisted caller and fails closed when `ADMIN_FIREBASE_UIDS` is unset. This plan does not define `requireAdmin` itself — confirm it really is being imported from `src/middleware/auth.ts` everywhere, not re-implemented.
- `refundPoojaBooking()`'s status-flip UPDATE is confirmed to be the sole concurrency guard (re-read the docstring and the Task 3 test asserting the exact `WHERE ... status IN ('requested','assigned')` clause) — no separate row-level lock or advisory lock was needed or added.
- `POST /v1/admin/pandits/:id/invite` 404s for an unknown pandit, 409s when a `provider_accounts` row already exists for `(kind: 'pandit', refId: id)`, and on success neither logs nor otherwise persists the plaintext temporary password anywhere but the single API response.
- `GET /v1/provider/bookings` for a signed-in pandit provider returns only that pandit's own bookings (via `listPoojaBookingsForPandit`), newest first — Task 9's wiring into `provider.service.ts` was written against that file's real, verified code (not an assumed shape); re-confirm at implementation time only that `provider.service.ts` hasn't drifted further since this plan was last updated. Also confirm `provider.routes.ts`'s response schema was updated to the `z.union([AstrologerBookingSchema, PoojaBookingDtoSchema])` shape (Task 9) — without it, `pnpm typecheck` fails once `listProviderBookings`'s return type is broadened.
- Pooja-booking chat (`POST/GET /v1/bookings/pooja/:bookingId/messages`) is reachable by the booking's customer and by its assigned pandit, and rejected for anyone else (a different customer, an unrelated pandit, an astrologer) — Task 10's wiring into `messaging.service.ts` was written against that file's real, verified code (not an assumed shape), including the `assertCallerIsParty`/`notifyOtherParty` generalizations it required beyond the single `resolveBookingParty` TODO; re-confirm at implementation time only that `messaging.service.ts` hasn't drifted further since this plan was last updated.
- Confirm the deferred-items list (pandit self-onboarding, multi-member sankalp, offerings/add-ons, video-proof, automated decline/reassignment, pandit payouts, a separate ops-initiated refund route, typing indicators/read receipts beyond `readAt`, file/image attachments, guaranteed push delivery, and any portal frontend UI) is NOT accidentally implemented by any task above — this batch is intentionally the small concierge pilot, now with real pandit accounts and chat bolted onto the shared provider system, nothing more.
- Do NOT merge `feat/prime-reports-batch2` to `main` — continue accumulating on this branch as with every prior batch on it.
