import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import {
  ShagunProductIdParamSchema,
  ShagunProductListQuerySchema,
  ShagunProductListSchema,
} from './shagun.schemas.js';
import { listShagunProducts, recordShagunClickAndGetRedirectUrl } from './shagun.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('ShagunError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const shagunRouter = new OpenAPIHono();

const listRoute = createRoute({
  method: 'get',
  path: '/shagun/products',
  tags: ['Shagun'],
  summary: 'List the active Shagun affiliate product catalog',
  description:
    'Curated gemstones, rudraksha, yantras, malas, idols, puja items, and gift sets, ' +
    'each linking out to a third-party seller. Aroha does not sell or ship these itself ' +
    '— it earns a referral commission via GET /shagun/products/{id}/redirect.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: { query: ShagunProductListQuerySchema },
  responses: {
    200: {
      description: 'Active products, sorted by sortOrder ascending',
      content: { 'application/json': { schema: ShagunProductListSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Invalid category'),
  },
});

shagunRouter.openapi(
  listRoute,
  async (c) => {
    const { category } = c.req.valid('query');
    const items = await listShagunProducts(category);
    return c.json({ items }, 200);
  },
  // Same reasoning as public.routes.ts / palm-photo.routes.ts: the library's
  // own no-hook default resolves a failed query validation to a plain
  // `c.json(result, 400)`, but this route's documented contract is 422 —
  // mapped explicitly here instead of relying on that default.
  (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'UNPROCESSABLE',
            message: 'Validation failed',
            details: result.error.flatten(),
          },
        },
        422,
      );
    }
  },
);

// Plain (non-`.openapi()`) route: a 302 redirect has no JSON response body,
// which doesn't fit the typed `.openapi()` response contract — same reasoning
// as the PDF route at prime-reports.routes.ts, which established this
// plain-route-with-positional-middleware pattern for the same kind of
// non-JSON response.
shagunRouter.get('/shagun/products/:id/redirect', requireUser, async (c) => {
  const user = c.get('user');
  const parsedId = ShagunProductIdParamSchema.safeParse({ id: c.req.param('id') });
  if (!parsedId.success) {
    return c.json(
      {
        error: {
          code: 'UNPROCESSABLE',
          message: 'Validation failed',
          details: parsedId.error.flatten(),
        },
      },
      422,
    );
  }

  const affiliateUrl = await recordShagunClickAndGetRedirectUrl(parsedId.data.id, user.id);
  return c.redirect(affiliateUrl, 302);
});
