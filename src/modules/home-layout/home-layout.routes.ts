import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin, requireUser } from '../../middleware/auth.js';
import { Errors } from '../../lib/errors.js';
import { logAdminAction } from '../admin/admin.repo.js';
import {
  HomeLayoutDocSchema,
  HomeLayoutForAppSchema,
  StoredHomeLayoutSchema,
} from './home-layout.schemas.js';
import {
  discardDraft,
  layoutForUser,
  publishDraft,
  readStoredLayout,
  saveDraft,
  undoPublish,
} from './home-layout.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('HomeLayoutError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const homeLayoutRouter = new OpenAPIHono();

/** Same identity-from-already-validated-token shortcut as the other admin routers. */
function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

const appRoute = createRoute({
  method: 'get',
  path: '/home-layout',
  tags: ['Home'],
  summary: "The owner's card order for Home, or null to keep the built-in order",
  description:
    'Answers null while `experience.homeLayout` is off for the user. When the switch is on for ' +
    'everyone, everyone gets the published layout. When it is on only for an admin user group, ' +
    'those members get the draft, so an order can be tried before it is published.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: { description: 'The layout', content: { 'application/json': { schema: HomeLayoutForAppSchema } } },
    401: errorResponse('Unauthorized'),
  },
});

homeLayoutRouter.openapi(appRoute, async (c) => {
  const user = c.get('user');
  return c.json(await layoutForUser(user.id), 200);
});

const adminGetRoute = createRoute({
  method: 'get',
  path: '/admin/home-layout',
  tags: ['Admin'],
  summary: 'The draft, the published layout and the one before it',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: { description: 'Stored layouts', content: { 'application/json': { schema: StoredHomeLayoutSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

homeLayoutRouter.openapi(adminGetRoute, async (c) => c.json(await readStoredLayout(), 200));

const adminPutRoute = createRoute({
  method: 'put',
  path: '/admin/home-layout/draft',
  tags: ['Admin'],
  summary: 'Save the draft layout (seen only by the admin test group until published)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { body: { required: true, content: { 'application/json': { schema: HomeLayoutDocSchema } } } },
  responses: {
    200: { description: 'Stored layouts', content: { 'application/json': { schema: StoredHomeLayoutSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    422: errorResponse('Not a valid layout'),
  },
});

homeLayoutRouter.openapi(adminPutRoute, async (c) => {
  const doc = c.req.valid('json');
  const stored = await saveDraft(doc, adminPhoneOf(c));
  await logAdminAction(adminPhoneOf(c), 'PUT /v1/admin/home-layout/draft', {});
  return c.json(stored, 200);
});

const discardRoute = createRoute({
  method: 'delete',
  path: '/admin/home-layout/draft',
  tags: ['Admin'],
  summary: 'Throw the draft away',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: { description: 'Stored layouts', content: { 'application/json': { schema: StoredHomeLayoutSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

homeLayoutRouter.openapi(discardRoute, async (c) => {
  const stored = await discardDraft(adminPhoneOf(c));
  await logAdminAction(adminPhoneOf(c), 'DELETE /v1/admin/home-layout/draft', {});
  return c.json(stored, 200);
});

const publishRoute = createRoute({
  method: 'post',
  path: '/admin/home-layout/publish',
  tags: ['Admin'],
  summary: 'Publish the draft: it becomes the layout everyone sees (once the switch is on for everyone)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: { description: 'Stored layouts', content: { 'application/json': { schema: StoredHomeLayoutSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    409: errorResponse('There is no draft to publish'),
  },
});

homeLayoutRouter.openapi(publishRoute, async (c) => {
  const stored = await publishDraft(adminPhoneOf(c));
  if (!stored) throw Errors.conflict('There is no draft to publish');
  await logAdminAction(adminPhoneOf(c), 'POST /v1/admin/home-layout/publish', {});
  return c.json(stored, 200);
});

const undoRoute = createRoute({
  method: 'post',
  path: '/admin/home-layout/undo',
  tags: ['Admin'],
  summary: 'Go back to the layout that was published before the last publish',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: { description: 'Stored layouts', content: { 'application/json': { schema: StoredHomeLayoutSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    409: errorResponse('There is nothing to go back to'),
  },
});

homeLayoutRouter.openapi(undoRoute, async (c) => {
  const stored = await undoPublish(adminPhoneOf(c));
  if (!stored) throw Errors.conflict('There is nothing to go back to');
  await logAdminAction(adminPhoneOf(c), 'POST /v1/admin/home-layout/undo', {});
  return c.json(stored, 200);
});
