// Owner 2026-10-24: old reports rebuilt free on open; this page shows how many are waiting/rebuilt/failed and which model wrote them, and lets the owner retry failures; the on/off switch itself lives on Admin -> Features (reports.refreshOldOnOpen).
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { logAdminAction } from './admin.repo.js';
import { getReportRefreshStatus, retryFailedReportRefreshes } from '../reports/reports.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('AdminReportRefreshError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const adminReportRefreshRouter = new OpenAPIHono();

function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

const AdminReportRefreshSchema = z
  .object({
    switchOn: z.boolean(),
    model: z.string().nullable(),
    contentVersion: z.number().int(),
    waiting: z.number().int(),
    running: z.number().int(),
    failed: z.number().int(),
    rebuilt: z.number().int(),
    byModel: z.array(z.object({ model: z.string(), count: z.number().int() })),
  })
  .openapi('AdminReportRefresh');

const getRoute = createRoute({
  method: 'get',
  path: '/admin/report-refresh',
  tags: ['Admin'],
  summary: 'Report refresh status — waiting/rebuilt/failed counts and model breakdown',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Refresh status',
      content: { 'application/json': { schema: AdminReportRefreshSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminReportRefreshRouter.openapi(getRoute, async (c) => {
  const status = await getReportRefreshStatus();
  return c.json(status, 200);
});

const retryRoute = createRoute({
  method: 'post',
  path: '/admin/report-refresh/retry-failed',
  tags: ['Admin'],
  summary: 'Reset failed report refresh attempts so they can be rebuilt again',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Number of rows reset',
      content: { 'application/json': { schema: z.object({ reset: z.number().int() }) } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminReportRefreshRouter.openapi(retryRoute, async (c) => {
  const reset = await retryFailedReportRefreshes();
  await logAdminAction(adminPhoneOf(c), 'POST /v1/admin/report-refresh/retry-failed', { reset });
  return c.json({ reset }, 200);
});
