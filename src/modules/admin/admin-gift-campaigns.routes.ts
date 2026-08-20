import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import {
  GiftCampaignsResponseSchema,
  CreateGiftCampaignBodySchema,
  GiftCampaignRowSchema,
  GiftCampaignIdParamSchema,
  PreviewAudienceBodySchema,
  AudiencePreviewResponseSchema,
} from './admin-gift-campaigns.schemas.js';
import { logAdminAction } from './admin.repo.js';
import { listGiftCampaigns, getGiftCampaignById } from '../gift-campaigns/gift-campaigns.repo.js';
import {
  createCampaign,
  previewAudience,
  cancelCampaign,
  sendCampaignNow,
} from '../gift-campaigns/gift-campaigns.service.js';
import { Errors } from '../../lib/errors.js';
import type { GiftCampaignRow } from '../../db/schema.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('AdminGiftCampaignsError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const adminGiftCampaignsRouter = new OpenAPIHono();

/** Same identity-from-already-validated-token shortcut as admin-groups.routes.ts's own adminPhoneOf. */
function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

async function auditRead(
  c: { get: (key: 'firebaseToken') => { phone_number?: string } },
  route: string,
  params: unknown,
): Promise<void> {
  await logAdminAction(adminPhoneOf(c), route, params).catch((err: unknown) =>
    logger.warn({ err, route }, 'admin_audit_log insert failed'),
  );
}

function toDto(row: GiftCampaignRow) {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    amountPaise: row.amountPaise,
    audienceMaxBalancePaise: row.audienceMaxBalancePaise,
    deliveryMode: row.deliveryMode,
    claimWindowDays: row.claimWindowDays,
    creditExpiryDays: row.creditExpiryDays,
    scheduledSendAt: row.scheduledSendAt?.toISOString() ?? null,
    status: row.status,
    validFrom: row.validFrom?.toISOString() ?? null,
    validUntil: row.validUntil?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* GET /admin/gift-campaigns                                                  */
/* -------------------------------------------------------------------------- */

const listRoute = createRoute({
  method: 'get',
  path: '/admin/gift-campaigns',
  tags: ['Admin'],
  summary: 'List every gift campaign, newest first',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Campaign list',
      content: { 'application/json': { schema: GiftCampaignsResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGiftCampaignsRouter.openapi(listRoute, async (c) => {
  const rows = await listGiftCampaigns();
  await auditRead(c, 'GET /v1/admin/gift-campaigns', {});
  return c.json({ campaigns: rows.map(toDto).reverse() }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /admin/gift-campaigns                                                 */
/* -------------------------------------------------------------------------- */

const createGiftCampaignRoute = createRoute({
  method: 'post',
  path: '/admin/gift-campaigns',
  tags: ['Admin'],
  summary: 'Create a gift campaign (draft, or scheduled if scheduledSendAt is given)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateGiftCampaignBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Created campaign',
      content: { 'application/json': { schema: GiftCampaignRowSchema } },
    },
    400: errorResponse('Invalid amount or missing claim window for a self-claim campaign'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGiftCampaignsRouter.openapi(createGiftCampaignRoute, async (c) => {
  const body = c.req.valid('json');
  const row = await createCampaign(
    { ...body, scheduledSendAt: body.scheduledSendAt ? new Date(body.scheduledSendAt) : null },
    adminPhoneOf(c),
  );
  return c.json(toDto(row), 200);
});

/* -------------------------------------------------------------------------- */
/* POST /admin/gift-campaigns/preview                                        */
/* -------------------------------------------------------------------------- */

const previewRoute = createRoute({
  method: 'post',
  path: '/admin/gift-campaigns/preview',
  tags: ['Admin'],
  summary: 'Dry-run: eligible/pushable audience size and total cost for a not-yet-created campaign',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: PreviewAudienceBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Audience preview',
      content: { 'application/json': { schema: AudiencePreviewResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGiftCampaignsRouter.openapi(previewRoute, async (c) => {
  const { amountPaise, audienceMaxBalancePaise } = c.req.valid('json');
  const preview = await previewAudience(amountPaise, audienceMaxBalancePaise);
  return c.json(preview, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /admin/gift-campaigns/{id}/send                                      */
/* -------------------------------------------------------------------------- */

const sendRoute = createRoute({
  method: 'post',
  path: '/admin/gift-campaigns/{id}/send',
  tags: ['Admin'],
  summary: 'Send a draft or scheduled campaign immediately',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: GiftCampaignIdParamSchema },
  responses: {
    200: {
      description: 'Sent campaign',
      content: { 'application/json': { schema: GiftCampaignRowSchema } },
    },
    404: errorResponse('Unknown campaign'),
    409: errorResponse('Already sent or canceled'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGiftCampaignsRouter.openapi(sendRoute, async (c) => {
  const { id } = c.req.valid('param');
  const row = await sendCampaignNow(id, adminPhoneOf(c));
  return c.json(toDto(row), 200);
});

/* -------------------------------------------------------------------------- */
/* DELETE /admin/gift-campaigns/{id}                                         */
/* -------------------------------------------------------------------------- */

const cancelRoute = createRoute({
  method: 'delete',
  path: '/admin/gift-campaigns/{id}',
  tags: ['Admin'],
  summary: 'Cancel a draft or scheduled campaign',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: GiftCampaignIdParamSchema },
  responses: {
    204: { description: 'Canceled' },
    404: errorResponse('Unknown campaign'),
    409: errorResponse('Already sent or canceled'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGiftCampaignsRouter.openapi(cancelRoute, async (c) => {
  const { id } = c.req.valid('param');
  const existing = await getGiftCampaignById(id);
  if (!existing) throw Errors.notFound('Unknown campaign');
  await cancelCampaign(id, adminPhoneOf(c));
  return c.body(null, 204);
});
