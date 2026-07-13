import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { requireUser } from '../../middleware/auth.js';
import { requireConsent } from '../../middleware/consent.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { logger } from '../../lib/logger.js';
import { Errors } from '../../lib/errors.js';
import { deductCredits } from '../users/users.repo.js';
import * as astroService from './astro.service.js';
import * as chatSessionsRepo from './chat-sessions.repo.js';

/** Flat cost per chat question, charged atomically before generation starts. */
const CHAT_MESSAGE_COST = 2;

/** Expensive LLM/swarm routes: cap per authenticated user. */
const llmRateLimit = rateLimiter({ windowMs: 60_000, max: 20 });
import {
  OnboardingRequestSchema,
  OnboardingResponseSchema,
  ForecastRequestSchema,
  ForecastResponseSchema,
  MatchmakingRequestSchema,
  MatchmakingResponseSchema,
  ChatRequestSchema,
  SignIndexParamSchema,
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
  request: { query: PanchangMonthQuerySchema },
  responses: {
    200: {
      description: 'Per-day panchang summaries',
      content: {
        'application/json': {
          schema: z.object({ year: z.number(), month: z.number(), days: z.array(z.any()) }),
        },
      },
    },
    422: errorResponse('Validation failed'),
  },
});

astroRouter.openapi(panchangMonthRoute, async (c) => {
  const { year, month, lat, lon } = c.req.valid('query');
  const days = await astroService.getPanchangMonth(year, month, lat, lon);
  return c.json({ year, month, days }, 200);
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
  middleware: [requireUser, llmRateLimit, requireConsent] as const,
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
  },
});

astroRouter.openapi(chatRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  // Aborts when the client disconnects — propagated to the LLM so generation
  // (and its NIM inflight slot) stops instead of running on detached.
  const signal = c.req.raw.signal;

  // Charge atomically before any generation starts — same balance-check-and-
  // debit-in-one-UPDATE primitive as unlockHouseForUser, so two concurrent
  // sends can't both succeed against a balance that only covers one. Not
  // refunded if generation later fails (same precedent as house unlocks:
  // the charge is for asking, not contingent on the LLM call succeeding).
  const charged = await deductCredits(user.id, CHAT_MESSAGE_COST);
  if (!charged) {
    throw Errors.conflict('Not enough credits to ask a question');
  }

  return streamSSE(c, async (stream) => {
    try {
      const events = astroService.chatStream(
        user.id,
        body.message,
        body.history,
        body.summary,
        body.detailLevel,
        signal,
        body.locale,
      );

      let fullContent = '';
      let currentSummary = body.summary;

      for await (const event of events) {
        if (signal.aborted || stream.aborted) break;
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
      if (!signal.aborted && !stream.aborted) {
        // Save history
        let sessionId = body.sessionId;
        const newHistory = [
          ...body.history,
          { role: 'user', content: body.message },
          { role: 'assistant', content: fullContent },
        ] as { role: 'user' | 'assistant'; content: string }[]; // cast to avoid exact typing mismatch if any

        if (sessionId) {
          await chatSessionsRepo.updateChatSession(sessionId, newHistory, currentSummary);
        } else {
          // generate a new session title based on the message
          const title =
            body.message.length > 50 ? body.message.substring(0, 47) + '...' : body.message;
          const session = await chatSessionsRepo.createChatSession(
            user.id,
            title,
            newHistory,
            currentSummary,
          );
          sessionId = session.id;
        }

        await stream.writeSSE({ event: 'session_id', data: JSON.stringify({ sessionId }) });
        await stream.writeSSE({ event: 'done', data: JSON.stringify({ status: 'complete' }) });
      }
    } catch (err) {
      // A failed stream MUST be distinguishable from a completed one — always
      // emit a terminal event (and never leak internals to the client).
      logger.error({ err, userId: user.id }, 'chat stream failed');
      if (!signal.aborted && !stream.aborted) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: 'Generation failed. Please try again.' }),
        });
      }
    }
  });
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
  const sessions = await chatSessionsRepo.getChatSessions(user.id);
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
  const session = await chatSessionsRepo.getChatSession(id, user.id);
  if (!session) {
    throw Errors.notFound('Session not found');
  }
  return c.json(session, 200);
});
