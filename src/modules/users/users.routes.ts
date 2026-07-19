import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import crypto from 'node:crypto';
import { requireUser } from '../../middleware/auth.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { updateUserById } from './users.repo.js';
import {
  UpdateMeBodySchema,
  UserSchema,
  NotificationSchema,
  TransactionSchema,
} from './users.schemas.js';
import {
  deleteMe,
  toUserDto,
  updateMe,
  unlockHouse,
  unlockGemstone,
  getNotifications,
  getTransactions,
  markNotificationsRead,
} from './users.service.js';

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
  summary: 'Unlock a house using wallet balance',
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
    409: errorResponse('Conflict (Insufficient balance or already unlocked)'),
    422: errorResponse('Validation failed'),
  },
});

const unlockGemstoneRoute = createRoute({
  method: 'post',
  path: '/me/unlock-gemstone',
  tags: ['Users'],
  summary: 'Unlock the full gemstone report using wallet balance (one-time, whole report)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Success',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    401: errorResponse('Unauthorized'),
    409: errorResponse('Conflict (Insufficient balance or already unlocked)'),
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

const getNotificationsRoute = createRoute({
  method: 'get',
  path: '/me/notifications',
  tags: ['Users'],
  summary: 'Get user notifications',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'List of notifications',
      content: { 'application/json': { schema: z.array(NotificationSchema) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

const markNotificationsReadRoute = createRoute({
  method: 'patch',
  path: '/me/notifications/read',
  tags: ['Users'],
  summary: 'Mark all user notifications as read',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Success',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

const getTransactionsRoute = createRoute({
  method: 'get',
  path: '/me/transactions',
  tags: ['Users'],
  summary: 'Get user wallet transactions',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'List of transactions',
      content: { 'application/json': { schema: z.array(TransactionSchema) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

usersRouter.openapi(getMeRoute, async (c) => {
  const user = c.get('user');

  // Lazy initialization of referralCode for existing users
  if (!user.referralCode) {
    user.referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    await updateUserById(user.id, { referralCode: user.referralCode });
  }

  const profile = await resolveActiveProfileContext(user);
  return c.json(toUserDto(user, profile), 200);
});

usersRouter.openapi(patchMeRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const sourceIp =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? null;
  const userAgent = c.req.header('user-agent') ?? null;
  const next = await updateMe(user.id, body, { sourceIp, userAgent });
  const profile = await resolveActiveProfileContext(next);
  return c.json(toUserDto(next, profile), 200);
});

usersRouter.openapi(deleteMeRoute, async (c) => {
  const user = c.get('user');
  await deleteMe(user.id);
  return c.body(null, 204);
});

usersRouter.openapi(unlockHouseRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const profile = await resolveActiveProfileContext(user);
  await unlockHouse(user.id, profile.birthProfileId, body.houseNumber);
  return c.json({ success: true }, 200);
});

usersRouter.openapi(unlockGemstoneRoute, async (c) => {
  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  await unlockGemstone(user.id, profile.birthProfileId);
  return c.json({ success: true }, 200);
});

usersRouter.openapi(getNotificationsRoute, async (c) => {
  const user = c.get('user');
  const notifications = await getNotifications(user.id);
  return c.json(notifications, 200);
});

usersRouter.openapi(markNotificationsReadRoute, async (c) => {
  const user = c.get('user');
  await markNotificationsRead(user.id);
  return c.json({ success: true }, 200);
});

usersRouter.openapi(getTransactionsRoute, async (c) => {
  const user = c.get('user');
  const transactions = await getTransactions(user.id);
  return c.json(transactions, 200);
});
