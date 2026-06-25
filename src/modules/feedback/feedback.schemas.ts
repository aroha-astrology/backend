import { z } from '@hono/zod-openapi';

export const FeedbackBodySchema = z
  .object({
    rating: z.number().int().min(1).max(5).openapi({ example: 4 }),
    comment: z.string().max(2000).optional().openapi({ example: 'Very accurate prediction!' }),
    predictionId: z.string().uuid().optional().openapi({
      description: 'ID of the prediction this feedback relates to',
    }),
  })
  .strict()
  .openapi('FeedbackBody');

export const FeedbackResponseSchema = z
  .object({
    id: z.string().uuid(),
    received: z.boolean(),
  })
  .openapi('FeedbackResponse');
