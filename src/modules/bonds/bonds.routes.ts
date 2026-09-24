import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireAnyFeature, requireFeature } from '../../middleware/feature.js';
import { getBond, listBonds, unlockBond } from './bonds.service.js';

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
  summary: 'Everyone saved on the account, with compatibility and where each bond stands now',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(['nav.bonds', 'home.bondsCard'])] as const,
  responses: {
    200: { description: 'Bonds', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
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
  summary: 'One bond: compatibility, current phase, and (once unlocked) the detailed insight',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(['nav.bonds', 'home.bondsCard'])] as const,
  request: { params: ProfileParams },
  responses: {
    200: { description: 'Bond', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('Not one of your saved profiles'),
    409: errorResponse('CHART_NOT_READY'),
  },
});

bondsRouter.openapi(getRoute, async (c) => {
  const bond = await getBond(c.get('user'), c.req.valid('param').profileId);
  return c.json(bond as unknown as Record<string, unknown>, 200);
});

const unlockRoute = createRoute({
  method: 'post',
  path: '/bonds/{profileId}/unlock',
  tags: ['Bonds'],
  summary: "Unlock one bond's detailed insight (wallet; free with the Pass)",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireUser,
    requireFeature('nav.bonds'),
    requireFeature('paid.bondInsight'),
  ] as const,
  request: { params: ProfileParams },
  responses: {
    200: { description: 'Unlock state', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('Not one of your saved profiles'),
    409: errorResponse('INSUFFICIENT_CREDITS'),
  },
});

bondsRouter.openapi(unlockRoute, async (c) => {
  const state = await unlockBond(c.get('user'), c.req.valid('param').profileId);
  return c.json(state as unknown as Record<string, unknown>, 200);
});
