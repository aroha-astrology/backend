import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import {
  GeminiKeysResponseSchema,
  GeminiKeyRowSchema,
  AddGeminiKeyBodySchema,
  UpdateGeminiKeyBodySchema,
  MoveGeminiKeyBodySchema,
  GeminiKeyIdParamSchema,
  GeminiKeyTestResponseSchema,
  GeminiKeyDeletedResponseSchema,
} from './admin-gemini-keys.schemas.js';
import { logAdminAction } from './admin.repo.js';
import {
  listGeminiKeys,
  addGeminiKey,
  updateGeminiKey,
  useGeminiKeyFirst,
  moveGeminiKey,
  testGeminiKey,
  deleteGeminiKey,
} from './gemini-keys.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('AdminGeminiKeysError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const adminGeminiKeysRouter = new OpenAPIHono();

/** Same identity-from-already-validated-token shortcut as admin-groups.routes.ts's own adminPhoneOf. */
function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

/* -------------------------------------------------------------------------- */
/* GET /admin/gemini-keys                                                     */
/* -------------------------------------------------------------------------- */

const listRoute = createRoute({
  method: 'get',
  path: '/admin/gemini-keys',
  tags: ['Admin'],
  summary: 'Every Gemini key: free ones, then paid ones in the order they are tried',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: {
      description: 'Key list (secrets shown as their last 4 characters only)',
      content: { 'application/json': { schema: GeminiKeysResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGeminiKeysRouter.openapi(listRoute, async (c) => {
  const keys = await listGeminiKeys();
  await logAdminAction(adminPhoneOf(c), 'GET /v1/admin/gemini-keys', {}).catch((err: unknown) =>
    logger.warn({ err }, 'admin_audit_log insert failed'),
  );
  return c.json({ keys }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /admin/gemini-keys                                                    */
/* -------------------------------------------------------------------------- */

const addRoute = createRoute({
  method: 'post',
  path: '/admin/gemini-keys',
  tags: ['Admin'],
  summary:
    'Add a free or paid Gemini key (stored encrypted; a paid key joins at the end of the order)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    body: { required: true, content: { 'application/json': { schema: AddGeminiKeyBodySchema } } },
  },
  responses: {
    200: {
      description: 'The added key',
      content: { 'application/json': { schema: GeminiKeyRowSchema } },
    },
    400: errorResponse('Not a Gemini key'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    409: errorResponse('Key or name already in the list'),
  },
});

adminGeminiKeysRouter.openapi(addRoute, async (c) => {
  const body = c.req.valid('json');
  return c.json(await addGeminiKey(body, adminPhoneOf(c)), 200);
});

/* -------------------------------------------------------------------------- */
/* PATCH /admin/gemini-keys/:id                                               */
/* -------------------------------------------------------------------------- */

const updateRoute = createRoute({
  method: 'patch',
  path: '/admin/gemini-keys/{id}',
  tags: ['Admin'],
  summary: 'Rename a key, move it between free and paid, or switch it on/off',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: GeminiKeyIdParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: UpdateGeminiKeyBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'The updated key',
      content: { 'application/json': { schema: GeminiKeyRowSchema } },
    },
    400: errorResponse('Would leave no key switched on'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('Key not found'),
    409: errorResponse('Name already taken'),
  },
});

adminGeminiKeysRouter.openapi(updateRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  return c.json(await updateGeminiKey(id, body, adminPhoneOf(c)), 200);
});

/* -------------------------------------------------------------------------- */
/* POST /admin/gemini-keys/:id/use-first                                      */
/* -------------------------------------------------------------------------- */

const useFirstRoute = createRoute({
  method: 'post',
  path: '/admin/gemini-keys/{id}/use-first',
  tags: ['Admin'],
  summary: 'Make a paid key the first one tried once the free keys run out',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: GeminiKeyIdParamSchema },
  responses: {
    200: {
      description: 'The whole key list in its new order',
      content: { 'application/json': { schema: GeminiKeysResponseSchema } },
    },
    400: errorResponse('Not a paid key'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('Key not found'),
  },
});

adminGeminiKeysRouter.openapi(useFirstRoute, async (c) => {
  const { id } = c.req.valid('param');
  return c.json({ keys: await useGeminiKeyFirst(id, adminPhoneOf(c)) }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /admin/gemini-keys/:id/move                                           */
/* -------------------------------------------------------------------------- */

const moveRoute = createRoute({
  method: 'post',
  path: '/admin/gemini-keys/{id}/move',
  tags: ['Admin'],
  summary: 'Move a paid key one place up (tried sooner) or down (tried later)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: GeminiKeyIdParamSchema,
    body: { required: true, content: { 'application/json': { schema: MoveGeminiKeyBodySchema } } },
  },
  responses: {
    200: {
      description: 'The whole key list in its new order',
      content: { 'application/json': { schema: GeminiKeysResponseSchema } },
    },
    400: errorResponse('Not a paid key'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('Key not found'),
  },
});

adminGeminiKeysRouter.openapi(moveRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { direction } = c.req.valid('json');
  return c.json({ keys: await moveGeminiKey(id, direction, adminPhoneOf(c)) }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /admin/gemini-keys/:id/test                                           */
/* -------------------------------------------------------------------------- */

const testRoute = createRoute({
  method: 'post',
  path: '/admin/gemini-keys/{id}/test',
  tags: ['Admin'],
  summary: 'Send one tiny real request on this key and report whether it worked',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: GeminiKeyIdParamSchema },
  responses: {
    200: {
      description: 'Test result (ok false = the key failed; the reason is in message)',
      content: { 'application/json': { schema: GeminiKeyTestResponseSchema } },
    },
    400: errorResponse('Key no longer available'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('Key not found'),
  },
});

adminGeminiKeysRouter.openapi(testRoute, async (c) => {
  const { id } = c.req.valid('param');
  return c.json(await testGeminiKey(id, adminPhoneOf(c)), 200);
});

/* -------------------------------------------------------------------------- */
/* DELETE /admin/gemini-keys/:id                                              */
/* -------------------------------------------------------------------------- */

const deleteRoute = createRoute({
  method: 'delete',
  path: '/admin/gemini-keys/{id}',
  tags: ['Admin'],
  summary: 'Delete a key pasted on this page (keys from .env can only be switched off)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: GeminiKeyIdParamSchema },
  responses: {
    200: {
      description: 'Deleted',
      content: { 'application/json': { schema: GeminiKeyDeletedResponseSchema } },
    },
    400: errorResponse('A .env key, or the last key switched on'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('Key not found'),
  },
});

adminGeminiKeysRouter.openapi(deleteRoute, async (c) => {
  const { id } = c.req.valid('param');
  await deleteGeminiKey(id, adminPhoneOf(c));
  return c.json({ deleted: true as const }, 200);
});
