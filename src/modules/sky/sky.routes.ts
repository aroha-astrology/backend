import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin, requireUser } from '../../middleware/auth.js';
import { requireAnyFeature } from '../../middleware/feature.js';
import { Errors } from '../../lib/errors.js';
import { logAdminAction } from '../admin/admin.repo.js';
import { MAX_POST_CHARS, MAX_REPORT_REASON_CHARS } from './sky-rules.js';
import {
  adminDecide,
  adminQueue,
  blockAuthor,
  createPost,
  getRoom,
  removeOwnPost,
  reportPost,
  unblockAuthor,
} from './sky.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('SkyError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose: the shapes are documented on the service types. */
const Json = z.record(z.string(), z.any());
const IdParams = z.object({ id: z.string().uuid() });

export const skyRouter = new OpenAPIHono();

const skyOn = requireAnyFeature(['community.sameSky']);

const roomRoute = createRoute({
  method: 'get',
  path: '/sky',
  tags: ['Same Sky'],
  summary: "The reader's Same Sky room (their natal Moon sign) and its posts",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, skyOn] as const,
  request: { query: z.object({ before: z.string().datetime().optional() }) },
  responses: {
    200: { description: 'The room', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

skyRouter.openapi(roomRoute, async (c) => {
  const { before } = c.req.valid('query');
  const room = await getRoom(c.get('user').id, { before: before ? new Date(before) : undefined });
  return c.json(room as unknown as Record<string, unknown>, 200);
});

const postRoute = createRoute({
  method: 'post',
  path: '/sky/posts',
  tags: ['Same Sky'],
  summary: 'Write a post in the reader\'s room (checked first; it may wait for a person)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, skyOn] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ body: z.string().max(MAX_POST_CHARS * 4) }) } },
    },
  },
  responses: {
    200: { description: 'The post and what the check decided', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    409: errorResponse('NO_ROOM — the reader has no Moon sign yet'),
    422: errorResponse('Not a valid post'),
    429: errorResponse('SKY_DAILY_LIMIT'),
  },
});

skyRouter.openapi(postRoute, async (c) => {
  const result = await createPost(c.get('user').id, c.req.valid('json').body);
  return c.json(result as unknown as Record<string, unknown>, 200);
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/sky/posts/{id}',
  tags: ['Same Sky'],
  summary: 'Delete one of the reader\'s own posts',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, skyOn] as const,
  request: { params: IdParams },
  responses: {
    200: { description: 'Deleted', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('Not one of the reader\'s posts'),
  },
});

skyRouter.openapi(deleteRoute, async (c) => {
  const ok = await removeOwnPost(c.get('user').id, c.req.valid('param').id);
  if (!ok) throw Errors.notFound('Post not found');
  return c.json({ ok: true }, 200);
});

const reportRoute = createRoute({
  method: 'post',
  path: '/sky/posts/{id}/report',
  tags: ['Same Sky'],
  summary: 'Report a post; it stops showing for the reporter at once',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, skyOn] as const,
  request: {
    params: IdParams,
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ reason: z.string().max(MAX_REPORT_REASON_CHARS) }) } },
    },
  },
  responses: {
    200: { description: 'Reported', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('No such post in the reader\'s room'),
    409: errorResponse('OWN_POST'),
  },
});

skyRouter.openapi(reportRoute, async (c) => {
  const outcome = await reportPost(c.get('user').id, c.req.valid('param').id, c.req.valid('json').reason);
  return c.json({ ok: true, ...outcome }, 200);
});

const blockRoute = createRoute({
  method: 'post',
  path: '/sky/posts/{id}/block',
  tags: ['Same Sky'],
  summary: 'Block the author of a post: none of their posts show again',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, skyOn] as const,
  request: { params: IdParams },
  responses: {
    200: { description: 'Blocked', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('No such post'),
    409: errorResponse('OWN_POST'),
  },
});

skyRouter.openapi(blockRoute, async (c) => {
  await blockAuthor(c.get('user').id, c.req.valid('param').id);
  return c.json({ ok: true }, 200);
});

const unblockRoute = createRoute({
  method: 'delete',
  path: '/sky/posts/{id}/block',
  tags: ['Same Sky'],
  summary: 'Undo a block (by any post of that author)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, skyOn] as const,
  request: { params: IdParams },
  responses: {
    200: { description: 'Unblocked', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('No such post'),
  },
});

skyRouter.openapi(unblockRoute, async (c) => {
  await unblockAuthor(c.get('user').id, c.req.valid('param').id);
  return c.json({ ok: true }, 200);
});

/* -------------------------------------------------------------------------- */
/* Admin queue                                                                 */
/* -------------------------------------------------------------------------- */

/** Same identity-from-already-validated-token shortcut as the other admin routers. */
function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

const queueRoute = createRoute({
  method: 'get',
  path: '/admin/sky/queue',
  tags: ['Admin'],
  summary: 'Same Sky posts waiting for a decision, and approved posts that were reported',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: { description: 'The queue', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

skyRouter.openapi(queueRoute, async (c) => c.json((await adminQueue()) as unknown as Record<string, unknown>, 200));

for (const action of ['approve', 'reject', 'remove'] as const) {
  const route = createRoute({
    method: 'post',
    path: `/admin/sky/posts/{id}/${action}`,
    tags: ['Admin'],
    summary: `${action[0]!.toUpperCase()}${action.slice(1)} one Same Sky post`,
    security: [{ bearerAuth: [] }],
    middleware: [requireAdmin] as const,
    request: { params: IdParams },
    responses: {
      200: { description: 'Done', content: { 'application/json': { schema: Json } } },
      401: errorResponse('Unauthorized'),
      403: errorResponse('Admin access required'),
      404: errorResponse('No such post'),
    },
  });
  skyRouter.openapi(route, async (c) => {
    const id = c.req.valid('param').id;
    await adminDecide(id, action, adminPhoneOf(c));
    await logAdminAction(adminPhoneOf(c), `POST /v1/admin/sky/posts/${id}/${action}`, {});
    return c.json({ ok: true }, 200);
  });
}
