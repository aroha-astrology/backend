import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireAnyFeature } from '../../middleware/feature.js';
import { Errors } from '../../lib/errors.js';
import {
  confirmEvent,
  dismissItem,
  forgetAll,
  forgetOne,
  getVault,
  memorySummary,
} from './memory.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('MemoryError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose: the shapes are documented on the service types. */
const Json = z.record(z.string(), z.any());
const IdParams = z.object({ id: z.string().uuid() });

export const memoryRouter = new OpenAPIHono();

const vaultOn = requireAnyFeature(['memory.vault']);
const anyMemoryOn = requireAnyFeature(['memory.vault', 'memory.babaMemory', 'memory.rectifyChip']);

const vaultRoute = createRoute({
  method: 'get',
  path: '/me/memory',
  tags: ['Memory'],
  summary: 'Everything Baba Ji remembers about the reader (Memory Vault)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, vaultOn] as const,
  responses: {
    200: { description: 'The vault', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

memoryRouter.openapi(vaultRoute, async (c) => {
  const user = c.get('user');
  return c.json((await getVault(user.id, user.currentTimezone)) as unknown as Record<string, unknown>, 200);
});

const summaryRoute = createRoute({
  method: 'get',
  path: '/me/memory/summary',
  tags: ['Memory'],
  summary: 'Free-reply token and whether to offer the birth-time check',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, anyMemoryOn] as const,
  responses: {
    200: { description: 'The summary', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

memoryRouter.openapi(summaryRoute, async (c) => {
  const user = c.get('user');
  return c.json((await memorySummary(user.id, user.birthTimeAccuracy)) as unknown as Record<string, unknown>, 200);
});

const forgetAllRoute = createRoute({
  method: 'delete',
  path: '/me/memory',
  tags: ['Memory'],
  summary: 'Forget everything Baba Ji remembers',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, vaultOn] as const,
  responses: {
    200: { description: 'How many items were forgotten', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

memoryRouter.openapi(forgetAllRoute, async (c) => {
  const removed = await forgetAll(c.get('user').id);
  return c.json({ removed }, 200);
});

const forgetOneRoute = createRoute({
  method: 'delete',
  path: '/me/memory/{id}',
  tags: ['Memory'],
  summary: 'Forget one remembered item',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, vaultOn] as const,
  request: { params: IdParams },
  responses: {
    200: { description: 'Forgotten', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('Not one of the reader\'s items'),
  },
});

memoryRouter.openapi(forgetOneRoute, async (c) => {
  const ok = await forgetOne(c.get('user').id, c.req.valid('param').id);
  if (!ok) throw Errors.notFound('Memory item not found');
  return c.json({ removed: 1 }, 200);
});

const happenedRoute = createRoute({
  method: 'post',
  path: '/me/memory/{id}/happened',
  tags: ['Memory'],
  summary: 'The reader says a dated event happened (it can then anchor a birth-time check)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, vaultOn] as const,
  request: { params: IdParams },
  responses: {
    200: { description: 'Marked done', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('Not one of the reader\'s items'),
    409: errorResponse('NOT_YET — the event is still in the future'),
  },
});

memoryRouter.openapi(happenedRoute, async (c) => {
  const user = c.get('user');
  const outcome = await confirmEvent(user.id, c.req.valid('param').id, user.currentTimezone);
  if (outcome === 'not-found') throw Errors.notFound('Memory item not found');
  if (outcome === 'not-yet') throw Errors.conflict('NOT_YET');
  return c.json({ ok: true }, 200);
});

const dismissRoute = createRoute({
  method: 'post',
  path: '/me/memory/{id}/dismiss',
  tags: ['Memory'],
  summary: 'Stop checking in on one item (it stays in the vault until deleted)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, vaultOn] as const,
  request: { params: IdParams },
  responses: {
    200: { description: 'Dismissed', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('Not one of the reader\'s items'),
  },
});

memoryRouter.openapi(dismissRoute, async (c) => {
  const ok = await dismissItem(c.get('user').id, c.req.valid('param').id);
  if (!ok) throw Errors.notFound('Memory item not found');
  return c.json({ ok: true }, 200);
});
