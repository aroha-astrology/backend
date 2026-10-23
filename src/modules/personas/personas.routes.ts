import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { users } from '../../db/schema.js';
import { requireUser } from '../../middleware/auth.js';
import { requireAnyFeature } from '../../middleware/feature.js';
import { Errors } from '../../lib/errors.js';
import { lookOf, personaById, personasForLook, resolvePersona } from '../../lib/personas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('PersonasError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

const Json = z.record(z.string(), z.any());

export const personasRouter = new OpenAPIHono();

const personasOn = requireAnyFeature(['chat.personas']);

function view(uiSkin: string | null | undefined, personaId: string | null | undefined) {
  const look = lookOf(uiSkin);
  return {
    look,
    current: resolvePersona(personaId, uiSkin).id,
    options: personasForLook(look).map((p) => ({ id: p.id, name: p.name })),
  };
}

const getRoute = createRoute({
  method: 'get',
  path: '/me/persona',
  tags: ['Personas'],
  summary: "The guide who answers the reader, and the guides of the reader's current look",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, personasOn] as const,
  responses: {
    200: { description: 'The guide and the options', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

personasRouter.openapi(getRoute, async (c) => {
  const user = c.get('user');
  return c.json(view(user.uiSkin, user.personaId), 200);
});

const putRoute = createRoute({
  method: 'put',
  path: '/me/persona',
  tags: ['Personas'],
  summary: 'Choose the guide who answers in chat and on calls',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, personasOn] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ personaId: z.string().min(1).max(40) }) } },
    },
  },
  responses: {
    200: { description: 'The new choice', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    422: errorResponse('Not a guide of the reader\'s look'),
  },
});

personasRouter.openapi(putRoute, async (c) => {
  const user = c.get('user');
  const { personaId } = c.req.valid('json');
  const chosen = personaById(personaId);
  if (!chosen || chosen.look !== lookOf(user.uiSkin)) {
    throw Errors.unprocessable('That guide is not available in your look');
  }
  await db.update(users).set({ personaId: chosen.id }).where(eq(users.id, user.id));
  return c.json(view(user.uiSkin, chosen.id), 200);
});
