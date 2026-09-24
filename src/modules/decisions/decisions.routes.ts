import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireAnyFeature, requireFeature } from '../../middleware/feature.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { DECISION_CATEGORIES, MUHURTA_CATEGORIES } from '../../lib/astro-tools/muhurta-rules.js';
import {
  getDecision,
  listDecisions,
  MAX_RANGE_DAYS,
  MIN_RANGE_DAYS,
  runDecision,
  runFindDate,
} from './decisions.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('DecisionsError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose — the shapes are documented on the service types. */
// z.any (not z.unknown) values: Hono types an `unknown` JSON value as `never`.
const Json = z.record(z.string(), z.any());

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const DaysSchema = z.number().int().min(MIN_RANGE_DAYS).max(MAX_RANGE_DAYS);

const PlaceSchema = z.object({
  name: z.string().max(200),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  tz: z.string().min(1).max(64),
});

export const decisionsRouter = new OpenAPIHono();

// Each result casts up to 90 daily charts; keep one user from hammering it.
const runLimit = rateLimiter({ windowMs: 60_000, max: 6, name: 'decision-run' });

const decisionRoute = createRoute({
  method: 'post',
  path: '/decisions',
  tags: ['Decisions'],
  summary:
    'Decision Astrology: favourable and caution windows for a choice (wallet; free with the Pass)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.decisions'), runLimit] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            category: z.enum(DECISION_CATEGORIES),
            question: z.string().max(300).optional(),
            from: DateSchema,
            days: DaysSchema,
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The stored result', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('INSUFFICIENT_CREDITS or CHART_NOT_READY'),
  },
});

decisionsRouter.openapi(decisionRoute, async (c) => {
  const result = await runDecision(c.get('user'), c.req.valid('json'));
  return c.json(result as unknown as Record<string, unknown>, 200);
});

const findDateRoute = createRoute({
  method: 'post',
  path: '/find-date',
  tags: ['Decisions'],
  summary:
    'Find My Date: the best days and times for a beginning at a place (wallet; free with the Pass)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('panchang.findMyDate'), runLimit] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            category: z.enum(MUHURTA_CATEGORIES),
            place: PlaceSchema,
            from: DateSchema,
            days: DaysSchema,
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The stored result', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('INSUFFICIENT_CREDITS'),
  },
});

decisionsRouter.openapi(findDateRoute, async (c) => {
  const result = await runFindDate(c.get('user'), c.req.valid('json'));
  return c.json(result as unknown as Record<string, unknown>, 200);
});

const listRoute = createRoute({
  method: 'get',
  path: '/decisions',
  tags: ['Decisions'],
  summary: "The user's saved Decision and Find My Date results, with today's prices",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(['nav.decisions', 'panchang.findMyDate'])] as const,
  request: {
    query: z.object({ kind: z.enum(['decision', 'muhurta']).optional() }),
  },
  responses: {
    200: { description: 'Saved results', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

decisionsRouter.openapi(listRoute, async (c) => {
  const { kind } = c.req.valid('query');
  const list = await listDecisions(c.get('user'), kind);
  return c.json(list as unknown as Record<string, unknown>, 200);
});

const getRoute = createRoute({
  method: 'get',
  path: '/decisions/{id}',
  tags: ['Decisions'],
  summary: 'One saved result (reopening is free)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(['nav.decisions', 'panchang.findMyDate'])] as const,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'The result', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('Not found'),
  },
});

decisionsRouter.openapi(getRoute, async (c) => {
  const result = await getDecision(c.get('user'), c.req.valid('param').id);
  return c.json(result as unknown as Record<string, unknown>, 200);
});
