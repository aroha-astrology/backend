import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireAnyFeature } from '../../middleware/feature.js';
import { completeRitual, getRitualToday } from './ritual.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('RitualError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose: the shapes are documented on the service types. */
const Json = z.record(z.string(), z.any());

export const ritualRouter = new OpenAPIHono();

const todayRoute = createRoute({
  method: 'get',
  path: '/ritual/today',
  tags: ['Ritual'],
  summary: "Today's Morning Ritual: the Prashna card, whether it is done, and the merged streak",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(['ritual.morning'])] as const,
  responses: {
    200: { description: 'Today', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

ritualRouter.openapi(todayRoute, async (c) => {
  const today = await getRitualToday(c.get('user'));
  return c.json(today as unknown as Record<string, unknown>, 200);
});

const CompleteBody = z
  .object({
    practice: z.enum(['jap', 'breath']),
    mood: z.number().int().min(1).max(5).nullable().optional(),
  })
  .openapi('RitualCompleteBody');

const completeRoute = createRoute({
  method: 'post',
  path: '/ritual/complete',
  tags: ['Ritual'],
  summary:
    "Finish today's ritual: counts as the daily check-in (one streak) and may hand out a Cosmic Key or a shield",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(['ritual.morning'])] as const,
  request: { body: { required: true, content: { 'application/json': { schema: CompleteBody } } } },
  responses: {
    200: {
      description: 'The ritual after finishing (alreadyDone when it was done before)',
      content: { 'application/json': { schema: Json } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

ritualRouter.openapi(completeRoute, async (c) => {
  const result = await completeRitual(c.get('user'), c.req.valid('json'));
  return c.json(result as unknown as Record<string, unknown>, 200);
});
