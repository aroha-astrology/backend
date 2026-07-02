import { z } from '@hono/zod-openapi';

export const HoroscopePeriodSchema = z.enum(['daily', 'weekly', 'monthly', 'yearly']);
export type HoroscopePeriod = z.infer<typeof HoroscopePeriodSchema>;

export const MonthlyBreakdownEntrySchema = z
  .object({
    month: z.number().int().min(1).max(12),
    monthLabel: z.string(),
    summary: z.string(),
  })
  .openapi('MonthlyBreakdownEntry');

export const HoroscopeSchema = z
  .object({
    forDate: z.string().describe('ISO date (YYYY-MM-DD, IST) the period starts on'),
    period: HoroscopePeriodSchema,
    periodKey: z.string().describe('Cache key within the period, e.g. YYYY-MM-DD / YYYY-MM / YYYY'),
    summary: z.string(),
    /** Only present on period: 'yearly' — a short blurb per calendar month. */
    monthlyBreakdown: z.array(MonthlyBreakdownEntrySchema).optional(),
    model: z.string().nullable(),
    generatedAt: z.string(),
  })
  .openapi('Horoscope');

export type HoroscopeDto = z.infer<typeof HoroscopeSchema>;

export const GetHoroscopeQuerySchema = z.object({
  period: HoroscopePeriodSchema.optional()
    .default('daily')
    .openapi({
      param: { name: 'period', in: 'query' },
      example: 'daily',
    }),
});

/** Result summary of a daily-horoscope CRON run. */
export const DailyHoroscopeRunSchema = z
  .object({
    forDate: z.string(),
    processed: z.number().int(),
    generated: z.number().int(),
    skipped: z.number().int(),
    failed: z.number().int(),
  })
  .openapi('DailyHoroscopeRun');

/** Optional body for the cron trigger (for testing / backfill). */
export const DailyHoroscopeRunBodySchema = z
  .object({
    forDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
      .optional()
      .describe('Override the date; defaults to today (IST).'),
    force: z.boolean().optional().describe('Regenerate even if one already exists for the date.'),
    limit: z.number().int().positive().max(100000).optional().describe('Cap users processed.'),
  })
  .strict()
  .openapi('DailyHoroscopeRunBody');
