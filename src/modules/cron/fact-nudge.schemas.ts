import { z } from '@hono/zod-openapi';

export const FactNudgeBodySchema = z
  .object({
    force: z
      .boolean()
      .optional()
      .describe('Skip the 1st/3rd-Sunday gate — run the selection+send pass regardless of date.'),
    dryRun: z
      .boolean()
      .optional()
      .describe(
        'Resolve candidates, pick a fact per user, and draft copy without sending anything or writing inbox rows.',
      ),
  })
  .strict()
  .openapi('FactNudgeBody');

export const FactNudgeResultSchema = z
  .object({
    skipped: z.boolean(),
    reason: z.string().optional(),
    candidates: z.number().int(),
    /** Candidates with nothing safe/dated worth saying this cycle. */
    silent: z.number().int(),
    sent: z.number().int(),
    fallbacks: z.number().int(),
  })
  .openapi('FactNudgeResult');
