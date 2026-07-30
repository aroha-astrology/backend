import { z } from '@hono/zod-openapi';

export const SaturnPhaseRunBodySchema = z
  .object({
    dryRun: z
      .boolean()
      .optional()
      .describe('Detect and persist phases, but skip sending any push/notification.'),
  })
  .strict()
  .openapi('SaturnPhaseRunBody');

export const SaturnPhaseRunResultSchema = z
  .object({
    checked: z.number().int().describe('Ready kundlis whose phase was computed and persisted.'),
    transitions: z.number().int().describe('Users whose phase differs from what was last stored.'),
    alertsSent: z
      .number()
      .int()
      .describe('Personal (primary-profile) transitions that were pushed.'),
  })
  .openapi('SaturnPhaseRunResult');
