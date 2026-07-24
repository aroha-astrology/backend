// =============================================================================
// Palm photo upload — a dedicated endpoint, deliberately separate from the
// generic /v1/prime/reports/{reportType} routes (see the plan doc for why:
// this keeps the shared Report Engine's request/response shape untouched).
// Upload first via this endpoint, THEN unlock 'palm' via the normal
// POST /v1/prime/reports/palm/unlock — the palm report type looks up the
// pending photo internally (prime-reports.registry.ts's `palm` entry).
// =============================================================================

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { upsertPendingPalmPhoto } from './palm-photo.repo.js';
import {
  PalmPhotoUploadRequestSchema,
  PalmPhotoUploadResponseSchema,
} from './palm-photo.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('PalmPhotoError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Uploads are large and rare per user — a tight per-minute cap is enough to stop abuse without affecting real usage. */
const palmPhotoUploadRateLimit = rateLimiter({
  windowMs: 60_000,
  max: 5,
  name: 'palm-photo-upload',
});

export const palmPhotoRouter = new OpenAPIHono();

const uploadRoute = createRoute({
  method: 'post',
  path: '/prime/palm/photo',
  tags: ['Prime Reports'],
  summary: 'Upload a palm photo ahead of unlocking the Palm Reading report',
  description:
    'Stores the photo temporarily (48 hours) so the Palm Reading report can be generated — and retried on failure — without re-uploading. The photo is deleted immediately once a report is successfully generated from it, and by a periodic cleanup job otherwise. A new upload replaces any previous pending one for the same profile.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, palmPhotoUploadRateLimit] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: PalmPhotoUploadRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Photo stored',
      content: { 'application/json': { schema: PalmPhotoUploadResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Validation failed'),
  },
});

palmPhotoRouter.openapi(
  uploadRoute,
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const profile = await resolveActiveProfileContext(user);

    const row = await upsertPendingPalmPhoto(
      user.id,
      profile.birthProfileId,
      body.imageBase64,
      body.mimeType,
    );

    return c.json({ uploaded: true as const, expiresAt: row.expiresAt.toISOString() }, 200);
  },
  // @hono/zod-openapi's own default (no hook passed) resolves a failed request
  // validation to a plain `c.json(result, 400)` — it never throws, so it
  // never reaches errorHandler's `AppError`/`ZodError` branches. This route's
  // documented contract above is 422, so map validation failures to that
  // shape explicitly, same as public.routes.ts's moonSignRoute.
  (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'UNPROCESSABLE',
            message: 'Validation failed',
            details: result.error.flatten(),
          },
        },
        422,
      );
    }
  },
);
