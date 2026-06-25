import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { requireUser } from '../../middleware/auth.js';
import { requireConsent } from '../../middleware/consent.js';
import * as astroService from './astro.service.js';
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
  middleware: [requireUser, requireConsent] as const,
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
  middleware: [requireUser, requireConsent] as const,
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
  middleware: [requireUser, requireConsent] as const,
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
  middleware: [requireUser, requireConsent] as const,
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
/* GET /remedies                                                         */
/* -------------------------------------------------------------------------- */

const RemedySchema = z.object({
  planet: z.string(),
  title: z.string(),
  icon: z.string(),
  remedy: z.string(),
});

const remediesRoute = createRoute({
  method: 'get',
  path: '/remedies',
  tags: ['Astro'],
  summary: 'Get personalised Vedic remedies (public, optional auth for chart-based results)',
  request: {
    query: z.object({
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().openapi({
        param: { name: 'birthDate', in: 'query' },
        example: '1990-05-15',
        description: 'Birth date (YYYY-MM-DD)',
      }),
      birthTime: z.string().optional().default('12:00').openapi({
        param: { name: 'birthTime', in: 'query' },
        example: '14:30',
        description: 'Birth time (HH:mm)',
      }),
      lat: z
        .string()
        .optional()
        .transform((v) => (v ? Number(v) : undefined))
        .openapi({
          param: { name: 'lat', in: 'query' },
          example: '28.6139',
          description: 'Birth latitude',
        }),
      lon: z
        .string()
        .optional()
        .transform((v) => (v ? Number(v) : undefined))
        .openapi({
          param: { name: 'lon', in: 'query' },
          example: '77.209',
          description: 'Birth longitude',
        }),
      timezone: z.string().optional().default('Asia/Kolkata').openapi({
        param: { name: 'timezone', in: 'query' },
        example: 'Asia/Kolkata',
        description: 'IANA timezone',
      }),
    }),
  },
  responses: {
    200: {
      description: 'List of remedies',
      content: {
        'application/json': {
          schema: z.object({ remedies: z.array(RemedySchema) }),
        },
      },
    },
  },
});

astroRouter.openapi(remediesRoute, async (c) => {
  const query = c.req.valid('query');

  // If birth data is provided, pass it for chart-based remedies
  const birthData =
    query.birthDate && query.lat != null && query.lon != null
      ? {
          date: query.birthDate,
          time: query.birthTime ?? '12:00',
          latitude: query.lat,
          longitude: query.lon,
          timezone: query.timezone ?? 'Asia/Kolkata',
        }
      : undefined;

  const remedies = await astroService.getRemedies(birthData);
  return c.json({ remedies }, 200);
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
  middleware: [requireUser, requireConsent] as const,
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

  return streamSSE(c, async (stream) => {
    for await (const token of astroService.chatStream(user.id, body.message)) {
      await stream.writeSSE({
        event: 'token',
        data: JSON.stringify({ content: token }),
      });
    }
    await stream.writeSSE({
      event: 'done',
      data: JSON.stringify({ status: 'complete' }),
    });
  });
});
