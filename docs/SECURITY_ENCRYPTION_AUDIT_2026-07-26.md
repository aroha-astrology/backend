# Aroha Astrology — Field-Level Encryption Audit

**Date:** 2026-07-26
**Scope:** `jyotish-backend` (encryption mechanism, its call sites, key management, transport/backup posture, third-party LLM egress) plus a read-only check of `frontend/lib/cache.ts` for client-side plaintext caching.
**Method:** Direct code read only — `field-encryption.ts`, every repo file, `schema.ts`, `env.ts`, `db.ts`, `deploy.sh`, `.env.example`, `.github/workflows/`, and a cross-reference against the prior `SECURITY_AND_PRIVACY_AUDIT.md` (2026-07-17). No code was written or changed. No database, build, or migration command was run.
**This is an audit only.** It does not recommend or begin any implementation — that is deliberately out of scope for this round. Its purpose is to give an accurate, complete, file:line-cited picture of today's state so a follow-up round can be scoped correctly.

---

## 0. Relationship to the prior audit

`SECURITY_AND_PRIVACY_AUDIT.md` (2026-07-17, repo root of `aroha-astrology`) is the most recent full security/PII/DPDP audit and remains the authoritative source for everything outside field-level encryption (Telegram RBAC, phone-recycling takeover, consent/erasure, PostHog, legal-text gaps, dependency CVEs, etc. — none of that is re-litigated here). At the time of that audit, its P1 finding #5 stated plainly: **"No field-level encryption anywhere — phone, DOB, birth place/coordinates, gotra, full chat transcripts stored as plaintext columns/JSONB, relying solely on Postgres/Supabase disk encryption."**

That has since changed. This document's first job is to establish **what shipped** since that finding (the mechanism in §1–§2 below, deployed live per project history), and its second job is to establish **what did not** — the gaps in §3, several of which the 2026-07-17 audit had no way to anticipate because the feature didn't exist yet (e.g. `chat_feedback_reports` as a plaintext side-channel of now-encrypted chat content).

Two other items from the 2026-07-17 audit are directly relevant here and are re-verified, not re-derived from scratch:
- **DB transport (§6):** the 2026-07-17 audit found `db.ts` passed **no `ssl` option at all**. That has changed — `db.ts` now passes an explicit `ssl: isProduction ? 'prefer' : false` (see §6). This is a partial change, not a full fix: `'prefer'` is opportunistic, not enforced.
- **CI security tooling:** the 2026-07-17 audit found "zero SAST/secret-scanning/dependency-audit in any repo." `.github/workflows/security.yml` now exists in this repo (Gitleaks secret scan + informational `pnpm audit` on every PR/push to `main`) — relevant here because it's the only thing in this repo that would catch an `ENCRYPTION_KEY`/`ENCRYPTION_HASH_KEY` value accidentally committed.

Everything else below is new material specific to the encryption mechanism and its gaps.

---

## 1. How the mechanism works

Source: `src/lib/crypto/field-encryption.ts` (103 lines, read in full).

- **Algorithm:** AES-256-GCM (`ALGORITHM = 'aes-256-gcm'`, line 17), random 12-byte IV per value (`IV_LENGTH = 12`, line 18, freshly generated via `randomBytes(IV_LENGTH)` on every `encryptField` call, line 42).
- **Wire format:** `enc:v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>` (`PREFIX = 'enc:v1:'`, line 19; assembled at line 46). The GCM auth tag is stored and verified separately (`cipher.getAuthTag()` / `decipher.setAuthTag()`, lines 45/63) — a tampered ciphertext fails to decrypt rather than silently returning garbage.
- **Key handling:** `ENCRYPTION_KEY` must be a base64-encoded 32-byte key (`openssl rand -base64 32`), validated and cached in module scope on first use (`getKey()`, lines 23–37). If unset, every encrypt/decrypt call throws immediately with a descriptive error (lines 26–30) rather than silently falling back to plaintext.
- **Key-loss warning, verbatim from the file's own header comment (lines 8–11):** *"`ENCRYPTION_KEY` must be a 32-byte key, base64-encoded... Losing it means the encrypted columns become unrecoverable — back it up outside the app's own `.env` (e.g. a secrets manager), the same way `DATABASE_URL` and the Firebase Admin key are handled."* This is a design property, not an oversight: there is no key-recovery mechanism anywhere in this codebase.
- **Non-destructive migration property:** `decryptField` (lines 55–69) returns any value that doesn't start with `enc:v1:` **unchanged**. This is what let the migration ship without a maintenance window — legacy plaintext rows read back correctly forever, until the next write re-encrypts them. `decryptJson` (lines 78–88) has the same property, plus a defensive `try/catch` around `JSON.parse` so one malformed/legacy row can't 500 an entire request (returns `null` instead of throwing).
- **JSON helper:** `encryptJson`/`decryptJson` (lines 72–88) simply `JSON.stringify`/`JSON.parse` around `encryptField`/`decryptField`, used for structured values like `PlaceOfBirth`.
- **Blind index for equality lookups:** `hashForLookup` (lines 96–102) is a deterministic HMAC-SHA256 over a **separate** key, `ENCRYPTION_HASH_KEY`. This exists because AES-GCM ciphertext is non-deterministic (random IV per call) and can't back a unique constraint or an equality `WHERE` clause directly — phone-number lookups (login, admin search) go through the hash column instead. The two keys are deliberately kept distinct (documented at lines 91–95 and again in `env.ts:78–84`) specifically so that a leak of one key alone can't be used to either decrypt data or forge lookup hashes.
- **One-time backfill:** `scripts/backfill-field-encryption.ts` (183 lines) is the migration's rollout script — it walks `users`, `birth_profiles`, `chat_sessions`, `user_facts`, encrypting any row still holding plaintext (detected the same way `decryptField` detects it: absence of the `enc:v1:` prefix) and, critically, computing `phoneE164Hash` for every user row that doesn't have one yet (its own header comment, lines 12–15, notes that without this step "EVERY existing user is locked out," since login now looks users up by hash, not plaintext). It's idempotent (already-encrypted rows are skipped) and requires both keys to be set before it will run at all (lines 165–170).

**Schema-level migration:** `src/db/migrations/0023_security_hardening_2026_07_17.sql` is the DDL that made this possible — it only changes column *types* (`date`/`time`/`jsonb` → `text`, since ciphertext needs a text column) on `users.date_of_birth/time_of_birth/place_of_birth`, `birth_profiles.date_of_birth/time_of_birth/place_of_birth`, and `chat_sessions.history`, plus adds `users.phone_e164_hash`. It does not touch existing values — that's what the backfill script above is for. `gotra`, `sankalpa_name`, and `user_facts.fact`/`follow_up_question` were already plain `text` columns (no type change needed to hold ciphertext).

---

## 2. What is encrypted today — table by table

### `users` (`schema.ts:239–380`)

| Column | Schema line | Encrypted? |
|---|---|---|
| `phoneE164` | 250 | Yes (AES-GCM) |
| `phoneE164Hash` | 251 | Blind index (HMAC-SHA256, separate key) — not itself "encrypted," it's the lookup mechanism |
| `dateOfBirth` | 265 | Yes |
| `timeOfBirth` | 266 | Yes |
| `placeOfBirth` | 267 | Yes (as JSON via `encryptJson`) |
| `gotra` | 278 | Yes |
| `sankalpaName` | 279 | Yes |
| `displayName` | 254 | **No — see Gap 1** |

Call sites, all in `src/modules/users/users.repo.ts`:
- `decryptUserRow` (lines 39–52) — decrypts all six fields on every read; its own doc comment (lines 28–37) states it is "the ONLY place that should touch those raw columns."
- `encryptUserPatch` (lines 61–76) — encrypts on write; when `phoneE164` is being set, it computes `phoneE164Hash` from the plaintext **before** encrypting it (lines 64–66), since the hash can only be derived pre-encryption.
- `findUserByFirebaseUid`, `findUserByPhoneE164` (lines 78–91) — the latter looks up by `phoneE164Hash` via `hashForLookup`, not by the ciphertext column.
- `listUsersPage` (line 556) and the admin/Telegram search predicate `userSearchWhere` (lines 517–537) — decrypts `phoneE164` for display; note the file's own comment here (lines 517–524) explaining that `displayName`/`email` are deliberately left plaintext specifically so they can be partial-matched with `ILIKE`, while phone can only be matched exactly via the hash.

### `birth_profiles` (`schema.ts:389–436`) — third-party (spouse/child/parent) charts

| Column | Schema line | Encrypted? |
|---|---|---|
| `dateOfBirth` | 403 | Yes |
| `timeOfBirth` | 404 | Yes |
| `placeOfBirth` | 405 | Yes (JSON) |
| `gotra` | 409 | Yes |
| `displayName` | 399 | **No — see Gap 1** |

Call sites, `src/modules/birth-profiles/birth-profiles.repo.ts`: `decryptRow` (lines 24–34), `encryptPatch` (lines 36–45) — same shape as the `users` treatment, its own comment (lines 19–23) confirms "same treatment as the equivalent `users` columns."

### `chat_sessions` (`schema.ts:1415–1444`) — full AI chat transcripts

| Column | Schema line | Encrypted? |
|---|---|---|
| `history` (full transcript array) | 1432 | Yes (JSON via `encryptJson`/`decryptJson`) |
| `summary` (LLM-compacted) | 1433 | Yes |

Call sites, `src/modules/astro/chat-sessions.repo.ts`: `decryptRow` (lines 17–23), read paths `getChatSessions`/`getChatSession` (lines 32–62), write paths `createChatSession`/`updateChatSession` (lines 64–111, encrypting at lines 77–78 and 101–102).

### `user_facts` (`schema.ts:1522–1546`) — durable cross-session facts extracted from chat

| Column | Schema line | Encrypted? |
|---|---|---|
| `fact` | 1535 | Yes |
| `followUpQuestion` | 1538 | Yes |

Call sites, `src/modules/astro/user-facts.repo.ts`: `getUserFacts` decrypts at lines 37–38; `saveUserFacts` encrypts at lines 81–82 (and decrypts existing facts at line 61 purely to do case-insensitive dedup against new ones).

### Read-only decrypt-for-display consumers (don't own any encrypted column, just decrypt `users.phoneE164` for their own output)

- `src/modules/astro/feedback.repo.ts` — `getFeedbackVoteCountsByUser` (lines 61–96) joins `chat_feedback_votes` to `users` and decrypts `phoneE164` at line 91, for the Telegram `/feedback` command's leaderboard.
- `src/modules/user-groups/user-groups.repo.ts` — `listMembers` (lines 84–96) joins `user_group_members` to `users` and decrypts `phoneE164` at line 96, for the admin group-membership view.

### Blind-index (`hashForLookup`) call sites

`src/modules/users/users.repo.ts`: line 65 (compute hash on write), line 88 (`findUserByPhoneE164`, the login path), line 534 (`userSearchWhere`, exact-match branch of admin/Telegram user search — the comment at lines 517–524 spells out that this is why phone search can only ever be an exact match, never partial, unlike `displayName`/`email`).

**All eight repo files that touch the encryption module, confirmed by grepping the entire `src/` tree for `encryptField|decryptField|encryptJson|decryptJson|hashForLookup`:** `field-encryption.ts` (the module itself), `users.repo.ts`, `birth-profiles.repo.ts`, `chat-sessions.repo.ts`, `user-facts.repo.ts`, `feedback.repo.ts`, `user-groups.repo.ts` — seven consumers, no more. This list from the prior audit is confirmed still current and complete.

---

## 3. Gaps

### Gap 1 — `displayName` is plaintext everywhere, by deliberate but implicit tradeoff

**What's exposed:** `users.displayName` (`schema.ts:254`) and `birth_profiles.displayName` (`schema.ts:399`, third parties' names) are never passed through `encryptField`. This is not an oversight — `users.repo.ts:517–524` documents that `displayName`/`email` are "plaintext columns and can be ILIKE'd for a partial match," which is exactly what the admin dashboard and Telegram `/users`/`/search` commands rely on. AES-GCM's non-deterministic ciphertext structurally cannot support partial-match search, so encrypting `displayName` today would break that admin search feature outright without an additional mechanism (e.g. a separate n-gram/tokenized search index).

**Realistic impact:** a DB dump, read-replica leak, or `pg_dump` in the wrong hands would expose every user's (and every third party's, in `birth_profiles`) full name in plaintext — arguably more directly identifying on its own than the phone-number or birth-data columns that already got the encryption treatment, since a name requires no further correlation to identify a person.

**Remediation effort:** M — not a simple "wrap it in `encryptField`" change, because that breaks partial-match admin search. A real fix needs either a separate searchable-encryption scheme (e.g. hashed n-grams) or a product decision to drop partial-name search in favor of exact-match/phone-hash lookup only.

**Recommendation:** this tradeoff should be made explicit and signed off on, not left as a single inline code comment — it's currently a real, working decision, just an undocumented one outside that one comment.

### Gap 2 — Kundli/horoscope/gemstone/vastu/report content is entirely unencrypted

**What's exposed:** none of the following tables or their repo files (`src/modules/kundli/kundli.repo.ts`, `src/modules/horoscope/horoscope.repo.ts`, `src/modules/kundli/house-insight.repo.ts`, `src/modules/gemstone/gemstone.repo.ts`, `src/modules/vastu/vastu.repo.ts`, `src/modules/reports/reports.repo.ts`) import the encryption module at all (confirmed by grep — zero hits):

| Table | Columns | Schema lines |
|---|---|---|
| `kundlis` | `chartData`, `dashaData`, `yogaData`, `doshaData`, `ashtakavargaData` | 851–855 |
| `daily_horoscopes` | `summary`, `monthlyBreakdown`, `structured`, `translations` | 966–983 |
| `house_insights` | `text`, `strengths`, `weaknesses`, `translations` | 1042–1049 |
| `gemstone_recommendations` | `analysis`, `translations` | 1103–1105 |
| `vastu_plans` | `layout`, `roomLayout`, `roomDetails`, `analysis`, `translations` | 1248–1258 |
| `reports` | `content`, `translations`, `input` | 1325–1333 |

**Realistic impact:** most of this content (planetary positions, dasha periods, AI-generated horoscope narrative) is *derived from* birth data rather than a direct identifier itself, so on its own it's lower-severity than the already-encrypted columns. But two specific fields are meaningfully worse: `reports.input` (`schema.ts:1332–1333`) stores a partner's raw birth details for `kundli_milan` compatibility reports — this is third-party birth data of the same sensitivity class as `birth_profiles`, just sitting in a different, unencrypted table. `vastu_plans.roomDetails` (`schema.ts:1251`) explicitly carries "any free-text notes passed to the AI" — an open text field a user could put anything into. A DB dump would expose a user's complete natal chart (joined trivially via `userId`) plus any free text they entered into Vastu or a `kundli_milan` partner form, in plaintext.

**Remediation effort:** L — six tables, several with `translations` sub-objects that would each need the same treatment, and (unlike `chat_sessions.history`, which is opaque free text) some of this content is read by SQL-level filters/joins in places, which would need auditing before blindly wrapping columns in `encryptField`.

**Recommendation:** lowest priority of the four content-level gaps given the "derived, not raw" nature of most of it — but `reports.input` and `vastu_plans.roomDetails` specifically resemble the birth-data/free-text classes that already got encrypted elsewhere, and are the natural first candidates if this gap is ever closed.

### Gap 3 — `chat_feedback_reports` is a plaintext side-channel of already-encrypted chat content

**What's exposed:** `chat_feedback_reports.question`/`.answer` (`schema.ts:1476–1477`) store the exact Q&A text of any chat turn a user thumbs-downs — written in plaintext by `saveChatFeedbackReport` (`src/modules/astro/feedback.repo.ts:22–36`). This is the *same content class* as `chat_sessions.history`/`summary`, which are encrypted — but this table captures a verbatim copy of select turns from that same transcript and stores it with no encryption at all.

**Realistic impact:** a DB dump exposes real user chat exchanges — which, per the prior audit's finding (independently corroborated by the design here, since chat is deliberately free-text), "can contain anything the user typed, including their own name" — even in a hypothetical world where `chat_sessions` itself were fully protected. This is the most direct, fixable inconsistency in the current encryption coverage: a table added after the encryption migration shipped, holding the same sensitivity of content, that nobody wired into the existing pattern.

**Remediation effort:** S — two `text` columns, one repo file, the exact same `encryptField`/`decryptField` pattern already used seven times elsewhere in this codebase. No schema/type change needed (both columns are already `text`).

**Recommendation:** apply the existing pattern here; this is the smallest, most mechanical gap to close of everything in this document.

### Gap 4 — Frontend caches fully-decrypted PII in browser `localStorage`, unencrypted

**What's exposed:** `frontend/lib/cache.ts` (read in full) is a `localStorage` wrapper (`cacheGet`/`cacheSet`, lines 68–176) used to cache kundli, horoscope, gemstone, house-insight, and Vastu ("remedies") API responses client-side — the module's own header comment (lines 1–20) names the exact hooks that write into it (`usePersonalizedHoroscope`, `useKundli`, `useGemstone`, `useHouseInsight`) and the direct call sites (`app/remedies/page.tsx`, `app/panchang/page.tsx`). Every cache key is built via `buildKey(kind, userId, ...)` (lines 207–219), and `CacheScope` (line 231) explicitly lists `"kundli" | "horoscope" | "gemstone" | "houseInsight" | "remedies"` as the scopes that get purged on a birth-detail edit — confirming these are the PII-bearing resources being cached. By the time this data reaches the frontend, it has already been decrypted server-side (the whole point of field-level encryption is that every layer *outside* the repo files sees plain values) — so what lands in `localStorage` is the user's full natal chart and personalized readings, in plaintext, with no encryption of any kind at the storage layer. Expiry is TTL-based only (`Entry.exp`, lines 25–32); there's no encryption key involved at all client-side.

**Realistic impact:** on a shared or family device, this data persists in browser storage until its TTL lapses (device clock permitting) or the app's cache version bumps — recoverable by anyone with access to that browser profile. The prior audit separately flagged `android:allowBackup="true"` with no backup-exclusion rules on the live mobile app; combined with a WebView-based client, that means this same localStorage content could ride along in Android's automatic cloud backup, entirely outside this repo's or Postgres's control.

**Remediation effort:** M — the options range from a pure policy decision (accept as documented risk, matching how `ENCRYPTION_KEY` custody is already handled as a documented-not-solved risk) to real engineering work (move to a session-scoped Web Crypto AES key held only in memory, or drop persistent caching of these specific resource kinds in favor of an in-memory-only cache).

**Recommendation:** this deserves the same explicit accept-or-fix decision the key-custody question already gets — right now it's neither.

### Gap 5 — No key rotation or re-encryption tooling exists anywhere

**What's exposed:** grepping this repo for `rotat|re-encrypt|reencrypt` turns up zero relevant code — every hit is either the Panchang `karana` calendar's unrelated "rotating" vocabulary or the word "re-encrypted" inside `field-encryption.ts`'s own doc comment describing the *original* plaintext-to-ciphertext migration, not a rotation capability. `scripts/backfill-field-encryption.ts` is the only migration-adjacent script that exists, and it is explicitly a one-shot: it only touches rows that are still plaintext (`isPlain()`, line 36) — it has no path for re-encrypting an already-`enc:v1:`-prefixed row under a *new* key. `ENCRYPTION_KEY`/`ENCRYPTION_HASH_KEY` are `optional()` in the Zod env schema (`env.ts:83–84`) — the app boots fine without them; the first attempted encrypt/decrypt call is what throws (`field-encryption.ts:26–30, 98–100`), not startup validation.

**Realistic impact:** if `ENCRYPTION_KEY` were ever suspected compromised (e.g. accidentally logged, or exposed via a leaked EC2 `.env`), there is today no way to rotate it without also decrypting-and-re-encrypting every affected row using a purpose-built script that doesn't currently exist — meaning a key-compromise incident would require emergency script-writing under pressure rather than running a rehearsed procedure.

**Remediation effort:** M — a rotation script following the same shape as `backfill-field-encryption.ts` (decrypt under the old key, re-encrypt under the new one), plus a short dual-key rollover window in `field-encryption.ts` itself (try new key, fall back to old key on `decryptField` failure) so the app keeps working mid-rotation.

**Recommendation:** none prescribed here (this round is audit-only) — flagged as a real, currently-unaddressed operational gap, distinct from the key-custody question in the next paragraph.

### Gap 6 — Key custody: no evidence of a secrets manager, only the hand-managed EC2 `.env`

**What's exposed:** `field-encryption.ts`'s own header comment (lines 8–11) instructs that the keys be "back[ed] up outside the app's own `.env` (e.g. a secrets manager), the same way `DATABASE_URL` and the Firebase Admin key are handled." `scripts/deploy.sh` (lines 27–31) explicitly excludes `.env`/`secrets` from every rsync to the EC2 box — meaning the box's `.env` (which must hold the real `ENCRYPTION_KEY`/`ENCRYPTION_HASH_KEY` for the running app to function) is entirely hand-managed outside this repo's tooling, and `.env.example` (lines 51–55) only documents the variable names and the `openssl rand -base64 32` generation command, with no reference to where the live values are actually stored or backed up. This repo contains no evidence one way or the other of whether a secrets-manager backup actually exists — that lives entirely outside the code this audit can inspect.

**Realistic impact:** unverifiable from this repo. Stated explicitly rather than guessed either way, per this audit's own ground rules — if no such backup exists, the key-loss warning in Gap 5's neighbor is not hypothetical.

**Remediation effort:** N/A (verification task, not a code change).

**Recommendation:** none prescribed here — flagged as unverifiable from code alone, needs a direct answer from whoever manages the EC2 box's `.env`.

---

## 4. Transport and storage-level encryption (outside the field-level mechanism)

### Postgres transport (`src/config/db.ts:6–18`)

```
const client = postgres(env.DATABASE_URL, {
  max: isProduction ? 10 : 5,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: false,
  ssl: isProduction ? 'prefer' : false,
});
```

The comment directly above this (lines 11–16) states `'require'` was tried first and confirmed, live on 2026-07-17, to break the production connection entirely — and that its TLS support/cert configuration was never independently verified before that attempt. Today's setting, `'prefer'`, is **opportunistic**: it uses TLS if the server offers it, but does not fail the connection if it doesn't. This is a change from the 2026-07-17 audit (which found no `ssl` option passed at all), but it is not equivalent to an enforced/verified TLS posture — if the production Postgres endpoint were ever to stop offering TLS (or a network path strips it), the app would silently fall back to an unencrypted connection rather than failing loudly.

### Database hosting and storage-level encryption

`.env.example` (lines 9–14) documents `DATABASE_URL` as "the pooled connection string from Supabase (\"Connection pooling\" tab)" — i.e., the production Postgres instance is **Supabase-managed**, not a self-administered AWS RDS instance the app or this repo directly configures. Whether that underlying storage is encrypted at rest, and under what key-management model, is a Supabase account/plan-level setting entirely outside anything in `jyotish-backend`'s code or config — **this repo's code cannot attest to it either way**, and no attempt was made to guess.

### Backups

Grepping this entire repo for `pg_dump`, "RDS snapshot," "automated backup," and `backup_retention` returns **zero results** — no backup script, cron job, or documentation of a backup/retention policy exists anywhere in `jyotish-backend`. Given the Supabase-hosted finding above, backup behavior most likely lives entirely in Supabase's own project settings (point-in-time recovery, daily snapshots, etc., depending on plan tier) rather than anything this repo runs or documents — but that is inference, not something confirmed here. This matches the prior audit's own explicit out-of-scope note ("Backup security & restore testing — not assessed").

---

## 5. Third-party egress: what reaches Gemini

`src/lib/llm/gemini-client.ts` (the sole LLM client — its own header comment states "Sole LLM provider, single key, no cross-provider fallback exists anymore") sends prompt content over HTTPS to `env.GEMINI_BASE_URL` (`https://generativelanguage.googleapis.com/v1beta/openai` by default, `env.ts:62`) via `POST /chat/completions` (`gemini-client.ts:106–114`), authenticated with `GEMINI_API_KEY` as a bearer token.

By design, decrypted birth data is used server-side only to *compute* derived astrological facts before anything reaches a prompt — confirmed directly in `src/modules/astro/astro.service.ts`: `buildChatRelocationFacts` (lines 835–843) and the saved-profile fact-builder (lines 919–939) both take a decrypted `dateOfBirth`/`timeOfBirth`/`placeOfBirth` and feed them into `computeMetrology`, producing fact strings — never the raw date/time/place themselves — that are collected into `extraFacts` (line 1133) and passed into `scholarStream` (lines 1135–1145), which builds the actual Gemini prompt.

However, encryption-at-rest and third-party egress are separate controls, and this system necessarily decrypts chat content before using it: the prior 2026-07-17 audit independently traced (`scholar.ts:322–331, 374–387`) that `chat_sessions.history` (full transcript) and `chat_sessions.summary`, plus every row in `user_facts.fact`, are sent to Gemini **raw and verbatim** on every chat turn — this is the intended design (free text needs to be usable as free text), not a bug, but it does mean anything a user has ever typed in chat — including, per that audit's finding, their own name — reaches Google's Gemini API in plaintext, regardless of how well the same content is protected at rest in Postgres.

**No documented retention or deletion policy for Gemini/Google's handling of prompt content was found anywhere in this repo** — no `docs/` file, code comment, or config references a Gemini-specific data-processing agreement, retention window, or deletion guarantee. This matches the prior audit's own conclusion on this exact point (its §8a table lists "Processor agreements (DPDP §8(2)) with Google/Gemini... N/A — not code. Unverifiable here; hand to counsel/vendor contracts.") — unchanged since that audit.

---

## 6. Prioritized remediation plan

**P0 — do before anything else:**
- Confirm directly (outside this repo) whether `ENCRYPTION_KEY`/`ENCRYPTION_HASH_KEY` are actually backed up to a secrets manager as `field-encryption.ts`'s own comment instructs, or whether they exist only in the EC2 box's hand-managed `.env` — addresses Gap 6.
- Encrypt `chat_feedback_reports.question`/`.answer` using the existing `encryptField`/`decryptField` pattern already used seven times elsewhere — the smallest, most mechanical gap, and the one place encrypted chat content has an unencrypted side-door copy — addresses Gap 3.

**P1 — close next:**
- Decide and explicitly document the `frontend/lib/cache.ts` plaintext-localStorage posture for kundli/horoscope/gemstone/houseInsight/remedies (accept as documented risk, or move to a non-persistent/encrypted client cache) — addresses Gap 4.
- Decide and explicitly document the `displayName` plaintext/`ILIKE`-searchability tradeoff as a real accepted decision rather than one inline code comment — addresses Gap 1.
- Build a key-rotation/re-encryption script (none exists today), so a suspected `ENCRYPTION_KEY` compromise has a rehearsed remediation path instead of requiring one to be written under pressure — addresses Gap 5.
- Revisit `db.ts`'s `ssl: 'prefer'` — confirm what specifically broke about `'require'` on 2026-07-17 (cert config vs. genuine lack of TLS support on the production Postgres endpoint) before accepting silent-downgrade-to-plaintext as the permanent posture — addresses §4's transport finding.

**P2 — hygiene / lower urgency:**
- Scope whether `kundlis`/`daily_horoscopes`/`house_insights`/`gemstone_recommendations`/`vastu_plans`/`reports` need encryption at all, given most of their content is derived-from-birth-data rather than directly identifying — if pursued, start with `reports.input` (raw partner birth data) and `vastu_plans.roomDetails` (free text) as the two fields that most resemble already-protected data classes — addresses Gap 2.
- Get an explicit, documented answer on Supabase-side backup posture (retention window, at-rest encryption, restore testing) since none of that is configured or documented anywhere in this repo — addresses §4's backup finding.
- Get a documented position (legal/vendor-contract, not code) on Gemini/Google's data retention and deletion for prompt content, since chat text and user facts reach it in plaintext by design — addresses §5's egress finding.
