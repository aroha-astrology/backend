import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { rateLimiter } from '../../middleware/rate-limit.js';
import * as publicService from './public.service.js';
import { MoonSignRequestSchema, MoonSignResponseSchema } from './public.schemas.js';

/* -------------------------------------------------------------------------- */
/* Shared helpers (same shape as astro.routes.ts's ErrorSchema/errorResponse) */
/* -------------------------------------------------------------------------- */

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('PublicError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/**
 * Unauthenticated, no-consent, no-credit routes for the marketing site. Kept
 * deliberately separate from astroRouter (which attaches auth/consent
 * middleware to most of its routes) so nothing here can accidentally inherit
 * a `requireUser`/`requireConsent` wildcard the way kundliRouter does.
 */
export const publicRouter = new OpenAPIHono();

/* -------------------------------------------------------------------------- */
/* POST /public/moon-sign                                                     */
/* -------------------------------------------------------------------------- */

// Stricter than the global 300/min-per-IP baseline in app.ts — this is the
// #1 abuse risk since it's unauthenticated and does a real ephemeris compute
// per call. Same style as astro.routes.ts's llmRateLimit.
const moonSignRateLimit = rateLimiter({ windowMs: 60_000, max: 10, name: 'public-moon-sign' });

const moonSignRoute = createRoute({
  method: 'post',
  path: '/public/moon-sign',
  tags: ['Public'],
  summary:
    "Compute a birth chart's Moon sign/nakshatra — public, unauthenticated, no interpretation",
  middleware: [moonSignRateLimit] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: MoonSignRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Moon sign result',
      content: { 'application/json': { schema: MoonSignResponseSchema } },
    },
    422: errorResponse('Malformed/out-of-range date, time, or tzOffsetMinutes'),
  },
});

publicRouter.openapi(
  moonSignRoute,
  async (c) => {
    const body = c.req.valid('json');
    const result = await publicService.computeMoonSign(body);
    return c.json(result, 200);
  },
  // @hono/zod-validator's own default (no hook passed) resolves a failed
  // request validation to a plain `c.json(result, 400)` — it never throws,
  // so it never reaches errorHandler's `AppError`/`ZodError` branches. This
  // route's documented contract is a 422 (matching the rest of the astro
  // API's `Errors.unprocessable` shape), so validation failures are mapped
  // to that shape explicitly here instead of relying on the library default.
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
