import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin, requireUser } from '../../middleware/auth.js';
import { requireAnyFeature, requireFeature } from '../../middleware/feature.js';
import { QUESTION_PACKS } from './pass.config.js';
import { buyQuestionPack, getPassStatus, startQuestionPackCheckout } from './pass.service.js';
import { confirmPlayPass } from './pass-play.service.js';
import {
  cancelRazorpayPass,
  confirmRazorpayPass,
  startRazorpayPass,
} from './pass-razorpay.service.js';
import { confirmAppStorePass } from './pass-appstore.service.js';
import { passStats, listPassSubscribers } from './pass.repo.js';
import { passLaunchReadiness, sendPassLaunch } from './pass-launch.service.js';
import { logAdminAction } from '../admin/admin.repo.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('PassError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose — the shape is PassStatus in pass.service.ts. */
// z.any (not z.unknown) values: Hono types an `unknown` JSON value as `never`.
const Json = z.record(z.string(), z.any());

const PACK_KEYS = QUESTION_PACKS.map((p) => p.key);
const PACK_NAMES = QUESTION_PACKS.map((p) => p.pack) as [string, ...string[]];

export const passRouter = new OpenAPIHono();

const statusRoute = createRoute({
  method: 'get',
  path: '/pass',
  tags: ['Pass'],
  summary: 'Aroha Pass status, the tiers on offer, question credits and packs',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(['nav.arohaPass', ...PACK_KEYS])] as const,
  responses: {
    200: { description: 'Status', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

passRouter.openapi(statusRoute, async (c) => {
  const status = await getPassStatus(c.get('user'));
  return c.json(status as unknown as Record<string, unknown>, 200);
});

const playConfirmRoute = createRoute({
  method: 'post',
  path: '/pass/google-play',
  tags: ['Pass'],
  summary:
    'Record a Google Play Aroha Pass subscription the app just bought (verified with Google) — the only way to get the Pass',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.arohaPass')] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            productId: z.string().min(1).max(200),
            purchaseToken: z.string().min(1).max(4096),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Status', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('PLAY_SUBSCRIPTION_NOT_ACTIVE'),
  },
});

passRouter.openapi(playConfirmRoute, async (c) => {
  const user = c.get('user');
  await confirmPlayPass(user.id, c.req.valid('json'));
  const status = await getPassStatus(user);
  return c.json(status as unknown as Record<string, unknown>, 200);
});

// --- The Pass on the website: Razorpay Subscriptions (money.razorpayPass) ---------------------

const webSubscribeRoute = createRoute({
  method: 'post',
  path: '/pass/razorpay/subscribe',
  tags: ['Pass'],
  summary: 'Start a Razorpay subscription for one Pass tier (the website only, money.razorpayPass)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.arohaPass')] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            tier: z.enum(['silver', 'gold', 'platinum']),
            currency: z.string().length(3).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Subscription to open in Razorpay Checkout', content: { 'application/json': { schema: Json } } },
    400: errorResponse('PASS_TIER_NOT_AVAILABLE'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('FEATURE_DISABLED'),
    409: errorResponse('PASS_ALREADY_ACTIVE or PASS_WEB_NOT_CONFIGURED'),
  },
});

passRouter.openapi(webSubscribeRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const checkout = await startRazorpayPass(user, body.tier, {
    country: user.currentCountry ?? user.geoCountry,
    currency: body.currency,
  });
  return c.json(checkout as unknown as Record<string, unknown>, 200);
});

const webVerifyRoute = createRoute({
  method: 'post',
  path: '/pass/razorpay/verify',
  tags: ['Pass'],
  summary: "Record a web Pass after Razorpay Checkout (checks Razorpay's signature, then asks Razorpay)",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.arohaPass')] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            razorpayPaymentId: z.string().min(1).max(100),
            razorpaySubscriptionId: z.string().min(1).max(100),
            razorpaySignature: z.string().min(1).max(200),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Status', content: { 'application/json': { schema: Json } } },
    400: errorResponse('Payment could not be verified'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('FEATURE_DISABLED or another account'),
    409: errorResponse('PASS_PAYMENT_PENDING'),
  },
});

passRouter.openapi(webVerifyRoute, async (c) => {
  const user = c.get('user');
  await confirmRazorpayPass(user.id, c.req.valid('json'));
  const status = await getPassStatus(user);
  return c.json(status as unknown as Record<string, unknown>, 200);
});

const webCancelRoute = createRoute({
  method: 'post',
  path: '/pass/razorpay/cancel',
  tags: ['Pass'],
  summary: 'Stop a web Pass from renewing; it runs to the end of the paid month',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.arohaPass')] as const,
  responses: {
    200: { description: 'Status', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    404: errorResponse('NO_WEB_PASS'),
  },
});

passRouter.openapi(webCancelRoute, async (c) => {
  const user = c.get('user');
  await cancelRazorpayPass(user.id);
  const status = await getPassStatus(user);
  return c.json(status as unknown as Record<string, unknown>, 200);
});

// --- The Pass on an iPhone: StoreKit 2 (money.storekit) -----------------------------------------

const appStoreConfirmRoute = createRoute({
  method: 'post',
  path: '/pass/app-store',
  tags: ['Pass'],
  summary: "Record an App Store Pass the iOS app bought or restored (Apple's signed transaction)",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.arohaPass')] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({ signedTransaction: z.string().min(1).max(20_000) }),
        },
      },
    },
  },
  responses: {
    200: { description: 'Status', content: { 'application/json': { schema: Json } } },
    400: errorResponse('APP_STORE_SIGNATURE_INVALID or NOT_A_PASS_PRODUCT'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('FEATURE_DISABLED or APP_STORE_OTHER_ACCOUNT'),
    409: errorResponse('APP_STORE_SUBSCRIPTION_NOT_ACTIVE'),
  },
});

passRouter.openapi(appStoreConfirmRoute, async (c) => {
  const user = c.get('user');
  await confirmAppStorePass(user.id, c.req.valid('json').signedTransaction);
  const status = await getPassStatus(user);
  return c.json(status as unknown as Record<string, unknown>, 200);
});

const buyPackRoute = createRoute({
  method: 'post',
  path: '/question-packs/{pack}/buy',
  tags: ['Pass'],
  summary: 'RETIRED — packs are bought through Google Play; always 403 QUESTION_PACK_PLAY_ONLY',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(PACK_KEYS)] as const,
  request: { params: z.object({ pack: z.enum(PACK_NAMES) }) },
  responses: {
    200: { description: 'Never returned', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('QUESTION_PACK_PLAY_ONLY'),
  },
});

passRouter.openapi(buyPackRoute, async (c) => {
  const pack = c.req.valid('param').pack as (typeof QUESTION_PACKS)[number]['pack'];
  return buyQuestionPack(c.get('user'), pack);
});

const packCheckoutRoute = createRoute({
  method: 'post',
  path: '/question-packs/{pack}/checkout',
  tags: ['Pass'],
  summary:
    'Start a Google Play purchase of a Question Pack: records the pending order and returns the ' +
    'Play product to launch. Confirm with POST /billing/confirm-google-play, as for top-ups.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(PACK_KEYS)] as const,
  request: { params: z.object({ pack: z.enum(PACK_NAMES) }) },
  responses: {
    200: {
      description: 'Pending order recorded',
      content: {
        'application/json': {
          schema: z.object({ productId: z.string(), questions: z.number() }),
        },
      },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('That pack is switched off'),
  },
});

passRouter.openapi(packCheckoutRoute, async (c) => {
  const pack = c.req.valid('param').pack as (typeof QUESTION_PACKS)[number]['pack'];
  return c.json(await startQuestionPackCheckout(c.get('user'), pack), 200);
});

/* -------------------------------------------------------------------------- */
/* Admin: Pass + pack numbers                                                  */
/* -------------------------------------------------------------------------- */

const adminStatsRoute = createRoute({
  method: 'get',
  path: '/admin/pass-stats',
  tags: ['Admin'],
  summary: 'Aroha Pass subscribers (by source and tier), churn, revenue and Question Pack sales',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: { description: 'Pass numbers', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
  },
});

passRouter.openapi(adminStatsRoute, async (c) => {
  const stats = await passStats();
  return c.json(stats as unknown as Record<string, unknown>, 200);
});

const adminSubscribersRoute = createRoute({
  method: 'get',
  path: '/admin/pass-subscribers',
  tags: ['Admin'],
  summary: 'Paginated list of users with an active Aroha Pass',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    query: z.object({
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: { description: 'Subscriber list', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
  },
});

passRouter.openapi(adminSubscribersRoute, async (c) => {
  const { offset, limit } = c.req.valid('query');
  const page = await listPassSubscribers(limit, offset);
  return c.json(page as unknown as Record<string, unknown>, 200);
});

/* -------------------------------------------------------------------------- */
/* Admin: go-live check and the launch notification                           */
/* -------------------------------------------------------------------------- */

const launchStatusRoute = createRoute({
  method: 'get',
  path: '/admin/pass-launch',
  tags: ['Admin'],
  summary:
    'Is the Aroha Pass ready to go live: every switch it needs, Google Play, and who the launch notification would reach',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: { description: 'Readiness', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
  },
});

passRouter.openapi(launchStatusRoute, async (c) => {
  const readiness = await passLaunchReadiness();
  return c.json(readiness as unknown as Record<string, unknown>, 200);
});

const launchSendRoute = createRoute({
  method: 'post',
  path: '/admin/pass-launch',
  tags: ['Admin'],
  summary:
    'Send the "Aroha Pass is here" notification to every user who has not had it, or with onlyMe a try-out to the calling admin',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ onlyMe: z.boolean().default(false) }) } },
    },
  },
  responses: {
    200: { description: 'Send result', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    409: errorResponse('PASS_NOT_READY'),
  },
});

passRouter.openapi(launchSendRoute, async (c) => {
  const admin = c.get('user');
  const { onlyMe } = c.req.valid('json');
  const result = await sendPassLaunch(
    onlyMe ? { onlyUser: { id: admin.id, locale: admin.locale } } : {},
  );
  await logAdminAction(
    c.get('firebaseToken').phone_number ?? 'unknown',
    'POST /v1/admin/pass-launch',
    { onlyMe, ...result },
  );
  return c.json(result as unknown as Record<string, unknown>, 200);
});
