import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { Errors } from '../../lib/errors.js';
import { logAdminAction } from './admin.repo.js';
import { findActiveUserById } from '../users/users.repo.js';
import {
  countPlayRefunds,
  listPlayRefunds,
  setPurchasesBlocked,
} from '../billing/play-refunds.repo.js';
import { REFUND_CLAWBACK_KEY, runPlayRefundCheck } from '../billing/play-refunds.service.js';
import { resolveFeatures } from '../features/features.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('AdminPlayRefundsError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const adminPlayRefundsRouter = new OpenAPIHono();

/** Same identity-from-already-validated-token shortcut as admin-gemini-keys.routes.ts. */
function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

const PAGE_SIZE = 25;

const PlayRefundRowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  productId: z.string().nullable(),
  googleOrderId: z.string().nullable(),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  amountPaise: z.number().int(),
  questionCredits: z.number().int(),
  status: z.string(),
  clawedBackPaise: z.number().int(),
  clawedBackQuestions: z.number().int(),
  reportsLocked: z.number().int(),
  walletBalancePaise: z.number().int().nullable(),
  purchasesBlocked: z.boolean(),
  voidedAt: z.string().nullable(),
  purchasedAt: z.string().nullable(),
  voidedReason: z.number().int().nullable(),
  voidedSource: z.number().int().nullable(),
  detectedVia: z.string(),
  createdAt: z.string(),
});

const PlayRefundsResponseSchema = z
  .object({
    /** Whether paid.refundClawback is on for everyone (it can also be on for a group only). */
    clawbackOn: z.boolean(),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    refunds: z.array(PlayRefundRowSchema),
  })
  .openapi('AdminPlayRefunds');

/* -------------------------------------------------------------------------- */
/* GET /admin/play-refunds                                                    */
/* -------------------------------------------------------------------------- */

const listRoute = createRoute({
  method: 'get',
  path: '/admin/play-refunds',
  tags: ['Admin'],
  summary: 'Every Google Play refund found, newest first, with what was taken back',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    query: z.object({ page: z.coerce.number().int().min(1).optional() }),
  },
  responses: {
    200: {
      description: 'One page of refunds',
      content: { 'application/json': { schema: PlayRefundsResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminPlayRefundsRouter.openapi(listRoute, async (c) => {
  const page = c.req.valid('query').page ?? 1;
  const [rows, total, features] = await Promise.all([
    listPlayRefunds(PAGE_SIZE, (page - 1) * PAGE_SIZE),
    countPlayRefunds(),
    resolveFeatures(),
  ]);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return c.json(
    {
      clawbackOn: features[REFUND_CLAWBACK_KEY]?.enabled === true,
      total,
      page,
      pageSize: PAGE_SIZE,
      refunds: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        productId: r.productId,
        googleOrderId: r.googleOrderId,
        userId: r.userId,
        userName: r.userName,
        amountPaise: r.amountPaise,
        questionCredits: r.questionCredits,
        status: r.status,
        clawedBackPaise: r.clawedBackPaise,
        clawedBackQuestions: r.clawedBackQuestions,
        reportsLocked: r.reportsLocked,
        walletBalancePaise: r.walletBalancePaise,
        purchasesBlocked: r.purchasesBlocked,
        voidedAt: iso(r.voidedAt),
        purchasedAt: iso(r.purchasedAt),
        voidedReason: r.voidedReason,
        voidedSource: r.voidedSource,
        detectedVia: r.detectedVia,
        createdAt: r.createdAt.toISOString(),
      })),
    },
    200,
  );
});

/* -------------------------------------------------------------------------- */
/* POST /admin/play-refunds/check                                             */
/* -------------------------------------------------------------------------- */

const checkRoute = createRoute({
  method: 'post',
  path: '/admin/play-refunds/check',
  tags: ['Admin'],
  summary: 'Ask Google for refunds now instead of waiting for the hourly check',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'What the check found',
      content: {
        'application/json': {
          schema: z.object({
            checked: z.number().int(),
            recorded: z.number().int(),
            clawedBack: z.number().int(),
            pass: z.number().int(),
            unmatched: z.number().int(),
            skipped: z.number().int(),
          }),
        },
      },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminPlayRefundsRouter.openapi(checkRoute, async (c) => {
  const result = await runPlayRefundCheck();
  await logAdminAction(adminPhoneOf(c), 'POST /v1/admin/play-refunds/check', result);
  return c.json(result, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /admin/users/:id/purchases-block                                      */
/* -------------------------------------------------------------------------- */

const blockRoute = createRoute({
  method: 'post',
  path: '/admin/users/{id}/purchases-block',
  tags: ['Admin'],
  summary: 'Block or unblock new purchases for an account (set after a second refund)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ blocked: z.boolean() }) } },
    },
  },
  responses: {
    200: {
      description: 'Saved',
      content: { 'application/json': { schema: z.object({ blocked: z.boolean() }) } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('User not found'),
  },
});

adminPlayRefundsRouter.openapi(blockRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { blocked } = c.req.valid('json');
  if (!(await findActiveUserById(id))) throw Errors.notFound('User not found');
  await setPurchasesBlocked(id, blocked);
  await logAdminAction(adminPhoneOf(c), 'POST /v1/admin/users/:id/purchases-block', {
    id,
    blocked,
  });
  return c.json({ blocked }, 200);
});
