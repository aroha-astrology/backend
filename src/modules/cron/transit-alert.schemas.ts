import { z } from '@hono/zod-openapi';

export const TransitAlertActionSchema = z.enum(['detect', 'draft', 'send']);

export const TransitAlertBodySchema = z
  .object({
    action: TransitAlertActionSchema.describe(
      'detect = extend the computed transit calendar and re-run collision selection; ' +
        'draft = generate and validate push copy for events pushing within 48h; ' +
        'send = deliver whatever is due now.',
    ),
    force: z
      .boolean()
      .optional()
      .describe(
        "send only: deliver even if already sent today (cron_batch_runs jobName='transit-alert').",
      ),
    dryRun: z
      .boolean()
      .optional()
      .describe(
        'send only: resolve recipients, grouping and copy and log them without calling FCM ' +
          'or writing inbox rows. Nothing is marked sent.',
      ),
    horizonDays: z
      .number()
      .int()
      .positive()
      .max(1200)
      .optional()
      .describe('detect only: how far ahead to scan. Defaults to 400 days.'),
  })
  .strict()
  .openapi('TransitAlertBody');

export const TransitAlertResultSchema = z
  .object({
    action: TransitAlertActionSchema,
    /** detect */
    scanned: z.number().int().optional(),
    inserted: z.number().int().optional(),
    selected: z.number().int().optional(),
    skipped: z.number().int().optional(),
    /** draft */
    events: z.number().int().optional(),
    generated: z.number().int().optional(),
    fallbacks: z.number().int().optional(),
    /** send */
    recipients: z.number().int().optional(),
    success: z.number().int().optional(),
    failure: z.number().int().optional(),
    reason: z.string().optional(),
  })
  .openapi('TransitAlertResult');
