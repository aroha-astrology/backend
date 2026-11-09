/**
 * Admin-only Varshik Rashifal pricing: the three tiers' price, struck-out price, names, card text and
 * on/off, edited here with no deploy.
 *   GET /admin/varshik-tiers          all three tiers (switched-off ones too)
 *   PUT /admin/varshik-tiers/{slug}   change any of the fields below (partial)
 * The server charges whatever price is stored here. Each change is written to the admin audit log.
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { logAdminAction } from './admin.repo.js';
import {
  listAllVarshikTiers,
  updateVarshikTier,
  VarshikTierPatchSchema,
  VarshikTierSchema,
  VarshikTierSlugSchema,
} from '../reports/varshik-tiers.js';

export const adminVarshikTiersRouter = new OpenAPIHono();

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('AdminVarshikTiersError');

const errors = {
  400: { description: 'Invalid change', content: { 'application/json': { schema: ErrorSchema } } },
  401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorSchema } } },
  403: { description: 'Admin access required', content: { 'application/json': { schema: ErrorSchema } } },
};

const listRoute = createRoute({
  method: 'get',
  path: '/admin/varshik-tiers',
  tags: ['Admin'],
  summary: 'The three Varshik Rashifal tiers with price and card text',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Tiers',
      content: { 'application/json': { schema: z.object({ tiers: z.array(VarshikTierSchema) }) } },
    },
    ...errors,
  },
});

adminVarshikTiersRouter.openapi(listRoute, async (c) => c.json({ tiers: await listAllVarshikTiers() }, 200));

const updateRoute = createRoute({
  method: 'put',
  path: '/admin/varshik-tiers/{slug}',
  tags: ['Admin'],
  summary: 'Change one Varshik tier (any of its price, names, text, on/off)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: z.object({ slug: VarshikTierSlugSchema.openapi({ param: { name: 'slug', in: 'path' } }) }),
    body: { required: true, content: { 'application/json': { schema: VarshikTierPatchSchema } } },
  },
  responses: {
    200: {
      description: 'Updated tier',
      content: { 'application/json': { schema: VarshikTierSchema } },
    },
    ...errors,
  },
});

adminVarshikTiersRouter.openapi(updateRoute, async (c) => {
  const { slug } = c.req.valid('param');
  const patch = c.req.valid('json');
  const tier = await updateVarshikTier(slug, patch);
  const phone = c.get('firebaseToken').phone_number ?? 'unknown';
  await logAdminAction(phone, 'PUT /v1/admin/varshik-tiers/' + slug, patch);
  return c.json(tier, 200);
});
