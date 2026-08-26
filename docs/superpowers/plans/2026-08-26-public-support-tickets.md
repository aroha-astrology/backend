# Public (anonymous) support ticket form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor with no Aroha account submit a support request from the landing site's `/support` page, and have it land in the same admin ticket queue the in-app help flow already uses.

**Architecture:** `support_tickets.user_id` becomes nullable with a new `contact_name`/`contact_email` fallback, guarded by a DB-level CHECK so a ticket can never have neither. A new unauthenticated `POST /v1/public/support/tickets` route (rate-limited by IP, honeypot-protected) reuses the existing `createTicket`/`notifySupportTicket` pipeline. The landing page gets a real form behind a same-origin API proxy (matching the existing `/api/kundli` pattern). The admin ticket table/modal (`frontend/app/admin/tickets`) branches to show contact info instead of a user id when `userId` is null — everything else about that screen is untouched.

**Tech Stack:** Hono + `@hono/zod-openapi` + Drizzle + Postgres (`jyotish-backend`), Next.js App Router (`landing`, `frontend`), Vitest.

**Spec:** `jyotish-backend/docs/superpowers/specs/2026-08-26-public-support-tickets-design.md`

---

## Task 1: Schema — nullable `userId` + contact columns

**Files:**

- Modify: `C:\dev\aroha-astrology\jyotish-backend\src\db\schema.ts:2254-2279`
- Generated: `C:\dev\aroha-astrology\jyotish-backend\src\db\migrations\0061_*.sql` (name chosen by drizzle-kit)

- [ ] **Step 1: Edit the `supportTickets` table definition**

In `schema.ts`, replace the `supportTickets` table body (currently lines 2254-2279) with:

```ts
export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // Nullable — a ticket filed from the public /support form (no account)
    // has no userId. contactName/contactEmail are the fallback identity for
    // that case; the CHECK constraint added by this migration (hand-appended
    // to the generated SQL, not modeled here) enforces "one or the other."
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    // Only set when userId is null. Encrypted at rest via field-encryption.ts,
    // same convention as message/adminNote below.
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    category: text('category').notNull(),
    message: text('message').notNull(),
    locale: text('locale'),
    // Nullable — an older client build may not send it.
    appVersion: text('app_version'),
    status: text('status').notNull().default('open'),
    adminNote: text('admin_note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => ({
    userIdx: index('support_tickets_user_id_idx').on(table.userId),
    statusIdx: index('support_tickets_status_idx').on(table.status),
  }),
);
```

(Only two real changes: `userId` drops `.notNull()`, and `contactName`/`contactEmail` are new.)

- [ ] **Step 2: Generate the migration**

Run (from `jyotish-backend`, with `DATABASE_URL` set in `.env` as every prior migration in this repo requires):

```bash
npm run db:generate
```

Expected: a new file `src/db/migrations/0061_<two-word-slug>.sql` (drizzle-kit picks the slug; don't rename it) plus updated `src/db/migrations/meta/_journal.json` and a new `meta/0061_snapshot.json`. The generated SQL should contain an `ALTER TABLE "support_tickets" ALTER COLUMN "user_id" DROP NOT NULL` and two `ADD COLUMN` statements for `contact_name text` / `contact_email text`.

- [ ] **Step 3: Hand-append the CHECK constraint**

Drizzle's schema builder here has no existing `check()` precedent in this codebase, so add the constraint as plain SQL at the end of the generated `0061_*.sql` file:

```sql
ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_identity_check"
  CHECK ("user_id" IS NOT NULL OR "contact_email" IS NOT NULL);
```

- [ ] **Step 4: Apply the migration to your local/dev database**

```bash
npm run db:migrate
```

Expected: no errors. Confirm with `psql "$DATABASE_URL" -c '\d support_tickets'` (or your DB client of choice) that `user_id` is nullable, `contact_name`/`contact_email` exist, and `support_tickets_identity_check` is listed under Check constraints.

- [ ] **Step 5: Commit**

```bash
cd C:/dev/aroha-astrology/jyotish-backend
git add src/db/schema.ts src/db/migrations/0061_*.sql src/db/migrations/meta/_journal.json src/db/migrations/meta/0061_snapshot.json
git commit -m "feat(support): make support_tickets.user_id nullable, add contact_name/contact_email

Lets a ticket exist without an account (the public /support form has none
to attach to) while a CHECK constraint still guarantees every ticket has
SOME identity — userId or contactEmail."
```

---

## Task 2: Schemas — public ticket body + widen admin DTO

**Files:**

- Modify: `C:\dev\aroha-astrology\jyotish-backend\src\modules\support\support.schemas.ts`

- [ ] **Step 1: Add `CreatePublicTicketBodySchema`**

Add this block after `CreateTicketBody`'s type export (i.e. right after line 22, before `SupportTicketSchema`):

```ts
/**
 * Anonymous/unauthenticated ticket — no bearer token, so the submitter
 * identifies themselves via name/email instead of an account. `website` is a
 * honeypot: a real visitor never sees or fills it (hidden client-side on the
 * landing form). It deliberately has NO length/format constraint and isn't
 * `.openapi()`-documented — a schema-level 422 on it would just teach a bot
 * to omit the field and retry; instead the route handler checks it and
 * silently drops the submission while still returning 201. See
 * support.routes.ts's createPublicTicketRoute handler.
 */
export const CreatePublicTicketBodySchema = z
  .object({
    name: z.string().min(1).max(100).openapi({ example: 'Priya Sharma' }),
    email: z.string().email().max(255).openapi({ example: 'priya@example.com' }),
    category: z.string().min(1).max(100).openapi({ example: 'billing' }),
    message: z.string().min(1).max(5000).openapi({
      example: 'I was double-charged for my Kundli report.',
    }),
    website: z.string().optional(),
  })
  .openapi('CreatePublicSupportTicketBody');

export type CreatePublicTicketBody = z.infer<typeof CreatePublicTicketBodySchema>;
```

- [ ] **Step 2: Widen `AdminSupportTicketSchema`**

Replace the existing `AdminSupportTicketSchema` block with:

```ts
/** Admin-facing shape — carries `userId`/`contactName`/`contactEmail` (whose ticket, or who to contact if there's no account) and `adminNote` (internal), unlike the caller-facing SupportTicketSchema. */
export const AdminSupportTicketSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid().nullable(),
    contactName: z.string().nullable(),
    contactEmail: z.string().nullable(),
    category: z.string(),
    message: z.string(),
    locale: z.string().nullable(),
    appVersion: z.string().nullable(),
    status: z.string(),
    adminNote: z.string().nullable(),
    createdAt: z.string(),
    resolvedAt: z.string().nullable(),
  })
  .openapi('AdminSupportTicket');
```

(`SupportTicketSchema`, the caller-facing shape used by the authenticated `/support/tickets` endpoints, is untouched — it already omits `userId` and has no reason to carry contact fields for a signed-in user's own ticket.)

- [ ] **Step 3: Commit**

```bash
cd C:/dev/aroha-astrology/jyotish-backend
git add src/modules/support/support.schemas.ts
git commit -m "feat(support): add CreatePublicTicketBodySchema, widen AdminSupportTicketSchema"
```

---

## Task 3: Repo — anonymous insert + contact-field encryption

**Files:**

- Modify: `C:\dev\aroha-astrology\jyotish-backend\src\modules\support\support.repo.ts`
- Test: `C:\dev\aroha-astrology\jyotish-backend\test\support-repo.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add to `test/support-repo.spec.ts`, inside the existing `describe('createSupportTicket — encryption round trip', ...)` block (after the "defaults locale/appVersion to null" test, before the "throws if insert returns no row" test):

```ts
it('creates an anonymous ticket (no userId) from contactName/contactEmail, encrypting both', async () => {
  const { chain, calls } = makeInsertChain();
  // makeInsertChain's fake row doesn't echo contactName/contactEmail —
  // extend it here so decryptRow has something to decrypt.
  chain.returning = vi.fn(() =>
    Promise.resolve([
      {
        id: 'ticket-1',
        userId: null,
        contactName: calls.values.contactName,
        contactEmail: calls.values.contactEmail,
        category: calls.values.category,
        message: calls.values.message,
        locale: null,
        appVersion: null,
        status: 'open',
        adminNote: null,
        createdAt: new Date('2026-08-26T00:00:00Z'),
        resolvedAt: null,
      },
    ]),
  );
  state.insert.mockReturnValue(chain);

  const result = await createSupportTicket({
    contactName: 'Priya Sharma',
    contactEmail: 'priya@example.com',
    category: 'billing',
    message: 'I was double-charged.',
  });

  expect(calls.values.userId).toBeNull();
  expect(calls.values.contactName).toMatch(/^enc:v1:/);
  expect(calls.values.contactEmail).toMatch(/^enc:v1:/);
  expect(result.userId).toBeNull();
  expect(result.contactName).toBe('Priya Sharma');
  expect(result.contactEmail).toBe('priya@example.com');
});

it('stores null contactName/contactEmail for an authenticated (in-app) ticket', async () => {
  const { chain, calls } = makeInsertChain();
  state.insert.mockReturnValue(chain);

  await createSupportTicket({ userId: 'user-1', category: 'billing', message: 'help' });

  expect(calls.values.contactName).toBeNull();
  expect(calls.values.contactEmail).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd C:/dev/aroha-astrology/jyotish-backend
npx vitest run test/support-repo.spec.ts
```

Expected: FAIL — `createSupportTicket` doesn't yet accept `contactName`/`contactEmail`, and `calls.values.contactName` is `undefined`, not matching `/^enc:v1:/`.

- [ ] **Step 3: Implement**

In `support.repo.ts`, replace `decryptRow`:

```ts
function decryptRow(row: SupportTicketRow) {
  return {
    ...row,
    message: decryptField(row.message) ?? '',
    adminNote: decryptField(row.adminNote),
    contactName: decryptField(row.contactName),
    contactEmail: decryptField(row.contactEmail),
  };
}
```

Replace `CreateSupportTicketInput` and `createSupportTicket`:

```ts
export interface CreateSupportTicketInput {
  userId?: string;
  contactName?: string;
  contactEmail?: string;
  category: string;
  message: string;
  locale?: string | null;
  appVersion?: string | null;
}

export async function createSupportTicket(input: CreateSupportTicketInput) {
  const [row] = await db
    .insert(supportTickets)
    .values({
      userId: input.userId ?? null,
      contactName: encryptField(input.contactName ?? null),
      contactEmail: encryptField(input.contactEmail ?? null),
      category: input.category,
      message: encryptField(input.message) as string,
      locale: input.locale ?? null,
      appVersion: input.appVersion ?? null,
    })
    .returning();
  if (!row) throw new Error('createSupportTicket: insert returned no row');
  return decryptRow(row);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run test/support-repo.spec.ts
```

Expected: PASS (all tests in the file, not just the two new ones).

- [ ] **Step 5: Commit**

```bash
cd C:/dev/aroha-astrology/jyotish-backend
git add src/modules/support/support.repo.ts test/support-repo.spec.ts
git commit -m "feat(support): accept userId-less tickets, encrypt contactName/contactEmail"
```

---

## Task 4: Service — nullable userId types + skip push-notify for anonymous tickets

**Files:**

- Modify: `C:\dev\aroha-astrology\jyotish-backend\src\modules\support\support.service.ts`

**Why this task exists:** `updateTicketForAdmin` currently calls `notifyUser(updated.userId, ...)` whenever an admin writes a reply — `notifyUser`'s `userId` parameter is `string`, not nullable ([`notify-user.ts:38`](../../../src/lib/notifications/notify-user.ts#L38)). Once `updated.userId` can be `null` (an anonymous ticket), that call would pass `null` where a string is required. There's no in-app inbox to push into for an anonymous ticket anyway (per the spec's non-goals), so the fix is to skip the push, not to loosen `notifyUser`.

- [ ] **Step 1: Widen `DecryptedTicketRow` and `toAdminDto`**

```ts
interface DecryptedTicketRow {
  id: string;
  userId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  category: string;
  message: string;
  locale: string | null;
  appVersion: string | null;
  status: string;
  adminNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}
```

```ts
function toAdminDto(row: DecryptedTicketRow): AdminSupportTicketDto {
  return {
    id: row.id,
    userId: row.userId,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    category: row.category,
    message: row.message,
    locale: row.locale,
    appVersion: row.appVersion,
    status: row.status,
    adminNote: row.adminNote,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}
```

(`toPublicDto` is unchanged — it never included `userId`/contact fields.)

- [ ] **Step 2: Guard the push-notify call**

In `updateTicketForAdmin`, change:

```ts
  if (body.adminNote !== undefined) {
    void notifyUser(updated.userId, {
```

to:

```ts
  if (body.adminNote !== undefined && updated.userId) {
    void notifyUser(updated.userId, {
```

- [ ] **Step 3: Typecheck**

```bash
cd C:/dev/aroha-astrology/jyotish-backend
npm run typecheck
```

Expected: no new errors from `support.service.ts`. (This surfaces the `notifyUser(updated.userId, ...)` type mismatch if the guard in Step 2 were missed — that's the point of running it here.)

- [ ] **Step 4: Commit**

```bash
git add src/modules/support/support.service.ts
git commit -m "fix(support): don't push-notify a reply on a ticket with no account to notify"
```

---

## Task 5: Notifications — optional `userId` on the two fan-out functions

**Files:**

- Modify: `C:\dev\aroha-astrology\jyotish-backend\src\lib\notifications\telegram.ts`
- Modify: `C:\dev\aroha-astrology\jyotish-backend\src\lib\notifications\support-email.ts`

- [ ] **Step 1: Widen `notifySupportTicket` in `telegram.ts`**

Change the function signature and the `User:` line:

```ts
export async function notifySupportTicket(fields: {
  ticketId: string;
  userId?: string | null;
  contact?: string | null;
  category: string;
  message: string;
}): Promise<boolean> {
  const text =
    `🆘 *New Support Ticket*\n\n` +
    `User: \`${escapeMarkdown(fields.userId ?? 'Anonymous (public form)')}\`\n` +
    (fields.contact ? `Contact: ${escapeMarkdown(fields.contact)}\n` : '') +
    `Category: ${escapeMarkdown(fields.category)}\n` +
    `\n*Message:* ${escapeMarkdown(clipForTelegram(fields.message))}`;
```

(Everything below the `text` assignment — the `emailSupportTicket` fan-out call, recipient lookup, `sendMessage` calls — is unchanged.)

- [ ] **Step 2: Widen `emailSupportTicket` in `support-email.ts`**

```ts
export async function emailSupportTicket(fields: {
  ticketId: string;
  userId?: string | null;
  contact?: string | null;
  category: string;
  message: string;
}): Promise<boolean> {
  const facts: Array<[string, string]> = [
    ['Category', fields.category],
    ...(fields.contact ? ([['Contact', fields.contact]] as Array<[string, string]>) : []),
    ['User', fields.userId ?? 'Anonymous (public form)'],
    ['Ticket', fields.ticketId],
  ];
```

(Everything below `facts` — the `renderEmail` call and return — is unchanged.)

- [ ] **Step 3: Typecheck**

```bash
cd C:/dev/aroha-astrology/jyotish-backend
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notifications/telegram.ts src/lib/notifications/support-email.ts
git commit -m "feat(support): let the Telegram/email ticket notifications handle an anonymous submitter"
```

---

## Task 6: Route — `POST /v1/public/support/tickets`

**Files:**

- Modify: `C:\dev\aroha-astrology\jyotish-backend\src\modules\support\support.routes.ts`
- Test: `C:\dev\aroha-astrology\jyotish-backend\test\support-routes.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `test/support-routes.spec.ts`, right after the closing `});` of the existing `describe('POST /v1/support/tickets', ...)` block (before `describe('GET /v1/support/tickets', ...)`):

```ts
describe('POST /v1/public/support/tickets', () => {
  function makeAnonTicketRow(overrides: Record<string, unknown> = {}) {
    const now = new Date('2026-08-26T00:00:00Z');
    return {
      id: 'ticket-2',
      userId: null,
      contactName: 'Priya Sharma',
      contactEmail: 'priya@example.com',
      category: 'billing',
      message: 'I was double-charged for my Kundli report.',
      locale: null,
      appVersion: null,
      status: 'open',
      adminNote: null,
      createdAt: now,
      resolvedAt: null,
      ...overrides,
    };
  }

  it('creates an anonymous ticket without an Authorization header and returns 201', async () => {
    state.createSupportTicket.mockResolvedValue(makeAnonTicketRow());
    const app = createApp();

    const res = await app.request('/v1/public/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Priya Sharma',
        email: 'priya@example.com',
        category: 'billing',
        message: 'I was double-charged for my Kundli report.',
        website: '',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    expect(state.createSupportTicket).toHaveBeenCalledWith({
      contactName: 'Priya Sharma',
      contactEmail: 'priya@example.com',
      category: 'billing',
      message: 'I was double-charged for my Kundli report.',
    });
    expect(body.id).toBe('ticket-2');
    expect(body.userId).toBeUndefined();
  });

  it('notifies with userId: null and contact set to the submitted email', async () => {
    state.createSupportTicket.mockResolvedValue(makeAnonTicketRow());
    const app = createApp();

    await app.request('/v1/public/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Priya Sharma',
        email: 'priya@example.com',
        category: 'billing',
        message: 'I was double-charged for my Kundli report.',
        website: '',
      }),
    });

    expect(state.notifySupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        contact: 'priya@example.com',
        category: 'billing',
      }),
    );
  });

  it('silently drops the submission when the honeypot field is filled, but still returns 201', async () => {
    const app = createApp();

    const res = await app.request('/v1/public/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bot',
        email: 'bot@example.com',
        category: 'other',
        message: 'buy cheap watches',
        website: 'http://spam.example',
      }),
    });

    expect(res.status).toBe(201);
    expect(state.createSupportTicket).not.toHaveBeenCalled();
    expect(state.notifySupportTicket).not.toHaveBeenCalled();
  });

  it('rejects a missing email (schema validation)', async () => {
    const app = createApp();

    const res = await app.request('/v1/public/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Priya', category: 'billing', message: 'help' }),
    });

    // Same runtime behavior as the authenticated route's own "missing
    // message" test above: @hono/zod-openapi's default hook returns 400.
    expect(res.status).toBe(400);
    expect(state.createSupportTicket).not.toHaveBeenCalled();
  });

  it('requires no Authorization header (still succeeds with none)', async () => {
    state.createSupportTicket.mockResolvedValue(makeAnonTicketRow());
    const app = createApp();

    const res = await app.request('/v1/public/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Priya Sharma',
        email: 'priya@example.com',
        category: 'billing',
        message: 'help',
        website: '',
      }),
    });

    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd C:/dev/aroha-astrology/jyotish-backend
npx vitest run test/support-routes.spec.ts
```

Expected: FAIL — `/v1/public/support/tickets` doesn't exist yet (404s), so every new test fails.

- [ ] **Step 3: Implement the route**

In `support.routes.ts`, add `CreatePublicTicketBodySchema` to the import from `./support.schemas.js`:

```ts
import {
  CreateTicketBodySchema,
  CreatePublicTicketBodySchema,
  SupportTicketSchema,
  ListMyTicketsResponseSchema,
  AdminListTicketsQuerySchema,
  AdminListTicketsResponseSchema,
  AdminTicketIdParamSchema,
  UpdateTicketBodySchema,
  AdminSupportTicketSchema,
} from './support.schemas.js';
```

Add the rate limiter right after the existing `createTicketRateLimit` declaration:

```ts
/** Public form is a much smaller trickle than the in-app flow but has no auth to lean on, so the cap is tighter and keyed by IP — rateLimiter's identify() already falls back to `ip:<addr>` whenever there's no authenticated user (see middleware/rate-limit.ts). */
const publicTicketRateLimit = rateLimiter({
  windowMs: 60 * 60_000,
  max: 3,
  name: 'public-support-tickets',
});
```

Add the new route section right after the closing `});` of the existing `POST /support/tickets` handler (i.e. right before the `/* GET /support/tickets */` section comment):

```ts
/* -------------------------------------------------------------------------- */
/* POST /public/support/tickets                                              */
/* -------------------------------------------------------------------------- */

const createPublicTicketRoute = createRoute({
  method: 'post',
  path: '/public/support/tickets',
  tags: ['Support'],
  summary: 'Submit a help/support request without an account (landing site /support form)',
  middleware: [publicTicketRateLimit] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreatePublicTicketBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Ticket created (or a no-op fake success if the honeypot was filled)',
      content: { 'application/json': { schema: SupportTicketSchema } },
    },
    422: errorResponse('Validation failed'),
    429: errorResponse('Rate limit exceeded'),
  },
});

supportRouter.openapi(createPublicTicketRoute, async (c) => {
  const body = c.req.valid('json');

  // Honeypot: a real visitor never sees or fills this field (hidden
  // client-side on the landing form). A bot that fills every field gets a
  // normal-looking 201 with nothing actually written — a validation error
  // here would just teach it to omit the field and retry.
  if (body.website) {
    return c.json(
      {
        id: '00000000-0000-0000-0000-000000000000',
        category: body.category,
        message: body.message,
        locale: null,
        appVersion: null,
        status: 'open',
        adminNote: null,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      },
      201,
    );
  }

  const ticket = await createTicket({
    contactName: body.name,
    contactEmail: body.email,
    category: body.category,
    message: body.message,
  });

  // Fire-and-forget, same as the authenticated route below.
  void notifySupportTicket({
    ticketId: ticket.id,
    userId: null,
    contact: body.email,
    category: body.category,
    message: body.message,
  }).catch(() => {});

  return c.json(ticket, 201);
});
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run test/support-routes.spec.ts
```

Expected: PASS (all tests in the file).

- [ ] **Step 5: Run the full backend test suite**

```bash
npm run test
```

Expected: PASS, no regressions elsewhere.

- [ ] **Step 6: Commit**

```bash
cd C:/dev/aroha-astrology/jyotish-backend
git add src/modules/support/support.routes.ts test/support-routes.spec.ts
git commit -m "feat(support): add POST /v1/public/support/tickets (unauthenticated, rate-limited, honeypot-protected)"
```

---

## Task 7: Landing — `/api/support` proxy route

**Files:**

- Create: `C:\dev\aroha-astrology\landing\src\app\api\support\route.ts`

- [ ] **Step 1: Create the proxy**

```ts
// Proxies the public support-ticket endpoint on the real backend. Same
// reasoning as src/app/api/kundli/route.ts: keeps JYOTISH_BACKEND_URL out of
// the client bundle, and needs no CORS config since this is server-to-server.
//
// Upstream status codes and bodies (422 malformed input, 429 rate limited)
// are passed straight through rather than collapsed into a generic 500, so
// the client can branch on them.

type SupportTicketRequestBody = {
  name: string;
  email: string;
  category: string;
  message: string;
  website: string;
};

function isValidBody(value: unknown): value is SupportTicketRequestBody {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.name === 'string' &&
    typeof body.email === 'string' &&
    typeof body.category === 'string' &&
    typeof body.message === 'string' &&
    typeof body.website === 'string'
  );
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json(
      { error: { code: 'invalid_json', message: 'Request body must be valid JSON.' } },
      { status: 422 },
    );
  }

  if (!isValidBody(payload)) {
    return Response.json(
      {
        error: {
          code: 'invalid_request',
          message: 'name, email, category and message are required.',
        },
      },
      { status: 422 },
    );
  }

  const base = process.env.JYOTISH_BACKEND_URL ?? 'https://api.arohaastrology.in';

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/v1/public/support/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        category: payload.category,
        message: payload.message,
        website: payload.website,
      }),
      cache: 'no-store',
    });
  } catch {
    return Response.json(
      {
        error: {
          code: 'upstream_unreachable',
          message: 'Could not reach the support service. Please try again or email us directly.',
        },
      },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return Response.json(
      { error: { code: 'upstream_error', message: 'Unexpected response from upstream.' } },
      { status: 502 },
    );
  }

  const data = await upstream.json();
  return Response.json(data, { status: upstream.status });
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/dev/aroha-astrology/landing
git add src/app/api/support/route.ts
git commit -m "feat(support): add /api/support proxy to the backend's public ticket endpoint"
```

---

## Task 8: Landing — the form itself

**Files:**

- Create: `C:\dev\aroha-astrology\landing\src\components\support\SupportForm.tsx`
- Modify: `C:\dev\aroha-astrology\landing\src\app\support\page.tsx`

- [ ] **Step 1: Create `SupportForm.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';

const CATEGORIES = [
  { value: 'billing', label: 'Billing' },
  { value: 'chart_accuracy', label: 'Chart accuracy' },
  { value: 'technical_issue', label: 'Technical issue' },
  { value: 'other', label: 'Other' },
] as const;

const inputClass =
  'w-full rounded-xl border border-ink/20 bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-2/60 outline-none transition-colors focus:border-accent';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function SupportForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [message, setMessage] = useState('');
  // Honeypot — never shown to a real visitor. A filled value marks the
  // submission as spam server-side; see api/support/route.ts and the
  // backend's createPublicTicketRoute handler.
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setError(null);

    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, category, message, website }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        if (res.status === 429) {
          setError(
            "You've sent a few requests already — please wait a bit before trying again, or email us directly.",
          );
        } else {
          setError(
            data?.error?.message ?? 'Something went wrong. Please try again or email us directly.',
          );
        }
        setStatus('error');
        return;
      }

      setStatus('success');
    } catch {
      setError('Could not reach the support service. Please try again or email us directly.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <p className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-ink-2">
        Thanks — we&apos;ve got your message and will reply by email within a day or two.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="support-name" className="mb-1 block text-sm text-ink-2">
          Name
        </label>
        <input
          id="support-name"
          type="text"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="support-email" className="mb-1 block text-sm text-ink-2">
          Email
        </label>
        <input
          id="support-email"
          type="email"
          required
          maxLength={255}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="support-category" className="mb-1 block text-sm text-ink-2">
          Category
        </label>
        <select
          id="support-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="support-message" className="mb-1 block text-sm text-ink-2">
          Message
        </label>
        <textarea
          id="support-message"
          required
          minLength={1}
          maxLength={5000}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Honeypot — visually hidden via sr-only, not display:none/hidden
          (some simple bots skip fields the browser computes as
          non-rendered). Real users never tab to it. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="support-website">Website</label>
        <input
          id="support-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" variant="solid" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Sending…' : 'Send message'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Wire it into `support/page.tsx`**

Add the import (after the existing `LINKS` import):

```ts
import { SupportForm } from '@/components/support/SupportForm';
```

Replace the top-of-file doc comment (currently lines 8-20) — it says "Deliberately static: no form, no backend," which is no longer true:

```ts
/**
 * The App Store Connect "Support URL" field pointed at the site root, which
 * has no way to ask a question or request help — Apple rejected build 1.0(4)
 * on Guideline 1.5 Safety over exactly this (submission 43b2e0bb, 2026-08-26).
 * A full ticketing screen already exists at app/help/page.tsx, but it sits
 * behind sign-in, so a reviewer can never reach it. This page is the public,
 * unauthenticated substitute App Store Connect's Support URL should point at.
 *
 * The form below posts to /api/support, which proxies POST
 * /v1/public/support/tickets on the backend — a real ticket row
 * (contactName/contactEmail instead of userId) that lands in the SAME admin
 * queue as in-app tickets (frontend/app/admin/tickets/page.tsx), not a side
 * channel. See jyotish-backend's
 * docs/superpowers/specs/2026-08-26-public-support-tickets-design.md.
 */
```

Add a new section right after the existing "Email us" `<section>` (before "From inside the app"):

```tsx
<section>
  <h2 className="font-display text-xl font-medium text-ink">Send us a message</h2>
  <p className="mt-3 leading-relaxed text-ink-2">
    Prefer a form? Fill this in and we&apos;ll reply by email.
  </p>
  <div className="mt-4">
    <SupportForm />
  </div>
</section>
```

- [ ] **Step 3: Verify locally**

```bash
cd C:/dev/aroha-astrology/landing
npm run build
```

Expected: build succeeds (this also type-checks the new component and page edit).

Then:

```bash
npm run dev
```

Open `http://localhost:3000/support`, submit the form with a real backend running locally (or point `JYOTISH_BACKEND_URL` at a reachable dev backend) — confirm the success message replaces the form, and that a 429 after 3 rapid submissions shows the rate-limit message.

- [ ] **Step 4: Commit**

```bash
cd C:/dev/aroha-astrology/landing
git add src/components/support/SupportForm.tsx src/app/support/page.tsx
git commit -m "feat(support): add a real support form to /support, wired to the public ticket endpoint"
```

---

## Task 9: Admin panel — show anonymous tickets

**Files:**

- Modify: `C:\dev\aroha-astrology\frontend\lib\admin-api.ts`
- Modify: `C:\dev\aroha-astrology\frontend\app\admin\tickets\page.tsx`

- [ ] **Step 1: Widen the `AdminSupportTicket` type**

In `admin-api.ts`, replace the `AdminSupportTicket` interface:

```ts
/** Admin-facing shape — unlike the caller-facing `SupportTicket` in lib/api.ts, includes `userId`/`contactName`/`contactEmail` and `adminNote`. `userId` is null for a ticket filed from the public (unauthenticated) /support form, in which case `contactName`/`contactEmail` are the submitter's identity instead. */
export interface AdminSupportTicket {
  id: string;
  userId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  category: string;
  message: string;
  locale: string | null;
  appVersion: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
```

- [ ] **Step 2: Branch the table row**

In `app/admin/tickets/page.tsx`, replace the User `<td>` in the table body:

```tsx
<td className="px-4 py-2 text-foreground font-mono text-xs" title={ticket.userId}>
  {truncate(ticket.userId, 12)}
</td>
```

with:

```tsx
<td className="px-4 py-2 text-foreground text-xs">
  {ticket.userId ? (
    <span className="font-mono" title={ticket.userId}>
      {truncate(ticket.userId, 12)}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5">
      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold border border-blue-500/40 bg-blue-500/10 text-blue-400">
        Public
      </span>
      <span title={ticket.contactEmail ?? undefined}>
        {ticket.contactName ?? ticket.contactEmail ?? '—'}
      </span>
    </span>
  )}
</td>
```

- [ ] **Step 3: Branch the modal**

In the same file, replace the "User ID" block in `TicketModal`:

```tsx
<div>
  <p className="text-xs text-muted mb-1">User ID</p>
  <p className="text-sm text-foreground break-all" title={ticket.userId}>
    {ticket.userId}
  </p>
</div>
```

with:

```tsx
<div>
  <p className="text-xs text-muted mb-1">{ticket.userId ? 'User ID' : 'Submitted by'}</p>
  {ticket.userId ? (
    <p className="text-sm text-foreground break-all" title={ticket.userId}>
      {ticket.userId}
    </p>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold border border-blue-500/40 bg-blue-500/10 text-blue-400">
        Public
      </span>
      <p className="text-sm text-foreground break-all">
        {ticket.contactName ?? '—'}
        {ticket.contactEmail && (
          <>
            {' · '}
            <a href={`mailto:${ticket.contactEmail}`} className="text-gold hover:underline">
              {ticket.contactEmail}
            </a>
          </>
        )}
      </p>
    </div>
  )}
</div>
```

- [ ] **Step 4: Typecheck / build**

```bash
cd C:/dev/aroha-astrology/frontend
npm run build
```

Expected: build succeeds. (Using `build` rather than `lint` here — `npm run lint` in this repo has been known to OOM; the build's own type-checking is what actually needs to pass.)

- [ ] **Step 5: Commit**

```bash
cd C:/dev/aroha-astrology/frontend
git add lib/admin-api.ts app/admin/tickets/page.tsx
git commit -m "feat(admin): show contact name/email for tickets with no account (public /support form)"
```

---

## Task 10: End-to-end verification

- [ ] **Step 1: Full backend suite one more time**

```bash
cd C:/dev/aroha-astrology/jyotish-backend
npm run test
```

Expected: PASS.

- [ ] **Step 2: Manual end-to-end**

With the backend running locally against a migrated dev DB, and `landing`'s dev server pointed at it:

1. Submit the `/support` form with real values.
2. Confirm a Telegram alert arrives in the configured chat (if `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ADMIN_CHAT_IDS` are configured locally) with `User: Anonymous (public form)` and a `Contact:` line.
3. Open `frontend`'s `/admin/tickets` — confirm the new ticket appears with the "Public" badge, contact name/email visible in the row and in the modal.
4. Submit an in-app ticket via `frontend`'s `/help` page (signed in) — confirm it still creates and displays exactly as before (no "Public" badge, User ID shown).
5. Submit the `/support` form 4 times in under an hour from the same machine — confirm the 4th shows the rate-limit message.
6. Fill the hidden honeypot field via browser devtools and submit — confirm a success message appears client-side but no new row appears in `/admin/tickets`.

- [ ] **Step 3: Report back**

Once verified, this plan is complete. Nothing further to push — each task's commit already happened per-repo; pushing to `main` in any of the three repos needs separate confirmation, per standing project convention.
