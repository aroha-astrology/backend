import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireFirebaseToken } from '../../middleware/auth.js';
import { toUserDto } from '../users/users.service.js';
import { establishSession } from './auth.service.js';
import { SessionResponseSchema } from './auth.schemas.js';
import { notifyNewSignup } from '../../lib/notifications/telegram.js';

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

export const authRouter = new OpenAPIHono();

const sessionRoute = createRoute({
  method: 'post',
  path: '/session',
  tags: ['Auth'],
  summary: 'Exchange a Firebase ID token for an application user',
  description:
    'Verifies the Firebase ID token. If no application user exists for the UID, creates one. ' +
    'Safe to call on every app launch — idempotent.',
  security: [{ bearerAuth: [] }],
  middleware: [requireFirebaseToken] as const,
  responses: {
    200: {
      description: 'Existing user returned',
      content: { 'application/json': { schema: SessionResponseSchema } },
    },
    201: {
      description: 'New user created',
      content: { 'application/json': { schema: SessionResponseSchema } },
    },
    401: errorResponse('Missing or invalid ID token'),
  },
});

authRouter.openapi(sessionRoute, async (c) => {
  const token = c.get('firebaseToken');
  const { user, created } = await establishSession(token);

  if (created) {
    void notifyNewSignup({ id: user.id, email: user.email, phone: user.phoneE164 }).catch(() => {});
  }

  const body = { user: toUserDto(user), created };
  return c.json(body, created ? 201 : 200);
});
