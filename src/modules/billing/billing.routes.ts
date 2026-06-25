import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import {
  BillingPlanResponseSchema,
  BillingBalanceResponseSchema,
} from './billing.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('BillingError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const billingRouter = new OpenAPIHono();

billingRouter.use('*', requireUser);

/* -------------------------------------------------------------------------- */
/* GET /billing/plan                                                           */
/* -------------------------------------------------------------------------- */

const planRoute = createRoute({
  method: 'get',
  path: '/billing/plan',
  tags: ['Billing'],
  summary: "Get the authenticated user's current subscription plan",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Current plan',
      content: { 'application/json': { schema: BillingPlanResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

billingRouter.openapi(planRoute, async (c) => {
  // TODO: read from subscription table
  return c.json(
    { plan: 'free', expiresAt: null, features: ['daily_forecast', 'panchang'] },
    200,
  );
});

/* -------------------------------------------------------------------------- */
/* GET /billing/balance                                                        */
/* -------------------------------------------------------------------------- */

const balanceRoute = createRoute({
  method: 'get',
  path: '/billing/balance',
  tags: ['Billing'],
  summary: "Get the authenticated user's credit balance",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Credit balance',
      content: { 'application/json': { schema: BillingBalanceResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

billingRouter.openapi(balanceRoute, async (c) => {
  // TODO: read from billing/credits table
  return c.json({ credits: 0, currency: 'INR' }, 200);
});
