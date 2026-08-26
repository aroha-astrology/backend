# Public (anonymous) support ticket form

## Context

Apple rejected iOS build 1.0(4) partly on Guideline 1.5: the App Store Connect
Support URL pointed at the site root, which had no way to ask a question or
request help. A static `/support` page with a `mailto:` link was added on the
`landing` repo to fix that ([`landing` commit
`c96f3ba`](https://github.com/aroha-astrology/landing/commit/c96f3ba)).

This spec extends that page with a real form, and makes those submissions
land in the same admin ticket queue the in-app support flow already uses —
so a support agent works one queue, not a mailbox plus a queue.

The blocking fact: `support_tickets.user_id` is `NOT NULL` with a FK to
`users` ([`jyotish-backend/src/db/schema.ts:2260`](../../../src/db/schema.ts#L2260)).
Every ticket today is filed by a signed-in app user. An App Store reviewer,
or any website visitor who hasn't signed up, has no `userId` to attach a
ticket to. This spec makes `user_id` optional and adds a contact-info
fallback, additively — the existing authenticated flow
([`app/help/page.tsx`](../../../../../frontend/app/help/page.tsx) →
`POST /v1/support/tickets`) is unchanged.

## Non-goals

- No CAPTCHA library or third-party spam service — honeypot field + IP-keyed
  rate limiting is the proportionate stopgap for a low-traffic form.
- No two-way email thread. An anonymous ticket has no in-app inbox to reply
  into, so an admin's reply path stays "email the `contactEmail` shown in the
  panel," same as it would be for a mailto today. `adminNote` still exists on
  the row for internal record-keeping, and still notifies via the existing
  Telegram hook.
- No merging of an anonymous ticket into an account later (e.g. if that
  visitor signs up afterward). Out of scope; can be a manual admin edit if it
  ever matters.

## Data model

New migration `jyotish-backend/src/db/migrations/0061_public_support_tickets.sql`
(next number after `0060_user_tours_completed.sql`):

```sql
ALTER TABLE support_tickets
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN contact_name text,
  ADD COLUMN contact_email text,
  ADD CONSTRAINT support_tickets_identity_check
    CHECK (user_id IS NOT NULL OR contact_email IS NOT NULL);
```

Update the Drizzle table def in `schema.ts` to match: `userId` becomes
`.references(() => users.id, { onDelete: 'cascade' })` without `.notNull()`,
add `contactName: text('contact_name')` and `contactEmail: text('contact_email')`.

## Backend

All changes in the existing `support` module — no new module, this is the
same ticket domain, just a second way to create one.

**`support.schemas.ts`**

- New `CreatePublicTicketBodySchema`: `name` (1–100 chars), `email`
  (`z.string().email()`), `category` (same free-text shape as the existing
  `CreateTicketBodySchema` — the 4 values the in-app form sends: `billing`,
  `chart_accuracy`, `technical_issue`, `other`), `message` (1–5000), and a
  honeypot field `website` (`z.string().max(0).optional()` — any non-empty
  value fails validation, which is enough: a bot that fills every field gets
  a 422, a real user never sees or fills this field because the input is
  visually hidden client-side).
- `AdminSupportTicketSchema` and `SupportTicketDto`/`toAdminDto` gain
  `contactName: z.string().nullable()` and `contactEmail: z.string().nullable()`.
  `userId` becomes `z.string().uuid().nullable()` on the admin-facing schema
  only (the caller-facing `SupportTicketSchema` already omits `userId`
  entirely, so it's untouched).

**`support.repo.ts`**

- `CreateSupportTicketInput.userId` becomes optional; add optional
  `contactName`/`contactEmail`.
- `createSupportTicket` passes them straight through to the insert.

**`support.service.ts`**

- `createTicket` signature widens the same way — no branching logic needed,
  it's already just "pass input to repo, return DTO."

**`support.routes.ts`** — new route, same file as the existing ticket routes
(the file's own top-of-file comment already explains why admin/user routes
share this router without a wildcard middleware; a third unauthenticated
route follows the same reasoning: per-route middleware, nothing global).

```
POST /public/support/tickets
middleware: [publicTicketRateLimit]   // no requireUser
```

- `publicTicketRateLimit = rateLimiter({ windowMs: 60 * 60_000, max: 3, name: 'public-support-tickets' })`
  — 3/hour. Keys by IP automatically: `identify()` in
  `middleware/rate-limit.ts` already falls back to `ip:<addr>` whenever
  `c.get('user')` is unset, which is exactly this route's case. No new
  rate-limit code needed, just the existing middleware with a tighter cap
  than the authenticated `createTicketRateLimit` (5/min/user).
- Handler: validate honeypot is empty (schema already rejects non-empty, but
  return the same generic 201-shaped-looking success anyway if it trips —
  see Spam handling below), call `createTicket({ contactName: body.name,
contactEmail: body.email, category: body.category, message: body.message
})`, fire-and-forget `notifySupportTicket` with `contact: body.email`
  instead of a user's phone/email.

**Spam handling nuance:** if the honeypot is non-empty, don't 422 — a bot
that gets a validation error will just retry without the field. Instead,
silently return `201` with a fake ticket-shaped response and skip the DB
insert and the Telegram notify. This is the one deliberate deviation from
"validate normally"; comment it inline so it doesn't look like a bug.

## Landing (`landing` repo)

**`src/app/api/support/route.ts`** — new proxy route, same shape as
`src/app/api/kundli/route.ts`: validates the JSON body has the required
string fields, forwards to
`${JYOTISH_BACKEND_URL ?? 'https://api.arohaastrology.in'}/v1/public/support/tickets`,
passes upstream status/body straight through (422/429 included, not
collapsed to 500).

**`src/app/support/page.tsx`** — the existing static page gets a new client
component, `src/components/support/SupportForm.tsx` (`"use client"`, page
stays a server component so `metadata`/`canonical` are untouched). Fields:
name, email, category (`<select>` with the same 4 labels the in-app help
page uses — billing, chart accuracy, technical issue, other), message
(`<textarea>`), and the honeypot input (visually hidden via
`className="sr-only"` + `tabIndex={-1}` + `autoComplete="off"`, not
`display:none` / `hidden` — some bots skip fields Chrome computes as
non-rendered, but `sr-only` positioning is cheap and matches how honeypots
are conventionally hidden). On submit, POST to `/api/support`; on success,
swap the form out for a confirmation message inline (no navigation). Errors
(422 malformed, 429 rate-limited) show inline under the message field.

No i18n — matches the rest of `/support` and `/delete-account`, which are
deliberately English-only compliance/utility pages outside `dictionary.ts`.

## Admin panel (`frontend` repo)

**`lib/admin-api.ts`** — `AdminSupportTicket.userId` becomes
`string | null`; add `contactName: string | null`, `contactEmail: string | null`.

**`app/admin/tickets/page.tsx`** — wherever the row/modal currently renders
the ticket's user (a link or ID), branch: if `userId` is present, unchanged;
if null, render `contactName` / `contactEmail` instead, with a small
"Public" badge next to the category so agents can tell at a glance this
ticket has no in-app reply path.

## Verification

1. `jyotish-backend`: run the new migration against a local/dev DB, confirm
   `\d support_tickets` shows the dropped NOT NULL and the two new columns
   and the CHECK constraint.
2. Unit-level: `createTicket` called with only `contactEmail` (no `userId`)
   inserts and returns successfully; called with neither `userId` nor
   `contactEmail` is rejected by the DB constraint (confirms the CHECK
   actually fires, not just the Zod layer).
3. `curl -X POST http://localhost:<port>/v1/public/support/tickets` with a
   valid body succeeds without an `Authorization` header; a 4th request
   within an hour from the same IP gets 429; a request with `website` filled
   in returns 201 but produces no DB row and no Telegram alert.
4. `landing`: `npm run build`, then `npm run dev`, submit the form at
   `/support` end-to-end against a local backend — confirm the row appears
   in `frontend`'s `/admin/tickets` with the "Public" badge and correct
   contact info.
5. Confirm an in-app ticket (`app/help`) still creates and displays
   correctly — the authenticated path must be unaffected.
