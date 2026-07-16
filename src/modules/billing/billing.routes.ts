import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import {
  BillingPlanResponseSchema,
  BillingBalanceResponseSchema,
  CreditPacksResponseSchema,
  ValidateCouponBodySchema,
  CouponValidationResponseSchema,
  CheckoutBodySchema,
  OrderSchema,
  OrderIdParamSchema,
  ConfirmOrderResponseSchema,
  ConfirmGooglePlayBodySchema,
} from './billing.schemas.js';
import {
  getCreditPacks,
  validateCoupon,
  checkout,
  confirmPayment,
  confirmGooglePlayPurchase,
  toOrderDto,
} from './billing.service.js';

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
  return c.json({ plan: 'free', expiresAt: null, features: ['daily_forecast', 'panchang'] }, 200);
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

/* -------------------------------------------------------------------------- */
/* GET /billing/packs                                                          */
/* -------------------------------------------------------------------------- */

const packsRoute = createRoute({
  method: 'get',
  path: '/billing/packs',
  tags: ['Billing'],
  summary: 'List purchasable credit packs',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Credit packs',
      content: { 'application/json': { schema: CreditPacksResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

billingRouter.openapi(packsRoute, async (c) => {
  return c.json({ packs: getCreditPacks() as unknown as CreditPack[] }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /billing/coupons/validate                                              */
/* -------------------------------------------------------------------------- */

const validateCouponRoute = createRoute({
  method: 'post',
  path: '/billing/coupons/validate',
  tags: ['Billing'],
  summary: 'Preview the discount a coupon code would apply to a pack, without redeeming it',
  security: [{ bearerAuth: [] }],
  request: {
    body: { required: true, content: { 'application/json': { schema: ValidateCouponBodySchema } } },
  },
  responses: {
    200: {
      description: 'Validation result (valid:false with a message when not applicable)',
      content: { 'application/json': { schema: CouponValidationResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    400: errorResponse('Unknown pack'),
  },
});

billingRouter.openapi(validateCouponRoute, async (c) => {
  const { code, packId } = c.req.valid('json');
  const result = await validateCoupon(code, packId);
  return c.json(result, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /billing/checkout                                                      */
/* -------------------------------------------------------------------------- */

const checkoutRoute = createRoute({
  method: 'post',
  path: '/billing/checkout',
  tags: ['Billing'],
  summary: 'Create a pending order for a credit pack (optionally with a coupon applied)',
  security: [{ bearerAuth: [] }],
  request: {
    body: { required: true, content: { 'application/json': { schema: CheckoutBodySchema } } },
  },
  responses: {
    200: {
      description: 'Pending order, ready to be paid',
      content: { 'application/json': { schema: OrderSchema } },
    },
    401: errorResponse('Unauthorized'),
    400: errorResponse('Unknown pack or invalid coupon'),
  },
});

billingRouter.openapi(checkoutRoute, async (c) => {
  const user = c.get('user');
  const { packId, couponCode } = c.req.valid('json');
  const order = await checkout(user.id, packId, couponCode);
  return c.json(toOrderDto(order), 200);
});

/* -------------------------------------------------------------------------- */
/* POST /billing/orders/{id}/confirm                                           */
/* -------------------------------------------------------------------------- */

const confirmRoute = createRoute({
  method: 'post',
  path: '/billing/orders/{id}/confirm',
  tags: ['Billing'],
  summary:
    'Confirm payment for a pending order and grant its credits. Currently always refuses — no ' +
    'real payment gateway (Razorpay/Stripe) is wired up yet, so this cannot verify a real payment.',
  security: [{ bearerAuth: [] }],
  request: { params: OrderIdParamSchema },
  responses: {
    200: {
      description: 'Order confirmed, credits granted',
      content: { 'application/json': { schema: ConfirmOrderResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Online payments are not live yet'),
    404: errorResponse('Order not found'),
    409: errorResponse('Order already processed or not pending'),
  },
});

billingRouter.openapi(confirmRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const { order, credits } = await confirmPayment(id, user.id);
  return c.json({ order: toOrderDto(order), credits }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /billing/confirm-google-play                                          */
/* -------------------------------------------------------------------------- */

const confirmGooglePlayRoute = createRoute({
  method: 'post',
  path: '/billing/confirm-google-play',
  tags: ['Billing'],
  summary: 'Confirm a Google Play purchase and grant its credits',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ConfirmGooglePlayBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Order confirmed, credits granted',
      content: { 'application/json': { schema: ConfirmOrderResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    400: errorResponse('Purchase not in a completed state, or product mismatch'),
    404: errorResponse('No matching order found'),
    409: errorResponse('Order already processed in a conflicting state'),
  },
});

billingRouter.openapi(confirmGooglePlayRoute, async (c) => {
  const user = c.get('user');
  const { purchaseToken, productId } = c.req.valid('json');
  const { order, credits } = await confirmGooglePlayPurchase(user.id, { purchaseToken, productId });
  return c.json({ order: toOrderDto(order), credits }, 200);
});

type CreditPack = z.infer<typeof CreditPacksResponseSchema>['packs'][number];
