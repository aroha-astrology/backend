import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireGooglePlayRtdnSecret } from '../../middleware/cron-auth.js';
import { logger } from '../../lib/logger.js';
import {
  BillingPlanResponseSchema,
  BillingBalanceResponseSchema,
  TopUpAmountsResponseSchema,
  ValidateCouponBodySchema,
  CouponValidationResponseSchema,
  CheckoutBodySchema,
  OrderSchema,
  OrderIdParamSchema,
  TransactionsResponseSchema,
  ConfirmOrderResponseSchema,
  ConfirmGooglePlayBodySchema,
  RazorpayCheckoutResponseSchema,
  VerifyRazorpayBodySchema,
} from './billing.schemas.js';
import {
  getTopUpAmounts,
  validateCoupon,
  checkout,
  confirmPayment,
  confirmGooglePlayPurchase,
  reconcileGooglePlayNotification,
  startRazorpayCheckout,
  verifyRazorpayPayment,
  listTransactions,
  toOrderDto,
} from './billing.service.js';
import { isRazorpayConfigured } from './razorpay.js';

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
  summary: "Get the authenticated user's wallet balance",
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
  return c.json({ walletBalancePaise: 0, currency: 'INR' }, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /billing/packs                                                          */
/* -------------------------------------------------------------------------- */

const packsRoute = createRoute({
  method: 'get',
  path: '/billing/top-up-amounts',
  tags: ['Billing'],
  summary: 'List purchasable top-up amounts',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Credit packs',
      content: { 'application/json': { schema: TopUpAmountsResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

billingRouter.openapi(packsRoute, async (c) => {
  return c.json(
    {
      amounts: getTopUpAmounts() as unknown as TopUpAmount[],
      razorpayEnabled: isRazorpayConfigured(),
    },
    200,
  );
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
  summary: 'Create a pending order for a top-up amount (optionally with a coupon applied)',
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
/* GET /billing/transactions                                                  */
/* -------------------------------------------------------------------------- */

const transactionsRoute = createRoute({
  method: 'get',
  path: '/billing/transactions',
  tags: ['Billing'],
  summary:
    "The authenticated user's full payment history — recharges plus every spend and refund — most recent first",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Payment history',
      content: { 'application/json': { schema: TransactionsResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

billingRouter.openapi(transactionsRoute, async (c) => {
  const user = c.get('user');
  const transactions = await listTransactions(user.id);
  return c.json({ transactions }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /billing/orders/{id}/confirm                                           */
/* -------------------------------------------------------------------------- */

const confirmRoute = createRoute({
  method: 'post',
  path: '/billing/orders/{id}/confirm',
  tags: ['Billing'],
  summary:
    'Confirm payment for a pending order and grant its wallet balance. Currently always refuses — no ' +
    'real payment gateway (Razorpay/Stripe) is wired up yet, so this cannot verify a real payment.',
  security: [{ bearerAuth: [] }],
  request: { params: OrderIdParamSchema },
  responses: {
    200: {
      description: 'Order confirmed, wallet balance granted',
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
  const { order, walletBalancePaise } = await confirmPayment(id, user.id);
  return c.json({ order: toOrderDto(order), walletBalancePaise }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /billing/confirm-google-play                                          */
/* -------------------------------------------------------------------------- */

const confirmGooglePlayRoute = createRoute({
  method: 'post',
  path: '/billing/confirm-google-play',
  tags: ['Billing'],
  summary: 'Confirm a Google Play purchase and grant its wallet balance',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ConfirmGooglePlayBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Order confirmed, wallet balance granted',
      content: { 'application/json': { schema: ConfirmOrderResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    400: errorResponse('Purchase is not in a completed state'),
    403: errorResponse('Google Play billing is not configured on this server'),
    404: errorResponse('No matching order found'),
    409: errorResponse('Order already processed in a conflicting state'),
  },
});

billingRouter.openapi(confirmGooglePlayRoute, async (c) => {
  const user = c.get('user');
  const { purchaseToken, productId } = c.req.valid('json');
  const { order, walletBalancePaise } = await confirmGooglePlayPurchase(user.id, {
    purchaseToken,
    productId,
  });
  return c.json({ order: toOrderDto(order), walletBalancePaise }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /billing/razorpay/order                                                */
/* -------------------------------------------------------------------------- */

const razorpayOrderRoute = createRoute({
  method: 'post',
  path: '/billing/razorpay/order',
  tags: ['Billing'],
  summary: 'Create a pending order plus its Razorpay order, ready for checkout.js',
  security: [{ bearerAuth: [] }],
  request: {
    body: { required: true, content: { 'application/json': { schema: CheckoutBodySchema } } },
  },
  responses: {
    200: {
      description: 'Order created on both sides',
      content: { 'application/json': { schema: RazorpayCheckoutResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    400: errorResponse('Unknown pack or invalid coupon'),
    403: errorResponse('Razorpay is not configured on this server'),
    500: errorResponse('Payment gateway error'),
  },
});

billingRouter.openapi(razorpayOrderRoute, async (c) => {
  const user = c.get('user');
  const { packId, couponCode } = c.req.valid('json');
  const { order, razorpayOrderId, razorpayKeyId } = await startRazorpayCheckout(
    user.id,
    packId,
    couponCode,
  );
  return c.json({ order: toOrderDto(order), razorpayOrderId, razorpayKeyId }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /billing/razorpay/verify                                               */
/* -------------------------------------------------------------------------- */

const razorpayVerifyRoute = createRoute({
  method: 'post',
  path: '/billing/razorpay/verify',
  tags: ['Billing'],
  summary: "Verify a Razorpay payment's signature and grant its wallet balance",
  security: [{ bearerAuth: [] }],
  request: {
    body: { required: true, content: { 'application/json': { schema: VerifyRazorpayBodySchema } } },
  },
  responses: {
    200: {
      description: 'Payment verified, wallet balance granted',
      content: { 'application/json': { schema: ConfirmOrderResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    400: errorResponse('Signature mismatch or payment/order mismatch'),
    404: errorResponse('Order not found'),
    409: errorResponse('Order already processed or not payable'),
  },
});

billingRouter.openapi(razorpayVerifyRoute, async (c) => {
  const user = c.get('user');
  const { order, walletBalancePaise } = await verifyRazorpayPayment(user.id, c.req.valid('json'));
  return c.json({ order: toOrderDto(order), walletBalancePaise }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /billing/google-play-rtdn  (Google Play → Cloud Pub/Sub push webhook)  */
/*                                                                              */
/* Separate router from billingRouter above: that one requires a logged-in    */
/* user on every route ('*' -> requireUser), but Google's push has no bearer  */
/* token — only the `?secret=` query param requireGooglePlayRtdnSecret        */
/* checks. Mounted at /internal alongside cronRouter/telegramBotRouter (see   */
/* app.ts) since this is another machine calling us, not a user session.      */
/* -------------------------------------------------------------------------- */

export const billingWebhooksRouter = new OpenAPIHono();
billingWebhooksRouter.use('/billing/google-play-rtdn', requireGooglePlayRtdnSecret);

const GooglePlayRtdnBodySchema = z
  .object({
    message: z.object({
      data: z.string().openapi({ description: 'Base64-encoded JSON RTDN payload' }),
      messageId: z.string().optional(),
    }),
    subscription: z.string().optional(),
  })
  .openapi('GooglePlayRtdnPush');

const googlePlayRtdnRoute = createRoute({
  method: 'post',
  path: '/billing/google-play-rtdn',
  tags: ['Billing'],
  summary: 'Google Play Real-time Developer Notifications push endpoint (Cloud Pub/Sub)',
  request: {
    query: z.object({ secret: z.string().optional() }),
    body: {
      required: true,
      content: { 'application/json': { schema: GooglePlayRtdnBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Acknowledged (Pub/Sub retries on anything else)',
      content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
    },
    403: errorResponse('Invalid or missing secret'),
  },
});

billingWebhooksRouter.openapi(googlePlayRtdnRoute, async (c) => {
  const { message } = c.req.valid('json');

  // Ack (200) even on a parse/processing failure — the only thing worth ever
  // rejecting is a bad secret (handled by the middleware above). Anything else
  // is already logged for follow-up inside reconcileGooglePlayNotification;
  // making Pub/Sub retry-storm us over the same payload wouldn't fix it.
  try {
    const payload = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) as {
      oneTimeProductNotification?: { notificationType: number; purchaseToken: string; sku: string };
    };
    if (payload.oneTimeProductNotification) {
      await reconcileGooglePlayNotification(payload.oneTimeProductNotification);
    }
  } catch (err) {
    logger.error({ err }, 'billing: failed to parse Google Play RTDN push body');
  }

  return c.json({ ok: true }, 200);
});

type TopUpAmount = z.infer<typeof TopUpAmountsResponseSchema>['amounts'][number];
