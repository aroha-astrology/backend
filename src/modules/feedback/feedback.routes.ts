import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import crypto from 'node:crypto';
import { requireUser } from '../../middleware/auth.js';
import { FeedbackBodySchema, FeedbackResponseSchema } from './feedback.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('FeedbackError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const feedbackRouter = new OpenAPIHono();

feedbackRouter.use('*', requireUser);

/* -------------------------------------------------------------------------- */
/* POST /feedback                                                              */
/* -------------------------------------------------------------------------- */

const submitFeedbackRoute = createRoute({
  method: 'post',
  path: '/feedback',
  tags: ['Feedback'],
  summary: 'Submit user feedback or a prediction rating',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: FeedbackBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Feedback recorded',
      content: { 'application/json': { schema: FeedbackResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Validation failed'),
  },
});

feedbackRouter.openapi(submitFeedbackRoute, async (c) => {
  const _user = c.get('user');
  const _body = c.req.valid('json');
  // TODO: persist to feedback table
  return c.json({ id: crypto.randomUUID(), received: true }, 201);
});
