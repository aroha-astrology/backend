import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import {
  DeviceTokenSchema,
  IdParamSchema,
  RegisterDeviceTokenBodySchema,
} from './device-tokens.schemas.js';
import {
  registerDeviceToken,
  revokeDeviceToken,
  toDeviceTokenDto,
} from './device-tokens.service.js';

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

export const deviceTokensRouter = new OpenAPIHono();

deviceTokensRouter.use('*', requireUser);

const registerRoute = createRoute({
  method: 'post',
  path: '/device-tokens',
  tags: ['DeviceTokens'],
  summary: "Register or refresh this device's push token",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: RegisterDeviceTokenBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Token registered/refreshed',
      content: { 'application/json': { schema: DeviceTokenSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Validation failed'),
  },
});

const revokeRoute = createRoute({
  method: 'delete',
  path: '/device-tokens/{id}',
  tags: ['DeviceTokens'],
  summary: 'Revoke a device push token (logout)',
  security: [{ bearerAuth: [] }],
  request: { params: IdParamSchema },
  responses: {
    204: { description: 'Revoked' },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
  },
});

deviceTokensRouter.openapi(registerRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const row = await registerDeviceToken(user.id, body);
  return c.json(toDeviceTokenDto(row), 200);
});

deviceTokensRouter.openapi(revokeRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  await revokeDeviceToken(user.id, id);
  return c.body(null, 204);
});
