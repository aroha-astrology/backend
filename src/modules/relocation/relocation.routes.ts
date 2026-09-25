import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireFeature } from '../../middleware/feature.js';
import { MAX_PLACES, compareRelocation, getRelocationStatus } from './relocation.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('RelocationError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose — the shapes are documented on the service types. */
// z.any (not z.unknown) values: Hono types an `unknown` JSON value as `never`.
const Json = z.record(z.string(), z.any());

const PlaceSchema = z.object({
  name: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const relocationRouter = new OpenAPIHono();

const statusRoute = createRoute({
  method: 'get',
  path: '/relocation',
  tags: ['Relocation'],
  summary: 'Relocation status: the birth-time confidence gate (Aroha Pass only)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.relocation')] as const,
  responses: {
    200: { description: 'Status', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user, or PASS_REQUIRED'),
  },
});

relocationRouter.openapi(statusRoute, async (c) => {
  const status = await getRelocationStatus(c.get('user'));
  return c.json(status as unknown as Record<string, unknown>, 200);
});

const compareRoute = createRoute({
  method: 'post',
  path: '/relocation/compare',
  tags: ['Relocation'],
  summary: 'Score six life areas at the birth place and up to five other places',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.relocation')] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({ places: z.array(PlaceSchema).min(1).max(MAX_PLACES) }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Comparison', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user, or PASS_REQUIRED'),
    409: errorResponse('BIRTH_TIME_TOO_UNCERTAIN or CHART_NOT_READY'),
  },
});

relocationRouter.openapi(compareRoute, async (c) => {
  const result = await compareRelocation(c.get('user'), c.req.valid('json').places);
  return c.json(result as unknown as Record<string, unknown>, 200);
});
