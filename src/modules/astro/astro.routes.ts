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

const moonSignRoute = createRoute({
  method: 'get',
  path: '/forecast/moon-sign/{signIndex}',
  tags: ['Astro'],
  summary: 'Public moon-sign daily forecast',
  request: { params: SignIndexParamSchema },
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
  const result = await astroService.moonSignForecast(signIndex);
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

const panchangRoute = createRoute({
  method: 'get',
  path: '/panchang',
  tags: ['Astro'],
  summary: "Get today's panchang (public, optional auth for GPS-based location)",
  responses: {
    200: {
      description: 'Panchang data for today',
      content: {
        'application/json': {
          schema: z.object({
            date: z.string(),
            tithi: z.any(),
            nakshatra: z.any(),
            yoga: z.any(),
            karana: z.any(),
            sunrise: z.string().optional(),
            sunset: z.string().optional(),
          }),
        },
      },
    },
  },
});

astroRouter.openapi(panchangRoute, async (c) => {
  // TODO: integrate with lib/astro-engine/panchang when GPS-location middleware is ready
  return c.json(
    {
      date: new Date().toISOString().slice(0, 10),
      tithi: null,
      nakshatra: null,
      yoga: null,
      karana: null,
    },
    200,
  );
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
      for await (const token of astroService.chatStream(user.id, body.message, body.persona, signal)) {
        if (signal.aborted || stream.aborted) break;
        await stream.writeSSE({ event: 'token', data: JSON.stringify({ content: token }) });
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
