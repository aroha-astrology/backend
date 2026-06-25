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
  // TODO: read from config or database
  return c.json(
    {
      terms: { version: '1.0.0', url: 'https://aroha.app/legal/terms' },
      privacy: { version: '1.0.0', url: 'https://aroha.app/legal/privacy' },
      disclaimer: { version: '1.0.0', url: 'https://aroha.app/legal/disclaimer' },
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
