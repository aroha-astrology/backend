import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import {
  DateRangeQuerySchema,
  OverviewResponseSchema,
  AdminFeaturesResponseSchema,
  UpdateFeatureBodySchema,
  AdminFeatureRowSchema,
  AdminUsersQuerySchema,
  AdminUsersResponseSchema,
  AdminUserIdParamSchema,
  AdjustWalletBodySchema,
  AdjustWalletResponseSchema,
  AdminReportsResponseSchema,
} from './admin.schemas.js';
import { resolveDateRangePreset, logAdminAction } from './admin.repo.js';
import {
  getOverview,
  listFeaturesForAdmin,
  updateFeature,
  searchUsers,
  adjustWallet,
  getReportsBreakdown,
} from './admin.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('AdminError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const adminRouter = new OpenAPIHono();

/**
 * `requireAdmin` is applied per-route via each `createRoute`'s own
 * `middleware: [requireAdmin]` (matching the idiom already used elsewhere,
 * e.g. astro.routes.ts's `[requireUser, llmRateLimit, requireConsent]`) —
 * deliberately NOT a router-wide `adminRouter.use('*', requireAdmin)`.
 *
 * A router-wide wildcard `.use()` here was tried first and reproducibly
 * broke OTHER, unrelated routers (kundli/horoscope, mounted later in
 * app.ts's `createApp()`) with spurious 403s: mounting a child OpenAPIHono
 * via `app.route(base, child)` and calling `.use('*', mw)` on the CHILD
 * does not reliably scope `mw` to the child's own paths once merged into
 * the parent's route tree — it can end up running for requests matched by
 * routers registered after it. `billingRouter.use('*', requireUser)`
 * already has this same latent issue but it happens to be invisible there
 * (everywhere it leaks to already requires `requireUser` anyway, so an
 * extra harmless re-run doesn't change any response). `requireAdmin`'s
 * stricter 403 made the leak visible. Per-route middleware arrays go
 * through `.openapi()`'s own path-specific registration instead and do not
 * exhibit this problem.
 *
 * Each `createRoute` below repeats the literal `middleware: [requireAdmin]
 * as const` inline rather than referencing one shared constant — a shared
 * `const X = [requireAdmin] as const` loses the contextual typing
 * `createRoute` needs (surfaces as `c.req.valid(...)` losing its schema
 * inference, typed `never`), so this mirrors astro.routes.ts's own
 * inline-literal convention exactly rather than "simplifying" it away.
 */

/**
 * The token claim requireAdmin already validated against ADMIN_PHONE_E164 —
 * safe to treat as the admin's identity for audit logging without
 * re-checking (requireAdmin already 403'd anything that wouldn't reach here).
 */
function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

/**
 * Audit-logs a READ (the two write routes — PUT features, POST wallet —
 * already log through admin.service.ts, alongside the state change itself).
 * Awaited so the log genuinely lands before the response, but never allowed
 * to fail the request — an audit-log hiccup should not turn a working
 * dashboard read into a 500.
 */
async function auditRead(
  c: { get: (key: 'firebaseToken') => { phone_number?: string } },
  route: string,
  params: unknown,
): Promise<void> {
  await logAdminAction(adminPhoneOf(c), route, params).catch((err: unknown) =>
    logger.warn({ err, route }, 'admin_audit_log insert failed'),
  );
}

/* -------------------------------------------------------------------------- */
/* GET /admin/overview                                                        */
/* -------------------------------------------------------------------------- */

const overviewRoute = createRoute({
  method: 'get',
  path: '/admin/overview',
  tags: ['Admin'],
  summary: 'Revenue/analytics overview for a date-range preset',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { query: DateRangeQuerySchema },
  responses: {
    200: {
      description: 'Overview metrics',
      content: { 'application/json': { schema: OverviewResponseSchema } },
    },
    400: errorResponse('Unknown preset or malformed custom from/to'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminRouter.openapi(overviewRoute, async (c) => {
  const { preset, from, to } = c.req.valid('query');
  const range = resolveDateRangePreset(preset, from, to);
  const overview = await getOverview(range, preset);
  await auditRead(c, 'GET /v1/admin/overview', { preset, from, to });
  return c.json(overview, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /admin/features                                                        */
/* -------------------------------------------------------------------------- */

const listFeaturesRoute = createRoute({
  method: 'get',
  path: '/admin/features',
  tags: ['Admin'],
  summary: 'Every feature in FEATURE_REGISTRY merged with its admin override, if any',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Feature list',
      content: { 'application/json': { schema: AdminFeaturesResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminRouter.openapi(listFeaturesRoute, async (c) => {
  const features = await listFeaturesForAdmin();
  await auditRead(c, 'GET /v1/admin/features', {});
  return c.json({ features }, 200);
});

/* -------------------------------------------------------------------------- */
/* PUT /admin/features                                                        */
/* -------------------------------------------------------------------------- */

const updateFeatureRoute = createRoute({
  method: 'put',
  path: '/admin/features',
  tags: ['Admin'],
  summary: 'Toggle/reprice a feature (writes a feature_flags override row)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    body: { required: true, content: { 'application/json': { schema: UpdateFeatureBodySchema } } },
  },
  responses: {
    200: {
      description: 'Updated feature row',
      content: { 'application/json': { schema: AdminFeatureRowSchema } },
    },
    400: errorResponse('Unknown feature key'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminRouter.openapi(updateFeatureRoute, async (c) => {
  const { key, enabled, pricePaise, originalPricePaise } = c.req.valid('json');
  const row = await updateFeature(key, enabled, pricePaise, originalPricePaise, adminPhoneOf(c));
  return c.json(row, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /admin/users                                                           */
/* -------------------------------------------------------------------------- */

const listUsersRoute = createRoute({
  method: 'get',
  path: '/admin/users',
  tags: ['Admin'],
  summary: 'Paginated user search — ILIKE on displayName/email, exact match on phone',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { query: AdminUsersQuerySchema },
  responses: {
    200: {
      description: 'User page',
      content: { 'application/json': { schema: AdminUsersResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminRouter.openapi(listUsersRoute, async (c) => {
  const { q, offset, limit } = c.req.valid('query');
  const page = await searchUsers(q, limit, offset);
  await auditRead(c, 'GET /v1/admin/users', { q, offset, limit });
  return c.json(page, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /admin/users/{id}/wallet                                              */
/* -------------------------------------------------------------------------- */

const adjustWalletRoute = createRoute({
  method: 'post',
  path: '/admin/users/{id}/wallet',
  tags: ['Admin'],
  summary: 'Grant or deduct wallet balance — the web equivalent of the Telegram /money command',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: AdminUserIdParamSchema,
    body: { required: true, content: { 'application/json': { schema: AdjustWalletBodySchema } } },
  },
  responses: {
    200: {
      description: 'New wallet balance',
      content: { 'application/json': { schema: AdjustWalletResponseSchema } },
    },
    400: errorResponse('deltaPaise must be non-zero'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('User not found'),
    409: errorResponse('Deduction would exceed the current balance'),
  },
});

adminRouter.openapi(adjustWalletRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { deltaPaise, note } = c.req.valid('json');
  const result = await adjustWallet(id, deltaPaise, note, adminPhoneOf(c));
  return c.json(result, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /admin/reports                                                         */
/* -------------------------------------------------------------------------- */

const reportsRoute = createRoute({
  method: 'get',
  path: '/admin/reports',
  tags: ['Admin'],
  summary: 'report_unlock spend broken down per report key, for a date-range preset',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { query: DateRangeQuerySchema },
  responses: {
    200: {
      description: 'Per-report spend',
      content: { 'application/json': { schema: AdminReportsResponseSchema } },
    },
    400: errorResponse('Unknown preset or malformed custom from/to'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminRouter.openapi(reportsRoute, async (c) => {
  const { preset, from, to } = c.req.valid('query');
  const range = resolveDateRangePreset(preset, from, to);
  const reports = await getReportsBreakdown(range);
  await auditRead(c, 'GET /v1/admin/reports', { preset, from, to });
  return c.json({ reports }, 200);
});
