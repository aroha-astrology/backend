import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import {
  LanguageQuerySchema,
  PurchaseReportBodySchema,
  PurchaseReportResponseSchema,
  ReportCatalogueResponseSchema,
  ReportFailedSchema,
  ReportGeneratingSchema,
  ReportIdParamSchema,
  ReportReadySchema,
} from './reports.schemas.js';
import { getReportCatalogueForUser, getReportForUser, purchaseReport } from './reports.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('ReportsError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const reportsRouter = new OpenAPIHono();

reportsRouter.use('*', requireUser);

const listRoute = createRoute({
  method: 'get',
  path: '/reports',
  tags: ['Reports'],
  summary: "The report catalogue merged with the current user's purchases",
  description:
    'Every catalogue entry includes its live enabled/price (resolved server-side from the admin ' +
    'feature-flag overrides — never hardcode a price client-side) plus this user\'s own purchases ' +
    'for that key, scoped to the currently active birth profile, so the client can render ' +
    '"buy" vs. "tap to view" per report.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Catalogue merged with purchases',
      content: { 'application/json': { schema: ReportCatalogueResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

reportsRouter.openapi(listRoute, async (c) => {
  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const catalogue = await getReportCatalogueForUser(user, profile.birthProfileId);
  return c.json({ reports: catalogue }, 200);
});

const purchaseRoute = createRoute({
  method: 'post',
  path: '/reports/purchase',
  tags: ['Reports'],
  summary: 'Purchase a report — one-time, one/many months of a monthly report, or kundli_milan with a partner',
  description:
    'Debits the wallet server-side (price is never trusted from the client) and kicks off background ' +
    'generation per purchased row — poll GET /reports/{id} for each id returned here. A report key with ' +
    'no registered generator yet (see the reports catalogue doc) is still purchasable; it will fail and ' +
    'auto-refund shortly after, visible via GET /reports/{id}.',
  security: [{ bearerAuth: [] }],
  request: {
    body: { required: true, content: { 'application/json': { schema: PurchaseReportBodySchema } } },
  },
  responses: {
    200: {
      description: 'Purchased — one summary per row (one for one-time/kundli_milan, one per month for a bundle)',
      content: { 'application/json': { schema: PurchaseReportResponseSchema } },
    },
    400: errorResponse('Validation failed — unknown key, missing/unexpected months, or missing/unexpected partner'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('FEATURE_DISABLED'),
    404: errorResponse('Unknown report key'),
    409: errorResponse('INSUFFICIENT_CREDITS'),
  },
});

reportsRouter.openapi(purchaseRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const result = await purchaseReport(user, body);
  return c.json(result, 200);
});

const getOneRoute = createRoute({
  method: 'get',
  path: '/reports/{id}',
  tags: ['Reports'],
  summary: 'Get a single purchased report (poll target)',
  description:
    'Deterministic `scores` are always recomputed fresh from the live chart, never trusted from the ' +
    'persisted row — so a future scoring-rule fix applies retroactively with no backfill. `sections` are ' +
    'the cached AI narrative, translated and cached on first request for a non-English `language`.',
  security: [{ bearerAuth: [] }],
  request: { params: ReportIdParamSchema, query: LanguageQuerySchema },
  responses: {
    200: {
      description: 'Ready (with sections + scores) or failed (with error)',
      content: { 'application/json': { schema: z.union([ReportReadySchema, ReportFailedSchema]) } },
    },
    202: {
      description: 'Still generating — poll again',
      content: { 'application/json': { schema: ReportGeneratingSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found (also returned for a report owned by another user)'),
  },
});

reportsRouter.openapi(getOneRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const { language } = c.req.valid('query');
  const dto = await getReportForUser(id, user.id, language || 'en');
  if (dto.status === 'generating') return c.json(dto, 202);
  return c.json(dto, 200);
});
