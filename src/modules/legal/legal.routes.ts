import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import {
  CurrentLegalResponseSchema,
  AcceptLegalBodySchema,
  AcceptLegalResponseSchema,
  LegalStatusResponseSchema,
} from './legal.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('LegalError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/**
 * Version of the Terms / Privacy Policy / Disclaimer currently in force.
 *
 * The documents themselves live in the client repos — the canonical text is
 * `frontend/lib/legal-content.ts`, mirrored to `landing/src/lib/legal-content.ts`
 * which renders the public arohaastrology.in/legal/* pages linked below. All
 * three repos must carry the SAME version string, and there is no shared CI to
 * enforce it: bump this whenever you bump `LEGAL_VERSION` there.
 *
 * This used to be three separate '1.0.0' literals inlined below while the
 * rendered documents said '1.1.0' — which meant the version this API reported
 * named a document nobody had ever been shown. One constant, no literals.
 */
export const LEGAL_VERSION = '1.3.0';

/** Public, unauthenticated home of the legal documents (landing repo). */
const LEGAL_BASE_URL = 'https://arohaastrology.in/legal';

export const legalRouter = new OpenAPIHono();

/* -------------------------------------------------------------------------- */
/* GET /legal/current                                                          */
/* -------------------------------------------------------------------------- */

const currentLegalRoute = createRoute({
  method: 'get',
  path: '/legal/current',
  tags: ['Legal'],
  summary: 'Get current legal document versions and URLs',
  responses: {
    200: {
      description: 'Current legal documents',
      content: { 'application/json': { schema: CurrentLegalResponseSchema } },
    },
  },
});

legalRouter.openapi(currentLegalRoute, async (c) => {
  return c.json(
    {
      terms: { version: LEGAL_VERSION, url: `${LEGAL_BASE_URL}/terms` },
      privacy: { version: LEGAL_VERSION, url: `${LEGAL_BASE_URL}/privacy` },
      disclaimer: { version: LEGAL_VERSION, url: `${LEGAL_BASE_URL}/disclaimer` },
    },
    200,
  );
});

/* -------------------------------------------------------------------------- */
/* POST /legal/accept                                                          */
/* -------------------------------------------------------------------------- */

const acceptLegalRoute = createRoute({
  method: 'post',
  path: '/legal/accept',
  tags: ['Legal'],
  summary: 'Accept terms and privacy policy',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: AcceptLegalBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Accepted',
      content: { 'application/json': { schema: AcceptLegalResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Validation failed'),
  },
});

legalRouter.openapi(acceptLegalRoute, async (c) => {
  // TODO: persist acceptance timestamps + consent log entry
  const _user = c.get('user');
  const _body = c.req.valid('json');
  return c.json({ accepted: true }, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /legal/status                                                           */
/* -------------------------------------------------------------------------- */

const legalStatusRoute = createRoute({
  method: 'get',
  path: '/legal/status',
  tags: ['Legal'],
  summary: "Get the authenticated user's consent timestamps",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Consent status',
      content: { 'application/json': { schema: LegalStatusResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

legalRouter.openapi(legalStatusRoute, async (c) => {
  const user = c.get('user');
  return c.json(
    {
      termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
      termsVersion: user.termsVersion ?? null,
      privacyPolicyAcceptedAt: user.privacyPolicyAcceptedAt?.toISOString() ?? null,
      privacyPolicyVersion: user.privacyPolicyVersion ?? null,
      dataProcessingConsentAt: user.dataProcessingConsentAt?.toISOString() ?? null,
      dataProcessingConsentRevokedAt: user.dataProcessingConsentRevokedAt?.toISOString() ?? null,
      marketingConsentAt: user.marketingConsentAt?.toISOString() ?? null,
      marketingConsentRevokedAt: user.marketingConsentRevokedAt?.toISOString() ?? null,
    },
    200,
  );
});
