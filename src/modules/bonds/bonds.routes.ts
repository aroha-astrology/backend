import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireAnyFeature } from '../../middleware/feature.js';
import { getBond, listBonds } from './bonds.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('BondsError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose — the shapes are documented on the service types. */
// z.any (not z.unknown) values: Hono types an `unknown` JSON value as `never`.
const Json = z.record(z.string(), z.any());

const ProfileParams = z.object({ profileId: z.string().uuid() });

export const bondsRouter = new OpenAPIHono();

const listRoute = createRoute({
  method: 'get',
  path: '/bonds',
  tags: ['Bonds'],
  summary:
    'Everyone saved on the account, with compatibility and where each bond stands now (Aroha Pass only)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(['nav.bonds', 'home.bondsCard'])] as const,
  responses: {
    200: { description: 'Bonds', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user, or PASS_REQUIRED'),
    409: errorResponse("CHART_NOT_READY — the owner's own chart"),
  },
});

bondsRouter.openapi(listRoute, async (c) => {
  const bonds = await listBonds(c.get('user'));
  return c.json(bonds as unknown as Record<string, unknown>, 200);
});

const getRoute = createRoute({
  method: 'get',
  path: '/bonds/{profileId}',
  tags: ['Bonds'],
  summary: 'One bond: compatibility, current phase and the detailed insight (Aroha Pass only)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(['nav.bonds', 'home.bondsCard'])] as const,
  request: { params: ProfileParams },
  responses: {
    200: { description: 'Bond', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user, or PASS_REQUIRED'),
    404: errorResponse('Not one of your saved profiles'),
    409: errorResponse('CHART_NOT_READY'),
  },
});

bondsRouter.openapi(getRoute, async (c) => {
  const bond = await getBond(c.get('user'), c.req.valid('param').profileId);
  return c.json(bond as unknown as Record<string, unknown>, 200);
});
