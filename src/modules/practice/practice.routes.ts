import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireAnyFeature } from '../../middleware/feature.js';
import { PRACTICE_ITEM_IDS, completePractice, getPracticeToday } from './practice.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('PracticeError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose — the shapes are documented on the service types. */
// z.any (not z.unknown) values: Hono types an `unknown` JSON value as `never`.
const Json = z.record(z.string(), z.any());

export const practiceRouter = new OpenAPIHono();

// The Home card and the page both read and tick off today's items.
const cardOrPage = requireAnyFeature(['nav.dailyPractice', 'home.dailyPractice']);

const todayRoute = createRoute({
  method: 'get',
  path: '/practice/today',
  tags: ['Practice'],
  summary: "Today's practice: 3-4 small items with their reasons, what's done, and the streak",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, cardOrPage] as const,
  responses: {
    200: { description: "Today's practice", content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

practiceRouter.openapi(todayRoute, async (c) => {
  const today = await getPracticeToday(c.get('user'));
  return c.json(today as unknown as Record<string, unknown>, 200);
});

const completeRoute = createRoute({
  method: 'post',
  path: '/practice/complete',
  tags: ['Practice'],
  summary: "Mark one of today's items done (idempotent)",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, cardOrPage] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ itemId: z.enum(PRACTICE_ITEM_IDS) }) } },
    },
  },
  responses: {
    200: { description: "Today's practice", content: { 'application/json': { schema: Json } } },
    400: errorResponse('PRACTICE_ITEM_NOT_OFFERED'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

practiceRouter.openapi(completeRoute, async (c) => {
  const today = await completePractice(c.get('user'), c.req.valid('json').itemId);
  return c.json(today as unknown as Record<string, unknown>, 200);
});
