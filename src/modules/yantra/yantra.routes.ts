import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireFeature } from '../../middleware/feature.js';
import { buyDigitalProduct, getYantra } from './yantra.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('YantraError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose — the shape is YantraView in yantra.service.ts. */
// z.any (not z.unknown) values: Hono types an `unknown` JSON value as `never`.
const Json = z.record(z.string(), z.any());

export const yantraRouter = new OpenAPIHono();

const getRoute = createRoute({
  method: 'get',
  path: '/yantra',
  tags: ['Yantra'],
  summary: 'The active profile yantra: the graha and why, what is owned, and prices',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.digitalYantra')] as const,
  responses: {
    200: { description: 'Yantra', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('CHART_NOT_READY'),
  },
});

yantraRouter.openapi(getRoute, async (c) => {
  const view = await getYantra(c.get('user'));
  return c.json(view as unknown as Record<string, unknown>, 200);
});

const buyRoute = createRoute({
  method: 'post',
  path: '/yantra/{kind}/buy',
  tags: ['Yantra'],
  summary: 'Buy the yantra or the phone wallpaper for the active profile (wallet)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.digitalYantra')] as const,
  request: { params: z.object({ kind: z.enum(['yantra', 'wallpaper']) }) },
  responses: {
    200: { description: 'Yantra', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature or that product switched off'),
    409: errorResponse('INSUFFICIENT_CREDITS or CHART_NOT_READY'),
  },
});

yantraRouter.openapi(buyRoute, async (c) => {
  const view = await buyDigitalProduct(c.get('user'), c.req.valid('param').kind);
  return c.json(view as unknown as Record<string, unknown>, 200);
});
