# Realtime voice (Gemini Live) + silent question pacing

**Date:** 2026-07-29
**Status:** Part A complete & tested. Part B backend written, not yet compile-verified. Frontend/mobile not started.
**Nothing committed, pushed or deployed.**

---

## Context

Two asks, both driven by protecting a shared free-tier Gemini quota.

### 1. Realtime voice

The original premise needed correcting before anything could be built:
**`gemini-3.1-flash-lite` cannot do realtime voice.** It is the text/batch tier, and it is
what the entire backend runs on today ([env.ts:87](../../../src/config/env.ts)).

The realtime model is a _different_ model — `gemini-3.1-flash-live-preview`: native
audio-to-audio over a WebSocket, barge-in, 90+ languages, released March 2026, currently
free of charge on the Gemini API. The goal is reachable by adding Flash Live as a **second**
model, leaving every existing Flash-Lite call site untouched.

Decisions taken (all three were the recommended options):

| Decision   | Choice                                                                       |
| ---------- | ---------------------------------------------------------------------------- |
| Model path | Add `gemini-3.1-flash-live-preview` for true realtime; Flash-Lite untouched  |
| Audio path | Ephemeral tokens, client connects **direct to Google**; EC2 carries no audio |
| Consent    | Explicit per-user opt-in on top of the admin feature flag                    |

Later additions from the user:

- Voice costs **₹20/minute**, hard cap **3 minutes** per session.

### 2. Question pacing

Users must not be able to fire questions rapidly, and **must never be told a limit exists**.
Enforcement has to read as natural product behaviour — "wait for the reply to finish" — not
as a quota wall.

Today this is enforced **client-side only**: `ChatConversation.tsx` returns early while
`streaming` and disables the send button. A second tab or a scripted client bypasses both
and hits the LLM in parallel, charging the wallet each time.

---

## Part A — Silent question pacing ✅ DONE

Three layers, none of which names a limit to the user.

### A1. Server-side single-flight lock — the real fix

One in-flight chat request per user, enforced in Redis so it holds across pm2 workers.

- Reuses `acquire()` / `release()` in [lib/cache/locks.ts](../../../src/lib/cache/locks.ts).
- Lock `chat:inflight` / `userId`, TTL 130s (just over `STREAM_TIMEOUT_MS` = 120s), taken
  **before** `deductWalletBalance` so a rejected duplicate never charges, released in the
  `streamSSE` `finally` **and** on the two throw-paths that never reach it (insufficient
  balance, debit failure).

**Two changes to `locks.ts` were required, both outage-relevant:**

1. `acquire()` returned `null` for both "held by someone else" and "Redis threw". The natural
   `if (!owner) reject` reading of that turns a Redis blip into a total chat outage — the
   exact shape of the `/v1` limiter incident fixed in `8c6e412`. It now returns a
   discriminated `{ ok: true, owner } | { ok: false, reason: 'held' | 'unavailable' }`, and
   the route **only rejects on `'held'`**.
2. It had **no bounded timeout**, unlike every other Redis caller in this codebase
   (`rate-limit.ts`, `gemini-key-pool.ts` both use 250ms). ioredis queues commands
   indefinitely while disconnected, so on the chat hot path an outage would have _hung_
   requests rather than failing open. All three functions now race a 250ms timeout.

`isLocked()` still fails **closed** — correctly, it guards critical sections where
double-execution is worse than unavailability.

### A2. Silent 10/min backstop

```ts
const chatQuestionLimit = rateLimiter({
  windowMs: 60_000,
  max: 10,
  name: 'chat-question',
  silent: true,
});
```

New `silent?: boolean` option on [middleware/rate-limit.ts](../../../src/middleware/rate-limit.ts):

- skips the `alertThrottled()` Telegram alert (a per-user ceiling designed to be reached by
  impatient people would otherwise page continuously and mean nothing);
- returns a bare message instead of `"Rate limit exceeded. Try again in N seconds."`

Its own `name` keeps it off the existing `astro-llm` counter (20/min, shared across every
astro LLM route).

### A3. Status codes

The pacing rejection is **429**. It was briefly 409, but that collided with
"not enough credits" — both would have arrived as an identical `code: 'CONFLICT'`, leaving
the client unable to tell a duplicate send (swallow silently) from a genuine out-of-credits
response (must be shown, with a top-up prompt).

### A4. Client behaviour

On a 429, [ChatConversation.tsx](../../../../frontend/components/ai-chat/ChatConversation.tsx)
drops the optimistic user message + assistant placeholder and restores the draft to the
input box, so it reads as a send that simply didn't go through. **No new i18n key mentions
limits, rates or waiting.** A 409 still falls through to the normal error display.

### Tests — 31 passing

| File                                                   | Covers                                                                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/cache-locks.spec.ts` (new, 8)                    | held vs unavailable, per-id/per-prefix scoping, owner-mismatch release, `isLocked` fails closed                                                       |
| `test/rate-limit.spec.ts` (+3)                         | silent mode rejects without alerting; discloses no ceiling; default still alerts                                                                      |
| `test/chat-route-single-flight.spec.ts` (new, 9)       | duplicate rejected, no double charge, fails open on Redis outage, lock released on success/failure/no-credits/debit-throw, 429-vs-409 distinguishable |
| `test/chat-route-full-history-persistence.spec.ts` (3) | unchanged, still green                                                                                                                                |

---

## Part B — Voice via Gemini Live ⚠️ BACKEND WRITTEN, UNVERIFIED

### Architecture

Client connects **directly to Google**; EC2 never carries audio (a relay would be ~64KB/s per
active speaker through the box that already serves the whole API). API keys never leave the
server. `liveConnectConstraints` pins the model, system instruction and response modality at
mint time, so a token cannot be repurposed or re-prompted.

### Metering — the load-bearing part

Because the audio path skips the backend, it cannot count spoken turns. Billing and the
3-minute ceiling are therefore enforced through **token minting**, which the client cannot
avoid:

- Token minted with `uses: 1` and `expireTime = now + 65s`. Per Google's docs `expireTime`
  bounds how long messages may be sent, so **one token buys exactly one paid minute,
  enforced by Google, not by us**.
- ₹20 charged via `deductWalletBalance` at each mint.
- Continuing past 60s requires calling the backend again with the `sessionResumption` handle;
  the 4th mint for a session is refused → **3-minute ceiling, server-side**.
- The ceiling check and the minute increment are **one conditional UPDATE** in
  `voice.repo.ts#claimVoiceMinute` (`WHERE minutes_charged < maxMinutes`), so two racing
  mints cannot both pass. Same discipline as `deductWalletBalance`.
- Failure ordering: claim minute → charge wallet → mint token, each step undoing the ones
  before it. If Google refuses, the user gets **both their money and their minute back**.

### Files added

| File                                 | Purpose                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `src/lib/llm/gemini-live-token.ts`   | Mints ephemeral tokens on the existing 8-key rotation pool (`pickKey`/`markRateLimited`) |
| `src/modules/voice/voice.repo.ts`    | `voice_sessions` DB access incl. the atomic minute claim                                 |
| `src/modules/voice/voice.service.ts` | Ceiling, charging, refunds, grounding assembly                                           |
| `src/modules/voice/voice.routes.ts`  | `POST /v1/voice/sessions`, `/{id}/extend`, `/{id}/end`                                   |

### Config

```
GEMINI_LIVE_BASE_URL   https://generativelanguage.googleapis.com/v1beta
GEMINI_LIVE_MODEL      gemini-3.1-flash-live-preview
GEMINI_LIVE_ENABLED    false   # operational kill switch, below the feature flag
```

`GEMINI_MODEL` stays `gemini-3.1-flash-lite`; every existing profile is untouched.

**Two independent switches, deliberately:** `paid.voiceChat` is the product control (admin
UI, per-user/per-group); `GEMINI_LIVE_ENABLED` is the operational one, so voice can be cut
from the box without a deploy or a DB write if it starts eating the shared quota.

### Feature flag

```ts
{ key: 'paid.voiceChat', label: 'Voice Chat (realtime, per minute)',
  group: 'paid', defaultEnabled: false, defaultPricePaise: 2000 }
```

Ships dark, per the standing "new features default off" rule. Note this price is **per
minute** — every other `paid.*` key is per unlock.

### Consent

Routed through the **existing audited consent pipeline** rather than a bespoke endpoint:
`PATCH /v1/me` with `consent: { voice: true }` → `applyConsent` → `user_consent_log` row.

- New `users.voice_consent_at` / `voice_consent_revoked_at`.
- New `voice` value on the `consent_type` enum.
- Exposed on `/v1/me` as `voiceConsentAt` / `voiceConsentRevokedAt` / `voiceConsentActive`.
- **Not inherited from `dataProcessingConsentAt`** — voice streams a recording of the user's
  own speech to a third party on a preview tier whose traffic may be used to improve that
  party's products, which is more than the general grant covers. Existing users must opt in
  explicitly, which a null column gives us for free.

Gate: feature flag ON **and** consent present. Consent failure returns a distinguishable
`VOICE_CONSENT_REQUIRED` so the app can show the sheet rather than hiding the feature.

### Prompt

`buildVoiceSystemInstruction()` in `scholar.ts` reuses a new `SHARED_PROMPT_RULES` list —
persona, grounding discipline, content policy, all the hard-won fixes — so the voice persona
**cannot drift** from the text one. Only the output style differs (`OUTPUT_STYLE_VOICE`:
spoken, 2-3 sentences, no markdown, explicit permission to be interrupted).

Worth noting: audio never passes through `classifyUserMessage` /
`classifyAssistantOutput`, so for voice the in-prompt `POLICY_SYSTEM_DIRECTIVE` is the
**only** content-policy enforcement there is. That is why it leads the prompt.

The chart grounding is a **snapshot taken at mint time** — a profile switch mid-call cannot
be reflected until the next session.

### Migration `0043_magenta_hulk.sql`

Creates `voice_sessions`, adds the two consent columns, extends the enum.

> ⚠️ It also carries `ALTER TABLE "notifications" ADD COLUMN "link" text` — **not part of
> this work.** It came from unrelated uncommitted schema.ts changes already in the tree when
> drizzle-kit generated the diff. Left in **on purpose**: deleting the statement would desync
> the file from `meta/0043_snapshot.json`, which already records the column, after which no
> future `db:generate` would ever emit it and the column would silently never be created in
> production. Noted in a comment at the top of the migration.

> ⚠️ Ordering verified: `0043.when` > `0042.when`. `db:migrate` silently no-ops on
> out-of-order timestamps.

---

## Remaining work

1. **Finish the typecheck.** Interrupted mid-run; last count was 20 `src/` errors against a
   baseline of **14 pre-existing**, with 3 of the 6 voice errors just fixed. Unverified.
2. **Backend voice tests** — 3-minute ceiling (incl. the concurrent-mint race), charge per
   mint, refund of money _and_ minute on mint failure, flag/consent gating, kill switch.
3. **Frontend Live client** (`frontend/lib/voice-live.ts`) — `getUserMedia` → AudioWorklet →
   **16kHz 16-bit PCM LE** up; **24kHz 16-bit PCM LE** down into an
   `AudioContext({ sampleRate: 24000 })` queue. Prefer the `@google/genai` JS live client
   (accepts an ephemeral token in place of an API key) over hand-rolled WebSocket framing.
4. **Voice UI** — mic control gated on `useFeature('paid.voiceChat')`, consent sheet reusing
   `BottomSheetModal`, a timer showing minutes elapsed and ₹ spent (that is _pricing_, which
   is shown; the pacing rule is not). All copy in **all 7 languages**.
5. **Mobile permissions** — `RECORD_AUDIO` in the Android manifest (absent today),
   `NSMicrophoneUsageDescription` in the iOS `Info.plist`.
6. **Final verification** — `pnpm typecheck && pnpm lint` in both repos, full suite against
   the recorded baseline.

### Recorded test baseline (before any of this work)

`1475–1476 passed`, **4 pre-existing failures**, none related:

- `test/billing-google-play.spec.ts` — 3 (`confirmGooglePlayPurchase`)
- `test/verify-chat-fix.spec.ts` — 1 (grounding block 25029 chars > 24000 assertion)
- `test/report-timing.spec.ts` — flaky, fails intermittently

`src/` typecheck baseline: **14 pre-existing errors** (`scripts/` has many more, all
pre-existing).

---

## Open questions before enabling for real users

1. **Are the 8 pooled Gemini keys in 8 separate Google Cloud projects, or one?** Free-tier
   limits are _per project_ — if they share one, the pool gives no extra Live headroom and
   voice will starve the text features.
2. Confirm in AI Studio that `gemini-3.1-flash-live-preview` is on this project's free tier,
   and what its RPM/TPM/concurrent-session numbers actually are. Google does not publish
   them; "free of charge" is a preview-period status that can change.
3. EEA/Switzerland/UK clients must use paid services for this model — irrelevant for an
   India-first user base, but it blocks any EU beta tester.
