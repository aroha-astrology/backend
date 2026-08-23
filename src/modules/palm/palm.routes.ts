import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireConsent } from '../../middleware/consent.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import {
  CreatePalmReadingBodySchema,
  PalmSlotSchema,
  PalmReadingIdParamSchema,
  PalmReadingResponseSchema,
  PalmReadingListResponseSchema,
  LanguageQuerySchema,
  SaveMountReliefBodySchema,
} from './palm.schemas.js';
import {
  createPalmReading,
  uploadFrame,
  analyzePalmReading,
  unlockPalmReading,
  getPalmReadingForUser,
  listPalmReadings,
  getFrameBytes,
  saveHandMountRelief,
} from './palm.service.js';
import { Errors } from '../../lib/errors.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('PalmError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

const PalmFrameParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
  slot: PalmSlotSchema.openapi({ param: { name: 'slot', in: 'path' } }),
});

// Vision inference on multi-frame uploads is the most expensive call in the
// product — its own tight limit, independent of every other LLM route.
const analyzeRateLimit = rateLimiter({ windowMs: 60_000, max: 3, name: 'palm-analyze' });

export const palmRouter = new OpenAPIHono();

palmRouter.use('*', requireUser);

const createRoute_ = createRoute({
  method: 'post',
  path: '/palm/readings',
  tags: ['Palm'],
  summary: 'Start a new palm reading — creates a pending row to upload frames into',
  security: [{ bearerAuth: [] }],
  middleware: [requireConsent] as const,
  request: {
    body: {
      required: false,
      content: { 'application/json': { schema: CreatePalmReadingBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Pending reading created',
      content: {
        'application/json': {
          schema: z.object({ readingId: z.string(), primaryHand: z.string() }),
        },
      },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Consent required'),
  },
});
palmRouter.openapi(createRoute_, async (c) => {
  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const result = await createPalmReading(user, profile.birthProfileId);
  return c.json(result, 200);
});

// Frames are stored on local disk (see lib/palm/storage.ts) — no cloud bucket, so no
// signed-URL round trip. The client POSTs the raw JPEG bytes directly to this route and GETs
// them back the same way, both behind the router's normal requireUser + ownership check
// (getFrameBytes/uploadFrame verify ownership). `createRoute`'s body/response schemas below
// are documentation-only for this pair — zod-openapi only runtime-validates content types it
// recognizes (json/form), so a non-JSON content type is never actually parsed against a zod
// schema; the handlers read/write raw bytes via c.req.arrayBuffer() / c.body() themselves.
const uploadFrameRoute = createRoute({
  method: 'post',
  path: '/palm/readings/{id}/frames/{slot}',
  tags: ['Palm'],
  summary: 'Upload one captured frame — raw JPEG bytes in the request body',
  security: [{ bearerAuth: [] }],
  request: {
    params: PalmFrameParamSchema,
    body: {
      required: true,
      content: { 'image/jpeg': { schema: z.string().openapi({ format: 'binary' }) } },
    },
  },
  responses: {
    200: {
      description: 'Frame recorded',
      content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
    },
    400: errorResponse('Empty or missing image body'),
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
    409: errorResponse('Reading is not accepting uploads'),
  },
});
palmRouter.openapi(uploadFrameRoute, async (c) => {
  const user = c.get('user');
  const { id, slot } = c.req.valid('param');
  const arrayBuffer = await c.req.arrayBuffer();
  if (arrayBuffer.byteLength === 0) throw Errors.badRequest('Empty image body');
  await uploadFrame(user.id, id, slot, Buffer.from(arrayBuffer));
  return c.json({ ok: true }, 200);
});

const getFrameRoute = createRoute({
  method: 'get',
  path: '/palm/readings/{id}/frames/{slot}',
  tags: ['Palm'],
  summary: 'Get one captured frame — raw JPEG bytes in the response body',
  security: [{ bearerAuth: [] }],
  request: { params: PalmFrameParamSchema },
  responses: {
    200: {
      description: 'JPEG bytes',
      content: { 'image/jpeg': { schema: z.string().openapi({ format: 'binary' }) } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
  },
});
palmRouter.openapi(getFrameRoute, async (c) => {
  const user = c.get('user');
  const { id, slot } = c.req.valid('param');
  const bytes = await getFrameBytes(user.id, id, slot);
  // c.body() wants a DOM-flavored Uint8Array<ArrayBuffer>; Node's Buffer is typed against the
  // broader ArrayBufferLike (which also covers SharedArrayBuffer), so TS rejects it directly.
  return c.body(new Uint8Array(bytes), 200, { 'Content-Type': 'image/jpeg' });
});

const mountReliefRoute = createRoute({
  method: 'post',
  path: '/palm/readings/{id}/mount-relief',
  tags: ['Palm'],
  summary: "Record one hand's client-computed CV mount-relief scores (best-effort, optional)",
  description:
    'Uploaded by the frontend after landmark detection + relief analysis on a front-view ' +
    'frame — see lib/palm/computeMountRelief.ts. Purely additive accuracy data; never ' +
    'required, and this call failing never blocks the capture/analysis flow.',
  security: [{ bearerAuth: [] }],
  request: {
    params: PalmReadingIdParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: SaveMountReliefBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Recorded',
      content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
  },
});
palmRouter.openapi(mountReliefRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const { hand, scores, regions } = c.req.valid('json');
  await saveHandMountRelief(user.id, id, hand, scores, regions);
  return c.json({ ok: true }, 200);
});

const analyzeRoute = createRoute({
  method: 'post',
  path: '/palm/readings/{id}/analyze',
  tags: ['Palm'],
  summary: 'FREE — kick off Stage A (vision measurement) once all 6 frames are uploaded',
  description:
    'No wallet charge. Produces the free teaser: hand element, confidence score, and the ' +
    'annotated line/mount overlay. Poll GET /palm/readings/{id} until status is "observed", ' +
    'then call POST /palm/readings/{id}/unlock for the full interpretation.',
  security: [{ bearerAuth: [] }],
  middleware: [analyzeRateLimit, requireConsent] as const,
  request: { params: PalmReadingIdParamSchema },
  responses: {
    200: {
      description: 'Generation started — poll GET /palm/readings/{id}',
      content: { 'application/json': { schema: z.object({ status: z.string() }) } },
    },
    400: errorResponse('Missing captured frames'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Consent required'),
    404: errorResponse('Not found'),
    409: errorResponse('Already generating'),
  },
});
palmRouter.openapi(analyzeRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const result = await analyzePalmReading(user, id);
  return c.json(result, 200);
});

const unlockRoute = createRoute({
  method: 'post',
  path: '/palm/readings/{id}/unlock',
  tags: ['Palm'],
  summary: 'PAID — charge and kick off Stage B/C (the full interpretation) for an observed reading',
  description:
    'Requires the reading to already be "observed" (the free scan must finish first). Reads ' +
    'the already-stored Stage A observations — does not re-download frames or call the ' +
    'vision model again.',
  security: [{ bearerAuth: [] }],
  middleware: [analyzeRateLimit, requireConsent] as const,
  request: { params: PalmReadingIdParamSchema },
  responses: {
    200: {
      description: 'Generation started — poll GET /palm/readings/{id}',
      content: { 'application/json': { schema: z.object({ status: z.string() }) } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Consent required or feature disabled'),
    404: errorResponse('Not found'),
    409: errorResponse('Insufficient credits, already generating, or scan not finished yet'),
  },
});
palmRouter.openapi(unlockRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const result = await unlockPalmReading(user, id);
  return c.json(result, 200);
});

const getOneRoute = createRoute({
  method: 'get',
  path: '/palm/readings/{id}',
  tags: ['Palm'],
  summary: 'Get one palm reading — poll target while status is generating',
  security: [{ bearerAuth: [] }],
  request: { params: PalmReadingIdParamSchema, query: LanguageQuerySchema },
  responses: {
    200: {
      description: 'Reading (any status)',
      content: { 'application/json': { schema: PalmReadingResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
  },
});
palmRouter.openapi(getOneRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const { language } = c.req.valid('query');
  const dto = await getPalmReadingForUser(user.id, id, language || 'en');
  return c.json(dto, 200);
});

const listRoute = createRoute({
  method: 'get',
  path: '/palm/readings',
  tags: ['Palm'],
  summary: "List the current user's palm readings for the active profile",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Readings',
      content: { 'application/json': { schema: PalmReadingListResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});
palmRouter.openapi(listRoute, async (c) => {
  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const readings = await listPalmReadings(user.id, profile.birthProfileId);
  return c.json({ readings }, 200);
});
