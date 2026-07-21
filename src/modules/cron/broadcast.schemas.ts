import { z } from '@hono/zod-openapi';

export const BroadcastPeriodSchema = z.enum(['daily', 'weekly', 'monthly', 'yearly']);

export const BroadcastReadingBodySchema = z
  .object({
    period: BroadcastPeriodSchema.optional().describe('Defaults to daily.'),
    force: z
      .boolean()
      .optional()
      .describe(
        "Send even if shouldBroadcast(period) says today is not this period's scheduled day, " +
          "or if it was already sent today (cron_batch_runs jobName='broadcast').",
      ),
  })
  .strict()
  .openapi('BroadcastReadingBody');

export const BroadcastReadingResultSchema = z
  .object({
    period: BroadcastPeriodSchema,
    skipped: z
      .boolean()
      .describe('True if no push was sent (not scheduled today, or already sent).'),
    reason: z.string().optional(),
    tokensFound: z.number().int(),
    success: z.number().int(),
    failure: z.number().int(),
  })
  .openapi('BroadcastReadingResult');
