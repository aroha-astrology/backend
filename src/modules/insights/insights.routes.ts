import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireAnyFeature, requireFeature } from '../../middleware/feature.js';
import { requireConsent } from '../../middleware/consent.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { LIFE_AREAS } from '../../lib/intelligence/areas.js';
import {
  LIFE_EVENT_DOMAINS,
  MIN_EVENTS_FOR_RECTIFICATION,
} from '../../lib/astro-engine/calculations/rectification.js';
import {
  applyBirthTimeCheck,
  getBirthTimeStatus,
  getWhy,
  istNoon,
  runBirthTimeCheck,
} from './insights.service.js';
import { getAstroWeather } from './weather.service.js';
import { getCalendar, MAX_CALENDAR_DAYS } from './calendar.service.js';
import { getTimeline, unlockFullTimeline } from './timeline.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('InsightsError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose — the shapes are documented on the service types. */
// z.any (not z.unknown) values: Hono types an `unknown` JSON value as `never`.
const Json = z.record(z.string(), z.any());

export const insightsRouter = new OpenAPIHono();

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* -------------------------------------------------------------------------- */
/* GET /why — "Why Aroha is saying this"                                       */
/* -------------------------------------------------------------------------- */

const whyRoute = createRoute({
  method: 'get',
  path: '/why',
  tags: ['Insights'],
  summary: 'The chart evidence behind a reading for one life area (rule-based, no AI)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('home.whyAroha')] as const,
  request: {
    query: z.object({
      area: z.enum(LIFE_AREAS).default('overall'),
      date: DateSchema.optional(),
    }),
  },
  responses: {
    200: { description: 'Ranked factors', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('CHART_NOT_READY — the kundli is still being computed'),
  },
});

insightsRouter.openapi(whyRoute, async (c) => {
  const { area, date } = c.req.valid('query');
  const why = await getWhy(c.get('user'), area, date ? istNoon(date) : new Date());
  return c.json(why as unknown as Record<string, unknown>, 200);
});

/* -------------------------------------------------------------------------- */
/* Birth Time Confidence                                                       */
/* -------------------------------------------------------------------------- */

const statusRoute = createRoute({
  method: 'get',
  path: '/birth-time',
  tags: ['Insights'],
  summary: "The active profile's birth time, how much Aroha trusts it, and the latest check",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('home.birthTimeConfidence')] as const,
  responses: {
    200: { description: 'Birth time status', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

insightsRouter.openapi(statusRoute, async (c) => {
  const status = await getBirthTimeStatus(c.get('user'));
  return c.json(status as unknown as Record<string, unknown>, 200);
});

// A check casts up to ~90 charts; keep a single user from hammering it.
const checkRateLimit = rateLimiter({ windowMs: 60_000, max: 5, name: 'birth-time-check' });

const checkRoute = createRoute({
  method: 'post',
  path: '/birth-time/check',
  tags: ['Insights'],
  summary:
    'Run a paid birth-time check from dated life events (charged only when it finds an answer)',
  security: [{ bearerAuth: [] }],
  middleware: [
    requireUser,
    requireFeature('home.birthTimeConfidence'),
    requireConsent,
    checkRateLimit,
  ] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            events: z
              .array(z.object({ date: DateSchema, domain: z.enum(LIFE_EVENT_DOMAINS) }))
              .min(MIN_EVENTS_FOR_RECTIFICATION)
              .max(20),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The check result', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled / consent required'),
    409: errorResponse('INSUFFICIENT_CREDITS'),
    422: errorResponse('MISSING_BIRTH_DATA or NOT_ENOUGH_EVIDENCE (nothing is charged)'),
  },
});

insightsRouter.openapi(checkRoute, async (c) => {
  const { events } = c.req.valid('json');
  const result = await runBirthTimeCheck(c.get('user'), events);
  return c.json(result as unknown as Record<string, unknown>, 200);
});

const applyRoute = createRoute({
  method: 'post',
  path: '/birth-time/check/{id}/apply',
  tags: ['Insights'],
  summary: "Move the profile's stored birth time to a check's suggestion (rebuilds the kundli)",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('home.birthTimeConfidence'), requireConsent] as const,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'The applied check', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled / consent required'),
    404: errorResponse('Not found'),
    409: errorResponse('ALREADY_APPLIED or NOT_CONFIDENT_ENOUGH'),
  },
});

insightsRouter.openapi(applyRoute, async (c) => {
  const { id } = c.req.valid('param');
  const result = await applyBirthTimeCheck(c.get('user'), id);
  return c.json(result as unknown as Record<string, unknown>, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /astro-weather — the daily view (Astro Weather + Your Day)              */
/* -------------------------------------------------------------------------- */

/** Today in IST, as YYYY-MM-DD. */
function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

const weatherRoute = createRoute({
  method: 'get',
  path: '/astro-weather',
  tags: ['Insights'],
  summary:
    "The day's astro weather: overall trend, area scores, Moon changes and the day's windows",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(['home.astroWeather', 'home.yourDay'])] as const,
  request: { query: z.object({ date: DateSchema.optional() }) },
  responses: {
    200: { description: 'Astro weather', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('CHART_NOT_READY'),
  },
});

insightsRouter.openapi(weatherRoute, async (c) => {
  const { date } = c.req.valid('query');
  const weather = await getAstroWeather(c.get('user'), date ?? istToday());
  return c.json(weather as unknown as Record<string, unknown>, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /calendar — the Aroha Calendar                                          */
/* -------------------------------------------------------------------------- */

const calendarRoute = createRoute({
  method: 'get',
  path: '/calendar',
  tags: ['Insights'],
  summary:
    'Personal calendar: transits in your houses, dasha changes, area windows, Saturn phases, eclipses, festivals',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(['nav.calendar', 'home.nextWindow'])] as const,
  request: {
    query: z.object({
      from: DateSchema.optional(),
      days: z.coerce.number().int().min(1).max(MAX_CALENDAR_DAYS).default(90),
    }),
  },
  responses: {
    200: { description: 'Calendar events', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('CHART_NOT_READY'),
  },
});

insightsRouter.openapi(calendarRoute, async (c) => {
  const { from, days } = c.req.valid('query');
  const calendar = await getCalendar(c.get('user'), from ?? istToday(), days);
  return c.json(calendar as unknown as Record<string, unknown>, 200);
});

/* -------------------------------------------------------------------------- */
/* Life Timeline                                                               */
/* -------------------------------------------------------------------------- */

const timelineRoute = createRoute({
  method: 'get',
  path: '/timeline',
  tags: ['Insights'],
  summary:
    'Life Timeline: dasha-scored bands per life area (±3 years free, whole life when unlocked)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.lifeTimeline')] as const,
  responses: {
    200: { description: 'Timeline', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('CHART_NOT_READY'),
  },
});

insightsRouter.openapi(timelineRoute, async (c) => {
  const timeline = await getTimeline(c.get('user'));
  return c.json(timeline as unknown as Record<string, unknown>, 200);
});

const timelineUnlockRoute = createRoute({
  method: 'post',
  path: '/timeline/unlock',
  tags: ['Insights'],
  summary: 'Unlock the whole-life timeline for the active profile (wallet; free with the Pass)',
  security: [{ bearerAuth: [] }],
  middleware: [
    requireUser,
    requireFeature('nav.lifeTimeline'),
    requireFeature('paid.lifeTimelineFull'),
  ] as const,
  responses: {
    200: { description: 'Unlock state', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('INSUFFICIENT_CREDITS or CHART_NOT_READY'),
  },
});

insightsRouter.openapi(timelineUnlockRoute, async (c) => {
  const state = await unlockFullTimeline(c.get('user'));
  return c.json(state as unknown as Record<string, unknown>, 200);
});
