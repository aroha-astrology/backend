# Shagun Affiliate Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend-only Shagun affiliate shop to the Aroha Astrology API — a curated, seed-managed catalog of auspicious ceremonial gift products (gemstones, rudraksha, yantras, malas, idols, puja items, gift sets) that authenticated users can browse and click through to a third-party seller, with every click logged for referral-commission analytics.

**Architecture:** A new `shagun` module (`shagun.repo.ts` / `shagun.schemas.ts` / `shagun.service.ts` / `shagun.routes.ts`) mirrors the existing `device-tokens` module's four-file structure exactly. Two new Drizzle tables — `shagun_products` (the curated catalog) and `shagun_click_events` (a minimal click log) — back a two-route surface: `GET /v1/shagun/products` (list, optionally filtered by category) and `GET /v1/shagun/products/{id}/redirect` (log a click, then 302 to the affiliate URL). Both routes require `requireUser`, same as every other route in this backend. The catalog is populated by a one-off idempotent seed script (`scripts/seed-shagun-products.ts`), not an admin UI — there is no admin console yet and building one is explicitly out of scope. No cart, payment, inventory, shipping, AI generation, or wallet/credit involvement anywhere in this feature; it is plain CRUD + redirect, deliberately not modeled on `prime-reports`' unlock/generate machinery.

**Tech Stack:** Hono + `@hono/zod-openapi`, Drizzle ORM (Postgres), Zod, Vitest (all existing tests mock `db` — there is no live-DB test tier in this repo).

---

## Before you start

Measured directly in the worktree (`C:\dev\aroha-astrology\jyotish-backend\.worktrees\prime-reports-batch2`, branch `feat/prime-reports-batch2`, clean working tree) on 2026-07-23:

- **`pnpm test` baseline:** 4 failed test files / 101 passed (105 total files); 9 failed tests / 803 passed (812 total). The 4 pre-existing failing files are `test/billing-google-play.spec.ts` (3 failures), `test/health-report.spec.ts` (2 failures), `test/horoscope-jargon.spec.ts` (3 failures), `test/purchase-plan-notify.spec.ts` (1 failure) — all unrelated to this feature. **This exact set of 9 failures must still be the only failures after Tasks 1–6** (no new regressions); the passing count should grow by exactly the number of new tests added.
- **`pnpm typecheck` baseline:** exits with code 2, **104** pre-existing `error TS` lines, spanning `src/modules/telegram-bot/telegram-bot.commands.ts`, `test/billing-google-play.spec.ts`, `test/chat-second-chart-facts.spec.ts`, `test/dosha-descriptions.spec.ts`, `test/health-report.spec.ts`, `test/helpers/mocks.ts`, `test/telegram-bot.spec.ts`. None of these touch `src/db/schema.ts`, `src/app.ts`, or anything this plan creates — **this count must still be exactly 104 after Tasks 1–6.**
- **Migrations:** highest existing file is `src/db/migrations/0032_even_menace.sql` (confirmed via directory listing + `meta/_journal.json`). The next migration is **`0033`**.
- **No `.env` file exists in this worktree** (only `.env.example`) — `dotenv/config` (loaded by both `src/config/env.ts` and `drizzle.config.ts`) only reads `.env`, not `.env.local`. `pnpm db:generate` needs `DATABASE_URL` set to _any_ non-empty string — it's a pure offline schema-diff against `src/db/schema.ts` + `src/db/migrations/meta/*.json` and never opens a real connection. Actually **applying** the generated migration (`pnpm db:migrate`) requires a real reachable Postgres and is a deploy-time step, out of scope for this plan.
- **Test layout fact:** every test lives flat under the top-level `test/` directory (`vitest.config.ts`'s `include: ['test/**/*.{test,spec}.ts']`), never colocated with `src/modules/**`. Repo-layer tests mock `db` from `../src/config/db.js` via `vi.mock` and assert on compiled SQL using `drizzle-orm/pg-core/dialect`'s `PgDialect`; route-layer tests mock `firebase-admin/app`, `firebase-admin/auth`, `../src/modules/users/users.repo.js`, and the module's own service/repo, then exercise the real `createApp()` over HTTP.
- **Category taxonomy source of truth:** `src/lib/shared/lib/productDetect.ts`'s `ProductCategory` type is `'gemstone' | 'rudraksha' | 'yantra' | 'mala' | 'idol' | 'puja-item'` (6 values, used by the AI chat product detector). This plan's `shagunProductCategoryEnum` reuses all 6 verbatim and adds a 7th, `'gift-set'`, for curated bundles that don't fit the chat detector's per-item categories.
- **Free abuse protection:** `src/app.ts` already applies `rateLimiter({ windowMs: 60_000, max: 300, name: 'baseline' })` to `app.use('/v1/*', ...)` _before_ any router is mounted, so both new routes inherit a 300/min/IP ceiling with zero extra work.
- **Error helper (verified against real source):** `src/lib/errors.ts` exports `AppError` (a class with `code`/`status`/`details`) and an `Errors` factory object with `Errors.notFound(message)` → `new AppError('NOT_FOUND', message)`, mapped to HTTP 404. The global `app.onError(errorHandler)` (registered in `src/app.ts`) catches any thrown `AppError` and formats the response — route/service code just throws, it never has to format the error response itself.
- **`.openapi()` 3-argument validation-hook pattern — verified precedent exists**: `src/modules/palm/palm-photo.routes.ts` and `src/modules/public/public.routes.ts` both already call `.openapi(route, handler, (result, c) => {...})` to override the library's default 400-on-invalid-query-param behavior with a custom 422 response shape. This plan's list route follows the same established pattern.
- **Drizzle-kit fact confirmed against precedent migrations** (`0030_transit_events.sql`, `0032_even_menace.sql`, etc.): a `pgEnum` + two `pgTable`s with an FK and a partial `index(...).where(...)` reliably generates `CREATE TYPE ... AS ENUM(...)` wrapped in a `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$;` block, `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, and `CREATE INDEX IF NOT EXISTS ... WHERE ...` statements, each separated by `--> statement-breakpoint`.

## File structure

| File                                                              | Action                    | Responsibility                                                                                       |
| ----------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/db/schema.ts`                                                | Modify                    | Add `shagunProductCategoryEnum`, `shagunProducts`, `shagunClickEvents` table definitions + row types |
| `src/db/migrations/0033_add_shagun_shop.sql`                      | Create (generated)        | Drizzle-kit-generated SQL for the two new tables                                                     |
| `src/db/migrations/meta/0033_snapshot.json`, `meta/_journal.json` | Create/Modify (generated) | Drizzle-kit migration bookkeeping                                                                    |
| `src/modules/shagun/shagun.schemas.ts`                            | Create                    | Zod request/response schemas + `ShagunProductCategory`/`ShagunProductDto` types                      |
| `src/modules/shagun/shagun.repo.ts`                               | Create                    | Drizzle queries: list active products, find one active product, log a click                          |
| `src/modules/shagun/shagun.service.ts`                            | Create                    | DTO mapping + click-then-redirect business logic                                                     |
| `src/modules/shagun/shagun.routes.ts`                             | Create                    | `GET /shagun/products`, `GET /shagun/products/{id}/redirect`                                         |
| `src/app.ts`                                                      | Modify                    | Import + mount `shagunRouter` under `/v1`                                                            |
| `scripts/seed-shagun-products.ts`                                 | Create                    | Idempotent seed script for the curated catalog (mirrors `scripts/seed-coupons.ts`)                   |
| `test/shagun-schema.spec.ts`                                      | Create                    | Schema-shape regression test                                                                         |
| `test/shagun-repo.spec.ts`                                        | Create                    | Repo query tests (mocked `db`)                                                                       |
| `test/shagun-schemas.spec.ts`                                     | Create                    | Zod schema parse/reject tests                                                                        |
| `test/shagun-service.spec.ts`                                     | Create                    | Service-layer DTO mapping + click/redirect tests                                                     |
| `test/shagun-routes.spec.ts`                                      | Create                    | HTTP route tests via `createApp()`                                                                   |
| `test/seed-shagun-products.spec.ts`                               | Create                    | Curated-data shape tests                                                                             |

---

### Task 1: Database schema + migration

**Files:**

- Modify: `src/db/schema.ts`
- Create: `test/shagun-schema.spec.ts`
- Create (generated): `src/db/migrations/0033_add_shagun_shop.sql`, `src/db/migrations/meta/0033_snapshot.json`, `src/db/migrations/meta/_journal.json` (modified)

- [ ] **Step 1: Write the failing test**

Create `test/shagun-schema.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shagunClickEvents, shagunProductCategoryEnum, shagunProducts } from '../src/db/schema.js';

describe('shagunProductCategoryEnum', () => {
  it("matches productDetect.ts's ProductCategory taxonomy, plus gift-set", () => {
    expect(shagunProductCategoryEnum.enumValues).toEqual([
      'gemstone',
      'rudraksha',
      'yantra',
      'mala',
      'idol',
      'puja-item',
      'gift-set',
    ]);
  });
});

describe('shagunProducts table', () => {
  it('defines every column the catalog needs', () => {
    expect(shagunProducts.id).toBeDefined();
    expect(shagunProducts.category).toBeDefined();
    expect(shagunProducts.name).toBeDefined();
    expect(shagunProducts.description).toBeDefined();
    expect(shagunProducts.imageUrl).toBeDefined();
    expect(shagunProducts.priceRangeText).toBeDefined();
    expect(shagunProducts.affiliateUrl).toBeDefined();
    expect(shagunProducts.isActive).toBeDefined();
    expect(shagunProducts.sortOrder).toBeDefined();
    expect(shagunProducts.createdAt).toBeDefined();
    expect(shagunProducts.updatedAt).toBeDefined();
  });
});

describe('shagunClickEvents table', () => {
  it('defines every column the click log needs', () => {
    expect(shagunClickEvents.id).toBeDefined();
    expect(shagunClickEvents.productId).toBeDefined();
    expect(shagunClickEvents.userId).toBeDefined();
    expect(shagunClickEvents.clickedAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- shagun-schema`
Expected failure: the import fails with something like `SyntaxError: The requested module '../src/db/schema.js' does not provide an export named 'shagunProducts'` (or `shagunClickEvents` / `shagunProductCategoryEnum` undefined at the `expect(...).toBeDefined()` assertions) — these exports don't exist yet.

- [ ] **Step 3: Write minimal implementation**

Append to the end of `src/db/schema.ts` (after `TransitAlertCopyRow`/`NewTransitAlertCopyRow` at the end of the file):

```ts
/* -------------------------------------------------------------------------- */
/* shagun_products — curated affiliate catalog for auspicious ceremonial gifts */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors (and extends with 'gift-set') the categories already used by the
 * AI chat product detector — see src/lib/shared/lib/productDetect.ts's
 * ProductCategory type. Keep these two lists in sync.
 */
export const shagunProductCategoryEnum = pgEnum('shagun_product_category', [
  'gemstone',
  'rudraksha',
  'yantra',
  'mala',
  'idol',
  'puja-item',
  'gift-set',
]);

/**
 * A curated, seed-script-managed catalog of third-party affiliate products
 * (see scripts/seed-shagun-products.ts) — there is no admin UI for this yet.
 * Aroha never sells or ships these itself; it earns a referral commission
 * when a user clicks through via GET /v1/shagun/products/{id}/redirect
 * (shagun.routes.ts), which is why there's no price/inventory/order data
 * here — only a display-only `priceRangeText` and the outbound
 * `affiliateUrl`.
 */
export const shagunProducts = pgTable(
  'shagun_products',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    category: shagunProductCategoryEnum('category').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    /** Display-only text like "₹500–1500" — never a real chargeable price. */
    priceRangeText: text('price_range_text'),
    affiliateUrl: text('affiliate_url').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    /** Ascending display order within a category listing. */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    activeCategorySortIdx: index('shagun_products_active_category_sort_idx')
      .on(table.category, table.sortOrder)
      .where(sql`${table.isActive} = true`),
  }),
);

export type ShagunProductRow = typeof shagunProducts.$inferSelect;
export type NewShagunProductRow = typeof shagunProducts.$inferInsert;

/* -------------------------------------------------------------------------- */
/* shagun_click_events — click-through log for the Shagun affiliate catalog   */
/* -------------------------------------------------------------------------- */

/**
 * One row per click on GET /v1/shagun/products/{id}/redirect — enough for
 * basic per-product click-count analytics. No session/referrer tracking by
 * design. `userId` is nullable for forward-compatibility with a possible
 * future logged-out surface, even though v1 only ever reaches this route
 * through `requireUser`.
 */
export const shagunClickEvents = pgTable(
  'shagun_click_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    productId: uuid('product_id')
      .notNull()
      .references(() => shagunProducts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    clickedAt: timestamp('clicked_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    productIdx: index('shagun_click_events_product_id_idx').on(table.productId),
  }),
);

export type ShagunClickEventRow = typeof shagunClickEvents.$inferSelect;
export type NewShagunClickEventRow = typeof shagunClickEvents.$inferInsert;
```

Then generate the migration (offline, doesn't need a reachable DB — `DATABASE_URL` just needs to be non-empty to satisfy `drizzle.config.ts`'s guard):

```bash
DATABASE_URL=postgres://localhost:5432/dummy pnpm db:generate -- --name=add_shagun_shop
```

This creates `src/db/migrations/0033_add_shagun_shop.sql` (and the matching `meta/0033_snapshot.json` + updates `meta/_journal.json`). Confirm it contains, in this shape (statement order may vary slightly, but every one of these must be present):

```sql
DO $$ BEGIN
 CREATE TYPE "public"."shagun_product_category" AS ENUM('gemstone', 'rudraksha', 'yantra', 'mala', 'idol', 'puja-item', 'gift-set');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shagun_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "shagun_product_category" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"price_range_text" text,
	"affiliate_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shagun_click_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shagun_click_events" ADD CONSTRAINT "shagun_click_events_product_id_shagun_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shagun_products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shagun_click_events" ADD CONSTRAINT "shagun_click_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shagun_products_active_category_sort_idx" ON "shagun_products" USING btree ("category","sort_order") WHERE "shagun_products"."is_active" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shagun_click_events_product_id_idx" ON "shagun_click_events" USING btree ("product_id");
```

If drizzle-kit's actual output differs in statement ordering or wording, trust the tool's real output over this prediction — just confirm both `CREATE TABLE` statements, the enum, and both FK constraints are present.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- shagun-schema`
Expected: 3 tests pass. Also run `pnpm typecheck` and confirm it still fails with exactly 104 pre-existing errors (no new ones from `schema.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/migrations/0033_add_shagun_shop.sql src/db/migrations/meta/0033_snapshot.json src/db/migrations/meta/_journal.json test/shagun-schema.spec.ts
git commit -m "feat(shagun): add shagun_products and shagun_click_events schema + migration"
```

---

### Task 2: Schemas layer

**Files:**

- Create: `src/modules/shagun/shagun.schemas.ts`
- Create: `test/shagun-schemas.spec.ts`

**Must run before Task 3** — `shagun.repo.ts` (Task 3) imports `ShagunProductCategory` from this file.

- [ ] **Step 1: Write the failing test**

Create `test/shagun-schemas.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ShagunProductCategorySchema,
  ShagunProductIdParamSchema,
  ShagunProductListQuerySchema,
  ShagunProductSchema,
} from '../src/modules/shagun/shagun.schemas.js';

describe('ShagunProductCategorySchema', () => {
  it('accepts every category in the taxonomy', () => {
    for (const category of [
      'gemstone',
      'rudraksha',
      'yantra',
      'mala',
      'idol',
      'puja-item',
      'gift-set',
    ]) {
      expect(() => ShagunProductCategorySchema.parse(category)).not.toThrow();
    }
  });

  it('rejects an unknown category', () => {
    expect(() => ShagunProductCategorySchema.parse('crystal-ball')).toThrow();
  });
});

describe('ShagunProductListQuerySchema', () => {
  it('allows an omitted category', () => {
    const parsed = ShagunProductListQuerySchema.parse({});
    expect(parsed.category).toBeUndefined();
  });

  it('accepts a valid category', () => {
    const parsed = ShagunProductListQuerySchema.parse({ category: 'yantra' });
    expect(parsed.category).toBe('yantra');
  });

  it('rejects an invalid category', () => {
    expect(() => ShagunProductListQuerySchema.parse({ category: 'nope' })).toThrow();
  });
});

describe('ShagunProductIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    expect(() =>
      ShagunProductIdParamSchema.parse({ id: '11111111-1111-1111-1111-111111111111' }),
    ).not.toThrow();
  });

  it('rejects a non-UUID id', () => {
    expect(() => ShagunProductIdParamSchema.parse({ id: 'not-a-uuid' })).toThrow();
  });
});

describe('ShagunProductSchema', () => {
  it('parses a full product DTO', () => {
    const dto = {
      id: '11111111-1111-1111-1111-111111111111',
      category: 'idol' as const,
      name: 'Ganesha Idol (Brass)',
      description: 'Handcrafted brass Ganesha idol.',
      imageUrl: 'https://images.example.com/ganesha.jpg',
      priceRangeText: '₹1,200–₹4,500',
      sortOrder: 0,
    };
    expect(() => ShagunProductSchema.parse(dto)).not.toThrow();
  });

  it('rejects a DTO missing required fields', () => {
    expect(() =>
      ShagunProductSchema.parse({ id: '11111111-1111-1111-1111-111111111111' }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- shagun-schemas`
Expected failure: `Cannot find module '../src/modules/shagun/shagun.schemas.js'` — the module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/modules/shagun/shagun.schemas.ts`:

```ts
import { z } from '@hono/zod-openapi';

export const ShagunProductCategorySchema = z.enum([
  'gemstone',
  'rudraksha',
  'yantra',
  'mala',
  'idol',
  'puja-item',
  'gift-set',
]);

export type ShagunProductCategory = z.infer<typeof ShagunProductCategorySchema>;

/**
 * Public read model — deliberately omits `affiliateUrl` (same "don't expose
 * the raw link/secret" reasoning as device-tokens.schemas.ts's
 * DeviceTokenSchema omitting the raw push token). Clients link to
 * GET /shagun/products/{id}/redirect instead, so every visit is click-tracked.
 */
export const ShagunProductSchema = z
  .object({
    id: z.string().uuid(),
    category: ShagunProductCategorySchema,
    name: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string().nullable(),
    priceRangeText: z.string().nullable(),
    sortOrder: z.number().int(),
  })
  .openapi('ShagunProduct');

export type ShagunProductDto = z.infer<typeof ShagunProductSchema>;

export const ShagunProductListSchema = z
  .object({ items: z.array(ShagunProductSchema) })
  .openapi('ShagunProductList');

export const ShagunProductListQuerySchema = z.object({
  category: ShagunProductCategorySchema.optional().openapi({
    param: { name: 'category', in: 'query' },
    example: 'gemstone',
  }),
});

export const ShagunProductIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- shagun-schemas`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/shagun/shagun.schemas.ts test/shagun-schemas.spec.ts
git commit -m "feat(shagun): add product Zod schemas"
```

---

### Task 3: Repo layer

**Files:**

- Create: `src/modules/shagun/shagun.repo.ts`
- Create: `test/shagun-repo.spec.ts`

**Depends on:** Task 2 (imports `ShagunProductCategory` from `shagun.schemas.js`).

- [ ] **Step 1: Write the failing test**

Create `test/shagun-repo.spec.ts`:

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
  return { db: { insert: state.insert, select: state.select }, sqlClient };
});

import { shagunClickEvents } from '../src/db/schema.js';
import {
  findActiveShagunProductById,
  insertShagunClickEvent,
  listActiveShagunProducts,
} from '../src/modules/shagun/shagun.repo.js';

const dialect = new PgDialect();
/** Compiles a captured Drizzle SQL fragment to the SQL string + params Postgres would actually receive. */
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  orderBy: (...cols: unknown[]) => Promise<unknown[]>;
  limit: (n: number) => Promise<unknown[]>;
}

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown; orderBy?: unknown[] } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn((...cols: unknown[]) => {
      calls.orderBy = cols;
      return Promise.resolve(result);
    }),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return { chain, calls };
}

function makeInsertNoReturningChain() {
  const calls: { values?: unknown } = {};
  const chain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return Promise.resolve(undefined);
    }),
  };
  return { chain, calls };
}

beforeEach(() => {
  state.insert.mockReset();
  state.select.mockReset();
});

describe('listActiveShagunProducts', () => {
  it('filters to isActive = true and orders by sortOrder ascending when no category given', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listActiveShagunProducts();

    const query = compile(calls.where);
    expect(query.sql).toBe('"shagun_products"."is_active" = $1');
    expect(query.params).toEqual([true]);
    expect(calls.orderBy).toBeDefined();
  });

  it('filters to isActive = true AND category = <category> when a category is given', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await listActiveShagunProducts('gemstone');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("shagun_products"."is_active" = $1 and "shagun_products"."category" = $2)',
    );
    expect(query.params).toEqual([true, 'gemstone']);
  });

  it('returns the rows from the query', async () => {
    const rows = [{ id: 'p1' }, { id: 'p2' }];
    const { chain } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await listActiveShagunProducts();

    expect(result).toBe(rows);
  });
});

describe('findActiveShagunProductById', () => {
  it('filters to id = <id> AND isActive = true', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findActiveShagunProductById('product-1');

    const query = compile(calls.where);
    expect(query.sql).toBe('("shagun_products"."id" = $1 and "shagun_products"."is_active" = $2)');
    expect(query.params).toEqual(['product-1', true]);
  });

  it('returns the found row', async () => {
    const row = { id: 'product-1', affiliateUrl: 'https://example.com/p1' };
    const { chain } = makeSelectChain([row]);
    state.select.mockReturnValue(chain);

    const result = await findActiveShagunProductById('product-1');

    expect(result).toBe(row);
  });

  it('returns undefined when nothing matches', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const result = await findActiveShagunProductById('missing');

    expect(result).toBeUndefined();
  });
});

describe('insertShagunClickEvent', () => {
  it('inserts a click event row with the given productId and userId', async () => {
    const { chain, calls } = makeInsertNoReturningChain();
    state.insert.mockReturnValue(chain);

    await insertShagunClickEvent('product-1', 'user-1');

    expect(state.insert).toHaveBeenCalledWith(shagunClickEvents);
    expect(calls.values).toEqual({ productId: 'product-1', userId: 'user-1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- shagun-repo`
Expected failure: `Cannot find module '../src/modules/shagun/shagun.repo.js'` — the module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/modules/shagun/shagun.repo.ts`:

```ts
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { shagunClickEvents, shagunProducts, type ShagunProductRow } from '../../db/schema.js';
import type { ShagunProductCategory } from './shagun.schemas.js';

/** Active products, optionally filtered to one category, sorted for display. */
export async function listActiveShagunProducts(
  category?: ShagunProductCategory,
): Promise<ShagunProductRow[]> {
  return db
    .select()
    .from(shagunProducts)
    .where(
      category
        ? and(eq(shagunProducts.isActive, true), eq(shagunProducts.category, category))
        : eq(shagunProducts.isActive, true),
    )
    .orderBy(asc(shagunProducts.sortOrder));
}

/**
 * A single active product by id — used to resolve the affiliate URL for the
 * redirect endpoint. Returns undefined for an unknown id OR one that's been
 * deactivated, so both cases 404 alike.
 */
export async function findActiveShagunProductById(
  id: string,
): Promise<ShagunProductRow | undefined> {
  const rows = await db
    .select()
    .from(shagunProducts)
    .where(and(eq(shagunProducts.id, id), eq(shagunProducts.isActive, true)))
    .limit(1);
  return rows[0];
}

/** Logs one click — analytics only, no read path depends on this. */
export async function insertShagunClickEvent(productId: string, userId: string): Promise<void> {
  await db.insert(shagunClickEvents).values({ productId, userId });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- shagun-repo`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/shagun/shagun.repo.ts test/shagun-repo.spec.ts
git commit -m "feat(shagun): add product/click-event repo queries"
```

---

### Task 4: Service layer

**Files:**

- Create: `src/modules/shagun/shagun.service.ts`
- Create: `test/shagun-service.spec.ts`

**Depends on:** Tasks 2 and 3.

- [ ] **Step 1: Write the failing test**

Create `test/shagun-service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  listActiveShagunProducts: vi.fn(),
  findActiveShagunProductById: vi.fn(),
  insertShagunClickEvent: vi.fn(),
}));

vi.mock('../src/modules/shagun/shagun.repo.js', () => ({
  listActiveShagunProducts: state.listActiveShagunProducts,
  findActiveShagunProductById: state.findActiveShagunProductById,
  insertShagunClickEvent: state.insertShagunClickEvent,
}));

import {
  listShagunProducts,
  recordShagunClickAndGetRedirectUrl,
  toShagunProductDto,
} from '../src/modules/shagun/shagun.service.js';

beforeEach(() => {
  state.listActiveShagunProducts.mockReset();
  state.findActiveShagunProductById.mockReset();
  state.insertShagunClickEvent.mockReset();
});

describe('toShagunProductDto', () => {
  it('maps a product row to its public DTO, omitting affiliateUrl', () => {
    const row = {
      id: 'p1',
      category: 'gemstone' as const,
      name: 'Yellow Sapphire (Pukhraj)',
      description: 'For Jupiter strength.',
      imageUrl: 'https://example.com/pukhraj.jpg',
      priceRangeText: '₹5000–15000',
      affiliateUrl: 'https://affiliate.example.com/pukhraj?ref=aroha',
      isActive: true,
      sortOrder: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const dto = toShagunProductDto(row);

    expect(dto).toEqual({
      id: 'p1',
      category: 'gemstone',
      name: 'Yellow Sapphire (Pukhraj)',
      description: 'For Jupiter strength.',
      imageUrl: 'https://example.com/pukhraj.jpg',
      priceRangeText: '₹5000–15000',
      sortOrder: 1,
    });
    expect(dto).not.toHaveProperty('affiliateUrl');
  });
});

describe('listShagunProducts', () => {
  it('delegates to the repo with the given category and maps rows to DTOs', async () => {
    state.listActiveShagunProducts.mockResolvedValueOnce([
      {
        id: 'p1',
        category: 'gemstone',
        name: 'Yellow Sapphire',
        description: null,
        imageUrl: null,
        priceRangeText: null,
        affiliateUrl: 'https://affiliate.example.com/p1',
        isActive: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await listShagunProducts('gemstone');

    expect(state.listActiveShagunProducts).toHaveBeenCalledWith('gemstone');
    expect(result).toEqual([
      {
        id: 'p1',
        category: 'gemstone',
        name: 'Yellow Sapphire',
        description: null,
        imageUrl: null,
        priceRangeText: null,
        sortOrder: 0,
      },
    ]);
  });

  it('passes undefined through when no category filter is given', async () => {
    state.listActiveShagunProducts.mockResolvedValueOnce([]);

    await listShagunProducts(undefined);

    expect(state.listActiveShagunProducts).toHaveBeenCalledWith(undefined);
  });
});

describe('recordShagunClickAndGetRedirectUrl', () => {
  it('logs the click and returns the affiliate URL when the product is active', async () => {
    state.findActiveShagunProductById.mockResolvedValueOnce({
      id: 'p1',
      affiliateUrl: 'https://affiliate.example.com/p1?ref=aroha',
    });

    const url = await recordShagunClickAndGetRedirectUrl('p1', 'user-1');

    expect(url).toBe('https://affiliate.example.com/p1?ref=aroha');
    expect(state.insertShagunClickEvent).toHaveBeenCalledWith('p1', 'user-1');
  });

  it('throws a NOT_FOUND error without logging a click when the product does not exist or is inactive', async () => {
    state.findActiveShagunProductById.mockResolvedValueOnce(undefined);

    await expect(recordShagunClickAndGetRedirectUrl('missing', 'user-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(state.insertShagunClickEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- shagun-service`
Expected failure: `Cannot find module '../src/modules/shagun/shagun.service.js'` — the module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/modules/shagun/shagun.service.ts`:

```ts
import type { ShagunProductRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import {
  findActiveShagunProductById,
  insertShagunClickEvent,
  listActiveShagunProducts,
} from './shagun.repo.js';
import type { ShagunProductCategory, ShagunProductDto } from './shagun.schemas.js';

export function toShagunProductDto(row: ShagunProductRow): ShagunProductDto {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    priceRangeText: row.priceRangeText,
    sortOrder: row.sortOrder,
  };
}

export async function listShagunProducts(
  category?: ShagunProductCategory,
): Promise<ShagunProductDto[]> {
  const rows = await listActiveShagunProducts(category);
  return rows.map(toShagunProductDto);
}

/**
 * Logs the click, then returns the affiliate URL to redirect to. Throws
 * NOT_FOUND (mapped to a 404 by the global errorHandler — same
 * throw-and-let-the-global-handler-format-it pattern as
 * device-tokens.service.ts's revokeDeviceToken) for an unknown or
 * deactivated product, WITHOUT logging a click for it.
 */
export async function recordShagunClickAndGetRedirectUrl(
  productId: string,
  userId: string,
): Promise<string> {
  const product = await findActiveShagunProductById(productId);
  if (!product) throw Errors.notFound('Product not found');
  await insertShagunClickEvent(productId, userId);
  return product.affiliateUrl;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- shagun-service`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/shagun/shagun.service.ts test/shagun-service.spec.ts
git commit -m "feat(shagun): add product listing and click-redirect service"
```

---

### Task 5: Routes + app mount

**Files:**

- Create: `src/modules/shagun/shagun.routes.ts`
- Modify: `src/app.ts`
- Create: `test/shagun-routes.spec.ts`

**Depends on:** Task 4.

- [ ] **Step 1: Write the failing test**

Create `test/shagun-routes.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';
import { AppError } from '../src/lib/errors.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  listShagunProducts: vi.fn(),
  recordShagunClickAndGetRedirectUrl: vi.fn(),
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

vi.mock('../src/modules/shagun/shagun.service.js', () => ({
  listShagunProducts: state.listShagunProducts,
  recordShagunClickAndGetRedirectUrl: state.recordShagunClickAndGetRedirectUrl,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token' } as const;
const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.listShagunProducts.mockReset();
  state.recordShagunClickAndGetRedirectUrl.mockReset();
});

describe('GET /v1/shagun/products', () => {
  it('200s with the active product list', async () => {
    state.listShagunProducts.mockResolvedValueOnce([
      {
        id: 'p1',
        category: 'gemstone',
        name: 'Yellow Sapphire',
        description: null,
        imageUrl: null,
        priceRangeText: '₹5000–15000',
        sortOrder: 0,
      },
    ]);

    const res = await createApp().request('/v1/shagun/products', { headers: AUTH });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; category: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: 'p1', category: 'gemstone' });
    expect(state.listShagunProducts).toHaveBeenCalledWith(undefined);
  });

  it('passes the category query param through to the service', async () => {
    state.listShagunProducts.mockResolvedValueOnce([]);

    const res = await createApp().request('/v1/shagun/products?category=rudraksha', {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect(state.listShagunProducts).toHaveBeenCalledWith('rudraksha');
  });

  it('422s on an invalid category', async () => {
    const res = await createApp().request('/v1/shagun/products?category=not-a-category', {
      headers: AUTH,
    });
    expect(res.status).toBe(422);
    expect(state.listShagunProducts).not.toHaveBeenCalled();
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/shagun/products');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/shagun/products/:id/redirect', () => {
  it('302s to the affiliate URL and logs the click', async () => {
    state.recordShagunClickAndGetRedirectUrl.mockResolvedValueOnce(
      'https://affiliate.example.com/p1?ref=aroha',
    );

    const res = await createApp().request(`/v1/shagun/products/${PRODUCT_ID}/redirect`, {
      headers: AUTH,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://affiliate.example.com/p1?ref=aroha');
    expect(state.recordShagunClickAndGetRedirectUrl).toHaveBeenCalledWith(PRODUCT_ID, 'id-1');
  });

  it('404s when the product does not exist or is inactive', async () => {
    state.recordShagunClickAndGetRedirectUrl.mockRejectedValueOnce(
      new AppError('NOT_FOUND', 'Product not found'),
    );

    const res = await createApp().request(`/v1/shagun/products/${PRODUCT_ID}/redirect`, {
      headers: AUTH,
    });

    expect(res.status).toBe(404);
  });

  it('422s on a malformed id', async () => {
    const res = await createApp().request('/v1/shagun/products/not-a-uuid/redirect', {
      headers: AUTH,
    });
    expect(res.status).toBe(422);
    expect(state.recordShagunClickAndGetRedirectUrl).not.toHaveBeenCalled();
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request(`/v1/shagun/products/${PRODUCT_ID}/redirect`);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- shagun-routes`
Expected failure: `Cannot find module '../src/modules/shagun/shagun.service.js'` fails to resolve via `vi.mock` (no such source module exists yet), or every request 404s via the global not-found handler since `/v1/shagun/*` isn't mounted in `src/app.ts` yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/modules/shagun/shagun.routes.ts`:

```ts
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import {
  ShagunProductIdParamSchema,
  ShagunProductListQuerySchema,
  ShagunProductListSchema,
} from './shagun.schemas.js';
import { listShagunProducts, recordShagunClickAndGetRedirectUrl } from './shagun.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('ShagunError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const shagunRouter = new OpenAPIHono();

const listRoute = createRoute({
  method: 'get',
  path: '/shagun/products',
  tags: ['Shagun'],
  summary: 'List the active Shagun affiliate product catalog',
  description:
    'Curated gemstones, rudraksha, yantras, malas, idols, puja items, and gift sets, ' +
    'each linking out to a third-party seller. Aroha does not sell or ship these itself ' +
    '— it earns a referral commission via GET /shagun/products/{id}/redirect.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: { query: ShagunProductListQuerySchema },
  responses: {
    200: {
      description: 'Active products, sorted by sortOrder ascending',
      content: { 'application/json': { schema: ShagunProductListSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Invalid category'),
  },
});

shagunRouter.openapi(
  listRoute,
  async (c) => {
    const { category } = c.req.valid('query');
    const items = await listShagunProducts(category);
    return c.json({ items }, 200);
  },
  // Same reasoning as public.routes.ts / palm-photo.routes.ts: the library's
  // own no-hook default resolves a failed query validation to a plain
  // `c.json(result, 400)`, but this route's documented contract is 422 —
  // mapped explicitly here instead of relying on that default.
  (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'UNPROCESSABLE',
            message: 'Validation failed',
            details: result.error.flatten(),
          },
        },
        422,
      );
    }
  },
);

// Plain (non-`.openapi()`) route: a 302 redirect has no JSON response body,
// which doesn't fit the typed `.openapi()` response contract — same reasoning
// as the PDF route at prime-reports.routes.ts, which established this
// plain-route-with-positional-middleware pattern for the same kind of
// non-JSON response.
shagunRouter.get('/shagun/products/:id/redirect', requireUser, async (c) => {
  const user = c.get('user');
  const parsedId = ShagunProductIdParamSchema.safeParse({ id: c.req.param('id') });
  if (!parsedId.success) {
    return c.json(
      {
        error: {
          code: 'UNPROCESSABLE',
          message: 'Validation failed',
          details: parsedId.error.flatten(),
        },
      },
      422,
    );
  }

  const affiliateUrl = await recordShagunClickAndGetRedirectUrl(parsedId.data.id, user.id);
  return c.redirect(affiliateUrl, 302);
});
```

Modify `src/app.ts`: add the import next to `palmPhotoRouter`'s import (line 23) —

```ts
import { palmPhotoRouter } from './modules/palm/palm-photo.routes.js';
import { shagunRouter } from './modules/shagun/shagun.routes.js';
```

— and mount it right after `palmPhotoRouter` (line 73), before the `/internal` routers:

```ts
app.route('/v1', palmPhotoRouter);
app.route('/v1', shagunRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- shagun-routes`
Expected: 9 tests pass. Then run the full suite: `pnpm test` — expect exactly the same 4 pre-existing failing files / 9 failing tests as the "Before you start" baseline, with the passing count up by all new tests added so far (schemas 9 + repo 7 + service 5 + routes 9 + schema 3 = 33). Run `pnpm typecheck` — expect exactly the same 104 pre-existing errors, none new.

- [ ] **Step 5: Commit**

```bash
git add src/modules/shagun/shagun.routes.ts src/app.ts test/shagun-routes.spec.ts
git commit -m "feat(shagun): add GET /v1/shagun/products and redirect routes"
```

---

### Task 6: Seed script

**Files:**

- Create: `scripts/seed-shagun-products.ts`
- Create: `test/seed-shagun-products.spec.ts`

**Depends on:** Task 1 (schema).

- [ ] **Step 1: Write the failing test**

Create `test/seed-shagun-products.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SEED_SHAGUN_PRODUCTS } from '../scripts/seed-shagun-products.js';

const ALL_CATEGORIES = [
  'gemstone',
  'rudraksha',
  'yantra',
  'mala',
  'idol',
  'puja-item',
  'gift-set',
] as const;

describe('SEED_SHAGUN_PRODUCTS', () => {
  it('covers every product category at least once', () => {
    const seenCategories = new Set(SEED_SHAGUN_PRODUCTS.map((p) => p.category));
    for (const category of ALL_CATEGORIES) {
      expect(seenCategories.has(category)).toBe(true);
    }
  });

  it('has no duplicate product names', () => {
    const names = SEED_SHAGUN_PRODUCTS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every product a unique, ascending sortOrder starting at 0', () => {
    const sortOrders = SEED_SHAGUN_PRODUCTS.map((p) => p.sortOrder).sort((a, b) => a - b);
    expect(sortOrders).toEqual(SEED_SHAGUN_PRODUCTS.map((_, i) => i));
  });

  it('gives every product an https affiliateUrl', () => {
    for (const product of SEED_SHAGUN_PRODUCTS) {
      expect(product.affiliateUrl.startsWith('https://')).toBe(true);
    }
  });

  it('marks every seed product active', () => {
    for (const product of SEED_SHAGUN_PRODUCTS) {
      expect(product.isActive).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- seed-shagun-products`
Expected failure: `Cannot find module '../scripts/seed-shagun-products.js'` — the script doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/seed-shagun-products.ts`:

```ts
/**
 * Seeds the curated Shagun affiliate product catalog. Idempotent —
 * re-running updates existing rows (matched by product name) instead of
 * duplicating. The `affiliateUrl` values below are placeholders — replace
 * them with real negotiated affiliate/commission links before seeding a
 * production database. There is no admin UI for this catalog (out of scope
 * for this feature) — edit this file and re-run to change the catalog.
 * Usage: npx tsx scripts/seed-shagun-products.ts
 */
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from '../src/config/db.js';
import { shagunProducts, type NewShagunProductRow } from '../src/db/schema.js';

export const SEED_SHAGUN_PRODUCTS: NewShagunProductRow[] = [
  {
    category: 'gemstone',
    name: 'Yellow Sapphire (Pukhraj)',
    description:
      'Certified natural Pukhraj for Jupiter (Guru) strength — career, wisdom, marriage.',
    imageUrl: 'https://images.example.com/shagun/yellow-sapphire.jpg',
    priceRangeText: '₹5,000–₹18,000',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-PUKHRAJ?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 0,
  },
  {
    category: 'gemstone',
    name: 'Blue Sapphire (Neelam)',
    description:
      'Certified natural Neelam for Saturn (Shani) — wear only after astrological confirmation.',
    imageUrl: 'https://images.example.com/shagun/blue-sapphire.jpg',
    priceRangeText: '₹8,000–₹25,000',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-NEELAM?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 1,
  },
  {
    category: 'rudraksha',
    name: '5-Mukhi Rudraksha Mala (108 Beads)',
    description: 'Original certified 5-Mukhi rudraksha mala for Jupiter — calm and focus.',
    imageUrl: 'https://images.example.com/shagun/5-mukhi-mala.jpg',
    priceRangeText: '₹800–₹2,500',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-5MUKHI?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 2,
  },
  {
    category: 'yantra',
    name: 'Shri Yantra (Brass, 3-inch)',
    description: 'Hand-engraved brass Shri Yantra for prosperity and abundance.',
    imageUrl: 'https://images.example.com/shagun/shri-yantra.jpg',
    priceRangeText: '₹600–₹2,000',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-SHRIYANTRA?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 3,
  },
  {
    category: 'yantra',
    name: 'Kuber Yantra (Brass)',
    description: 'Brass Kuber Yantra for wealth and financial stability.',
    imageUrl: 'https://images.example.com/shagun/kuber-yantra.jpg',
    priceRangeText: '₹500–₹1,800',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-KUBERYANTRA?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 4,
  },
  {
    category: 'mala',
    name: 'Tulsi Mala (108 Beads)',
    description: 'Original Tulsi wood mala for japa and daily wear.',
    imageUrl: 'https://images.example.com/shagun/tulsi-mala.jpg',
    priceRangeText: '₹300–₹900',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-TULSIMALA?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 5,
  },
  {
    category: 'idol',
    name: 'Ganesha Idol (Brass)',
    description: 'Handcrafted brass Ganesha idol for the home altar or gifting.',
    imageUrl: 'https://images.example.com/shagun/ganesha-idol.jpg',
    priceRangeText: '₹1,200–₹4,500',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-GANESHAIDOL?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 6,
  },
  {
    category: 'puja-item',
    name: 'Copper Kalash (Puja Set)',
    description: 'Traditional copper kalash for daily and festival puja.',
    imageUrl: 'https://images.example.com/shagun/copper-kalash.jpg',
    priceRangeText: '₹700–₹2,200',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-KALASH?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 7,
  },
  {
    category: 'gift-set',
    name: 'Ganesh-Lakshmi Diwali Puja Gift Set',
    description: 'Idol pair, diya, and incense in a gift-ready box for Diwali shagun.',
    imageUrl: 'https://images.example.com/shagun/diwali-gift-set.jpg',
    priceRangeText: '₹1,500–₹4,000',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-DIWALISET?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 8,
  },
  {
    category: 'gift-set',
    name: 'Griha Pravesh Shagun Gift Hamper',
    description: 'Curated housewarming hamper — coconut, kalash, toran, and sweets box.',
    imageUrl: 'https://images.example.com/shagun/griha-pravesh-hamper.jpg',
    priceRangeText: '₹1,800–₹5,000',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-GRIHAPRAVESH?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 9,
  },
];

async function main() {
  for (const p of SEED_SHAGUN_PRODUCTS) {
    const [existing] = await db
      .select({ id: shagunProducts.id })
      .from(shagunProducts)
      .where(eq(shagunProducts.name, p.name))
      .limit(1);

    if (existing) {
      await db
        .update(shagunProducts)
        .set({
          category: p.category,
          description: p.description,
          imageUrl: p.imageUrl,
          priceRangeText: p.priceRangeText,
          affiliateUrl: p.affiliateUrl,
          isActive: p.isActive,
          sortOrder: p.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(shagunProducts.id, existing.id));
      console.log(`Updated shagun product "${p.name}"`);
    } else {
      await db.insert(shagunProducts).values(p);
      console.log(`Inserted shagun product "${p.name}"`);
    }
  }
}

// Guards against running `main()` as a side effect of importing this module
// (e.g. test/seed-shagun-products.spec.ts imports SEED_SHAGUN_PRODUCTS) —
// only runs when this file is executed directly via `npx tsx`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- seed-shagun-products`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-shagun-products.ts test/seed-shagun-products.spec.ts
git commit -m "feat(shagun): add curated affiliate product seed script"
```

---

### Task 7: Final verification (no commit)

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: exactly the same 4 pre-existing failing files (`billing-google-play.spec.ts`, `health-report.spec.ts`, `horoscope-jargon.spec.ts`, `purchase-plan-notify.spec.ts`) / 9 failing tests as the "Before you start" baseline — no new failures. Passed-test count should increase by all new tests added across Tasks 1–6 (schema 3 + schemas 9 + repo 7 + service 5 + routes 9 + seed 5 = 38 new tests) — reconcile against whatever the actual final count is; the important invariant is _zero new failures_, not an exact predicted number.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: still exits 2 with exactly **104** pre-existing `error TS` lines in the same 7 files listed in "Before you start" — none in `src/db/schema.ts`, `src/app.ts`, or any `src/modules/shagun/**` / `scripts/seed-shagun-products.ts` / `test/shagun-*.spec.ts` / `test/seed-shagun-products.spec.ts` file.

If either check surfaces a new failure or error attributable to this feature's files, fix it and re-run before considering the plan complete — do not commit a fix under Task 7 (there's nothing to commit here); instead amend whichever Task's commit introduced the regression with a new follow-up commit.

---

## Self-review notes

- Verified against the real source (not assumed) before finalizing this plan: `src/lib/errors.ts`'s `AppError`/`Errors.notFound` shape, the `.openapi()` 3-argument validation-hook precedent in `palm-photo.routes.ts`/`public.routes.ts`, `device-tokens.schemas.ts`'s "omit the raw secret from the read DTO" pattern, and the exact `src/app.ts` line numbers for the `palmPhotoRouter` import/mount to anchor this module's own import/mount next to it.
- Deliberately NOT modeled on `prime-reports`' unlock/generate/translate machinery — this feature has no AI generation and no wallet/credit spend, so that machinery would be pure overbuild.
- No admin UI in this batch — catalog changes go through editing `scripts/seed-shagun-products.ts` and re-running it. A real admin console (tracked separately) can replace this later without any schema change.
