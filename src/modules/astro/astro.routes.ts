import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { requireUser } from '../../middleware/auth.js';
import { requireConsent } from '../../middleware/consent.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { logger } from '../../lib/logger.js';
import * as astroService from './astro.service.js';

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
  const { period } = c.req.valid('query');
  const result = await astroService.moonSignForecast(signIndex, period);
  return c.json({ forecast: result }, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /forecast/sun-sign/:signIndex                                     */
/* -------------------------------------------------------------------------- */

const sunSignRoute = createRoute({
  method: 'get',
  path: '/forecast/sun-sign/{signIndex}',
  tags: ['Astro'],
  summary: 'Public sun-sign daily forecast',
  request: { params: SignIndexParamSchema },
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
  const result = await astroService.sunSignForecast(signIndex);
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
    422: errorResponse('Validation failed'),
  },
});

astroRouter.openapi(chatRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  // Aborts when the client disconnects — propagated to the LLM so generation
  // (and its NIM inflight slot) stops instead of running on detached.
  const signal = c.req.raw.signal;

  return streamSSE(c, async (stream) => {
    try {
      const events = astroService.chatStream(
        user.id,
        body.message,
        body.history,
        body.summary,
        body.detailLevel,
        signal,
      );
      for await (const event of events) {
        if (signal.aborted || stream.aborted) break;
        if (event.type === 'token') {
          await stream.writeSSE({
            event: 'token',
            data: JSON.stringify({ content: event.content }),
          });
        } else {
          await stream.writeSSE({
            event: 'summary',
            data: JSON.stringify({ summary: event.summary }),
          });
        }
      }
      if (!signal.aborted && !stream.aborted) {
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
