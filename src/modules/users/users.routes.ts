import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { UpdateMeBodySchema, UserSchema } from './users.schemas.js';
import { deleteMe, toUserDto, updateMe, unlockHouse } from './users.service.js';

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

export const usersRouter = new OpenAPIHono();

const getMeRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Users'],
  summary: 'Get current user profile',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'The current user',
      content: { 'application/json': { schema: UserSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

const patchMeRoute = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['Users'],
  summary: 'Update current user profile',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: UpdateMeBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'The updated user',
      content: { 'application/json': { schema: UserSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Validation failed'),
  },
});

const unlockHouseRoute = createRoute({
  method: 'post',
  path: '/me/unlock-house',
  tags: ['Users'],
  summary: 'Unlock a house using credits',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': { schema: z.object({ houseNumber: z.number().int().min(1).max(12) }) },
      },
    },
  },
  responses: {
    200: {
      description: 'Success',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    401: errorResponse('Unauthorized'),
    409: errorResponse('Conflict (Insufficient credits or already unlocked)'),
    422: errorResponse('Validation failed'),
  },
});

const deleteMeRoute = createRoute({
  method: 'delete',
  path: '/me',
  tags: ['Users'],
  summary: 'Soft-delete the current user account',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    204: { description: 'Deleted' },
    401: errorResponse('Unauthorized'),
  },
});

usersRouter.openapi(getMeRoute, (c) => {
  const user = c.get('user');
  return c.json(toUserDto(user), 200);
});

usersRouter.openapi(patchMeRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const sourceIp =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? null;
  const userAgent = c.req.header('user-agent') ?? null;
  const next = await updateMe(user.id, body, { sourceIp, userAgent });
  return c.json(toUserDto(next), 200);
});

usersRouter.openapi(deleteMeRoute, async (c) => {
  const user = c.get('user');
  await deleteMe(user.id);
  return c.body(null, 204);
});

usersRouter.openapi(unlockHouseRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  await unlockHouse(user.id, body.houseNumber);
  return c.json({ success: true }, 200);
});
