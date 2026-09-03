import { z } from '@hono/zod-openapi';

export const RateReportBodySchema = z
  .object({
    rating: z.number().int().min(1).max(5).openapi({ example: 4 }),
    comment: z.string().max(2000).optional().openapi({ example: 'Very accurate!' }),
  })
  .strict()
  .openapi('RateReportBody');

export const RateReportResponseSchema = z
  .object({
    id: z.string().uuid(),
    /** Null unless the rating was under 3 stars, in which case this is 100% of
     * what was paid for the report, already credited to the wallet. */
    refundedPaise: z.number().nullable(),
  })
  .openapi('RateReportResponse');
