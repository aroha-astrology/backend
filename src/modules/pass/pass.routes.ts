import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin, requireUser } from '../../middleware/auth.js';
import { requireAnyFeature, requireFeature } from '../../middleware/feature.js';
import { QUESTION_PACKS } from './pass.config.js';
import { buyQuestionPack, buyWalletPass, getPassStatus, setAutoRenew } from './pass.service.js';
import { confirmPlayPass } from './pass-play.service.js';
import { passStats } from './pass.repo.js';

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
  summary: 'Aroha Pass status, this user’s offer (price variant), question credits and packs',
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

const buyWalletRoute = createRoute({
  method: 'post',
  path: '/pass/wallet',
  tags: ['Pass'],
  summary: 'Buy 30 days of the Aroha Pass from the wallet',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.arohaPass')] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': { schema: z.object({ autoRenew: z.boolean().default(false) }) },
      },
    },
  },
  responses: {
    200: { description: 'Status', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('PASS_NOT_AVAILABLE, PASS_ALREADY_ACTIVE or INSUFFICIENT_CREDITS'),
  },
});

passRouter.openapi(buyWalletRoute, async (c) => {
  const status = await buyWalletPass(c.get('user'), c.req.valid('json'));
  return c.json(status as unknown as Record<string, unknown>, 200);
});

const autoRenewRoute = createRoute({
  method: 'post',
  path: '/pass/auto-renew',
  tags: ['Pass'],
  summary: 'Turn wallet auto-renew on or off (a Play Pass is managed in the Play Store)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.arohaPass')] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ on: z.boolean() }) } },
    },
  },
  responses: {
    200: { description: 'Status', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('No active Pass'),
    409: errorResponse('PASS_MANAGED_BY_PLAY'),
  },
});

passRouter.openapi(autoRenewRoute, async (c) => {
  const status = await setAutoRenew(c.get('user'), c.req.valid('json').on);
  return c.json(status as unknown as Record<string, unknown>, 200);
});

const playConfirmRoute = createRoute({
  method: 'post',
  path: '/pass/google-play',
  tags: ['Pass'],
  summary:
    'Record a Google Play Aroha Pass subscription the app just bought (verified with Google)',
  security: [{ bearerAuth: [] }],
  middleware: [
    requireUser,
    requireFeature('nav.arohaPass'),
    requireFeature('paid.arohaPassPlay'),
  ] as const,
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

const buyPackRoute = createRoute({
  method: 'post',
  path: '/question-packs/{pack}/buy',
  tags: ['Pass'],
  summary: 'Buy a Question Pack (prepaid chat questions) from the wallet',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireAnyFeature(PACK_KEYS)] as const,
  request: { params: z.object({ pack: z.enum(PACK_NAMES) }) },
  responses: {
    200: { description: 'Status', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('That pack is switched off'),
    409: errorResponse('INSUFFICIENT_CREDITS'),
  },
});

passRouter.openapi(buyPackRoute, async (c) => {
  const pack = c.req.valid('param').pack as (typeof QUESTION_PACKS)[number]['pack'];
  const status = await buyQuestionPack(c.get('user'), pack);
  return c.json(status as unknown as Record<string, unknown>, 200);
});

/* -------------------------------------------------------------------------- */
/* Admin: Pass + pack numbers                                                  */
/* -------------------------------------------------------------------------- */

const adminStatsRoute = createRoute({
  method: 'get',
  path: '/admin/pass-stats',
  tags: ['Admin'],
  summary:
    'Aroha Pass subscribers (by source and price variant), churn, revenue and Question Pack sales',
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
