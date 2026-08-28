import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { requireUser } from '../../middleware/auth.js';
import { requireConsent } from '../../middleware/consent.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { logger } from '../../lib/logger.js';
import { Errors } from '../../lib/errors.js';
import { deductWalletBalance, addWalletBalance } from '../users/users.repo.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { resolveFeaturesForUser } from '../features/features.service.js';
import * as astroService from './astro.service.js';
import * as chatSessionsRepo from './chat-sessions.repo.js';
import { findPredictionsDueForReview, ratePrediction } from './prediction-outcomes.repo.js';
import { MIN_EVENTS_FOR_RECTIFICATION } from '../../lib/astro-engine/calculations/rectification.js';
import {
  incrementFeedbackCounter,
  saveChatFeedbackReport,
  recordChatFeedbackVote,
} from './feedback.repo.js';
import { notifyChatDownvote } from '../../lib/notifications/telegram.js';
import { acquire as acquireLock, release as releaseLock } from '../../lib/cache/locks.js';
import {
  findRemedyInsight,
  isRemedyInsightStale,
  remedyInsightForLanguage,
  requestRemedyInsightGeneration,
} from './remedy-insight.service.js';
import { isFreeFollowUp } from '../../lib/chat-follow-up.js';

/** Fallback cost per chat question if the `paid.chat` feature has no resolved
 * price (registry/DB lookup failure) — matches FEATURE_REGISTRY's
 * defaultPricePaise for 'paid.chat' in config/features.ts. The actual charge
 * uses the resolved price (admin-overridable), same as reports.service.ts. */
const CHAT_MESSAGE_COST_FALLBACK_PAISE = 2000;

/** Expensive LLM/swarm routes: cap per authenticated user. */
const llmRateLimit = rateLimiter({ windowMs: 60_000, max: 20, name: 'astro-llm' });

// Panchang is unauthenticated (no requireUser on this router's panchang
// routes) and now backs a real, crawlable /panchang marketing page rather
// than just an ISR-cached homepage section — same abuse reasoning as
// public-moon-sign/public-kundli-chart. Cache hits make repeat requests for
// the same day/location cheap, hence the higher ceiling than those.
const panchangRateLimit = rateLimiter({ windowMs: 60_000, max: 30, name: 'panchang' });

/**
 * Backstop ceiling on how fast one account can ask questions, sitting *under*
 * `llmRateLimit`'s broader 20/min (which is shared across every astro LLM
 * route, so it can be consumed entirely by non-chat traffic and would not pace
 * chat on its own). Its own `name` is what keeps the two counters separate —
 * reusing 'astro-llm' here would silently merge them.
 *
 * `silent` because this ceiling exists to be reached by ordinary impatient
 * users, so it must neither page an admin nor announce itself in the response
 * (see the `silent` docs in middleware/rate-limit.ts). It is NOT the primary
 * pacing mechanism — the single-flight lock in the handler below is, and a
 * client behaving normally can never get near 10/min because its own composer
 * stays disabled until the reply finishes. This only catches a client that
 * ignores that, and it deliberately sits well above the ~4-6 questions/min a
 * real person can sustain when each answer must stream fully first.
 */
const chatQuestionLimit = rateLimiter({
  windowMs: 60_000,
  max: 10,
  name: 'chat-question',
  silent: true,
});

/**
 * Guards the "one question at a time" rule server-side. TTL sits just above
 * gemini-client.ts's STREAM_TIMEOUT_MS (120s) so the lock always outlives the
 * generation it guards, but still self-heals if a worker dies mid-stream
 * without reaching the release in the handler's `finally`.
 */
const CHAT_INFLIGHT_LOCK_TTL_SECONDS = 130;
import {
  OnboardingRequestSchema,
  OnboardingResponseSchema,
  ForecastRequestSchema,
  ForecastResponseSchema,
  MatchmakingRequestSchema,
  MatchmakingResponseSchema,
  ChatRequestSchema,
  ChatFeedbackRequestSchema,
  SignIndexParamSchema,
  RemediesResponseSchema,
} from './astro.schemas.js';

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('AstroError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

export const astroRouter = new OpenAPIHono();

/* -------------------------------------------------------------------------- */
/* POST /onboarding                                                      */
/* -------------------------------------------------------------------------- */

const onboardingRoute = createRoute({
  method: 'post',
  path: '/onboarding',
  tags: ['Astro'],
  summary: 'Run onboarding analysis for a new user',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, llmRateLimit, requireConsent] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: OnboardingRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Onboarding analysis result',
      content: { 'application/json': { schema: OnboardingResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Consent required'),
    422: errorResponse('Validation failed'),
  },
});

astroRouter.openapi(onboardingRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const result = await astroService.onboard(user.id, body);
  return c.json(result, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /forecast/daily                                                  */
/* -------------------------------------------------------------------------- */

const dailyForecastRoute = createRoute({
  method: 'post',
  path: '/forecast/daily',
  tags: ['Astro'],
  summary: 'Generate a daily forecast via the full swarm pipeline',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, llmRateLimit, requireConsent] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ForecastRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Daily forecast',
      content: { 'application/json': { schema: ForecastResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Consent required'),
    422: errorResponse('Validation failed'),
  },
});

astroRouter.openapi(dailyForecastRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const result = await astroService.dailyForecast(user.id, body);
  return c.json(result, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /forecast/daily/full                                             */
/* -------------------------------------------------------------------------- */

const dailyFullSynthesisRoute = createRoute({
  method: 'post',
  path: '/forecast/daily/full',
  tags: ['Astro'],
  summary: 'Generate a daily forecast via direct metrology + synthesis (no swarm)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, llmRateLimit, requireConsent] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ForecastRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Full daily synthesis',
      content: { 'application/json': { schema: ForecastResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Consent required'),
    422: errorResponse('Validation failed'),
  },
});

astroRouter.openapi(dailyFullSynthesisRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const result = await astroService.dailyFullSynthesis(user.id, body);
  return c.json(result, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /forecast/moon-sign/:signIndex                                    */
/* -------------------------------------------------------------------------- */

const PeriodQuerySchema = z.object({
  period: z
    .enum(['daily', 'weekly', 'monthly', 'yearly'])
    .optional()
    .default('daily')
    .openapi({
      param: { name: 'period', in: 'query' },
      example: 'daily',
      description:
        'Timescale — weekly/monthly/yearly are aggregates of the daily engine output, never independent narration',
    }),
  language: z
    .string()
    .optional()
    .openapi({
      param: { name: 'language', in: 'query' },
      example: 'hi',
      description: 'Language code for translation',
    }),
});

const moonSignRoute = createRoute({
  method: 'get',
  path: '/forecast/moon-sign/{signIndex}',
  tags: ['Astro'],
  summary: 'Public moon-sign forecast (daily/weekly/monthly/yearly)',
  request: { params: SignIndexParamSchema, query: PeriodQuerySchema },
  responses: {
    200: {
      description: 'Moon-sign forecast',
      content: { 'application/json': { schema: z.object({ forecast: z.any() }) } },
    },
    422: errorResponse('Invalid sign index (must be 0-11)'),
  },
});

astroRouter.openapi(moonSignRoute, async (c) => {
  const { signIndex } = c.req.valid('param');
  const { period, language } = c.req.valid('query');
  const result = await astroService.moonSignForecast(signIndex, period, language);
  return c.json({ forecast: result }, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /forecast/sun-sign/:signIndex                                     */
/* -------------------------------------------------------------------------- */

const SunSignQuerySchema = z.object({
  language: z
    .string()
    .optional()
    .openapi({
      param: { name: 'language', in: 'query' },
      example: 'hi',
      description: 'Language code for translation',
    }),
});

const sunSignRoute = createRoute({
  method: 'get',
  path: '/forecast/sun-sign/{signIndex}',
  tags: ['Astro'],
  summary: 'Public sun-sign daily forecast',
  request: { params: SignIndexParamSchema, query: SunSignQuerySchema },
  responses: {
    200: {
      description: 'Sun-sign forecast',
      content: { 'application/json': { schema: z.object({ forecast: z.any() }) } },
    },
    422: errorResponse('Invalid sign index (must be 0-11)'),
  },
});

astroRouter.openapi(sunSignRoute, async (c) => {
  const { signIndex } = c.req.valid('param');
  const { language } = c.req.valid('query');
  const result = await astroService.sunSignForecast(signIndex, language);
  return c.json({ forecast: result }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /matchmaking                                                     */
/* -------------------------------------------------------------------------- */

const matchmakingRoute = createRoute({
  method: 'post',
  path: '/matchmaking',
  tags: ['Astro'],
  summary: 'Compute Ashtakoota matchmaking compatibility between two birth charts',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, llmRateLimit, requireConsent] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: MatchmakingRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Matchmaking result',
      content: { 'application/json': { schema: MatchmakingResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Consent required'),
    422: errorResponse('Validation failed'),
  },
});

astroRouter.openapi(matchmakingRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const result = await astroService.matchmake(user.id, body);
  return c.json(result, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /panchang                                                         */
/* -------------------------------------------------------------------------- */

const PanchangQuerySchema = z.object({
  lat: z
    .string()
    .optional()
    .default('28.6139')
    .transform(Number)
    .pipe(z.number().min(-90).max(90))
    .openapi({
      param: { name: 'lat', in: 'query' },
      example: '28.6139',
      description: 'Latitude (defaults to New Delhi)',
    }),
  lon: z
    .string()
    .optional()
    .default('77.209')
    .transform(Number)
    .pipe(z.number().min(-180).max(180))
    .openapi({
      param: { name: 'lon', in: 'query' },
      example: '77.209',
      description: 'Longitude (defaults to New Delhi)',
    }),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .openapi({
      param: { name: 'date', in: 'query' },
      example: '2025-01-15',
      description: 'Date in YYYY-MM-DD format (defaults to today)',
    }),
});

const panchangRoute = createRoute({
  method: 'get',
  path: '/panchang',
  tags: ['Astro'],
  summary: 'Get panchang for a given date and location (public)',
  middleware: [panchangRateLimit] as const,
  request: { query: PanchangQuerySchema },
  responses: {
    200: {
      description: 'Panchang data',
      content: {
        'application/json': {
          schema: z.object({
            date: z.string(),
            tithi: z.any(),
            nakshatra: z.any(),
            yoga: z.any(),
            karana: z.any(),
            vara: z.string().optional(),
            rahuKaal: z.any().optional(),
            gulikaKaal: z.any().optional(),
            yamagandaKaal: z.any().optional(),
            abhijitMuhurta: z.any().optional(),
            sunriseTime: z.string().optional(),
            sunsetTime: z.string().optional(),
            regionalMonths: z.any().optional(),
            choghadiya: z.any().optional(),
            hora: z.any().optional(),
          }),
        },
      },
    },
    422: errorResponse('Validation failed'),
  },
});

astroRouter.openapi(panchangRoute, async (c) => {
  const { lat, lon, date } = c.req.valid('query');
  const result = await astroService.getPanchang(lat, lon, date);
  return c.json(result, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /panchang/month                                                   */
/* -------------------------------------------------------------------------- */

const PanchangMonthQuerySchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/)
    .transform(Number)
    .openapi({ param: { name: 'year', in: 'query' }, example: '2026' }),
  month: z
    .string()
    .regex(/^(1[0-2]|[1-9])$/)
    .transform(Number)
    .openapi({ param: { name: 'month', in: 'query' }, example: '7', description: '1-12' }),
  lat: z
    .string()
    .optional()
    .default('28.6139')
    .transform(Number)
    .pipe(z.number().min(-90).max(90))
    .openapi({ param: { name: 'lat', in: 'query' } }),
  lon: z
    .string()
    .optional()
    .default('77.209')
    .transform(Number)
    .pipe(z.number().min(-180).max(180))
    .openapi({ param: { name: 'lon', in: 'query' } }),
});

const panchangMonthRoute = createRoute({
  method: 'get',
  path: '/panchang/month',
  tags: ['Astro'],
  summary: 'Get lightweight per-day panchang summaries for a calendar month (public)',
  middleware: [panchangRateLimit] as const,
  request: { query: PanchangMonthQuerySchema },
  responses: {
    200: {
      description: 'Per-day panchang summaries',
      content: {
        'application/json': {
          schema: z.object({
            year: z.number(),
            month: z.number(),
            days: z.array(z.any()),
            regionalMonths: z.any().optional(),
          }),
        },
      },
    },
    422: errorResponse('Validation failed'),
  },
});

astroRouter.openapi(panchangMonthRoute, async (c) => {
  const { year, month, lat, lon } = c.req.valid('query');
  const { days, regionalMonths } = await astroService.getPanchangMonth(year, month, lat, lon);
  return c.json({ year, month, days, regionalMonths }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /chat  (SSE streaming)                                           */
/* -------------------------------------------------------------------------- */

const chatRoute = createRoute({
  method: 'post',
  path: '/chat',
  tags: ['Astro'],
  summary: 'Chat with the Jyotish scholar (SSE streaming)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, llmRateLimit, chatQuestionLimit, requireConsent] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ChatRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'SSE stream of tokens',
      content: { 'text/event-stream': { schema: z.any() } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Consent required'),
    409: errorResponse('Not enough credits'),
    422: errorResponse('Validation failed'),
    429: errorResponse('Asking faster than answers can be produced'),
  },
});

astroRouter.openapi(chatRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  // Resolves which profile (primary or an additional saved one) is currently
  // active for this account — chat sessions and grounding are scoped to it.
  const profile = await resolveActiveProfileContext(user);

  // The server — not the client — is the source of truth for the durable
  // transcript. `body.history`/`body.summary` are accepted for backward
  // compatibility with old app builds but are otherwise IGNORED: they used
  // to be re-persisted verbatim, which meant the client's own compaction
  // bookkeeping (a buffer it resets to just the latest turn once the
  // backend signals compaction — see chat-compaction.ts and
  // ChatConversation.tsx) silently became the permanent record, deleting
  // every older turn from chat_sessions.history. Loading the STORED history
  // here and basing both the model prompt and the persisted write on it
  // keeps compaction purely a model-context concern.
  let storedHistory: { role: 'user' | 'assistant'; content: string }[] = [];
  let storedSummary: string | undefined;
  // The stored session's own last-touched time — passed through so the model
  // can be told the replayed history above is from a previous session, not
  // from just now (see historyStalenessNote in scholar.ts). A dormant user
  // resuming an old session otherwise has their own stale-but-confident past
  // reply (e.g. an old "today is..." statement) mistaken for current fact.
  let storedLastActivityAt: Date | undefined;
  if (body.sessionId) {
    const existing = await chatSessionsRepo.getChatSession(
      body.sessionId,
      user.id,
      profile.birthProfileId,
    );
    if (!existing) {
      throw Errors.notFound('Chat session not found');
    }
    storedHistory = existing.history;
    storedSummary = existing.summary ?? undefined;
    storedLastActivityAt = existing.updatedAt;
  }

  // One question at a time, per account, enforced across the pm2 cluster.
  //
  // The app already blocks this in the UI (ChatConversation.tsx disables the
  // composer until the reply finishes streaming), but that is presentation, not
  // enforcement: a second tab, a replayed request or a script bypasses it
  // entirely and fires concurrent generations against the shared Gemini free
  // tier. Taken BEFORE the wallet debit so a rejected duplicate never charges.
  //
  // Deliberately fails OPEN when Redis is unreachable ('unavailable'), and only
  // rejects on a genuinely held lock ('held') — see the AcquireResult docs in
  // lib/cache/locks.ts. Degrading to "no pacing" during a Redis outage is
  // correct here; degrading to "nobody can ask anything" is the failure this
  // codebase already shipped once (8c6e412).
  const lock = await acquireLock('chat:inflight', user.id, CHAT_INFLIGHT_LOCK_TTL_SECONDS);
  if (!lock.ok && lock.reason === 'held') {
    // 429 rather than 409 so this stays distinguishable from "not enough
    // credits", which is the other conflict this handler can raise and which
    // the app DOES surface to the user. Both would otherwise arrive as an
    // identical `code: 'CONFLICT'` body (see middleware/error.ts) and the
    // client would have to guess which it was — silently swallowing a genuine
    // out-of-credits response in the process. Message is left bare for the same
    // reason the `silent` limiter's is: the pacing rule is never announced.
    throw Errors.tooManyRequests();
  }
  const lockOwner = lock.ok ? lock.owner : null;

  const releaseInflightLock = async (): Promise<void> => {
    if (!lockOwner) return;
    await releaseLock('chat:inflight', user.id, lockOwner).catch(() => {});
  };

  // Resolved once and reused for both the charge and any refund below, so a
  // mid-flight admin price change can never make the refund mismatch what was
  // actually charged. Same resolution the frontend's cost estimate reads
  // (ChatConversation.tsx's useFeature("paid.chat")), so the two can't drift.
  const features = await resolveFeaturesForUser(user.id);
  const chatMessageCostPaise =
    features['paid.chat']?.pricePaise ?? CHAT_MESSAGE_COST_FALLBACK_PAISE;

  // The model's own suggested "Ask next:" follow-up is free, ONE tap, verified
  // against the SERVER'S stored transcript — never a client-supplied flag,
  // which would be trivially spoofable into free chat. See chat-follow-up.ts
  // for why this exists: the chip was built to keep a conversation going and
  // then charged full price for using it, which defeated its own purpose.
  const isFollowUpTap = isFreeFollowUp(body.message, storedHistory);
  const amountToChargePaise = isFollowUpTap ? 0 : chatMessageCostPaise;

  // Charge atomically before any generation starts — same balance-check-and-
  // debit-in-one-UPDATE primitive as unlockHouseForUser, so two concurrent
  // sends can't both succeed against a balance that only covers one.
  // Refunded below (same fire-and-forget addCredits pattern as
  // vastu.service.ts) if generation throws or comes back with no content —
  // the user shouldn't pay for a question that got no answer. Skipped
  // entirely for a free follow-up: there's nothing to charge or refund, and a
  // zero-delta 'refund:chat_message' row would misleadingly suggest one.
  let charged: boolean;
  if (amountToChargePaise === 0) {
    charged = true;
  } else {
    try {
      charged = await deductWalletBalance(user.id, amountToChargePaise, 'chat_message');
    } catch (err) {
      // The lock is held at this point and streamSSE's `finally` (the only other
      // release path) is never reached if we throw here, so it must be released
      // explicitly or this user is locked out of chat until the TTL expires.
      await releaseInflightLock();
      throw err;
    }
  }
  if (!charged) {
    await releaseInflightLock();
    throw Errors.conflict('Not enough credits to ask a question');
  }

  // Appended onto the STORED full transcript (not body.history), so a
  // compacted model-context window never leaks into what's persisted. See
  // the comment above where storedHistory is loaded.
  const userTurn = { role: 'user' as const, content: body.message };
  const historyWithQuestion = [...storedHistory, userTurn];

  // Written BEFORE generation starts, so the question survives no matter how
  // the turn ends — a disconnect, a server crash mid-reply, a Gemini failure.
  // Previously the question and the reply were written together in a single
  // post-generation update, which a disconnect skipped entirely (see the
  // comment on `undefined` in the chatStream call below) — the paid wallet
  // debit above would stand for a turn that left no trace at all.
  let sessionId = body.sessionId;
  try {
    if (sessionId) {
      await chatSessionsRepo.updateChatSession(
        sessionId,
        user.id,
        profile.birthProfileId,
        historyWithQuestion,
        storedSummary,
      );
    } else {
      const title = body.message.length > 50 ? body.message.substring(0, 47) + '...' : body.message;
      const session = await chatSessionsRepo.createChatSession(
        user.id,
        profile.birthProfileId,
        title,
        historyWithQuestion,
        storedSummary,
      );
      sessionId = session?.id ?? sessionId;
    }
  } catch (err) {
    await releaseInflightLock();
    if (amountToChargePaise > 0) {
      await addWalletBalance(user.id, amountToChargePaise, 'refund:chat_message').catch(() => {});
    }
    throw err;
  }

  return streamSSE(c, async (stream) => {
    /** Guards against crediting the same charge on both the empty-content and the catch
     * path. Declared out here, not inside the `try`, so the `catch` can actually see it. */
    let refunded = false;

    try {
      const events = astroService.chatStream(
        user.id,
        body.message,
        storedHistory,
        storedSummary,
        // body.detailLevel is intentionally NOT forwarded — Details mode was
        // removed (the UI toggle that drove it was deleted long before this;
        // the backend kept generating an unreachable long-form reply nobody
        // could ask for). `detailLevel` stays in ChatRequestSchema, accepted
        // and ignored, only so an old cached app build that still posts it
        // doesn't get a 400 — see astro.schemas.ts.
        //
        // Deliberately NOT c.req.raw.signal. Generation used to abort the
        // instant the client disconnected (dropped mobile connection,
        // backgrounded tab), discarding both the question and whatever the
        // model had produced so far, while the wallet debit above stood —
        // "I paid but the answer disappeared". Generation is now decoupled
        // from the client connection and bounded only by gemini-client's own
        // internal deadline (MAX_TOTAL_ELAPSED_MS); the reply gets persisted
        // below regardless of whether anyone is still listening, and shows up
        // next time the user reopens the session.
        undefined,
        body.locale,
        body.compareProfileId,
        body.matchReportId,
        // Already resolved above (also used for chat-session scoping) —
        // threaded through instead of letting chatStream re-resolve it.
        profile,
        storedLastActivityAt,
      );

      let fullContent = '';
      let currentSummary = storedSummary;

      // No disconnect check here — `stream.writeSSE` swallows write errors on
      // a dead connection on its own (Hono's StreamingApi.write), so this
      // just runs the generator to completion either way.
      for await (const event of events) {
        if (event.type === 'token') {
          fullContent += event.content;
          await stream.writeSSE({
            event: 'token',
            data: JSON.stringify({ content: event.content }),
          });
        } else {
          currentSummary = event.summary;
          await stream.writeSSE({
            event: 'summary',
            data: JSON.stringify({ summary: event.summary }),
          });
        }
      }

      if (!fullContent.trim() && amountToChargePaise > 0) {
        // Generation "succeeded" with nothing to show (e.g. hit the
        // token ceiling before any content could be flushed) — don't
        // charge for a question that got no answer.
        refunded = true;
        await addWalletBalance(user.id, amountToChargePaise, 'refund:chat_message').catch(() => {});
      }

      // Persisted unconditionally now — no longer gated on the client still
      // being connected. `sessionId` is always set at this point: either
      // passed in, or created by the pre-generation write above.
      if (sessionId) {
        await chatSessionsRepo.updateChatSession(
          sessionId,
          user.id,
          profile.birthProfileId,
          [...historyWithQuestion, { role: 'assistant', content: fullContent }],
          currentSummary,
        );
      }

      await stream.writeSSE({ event: 'session_id', data: JSON.stringify({ sessionId }) });
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ status: 'complete' }) });
    } catch (err) {
      // A failed stream MUST be distinguishable from a completed one — always
      // emit a terminal event (and never leak internals to the client). The
      // question itself is already persisted (written before generation
      // started, above), so a thrown error here only ever loses the reply,
      // never the question.
      logger.error({ err, userId: user.id }, 'chat stream failed');
      // Don't charge for a question the LLM never actually answered. Guarded by
      // `refunded` because the empty-content branch above can fire and THEN the
      // persist below can throw, which would otherwise credit the same charge
      // twice for one question (pre-existing, but reachable more often now that
      // the persist runs unconditionally rather than only for connected clients).
      if (amountToChargePaise > 0 && !refunded) {
        refunded = true;
        await addWalletBalance(user.id, amountToChargePaise, 'refund:chat_message').catch(() => {});
      }
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message: 'Generation failed. Please try again.' }),
      });
    } finally {
      // Runs on every exit path — completion, generation failure, and client
      // disconnect — so the next question is never blocked by a stream that
      // has already stopped.
      await releaseInflightLock();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* POST /chat/feedback  (thumbs up/down on a reply)                           */
/* -------------------------------------------------------------------------- */

const chatFeedbackRoute = createRoute({
  method: 'post',
  path: '/chat/feedback',
  tags: ['Astro'],
  summary: 'Thumbs up/down on an AI chat reply',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ChatFeedbackRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Feedback recorded',
      content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Chat session not found'),
    422: errorResponse('Validation failed'),
  },
});

astroRouter.openapi(chatFeedbackRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  // `sessionId` used to be inserted as-is with no ownership check at all — a
  // client could attach a vote/report to ANY session id, including one
  // belonging to a different user, poisoning that session's feedback record.
  // Same ownership resolution and 404-on-mismatch convention as POST /chat's
  // own sessionId handling (chatRoute, above).
  if (body.sessionId) {
    const profile = await resolveActiveProfileContext(user);
    const session = await chatSessionsRepo.getChatSession(
      body.sessionId,
      user.id,
      profile.birthProfileId,
    );
    if (!session) throw Errors.notFound('Chat session not found');
  }

  await incrementFeedbackCounter(body.vote === 'up' ? 'chat_thumbs_up' : 'chat_thumbs_down');
  await recordChatFeedbackVote({ userId: user.id, vote: body.vote, sessionId: body.sessionId });

  if (body.vote === 'down' && body.question && body.answer) {
    await saveChatFeedbackReport({
      userId: user.id,
      sessionId: body.sessionId,
      question: body.question,
      answer: body.answer,
      locale: body.locale,
    });
    // Fire-and-forget — a Telegram outage must never fail the feedback request.
    void notifyChatDownvote({
      userId: user.id,
      locale: body.locale,
      question: body.question,
      answer: body.answer,
    }).catch(() => {});
  }

  return c.json({ ok: true }, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /chat/sessions                                                         */
/* -------------------------------------------------------------------------- */

const chatSessionsRoute = createRoute({
  method: 'get',
  path: '/chat/sessions',
  tags: ['Astro'],
  summary: 'List all past chat sessions',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'List of chat sessions',
      content: { 'application/json': { schema: z.any() } },
    },
    401: errorResponse('Unauthorized'),
  },
});

astroRouter.openapi(chatSessionsRoute, async (c) => {
  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const sessions = await chatSessionsRepo.getChatSessions(user.id, profile.birthProfileId);
  return c.json(sessions, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /chat/sessions/:id                                                     */
/* -------------------------------------------------------------------------- */

const chatSessionByIdRoute = createRoute({
  method: 'get',
  path: '/chat/sessions/{id}',
  tags: ['Astro'],
  summary: 'Get a specific chat session with its full history',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      description: 'Chat session details',
      content: { 'application/json': { schema: z.any() } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Session not found'),
  },
});

astroRouter.openapi(chatSessionByIdRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const profile = await resolveActiveProfileContext(user);
  const session = await chatSessionsRepo.getChatSession(id, user.id, profile.birthProfileId);
  if (!session) {
    throw Errors.notFound('Session not found');
  }
  return c.json(session, 200);
});

/* -------------------------------------------------------------------------- */
/* DELETE /chat/sessions/:id                                                  */
/* -------------------------------------------------------------------------- */

const deleteChatSessionRoute = createRoute({
  method: 'delete',
  path: '/chat/sessions/{id}',
  tags: ['Astro'],
  summary: 'Delete a chat session',
  description:
    'Soft delete: hides the session immediately. The row (and any facts already saved to ' +
    'user_facts) is kept for 7 days before a cron job hard-deletes it.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      description: 'Session deleted',
      content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Session not found'),
  },
});

astroRouter.openapi(deleteChatSessionRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const profile = await resolveActiveProfileContext(user);
  const deleted = await chatSessionsRepo.softDeleteChatSession(id, user.id, profile.birthProfileId);
  if (!deleted) {
    throw Errors.notFound('Session not found');
  }
  return c.json({ ok: true as const }, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /remedies                                                              */
/* -------------------------------------------------------------------------- */

const remediesRoute = createRoute({
  method: 'get',
  path: '/remedies',
  tags: ['Astro'],
  summary: 'Get the full Lal Kitab remedy reading for the active profile — free',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    query: z.object({
      language: z.string().optional().openapi({ example: 'hi' }),
    }),
  },
  responses: {
    200: {
      description: 'Remedies list',
      content: { 'application/json': { schema: RemediesResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

astroRouter.openapi(remediesRoute, async (c) => {
  const user = c.get('user');
  const { language } = c.req.valid('query');
  const profile = await resolveActiveProfileContext(user);

  const birthData =
    profile.dateOfBirth &&
    profile.timeOfBirth &&
    profile.placeOfBirth?.lat != null &&
    profile.placeOfBirth?.lon != null &&
    profile.placeOfBirth?.tz
      ? {
          date: profile.dateOfBirth,
          time: profile.timeOfBirth,
          latitude: profile.placeOfBirth.lat,
          longitude: profile.placeOfBirth.lon,
          timezone: profile.placeOfBirth.tz,
        }
      : undefined;

  const { remedies, debts, annual } = await astroService.getRemedies(birthData);

  // The deterministic half is complete at this point and is ALWAYS returned.
  // The plain-language half is cached per profile and generated on first view,
  // so a first-time reader gets a fully usable page immediately and the prose
  // fills in on a later poll rather than blocking this response on an LLM call.
  const planetsWithChart = remedies.filter((r) => r.natalHouse !== undefined);
  let simple = null;
  let simpleStatus: 'ready' | 'generating' | 'unavailable' = 'unavailable';

  if (planetsWithChart.length > 0) {
    const existing = await findRemedyInsight(user.id, profile.birthProfileId);
    const lang = language || user.contentLanguage || 'en';

    if (existing?.status === 'ready') {
      simple = await remedyInsightForLanguage(existing, lang);
      simpleStatus = simple ? 'ready' : 'unavailable';
    } else if (!existing || existing.status === 'failed' || isRemedyInsightStale(existing)) {
      simpleStatus = 'generating';
      const facts = {
        planets: planetsWithChart.map((r) => ({
          planet: r.planet,
          natalHouse: r.natalHouse as number,
          remedies: r.remedies ?? [],
          ...(r.isInPakkaGhar !== undefined && { isInPakkaGhar: r.isInPakkaGhar }),
          ...(r.displacement !== undefined && { displacement: r.displacement }),
          ...(r.blindness !== undefined && { blindness: r.blindness }),
        })),
        debts: debts.map((d) => ({ type: d.type, indicators: d.indicators })),
      };
      // Fire-and-forget: never make the reader wait on it, and never let a
      // generation failure take down a page that renders fine without it.
      void requestRemedyInsightGeneration(user.id, profile.birthProfileId, facts).catch(
        (err: unknown) => {
          logger.error({ err, userId: user.id }, 'remedy insight generation could not start');
        },
      );
    } else {
      simpleStatus = 'generating';
    }
  }

  return c.json({ remedies, debts, annual, simple, simpleStatus }, 200);
});

/* -------------------------------------------------------------------------- */
/* Prediction accuracy — the loop that makes predictions falsifiable          */
/*                                                                            */
/* `prediction_outcomes` records every dated claim, but a table nobody writes  */
/* a verdict into measures nothing. These two endpoints are that verdict path: */
/* GET returns the claims whose window has already closed (so the user can     */
/* actually know whether it happened), POST records what they say.            */
/* -------------------------------------------------------------------------- */

const PredictionDueSchema = z
  .object({
    id: z.string().uuid(),
    surface: z.string(),
    domain: z.string().nullable(),
    claim: z.string(),
    windowStart: z.string().nullable(),
    windowEnd: z.string().nullable(),
    confidence: z.string().nullable(),
  })
  .openapi('PredictionDue');

const predictionsDueRoute = createRoute({
  method: 'get',
  path: '/predictions/due',
  tags: ['Astro'],
  summary: 'Predictions whose window has closed and which the user has not yet rated',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Closed, unrated predictions, oldest first',
      content: {
        'application/json': { schema: z.object({ predictions: z.array(PredictionDueSchema) }) },
      },
    },
  },
});

astroRouter.openapi(predictionsDueRoute, async (c) => {
  const user = c.get('user');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const rows = await findPredictionsDueForReview(user.id, today);
  return c.json(
    {
      predictions: rows.map((r) => ({
        id: r.id,
        surface: r.surface,
        domain: r.domain,
        claim: r.claim,
        windowStart: r.windowStart,
        windowEnd: r.windowEnd,
        confidence: r.confidence,
      })),
    },
    200,
  );
});

const ratePredictionRoute = createRoute({
  method: 'post',
  path: '/predictions/{id}/rate',
  tags: ['Astro'],
  summary: 'Record whether a prediction turned out to be right',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            // -1 wrong, 0 unclear, 1 right.
            rating: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
            happened: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Rating recorded',
      content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
    },
    404: errorResponse('No such prediction for this user'),
  },
});

astroRouter.openapi(ratePredictionRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const { rating, happened } = c.req.valid('json');
  // Owner-scoped inside the repo, so one user can never rate another's claim.
  const ok = await ratePrediction(id, user.id, rating, happened ?? null);
  if (!ok) {
    return c.json({ error: { code: 'not_found', message: 'Prediction not found' } }, 404);
  }
  return c.json({ ok: true }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /rectify — birth-time rectification from dated life events            */
/*                                                                            */
/* Highest-leverage accuracy fix available: the Ascendant, every house, every  */
/* varga and every dasha date hang off the exact minute. Deliberately          */
/* COMPUTE-ONLY — it returns a suggestion and never rewrites the stored birth  */
/* time, because doing that silently would invalidate the user's whole kundli  */
/* and every report built on it. Applying is the user's decision.              */
/* -------------------------------------------------------------------------- */

const rectifyRoute = createRoute({
  method: 'post',
  path: '/rectify',
  tags: ['Astro'],
  summary: 'Suggest a corrected birth time from dated life events',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireConsent] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            events: z
              .array(
                z.object({
                  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                  domain: z.enum([
                    'job_started',
                    'promotion',
                    'job_loss',
                    'business_started',
                    'retirement',
                    'engagement',
                    'marriage',
                    'divorce',
                    'childbirth',
                    'bereavement',
                    'property_bought',
                    'vehicle_bought',
                    'big_financial_gain',
                    'relocation',
                    'health_crisis',
                    'accident_injury',
                    'legal_case',
                    'foreign_travel',
                    'education_milestone',
                  ]),
                }),
              )
              .min(MIN_EVENTS_FOR_RECTIFICATION),
            windowMinutes: z.number().int().min(5).max(180).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'A suggested time, or null when the evidence cannot support one',
      content: {
        'application/json': {
          schema: z.object({
            suggestion: z
              .object({
                time: z.string(),
                offsetMinutes: z.number(),
                ascendantSign: z.string(),
                matched: z.number(),
                confidence: z.enum(['low', 'medium', 'high']),
                reasoning: z.string(),
              })
              .nullable(),
          }),
        },
      },
    },
    400: errorResponse('Birth details are incomplete'),
  },
});

astroRouter.openapi(rectifyRoute, async (c) => {
  const user = c.get('user');
  const { events, windowMinutes } = c.req.valid('json');

  const result = await astroService.rectifyForUser(user.id, events, windowMinutes);
  if (result === 'missing_birth_data') {
    return c.json(
      {
        error: {
          code: 'bad_request',
          message: 'A full date, time and place of birth are needed before rectification.',
        },
      },
      400,
    );
  }

  return c.json(
    {
      suggestion: result
        ? {
            time: result.best.time,
            offsetMinutes: result.best.offsetMinutes,
            ascendantSign: result.best.ascendantSign,
            matched: result.best.matched,
            confidence: result.confidence,
            reasoning: result.reasoning,
          }
        : null,
    },
    200,
  );
});
