# Prime Reports Batch 6 — Palm Reading (Vision)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Palm Reading report (bringing the catalogue from 14 to 15) — the first report type whose input is a photo rather than birth data, analyzed via Gemini vision.

**Why this needs new infrastructure (not just a new registry entry):** every report so far reads from data already in the database (birth profile / kundli) or needs no input at all (tarot). Palm Reading needs the client to upload a photo. Per an explicit product decision, a failed generation attempt must be retryable WITHOUT asking the user to re-upload and get charged again — so the photo is stored temporarily (48 hours) rather than only held in request memory. This task adds:

1. A new, small, short-lived table (`palm_photos`) — NOT reusing `prime_reports.analysis`, since that column's contents are returned directly to the client in report responses and must never carry the raw photo.
2. A dedicated upload endpoint, `POST /v1/prime/palm/photo`, completely separate from the generic `/v1/prime/reports/{reportType}` routes — this avoids any change to the shared Report Engine's request/response shape (unlike Batch 5's `period` change, which DID need to touch the shared routes). The palm report type's own `generate()` simply looks up "the current pending photo for this (user, profile)" internally.
3. A minimal extension to the LLM client's message type to support an image alongside text (Gemini's OpenAI-compatible endpoint accepts the same multi-part `content` array format as OpenAI's vision API) — this is additive: every existing report's plain-string `content` keeps working unchanged.
4. A periodic cleanup script to delete expired photos — this task only WRITES the script; wiring it into the production crontab is a deploy-time action, out of scope here (same as every other change in this batch, this stays on the `feat/prime-reports-batch2` branch, unmerged).

**Architecture:**

- New module `src/modules/palm/` (repo + routes + schemas) — separate from `src/modules/prime-reports/`, since palm-photo upload is conceptually a prerequisite step, not part of the generic report engine.
- `palm_photos` is keyed like `prime_reports` (nullable `birth_profile_id` for the primary profile, partial unique indexes) — a NEW upload for the same (user, profile) REPLACES any previous pending upload (there is only ever one pending photo per profile at a time).
- On successful generation, the palm registry entry deletes the photo immediately (no need to wait for the 48h window). On failure, the photo is left in place so the next GET's retry-on-cache-miss path can reuse it. The cleanup script is the backstop for photos that are never successfully consumed (abandoned uploads, or an unlock that's never retried).
- The photo is NEVER returned in any report content — only the AI's resulting text narrative is persisted in `prime_reports.analysis`, exactly like every other report.

**Tech Stack:** Hono + zod-openapi, Drizzle/Postgres, Gemini via `gemini-client.ts` (now vision-capable), Vitest.

---

## Before you start (context every task needs)

- Working directory: `C:\dev\aroha-astrology\jyotish-backend\.worktrees\prime-reports-batch2` — a git worktree, still on branch `feat/prime-reports-batch2`. Do NOT merge to main.
- Run tests with `pnpm test`. Baseline before this plan's work: **720 passing / 9 failing** (pre-existing, unrelated — `billing-google-play`, `health-report`, `horoscope-jargon`, `purchase-plan-notify` specs).
- `PRIME_REPORT_DEFINITIONS` in `src/modules/prime-reports/prime-reports.registry.ts` currently has 14 entries. `PrimeReportDefinition.generate` is `(userId, profile, period) => ...` (added in Batch 5). Palm ignores `period` (prefix `_period`) — it has no variants, just a prerequisite (the uploaded photo).
- The next Drizzle migration number is **0032** — the last one committed is `0031_regular_shard.sql` (Batch 2). ALWAYS generate migrations via `pnpm db:generate` after editing `schema.ts` — never hand-write migration SQL. After generating, open the resulting `.sql` file and confirm it contains ONLY palm_photos-related DDL (a `CREATE TYPE`/`CREATE TABLE`/FK/index for `palm_photos`) and nothing else — a prior session hit a real bug where `db:generate` re-emitted already-deployed DDL for unrelated tables because of a missing snapshot file; that root cause is fixed now, but re-verify the generated file's contents anyway before committing.
- "No fallback filler" discipline applies: an unparseable/incomplete LLM JSON response THROWS, never silently caches generic text.
- This repo has NO existing image/file-upload infrastructure and NO S3/object-storage client dependency — this is why the design stores the photo as a base64 string directly in Postgres rather than external object storage, avoiding a new infrastructure dependency for a modest, short-lived storage need.

---

### Task 1: `palm_photos` schema, migration, and repo layer

**Files:**

- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/00XX_<generated-name>.sql` (generated, not hand-written — see Step 2)
- Create: `src/modules/palm/palm-photo.repo.ts`
- Create: `test/palm-photo-repo.spec.ts`

- [ ] **Step 1: Add the `palmPhotos` table to `src/db/schema.ts`**

Add near `primeReports` (reuse the same nullable-`birthProfileId`-with-partial-unique-index pattern):

```ts
export const palmPhotos = pgTable(
  'palm_photos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    birthProfileId: uuid('birth_profile_id').references(() => birthProfiles.id, {
      onDelete: 'cascade',
    }),
    imageBase64: text('image_base64').notNull(),
    mimeType: text('mime_type').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    primaryUnique: uniqueIndex('palm_photos_primary_unique')
      .on(table.userId)
      .where(sql`${table.birthProfileId} is null`),
    profileUnique: uniqueIndex('palm_photos_profile_unique')
      .on(table.userId, table.birthProfileId)
      .where(sql`${table.birthProfileId} is not null`),
  }),
);
export type PalmPhotoRow = typeof palmPhotos.$inferSelect;
export type NewPalmPhotoRow = typeof palmPhotos.$inferInsert;
```

(Check the imports at the top of `schema.ts` already include `pgTable`, `uuid`, `text`, `timestamp`, `uniqueIndex`, `sql` — they should, since `primeReports` already uses all of these; add nothing new to the import line.)

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`

Expected: a new file `src/db/migrations/0032_<some-generated-name>.sql` and a corresponding `src/db/migrations/meta/0032_snapshot.json`, plus an updated `meta/_journal.json` entry for idx 32.

Open the generated `.sql` file and confirm it contains ONLY:

- `CREATE TABLE "palm_photos" (...)` with the 6 columns above
- The 2 FK constraints (`palm_photos_user_id_users_id_fk`, `palm_photos_birth_profile_id_birth_profiles_id_fk`)
- The 2 unique indexes (`palm_photos_primary_unique`, `palm_photos_profile_unique`)

If it contains ANY other `CREATE TABLE`/`ALTER TABLE`/`CREATE TYPE` statements for tables other than `palm_photos`, STOP and report this as a BLOCKED status — do not hand-trim it yourself; this would indicate the same snapshot-drift class of bug fixed in an earlier session, and needs the same careful root-cause diagnosis, not a quick patch.

- [ ] **Step 3: Implement the repo layer**

Create `src/modules/palm/palm-photo.repo.ts`:

```ts
// =============================================================================
// Palm photo repo — a short-lived (48h) staging area for palm-reading photo
// uploads, keyed like prime_reports (nullable birthProfileId = primary
// profile, partial unique indexes so only ONE pending photo can exist per
// (user, profile) at a time — a new upload replaces any previous one). The
// photo is deleted immediately on a successful report generation (see the
// `palm` entry in prime-reports.registry.ts), or by the periodic cleanup
// script (scripts/cleanup-expired-palm-photos.ts) once expiresAt passes.
// =============================================================================

import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { palmPhotos, type PalmPhotoRow } from '../../db/schema.js';

/** How long an uploaded photo stays available for report generation/retry before the cleanup script reclaims it. */
export const PALM_PHOTO_TTL_MS = 48 * 60 * 60 * 1000;

function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(palmPhotos.birthProfileId)
    : eq(palmPhotos.birthProfileId, birthProfileId);
}

/**
 * Replaces any existing pending photo for this (user, profile) with the new
 * one — only the LATEST upload ever matters, so this deletes-then-inserts
 * rather than erroring on the unique index.
 */
export async function upsertPendingPalmPhoto(
  userId: string,
  birthProfileId: string | null,
  imageBase64: string,
  mimeType: string,
): Promise<PalmPhotoRow> {
  const expiresAt = new Date(Date.now() + PALM_PHOTO_TTL_MS);
  await db
    .delete(palmPhotos)
    .where(and(eq(palmPhotos.userId, userId), profileFilter(birthProfileId)));
  const [row] = await db
    .insert(palmPhotos)
    .values({ userId, birthProfileId, imageBase64, mimeType, expiresAt })
    .returning();
  return row!;
}

/** Finds the pending (not-yet-expired) photo for this (user, profile), if any. */
export async function findPendingPalmPhoto(
  userId: string,
  birthProfileId: string | null,
): Promise<PalmPhotoRow | undefined> {
  const rows = await db
    .select()
    .from(palmPhotos)
    .where(
      and(
        eq(palmPhotos.userId, userId),
        profileFilter(birthProfileId),
        gt(palmPhotos.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0];
}

/** Deletes one photo by id — called right after it's successfully used to generate a report. */
export async function deletePalmPhoto(id: string): Promise<void> {
  await db.delete(palmPhotos).where(eq(palmPhotos.id, id));
}

/** Deletes ALL expired rows regardless of owner — used by the periodic cleanup script. Returns the count deleted. */
export async function deleteExpiredPalmPhotos(): Promise<number> {
  const deleted = await db
    .delete(palmPhotos)
    .where(lte(palmPhotos.expiresAt, new Date()))
    .returning({ id: palmPhotos.id });
  return deleted.length;
}
```

- [ ] **Step 4: Write `test/palm-photo-repo.spec.ts`**

Follow the EXACT pattern already used in `test/prime-reports-repo.spec.ts` for this codebase's repo-layer tests: mock `../src/config/db.js`'s `db` export, and use `PgDialect().sqlToQuery()` (from `drizzle-orm/pg-core`) to compile and assert the exact SQL/WHERE clauses produced by each function, rather than trying to run against a real database. Read `test/prime-reports-repo.spec.ts` first to copy its mocking setup precisely (same `db.select/.insert/.delete/.update` chainable-mock-builder pattern). Write tests covering:

1. `upsertPendingPalmPhoto` — issues a DELETE scoped to `(userId, birthProfileId)` before the INSERT (for both `birthProfileId: null` and a real UUID), and the INSERT sets `expiresAt` roughly 48 hours in the future.
2. `findPendingPalmPhoto` — the compiled SQL includes a `expires_at > $N`-style comparison (not-expired check) and correctly branches on `isNull`/`eq` for `birthProfileId` the same way `prime-reports.repo.ts`'s `profileFilter` does.
3. `deletePalmPhoto` — deletes by exact id.
4. `deleteExpiredPalmPhotos` — the compiled SQL's WHERE clause compares `expires_at <=` now (not `<`, not `>=`), and returns the count of deleted rows from the mocked `.returning()` result.

Run: `pnpm test test/palm-photo-repo.spec.ts` — expect PASS.

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline 720 + this task's new tests), no typecheck regressions.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/migrations/ src/modules/palm/palm-photo.repo.ts test/palm-photo-repo.spec.ts
git commit -m "feat(palm): add palm_photos table + repo layer"
```

(`src/db/migrations/` picks up both the new `.sql` file and the `meta/` snapshot/journal updates from `pnpm db:generate`.)

---

### Task 2: Palm photo upload endpoint

**Files:**

- Create: `src/modules/palm/palm-photo.schemas.ts`
- Create: `src/modules/palm/palm-photo.routes.ts`
- Create: `test/palm-photo-routes.spec.ts` (if this codebase has route-level tests for similar modules — check `test/` for any existing `*-routes.spec.ts` file first; if none exist, skip a dedicated route test and instead add 1-2 focused tests of the request/response schemas themselves, matching whatever the lightest existing precedent is)
- Modify: `src/app.ts` (mount the new router)

- [ ] **Step 1: Add the request/response schemas**

Create `src/modules/palm/palm-photo.schemas.ts`:

```ts
import { z } from '@hono/zod-openapi';

/** ~6MB raw image after base64's ~33% size overhead — generous for a phone photo, bounded to keep the temporary Postgres storage and the Gemini vision payload reasonable. */
export const PALM_PHOTO_MAX_BASE64_LENGTH = 8_000_000;

export const PalmPhotoUploadRequestSchema = z
  .object({
    imageBase64: z.string().min(1).max(PALM_PHOTO_MAX_BASE64_LENGTH),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  })
  .openapi('PalmPhotoUploadRequest');

export const PalmPhotoUploadResponseSchema = z
  .object({
    uploaded: z.literal(true),
    expiresAt: z.string(),
  })
  .openapi('PalmPhotoUploadResponse');
```

- [ ] **Step 2: Implement the upload route**

Create `src/modules/palm/palm-photo.routes.ts`:

```ts
// =============================================================================
// Palm photo upload — a dedicated endpoint, deliberately separate from the
// generic /v1/prime/reports/{reportType} routes (see the plan doc for why:
// this keeps the shared Report Engine's request/response shape untouched).
// Upload first via this endpoint, THEN unlock 'palm' via the normal
// POST /v1/prime/reports/palm/unlock — the palm report type looks up the
// pending photo internally (prime-reports.registry.ts's `palm` entry).
// =============================================================================

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { upsertPendingPalmPhoto } from './palm-photo.repo.js';
import {
  PalmPhotoUploadRequestSchema,
  PalmPhotoUploadResponseSchema,
} from './palm-photo.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('PalmPhotoError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Uploads are large and rare per user — a tight per-minute cap is enough to stop abuse without affecting real usage. */
const palmPhotoUploadRateLimit = rateLimiter({
  windowMs: 60_000,
  max: 5,
  name: 'palm-photo-upload',
});

export const palmPhotoRouter = new OpenAPIHono();

const uploadRoute = createRoute({
  method: 'post',
  path: '/prime/palm/photo',
  tags: ['Prime Reports'],
  summary: 'Upload a palm photo ahead of unlocking the Palm Reading report',
  description:
    'Stores the photo temporarily (48 hours) so the Palm Reading report can be generated — and retried on failure — without re-uploading. The photo is deleted immediately once a report is successfully generated from it, and by a periodic cleanup job otherwise. A new upload replaces any previous pending one for the same profile.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, palmPhotoUploadRateLimit] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: PalmPhotoUploadRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Photo stored',
      content: { 'application/json': { schema: PalmPhotoUploadResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Validation failed'),
  },
});

palmPhotoRouter.openapi(uploadRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const profile = await resolveActiveProfileContext(user);

  const row = await upsertPendingPalmPhoto(
    user.id,
    profile.birthProfileId,
    body.imageBase64,
    body.mimeType,
  );

  return c.json({ uploaded: true as const, expiresAt: row.expiresAt.toISOString() }, 200);
});
```

- [ ] **Step 3: Mount the router in `src/app.ts`**

Add the import alongside the other module imports:

```ts
import { palmPhotoRouter } from './modules/palm/palm-photo.routes.js';
```

Add the mount line right after `app.route('/v1', primeReportsRouter);`:

```ts
app.route('/v1', palmPhotoRouter);
```

- [ ] **Step 4: Test coverage**

Check `test/` for any existing route-level (as opposed to service/repo-level) test file for a comparably simple single-route module (e.g. search for a `*.routes.spec.ts` file). If this codebase has an established pattern for testing a Hono route handler directly (e.g. via `app.request(...)` or similar), follow it for a `test/palm-photo-routes.spec.ts` covering: successful upload returns `{uploaded: true, expiresAt}`; an invalid `mimeType` is rejected with 422; an oversized `imageBase64` is rejected with 422. If NO such precedent exists anywhere in this codebase's test suite (most of this codebase's route logic is tested at the service/repo layer, not via HTTP simulation), do not invent a new testing approach for just this one route — instead confirm `pnpm typecheck` passes (validates the Hono/zod-openapi wiring compiles correctly) and rely on Task 1's repo-layer tests plus manual reasoning about the route's straightforwardness (it's a thin wrapper: validate → upsert → respond). State clearly in your final report which of these two paths you took and why.

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + any new tests from Step 4), no typecheck regressions.

- [ ] **Step 6: Commit**

```bash
git add src/modules/palm/palm-photo.schemas.ts src/modules/palm/palm-photo.routes.ts src/app.ts
git commit -m "feat(palm): add palm photo upload endpoint"
```

(Add `test/palm-photo-routes.spec.ts` to this commit too if you wrote one in Step 4.)

---

### Task 3: Vision-capable LLM client + Palm Reading report

**Files:**

- Modify: `src/config/llm.ts` (extend `ChatMessage` for vision content + add `PALM_REPORT_PROFILE`)
- Create: `src/lib/llm/palm-report.ts`
- Create: `test/palm-report.spec.ts`
- Modify: `src/modules/prime-reports/prime-reports.registry.ts` (add `palm` entry)

- [ ] **Step 1: Extend `ChatMessage` to support vision content**

In `src/config/llm.ts`, change:

```ts
export interface ChatMessage {
  role: string;
  content: string;
}
```

to:

```ts
/** A single part of a multi-part (vision) message — Gemini's OpenAI-compatible endpoint accepts this same shape OpenAI's vision API uses. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: string;
  /** Plain string for every text-only report (the vast majority). An array of parts ONLY for vision calls (currently just palm-report.ts) — gemini-client.ts passes `messages` straight through to the API body unmodified, so no other change is needed to support this. */
  content: string | ContentPart[];
}
```

This is purely additive — every existing call site sets `content: 'some string'`, which still satisfies `string | ContentPart[]`. Do not change `gemini-client.ts` at all; confirm by reading `doRequest()` in that file that `messages: opts.messages` is passed through unmodified (it is) — no further change needed there.

- [ ] **Step 2: Add the generation profile**

In `src/config/llm.ts`, add at the end of the file:

```ts
/**
 * Palm reading (vision) — the only Prime report whose messages carry an
 * image (see ChatMessage's `content: string | ContentPart[]` above).
 * Generated once per unlock; the uploaded photo (palm_photos table) is
 * deleted immediately on success, or left in place for a bounded retry
 * window on failure — see lib/llm/palm-report.ts and
 * modules/palm/palm-photo.repo.ts.
 */
export const PALM_REPORT_PROFILE: GenerationProfile = {
  name: 'palm-report',
  temperature: 0.4,
  jsonMode: true,
  stream: false,
  maxTokens: 2500,
};
```

- [ ] **Step 3: Write the failing test file, then implement `src/lib/llm/palm-report.ts`**

Create `test/palm-report.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generatePalmReport, translatePalmContent } = await import('../src/lib/llm/palm-report.js');

const VALID_JSON = JSON.stringify({
  intro: 'Your palm shows a strong, clearly defined set of major lines.',
  lifeLine: 'Your life line curves deep into the palm, traditionally read as steady vitality.',
  heartLine: 'A long, gently curved heart line suggests warmth in how you connect with others.',
  headLine: 'Your head line runs fairly straight, traditionally linked to practical thinking.',
  fateLine: 'A clear fate line is visible, often read as a strong sense of direction.',
  overallGuidance: 'Trust the steady, practical instincts these lines point toward.',
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generatePalmReport', () => {
  it('returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    const result = await generatePalmReport({
      imageBase64: 'ZmFrZS1pbWFnZS1kYXRh',
      mimeType: 'image/jpeg',
    });

    expect(result.intro).toContain('lines');
    expect(result.lifeLine).toBeTruthy();
    expect(result.heartLine).toBeTruthy();
    expect(result.headLine).toBeTruthy();
    expect(result.fateLine).toBeTruthy();
    expect(result.overallGuidance).toBeTruthy();
    expect(result.model).toBeTruthy();
  });

  it('sends the photo as an image_url content part alongside the text instruction', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    await generatePalmReport({ imageBase64: 'ZmFrZS1pbWFnZS1kYXRh', mimeType: 'image/jpeg' });

    const call = state.generate.mock.calls[0]![0];
    const userMessage = call.messages.find((m: { role: string }) => m.role === 'user');
    expect(Array.isArray(userMessage.content)).toBe(true);
    const imagePart = userMessage.content.find((p: { type: string }) => p.type === 'image_url');
    expect(imagePart.image_url.url).toBe('data:image/jpeg;base64,ZmFrZS1pbWFnZS1kYXRh');
    const textPart = userMessage.content.find((p: { type: string }) => p.type === 'text');
    expect(textPart.text).toBeTruthy();
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(
      generatePalmReport({ imageBase64: 'abc', mimeType: 'image/jpeg' }),
    ).rejects.toThrow('palm LLM returned unparseable JSON');
  });

  it('throws when a required narrative field is missing', async () => {
    state.generate.mockResolvedValueOnce(JSON.stringify({ intro: 'only an intro' }));

    await expect(
      generatePalmReport({ imageBase64: 'abc', mimeType: 'image/jpeg' }),
    ).rejects.toThrow('palm LLM returned unparseable JSON');
  });
});

describe('translatePalmContent', () => {
  const original = {
    intro: 'Your palm shows a strong, clearly defined set of major lines.',
    lifeLine: 'Your life line curves deep into the palm.',
    heartLine: 'A long, gently curved heart line.',
    headLine: 'Your head line runs fairly straight.',
    fateLine: 'A clear fate line is visible.',
    overallGuidance: 'Trust the steady, practical instincts these lines point toward.',
  };

  it('returns the translated narrative on a valid response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'नमस्ते',
        lifeLine: 'जीवन रेखा',
        heartLine: 'हृदय रेखा',
        headLine: 'मस्तिष्क रेखा',
        fateLine: 'भाग्य रेखा',
        overallGuidance: 'मार्गदर्शन',
      }),
    );

    const result = await translatePalmContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते');
    expect(result.overallGuidance).toBe('मार्गदर्शन');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translatePalmContent(original, 'hi')).rejects.toThrow(
      'palm translation returned unparseable JSON (target=hi)',
    );
  });
});
```

Run: `pnpm test test/palm-report.spec.ts` — expect FAIL (module doesn't exist yet).

Implement `src/lib/llm/palm-report.ts`:

```ts
// =============================================================================
// Palm reading (vision) — the AI analyzes an uploaded photo directly (see
// ChatMessage's `content: string | ContentPart[]` in config/llm.ts). Unlike
// every other report, there is no separate "deterministic facts" layer here
// — the photo itself IS the input, and the model's job is both to read it
// and narrate it. No fallback filler: an unparseable response throws. The
// photo's lifecycle (storage, deletion) is owned entirely by the CALLER
// (prime-reports.registry.ts's `palm` entry + modules/palm/palm-photo.repo.ts)
// — this module never persists the image itself.
// =============================================================================

import { generate } from './gemini-client.js';
import { PALM_REPORT_PROFILE, MODEL } from '../../config/llm.js';
import { cleanJsonString } from './horoscope.js';

export interface PalmLlmContext {
  imageBase64: string;
  mimeType: string;
}

export interface PalmNarrative {
  intro: string;
  lifeLine: string;
  heartLine: string;
  headLine: string;
  fateLine: string;
  overallGuidance: string;
}

export interface PalmReportResult extends PalmNarrative {
  model: string;
}

const GROUNDING_RULE =
  'Base your reading only on what is actually visible in the photo. If the palm or a specific line is not clearly visible, say so honestly rather than inventing detail.';
const PLAIN_LANGUAGE_RULE =
  'Write for someone with zero palmistry background. Explain what each line traditionally suggests in plain, real-life terms.';
const SAFETY_RULE =
  'This is a traditional palmistry reading for reflection and entertainment, never a medical diagnosis or a guaranteed prediction. Never comment on visible skin conditions, injuries, or anything resembling a medical concern — if something looks medically relevant, do not mention it at all; simply read the lines.';

function systemPrompt(): string {
  return `You are a traditional palmistry reader analyzing a photo of a person's palm for a mobile app screen.

${GROUNDING_RULE}
${PLAIN_LANGUAGE_RULE}
${SAFETY_RULE}

Return STRICT JSON only, no markdown fences, in this exact shape:
{"intro": string, "lifeLine": string, "heartLine": string, "headLine": string, "fateLine": string, "overallGuidance": string}

"intro": 2-3 sentences (under 55 words) — a warm overview of the palm's general character.
"lifeLine", "heartLine", "headLine", "fateLine": each 2-3 sentences (under 60 words) — what that specific line's shape/length/depth traditionally suggests. If a line is not clearly visible in the photo, say so plainly instead of inventing a reading for it.
"overallGuidance": 1-2 sentences (under 40 words) — practical, reflective guidance tying the reading together.
Second person, present tense, conversational.`;
}

const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    lifeLine: { type: 'string' },
    heartLine: { type: 'string' },
    headLine: { type: 'string' },
    fateLine: { type: 'string' },
    overallGuidance: { type: 'string' },
  },
  required: ['intro', 'lifeLine', 'heartLine', 'headLine', 'fateLine', 'overallGuidance'],
} as const;

const NARRATIVE_FIELDS = [
  'intro',
  'lifeLine',
  'heartLine',
  'headLine',
  'fateLine',
  'overallGuidance',
] as const;

function parseNarrative(raw: string): PalmNarrative | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as Record<string, unknown>;
    const out: Partial<PalmNarrative> = {};
    for (const field of NARRATIVE_FIELDS) {
      const value = data[field];
      if (typeof value !== 'string' || !value.trim()) return null;
      out[field] = value.trim();
    }
    return out as PalmNarrative;
  } catch {
    return null;
  }
}

/**
 * No fallback: a failed or unparseable response throws rather than caching
 * generic filler — same discipline as every other report.
 */
export async function generatePalmReport(ctx: PalmLlmContext): Promise<PalmReportResult> {
  const raw = await generate({
    profile: PALM_REPORT_PROFILE,
    responseSchema: NARRATIVE_SCHEMA,
    messages: [
      { role: 'system', content: systemPrompt() },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this palm photo and write the reading.' },
          {
            type: 'image_url',
            image_url: { url: `data:${ctx.mimeType};base64,${ctx.imageBase64}` },
          },
        ],
      },
    ],
  });

  const parsed = parseNarrative(raw);
  if (!parsed) {
    void import('../logger.js').then((m) =>
      m.logger.error({ raw }, 'unparseable JSON in palm report'),
    );
    throw new Error('palm LLM returned unparseable JSON');
  }
  return { ...parsed, model: MODEL };
}

/** Translate an already-generated report's AI fields — same pattern as translateLifeAreaContent. */
export async function translatePalmContent(
  original: PalmNarrative,
  targetLanguage: string,
): Promise<PalmNarrative> {
  const raw = await generate({
    profile: PALM_REPORT_PROFILE,
    responseSchema: NARRATIVE_SCHEMA,
    messages: [
      {
        role: 'user',
        content: `Translate the following report content into the language "${targetLanguage}". Keep the exact same JSON structure and keys. ONLY translate the human-readable values.\n\nOriginal Content:\n${JSON.stringify(original, null, 2)}`,
      },
    ],
  });

  const parsed = parseNarrative(raw);
  if (!parsed) {
    throw new Error(`palm translation returned unparseable JSON (target=${targetLanguage})`);
  }
  return parsed;
}
```

Run: `pnpm test test/palm-report.spec.ts` — expect PASS.

- [ ] **Step 4: Add the registry entry**

In `src/modules/prime-reports/prime-reports.registry.ts`, add the imports:

```ts
import {
  generatePalmReport,
  translatePalmContent,
  type PalmNarrative,
} from '../../lib/llm/palm-report.js';
import { findPendingPalmPhoto, deletePalmPhoto } from '../palm/palm-photo.repo.js';
```

Add a new entry to `PRIME_REPORT_DEFINITIONS` (as a named key, alongside `baby-name`, before the `LIFE_AREAS` spread):

```ts
  palm: {
    reportType: 'palm',
    title: 'Palm Reading',
    pricePaise: 2500,
    async generate(userId, profile, _period) {
      const photo = await findPendingPalmPhoto(userId, profile.birthProfileId);
      if (!photo) {
        throw new Error(
          'Upload a palm photo first via POST /v1/prime/palm/photo before unlocking this report',
        );
      }
      const { model, ...narrative } = await generatePalmReport({
        imageBase64: photo.imageBase64,
        mimeType: photo.mimeType,
      });
      // Consumed successfully — delete now rather than waiting for the 48h
      // cleanup window. (If markPrimeReportReady somehow fails right after
      // this returns, the photo is already gone and a retry would need a
      // fresh upload — an accepted, narrow edge case: a DB write failing
      // immediately after a successful read-and-delete is rare, and no
      // simpler alternative avoids it without meaningfully more complexity.)
      await deletePalmPhoto(photo.id);
      return { content: narrative, model };
    },
    async translate(content, language) {
      const translated = await translatePalmContent(
        content as unknown as PalmNarrative,
        language,
      );
      return translated as unknown as Record<string, unknown>;
    },
  },
```

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all passing (baseline + this task's new tests), no typecheck regressions.

- [ ] **Step 6: Commit**

```bash
git add src/config/llm.ts src/lib/llm/palm-report.ts test/palm-report.spec.ts src/modules/prime-reports/prime-reports.registry.ts
git commit -m "feat(prime): add palm reading report (vision)"
```

---

### Task 4: Expired-photo cleanup script

**Files:**

- Create: `scripts/cleanup-expired-palm-photos.ts`

- [ ] **Step 1: Implement the script**

Create `scripts/cleanup-expired-palm-photos.ts`, following this codebase's existing one-off script convention (see `scripts/count-device-tokens.ts` for the exact style: a doc-comment usage line, a `main()` function, `.then(() => process.exit(0)).catch(...)`):

```ts
/** Deletes expired palm_photos rows (uploaded but never consumed within the 48h retention window). Usage: npx tsx scripts/cleanup-expired-palm-photos.ts */
import { deleteExpiredPalmPhotos } from '../src/modules/palm/palm-photo.repo.js';

async function main() {
  const deleted = await deleteExpiredPalmPhotos();
  console.log(`Deleted ${deleted} expired palm photo(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Sanity-check it compiles**

Run: `pnpm typecheck` — confirm no new errors from this file (it's a script, not covered by the main test suite, but must still typecheck cleanly).

Do NOT run this script for real in this session — it would attempt a real database connection, which doesn't exist in this sandbox. Confirm via `pnpm typecheck` only.

- [ ] **Step 3: Commit**

```bash
git add scripts/cleanup-expired-palm-photos.ts
git commit -m "chore(palm): add expired photo cleanup script"
```

Note in your final report that wiring this into the production crontab (so it actually runs periodically) is a deploy-time action for later — out of scope for this session, same as every other change in this batch.

---

## After all 4 tasks: controller final review (not a subagent task)

- `pnpm test && pnpm typecheck && pnpm lint` (lint scoped to files this batch touched) all clean.
- Full catalogue sanity check: `PRIME_REPORT_DEFINITIONS` has exactly 15 keys.
- Re-read the generated migration SQL one more time to be certain it ONLY adds `palm_photos` — this is the one place in this batch where a mistake could affect data outside this feature's scope.
- Confirm the photo is genuinely never included in any report's returned `content` — grep for `imageBase64` across `src/modules/prime-reports/` and confirm it appears ONLY inside the `palm` entry's `generate()` function (as an input to `generatePalmReport`), never assigned into anything returned to the client.

Do NOT merge to `main` — accumulate on this branch, merge once at the end in a single step.
