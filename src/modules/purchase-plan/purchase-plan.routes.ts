import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireConsent } from '../../middleware/consent.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import {
  AnalyzePurchasePlanBodySchema,
  PurchasePlanSchema,
  PlanIdParamSchema,
} from './purchase-plan.schemas.js';
import {
  requestPurchasePlanAnalysis,
  getPlansForUser,
  getPlanForUser,
} from './purchase-plan.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('PurchasePlanError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Independent of the general astro LLM rate limit — this is its own expensive call. */
const analyzeRateLimit = rateLimiter({ windowMs: 60_000, max: 5 });

export const purchasePlanRouter = new OpenAPIHono();

purchasePlanRouter.use('*', requireUser);

const analyzeRoute = createRoute({
  method: 'post',
  path: '/purchase-plan/analyze',
  tags: ['PurchasePlan'],
  summary: 'Request a Vedic timing analysis for a major purchase',
  security: [{ bearerAuth: [] }],
  middleware: [analyzeRateLimit, requireConsent] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: AnalyzePurchasePlanBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Analysis accepted — poll GET /purchase-plan/{id} for the result',
      content: { 'application/json': { schema: z.object({ planId: z.string() }) } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Consent required'),
    422: errorResponse('Validation failed'),
    429: errorResponse('Daily analysis limit reached'),
  },
});

purchasePlanRouter.openapi(analyzeRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const result = await requestPurchasePlanAnalysis(user.id, body);
  return c.json(result, 200);
});

const listRoute = createRoute({
  method: 'get',
  path: '/purchase-plan',
  tags: ['PurchasePlan'],
  summary: "List the current user's recent purchase-plan analyses",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Recent plans',
      content: { 'application/json': { schema: z.object({ plans: z.array(PurchasePlanSchema) }) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

purchasePlanRouter.openapi(listRoute, async (c) => {
  const user = c.get('user');
  const plans = await getPlansForUser(user.id);
  return c.json({ plans }, 200);
});

const getOneRoute = createRoute({
  method: 'get',
  path: '/purchase-plan/{id}',
  tags: ['PurchasePlan'],
  summary: 'Get a single purchase-plan analysis (poll target)',
  security: [{ bearerAuth: [] }],
  request: { params: PlanIdParamSchema },
  responses: {
    200: {
      description: 'The plan',
      content: { 'application/json': { schema: PurchasePlanSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
  },
});

purchasePlanRouter.openapi(getOneRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const plan = await getPlanForUser(id, user.id);
  return c.json(plan, 200);
});
