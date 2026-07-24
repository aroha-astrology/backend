import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { logAdminAction } from './admin.repo.js';
import {
  getDeviceTokenStats,
  inspectUserByPhone,
  notifyUserByPhone,
  startRegeneration,
} from './admin.service.js';
import {
  AdminDeviceTokenStatsSchema,
  AdminNotifyBodySchema,
  AdminNotifyResponseSchema,
  AdminRegenerateBodySchema,
  AdminRegenerateResponseSchema,
  AdminUserInspectionSchema,
  PhoneParamSchema,
} from './admin.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('Error');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const adminRouter = new OpenAPIHono();

const inspectRoute = createRoute({
  method: 'get',
  path: '/admin/users/{phone}/inspect',
  tags: ['Admin'],
  summary: 'Full diagnostic dump for one user by phone (profile, kundli(s), horoscopes)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: PhoneParamSchema },
  responses: {
    200: {
      description: 'User diagnostic dump',
      content: { 'application/json': { schema: AdminUserInspectionSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    404: errorResponse('No user found with this phone number'),
  },
});

adminRouter.openapi(inspectRoute, async (c) => {
  const { phone } = c.req.valid('param');
  await logAdminAction({
    adminFirebaseUid: c.get('user').firebaseUid,
    route: 'GET /v1/admin/users/:phone/inspect',
    params: { phone },
  });
  const dump = await inspectUserByPhone(phone);
  return c.json(dump, 200);
});

const regenerateRoute = createRoute({
  method: 'post',
  path: '/admin/users/{phone}/regenerate',
  tags: ['Admin'],
  summary: 'Trigger content regeneration for one user by phone (fire-and-forget)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: PhoneParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: AdminRegenerateBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Regeneration started',
      content: { 'application/json': { schema: AdminRegenerateResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    404: errorResponse('No user found with this phone number'),
    422: errorResponse('Validation failed'),
  },
});

adminRouter.openapi(
  regenerateRoute,
  async (c) => {
    const { phone } = c.req.valid('param');
    const { category } = c.req.valid('json');
    await logAdminAction({
      adminFirebaseUid: c.get('user').firebaseUid,
      route: 'POST /v1/admin/users/:phone/regenerate',
      params: { phone, category },
    });
    await startRegeneration(phone, category);
    return c.json({ status: 'started' as const }, 200);
  },
  // @hono/zod-openapi's own default (no hook passed) resolves a failed request
  // validation to a plain `c.json(result, 400)` — it never throws, so it
  // never reaches errorHandler's `AppError`/`ZodError` branches. This route's
  // documented contract above is 422, so map validation failures to that
  // shape explicitly, same as palm-photo.routes.ts's uploadRoute.
  (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'UNPROCESSABLE',
            message: 'Validation failed',
            details: result.error.flatten(),
          },
        },
        422,
      );
    }
  },
);

const notifyRoute = createRoute({
  method: 'post',
  path: '/admin/users/{phone}/notify',
  tags: ['Admin'],
  summary: "Send a single targeted push notification to one user's registered device(s)",
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: PhoneParamSchema,
    body: { required: true, content: { 'application/json': { schema: AdminNotifyBodySchema } } },
  },
  responses: {
    200: {
      description: 'Notification result',
      content: { 'application/json': { schema: AdminNotifyResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    404: errorResponse('No user found with this phone number'),
    422: errorResponse('Validation failed'),
  },
});

adminRouter.openapi(notifyRoute, async (c) => {
  const { phone } = c.req.valid('param');
  const { title, body } = c.req.valid('json');
  await logAdminAction({
    adminFirebaseUid: c.get('user').firebaseUid,
    route: 'POST /v1/admin/users/:phone/notify',
    params: { phone, title },
  });
  const result = await notifyUserByPhone(phone, title, body);
  return c.json(result, 200);
});

const deviceTokenStatsRoute = createRoute({
  method: 'get',
  path: '/admin/device-tokens/stats',
  tags: ['Admin'],
  summary: 'Device-token counts by platform (active/unrevoked)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Device token stats',
      content: { 'application/json': { schema: AdminDeviceTokenStatsSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
  },
});

adminRouter.openapi(deviceTokenStatsRoute, async (c) => {
  await logAdminAction({
    adminFirebaseUid: c.get('user').firebaseUid,
    route: 'GET /v1/admin/device-tokens/stats',
    params: null,
  });
  const stats = await getDeviceTokenStats();
  return c.json(stats, 200);
});
