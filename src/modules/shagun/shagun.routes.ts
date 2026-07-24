import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import {
  ShagunProductIdParamSchema,
  ShagunProductListQuerySchema,
  ShagunProductListSchema,
  ShagunRedirectResponseSchema,
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

// Returns the affiliate URL as JSON rather than issuing a raw 302. This
// route is Firebase-authenticated (requireUser), but a browser navigation
// (a plain `<a href>` or `window.open(url)`) can't attach a Bearer token —
// so a real redirect here would be unreachable from the client that's
// supposed to use it. The frontend instead does an authenticated fetch()
// against this route, then opens `redirectUrl` itself (see
// ShagunRedirectResponseSchema's doc comment).
const redirectRoute = createRoute({
  method: 'get',
  path: '/shagun/products/{id}/redirect',
  tags: ['Shagun'],
  summary: 'Log a click and return the affiliate URL to open',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: { params: ShagunProductIdParamSchema },
  responses: {
    200: {
      description: 'Affiliate URL to open client-side',
      content: { 'application/json': { schema: ShagunRedirectResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Product not found'),
    422: errorResponse('Invalid id'),
  },
});

shagunRouter.openapi(
  redirectRoute,
  async (c) => {
    const user = c.get('user');
    const { id } = c.req.valid('param');
    const redirectUrl = await recordShagunClickAndGetRedirectUrl(id, user.id);
    return c.json({ redirectUrl }, 200);
  },
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
