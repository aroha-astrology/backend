import { z } from '@hono/zod-openapi';

export const FestivalAlertBodySchema = z
  .object({
    force: z
      .boolean()
      .optional()
      .describe(
        "Send even if it was already sent for tomorrow's date (cron_batch_runs jobName='festival_alert').",
      ),
    dryRun: z
      .boolean()
      .optional()
      .describe(
        'Compute and log what would be sent, but do not actually push or mark the run complete.',
      ),
  })
  .strict()
  .openapi('FestivalAlertBody');

export const FestivalAlertResultSchema = z
  .object({
    skipped: z
      .boolean()
      .describe('True if nothing was sent (no major festival tomorrow, or already sent).'),
    reason: z.string().optional(),
    festivalName: z.string().optional(),
    forDate: z.string().describe("Tomorrow's IST date (YYYY-MM-DD) this run evaluated."),
    tokensFound: z.number().int(),
    success: z.number().int(),
    failure: z.number().int(),
  })
  .openapi('FestivalAlertResult');
