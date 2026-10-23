import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireAnyFeature } from '../../middleware/feature.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { Errors } from '../../lib/errors.js';
import { isFeatureOnGlobally } from '../features/features.service.js';
import { INVITE_CODE_PATTERN } from './circles-rules.js';
import {
  acceptInvite,
  addProfileMember,
  createInvite,
  getCircle,
  previewInvite,
  removeMember,
} from './circles.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('CirclesError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose: the shapes are documented on the service types. */
const Json = z.record(z.string(), z.any());

const CodeParams = z.object({
  code: z.string().regex(INVITE_CODE_PATTERN, 'Not an invite code'),
});

/* -------------------------------------------------------------------------- */
/* Signed-in routes                                                            */
/* -------------------------------------------------------------------------- */

export const circlesRouter = new OpenAPIHono();

const circlesOn = requireAnyFeature(['circles.circles']);

const listRoute = createRoute({
  method: 'get',
  path: '/circles',
  tags: ['Circles'],
  summary: 'The reader\'s Cosmic Circle with each member\'s pulse for today',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, circlesOn] as const,
  responses: {
    200: { description: 'The circle', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

circlesRouter.openapi(listRoute, async (c) => {
  const circle = await getCircle(c.get('user'));
  return c.json(circle as unknown as Record<string, unknown>, 200);
});

const addRoute = createRoute({
  method: 'post',
  path: '/circles/members',
  tags: ['Circles'],
  summary: 'Put one of the reader\'s saved profiles in the circle (the first person pays signup stage 3)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, circlesOn] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ profileId: z.string().uuid() }) } },
    },
  },
  responses: {
    200: { description: 'The new member', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('Not one of the reader\'s saved profiles'),
    409: errorResponse('CIRCLE_FULL, ALREADY_IN_CIRCLE or THATS_YOU'),
  },
});

circlesRouter.openapi(addRoute, async (c) => {
  const member = await addProfileMember(c.get('user'), c.req.valid('json').profileId);
  return c.json(member as unknown as Record<string, unknown>, 200);
});

const removeRoute = createRoute({
  method: 'delete',
  path: '/circles/members/{id}',
  tags: ['Circles'],
  summary: 'Take someone out of the circle (the saved profile stays)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, circlesOn] as const,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Removed', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('Not in the circle'),
  },
});

circlesRouter.openapi(removeRoute, async (c) => {
  await removeMember(c.get('user'), c.req.valid('param').id);
  return c.json({ removed: true }, 200);
});

const inviteOn = requireAnyFeature(['circles.invite']);

const createInviteRoute = createRoute({
  method: 'post',
  path: '/circles/invites',
  tags: ['Circles'],
  summary: 'Make a one-use invite link, /circle/invite/<code>, good for 14 days',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, circlesOn, inviteOn] as const,
  responses: {
    200: { description: 'The invite', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('TOO_MANY_OPEN_INVITES'),
  },
});

circlesRouter.openapi(createInviteRoute, async (c) => {
  const invite = await createInvite(c.get('user'));
  return c.json(invite as unknown as Record<string, unknown>, 200);
});

const acceptRoute = createRoute({
  method: 'post',
  path: '/circles/invites/{code}/accept',
  tags: ['Circles'],
  summary: 'Accept an invite: the two accounts join each other\'s circles, no profile slot used',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, circlesOn, inviteOn] as const,
  request: { params: CodeParams },
  responses: {
    200: { description: 'Linked', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('Not a valid invite'),
    409: errorResponse('INVITE_USED, INVITE_EXPIRED, CIRCLE_FULL or THATS_YOU'),
  },
});

circlesRouter.openapi(acceptRoute, async (c) => {
  const result = await acceptInvite(c.get('user'), c.req.valid('param').code);
  return c.json(result as unknown as Record<string, unknown>, 200);
});

/* -------------------------------------------------------------------------- */
/* Public: the landing card behind the invite link                             */
/* -------------------------------------------------------------------------- */

/** Mounted before the routers that guard everything under /v1 with a sign-in. */
export const circlesPublicRouter = new OpenAPIHono();

const previewRateLimit = rateLimiter({ windowMs: 60_000, max: 30, name: 'circle-invite-preview' });

const previewRoute = createRoute({
  method: 'get',
  path: '/public/circle-invites/{code}',
  tags: ['Circles'],
  summary: 'Who invited you and whether the link still works (public; first name only)',
  middleware: [previewRateLimit] as const,
  request: { params: CodeParams },
  responses: {
    200: { description: 'The invite card', content: { 'application/json': { schema: Json } } },
    404: errorResponse('Not a valid invite'),
  },
});

circlesPublicRouter.openapi(previewRoute, async (c) => {
  if (!(await isFeatureOnGlobally('circles.invite'))) throw Errors.notFound('Not available yet');
  const preview = await previewInvite(c.req.valid('param').code);
  return c.json(preview as unknown as Record<string, unknown>, 200);
});
