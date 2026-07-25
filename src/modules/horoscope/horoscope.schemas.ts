import { z } from '@hono/zod-openapi';

export const HoroscopePeriodSchema = z.enum(['daily', 'tomorrow', 'weekly', 'monthly', 'yearly']);
export type HoroscopePeriod = z.infer<typeof HoroscopePeriodSchema>;

const SubCategoryHooksSchema = z.object({
  health: z.string(),
  career: z.string(),
  marriage: z.string(),
  finance: z.string(),
  education: z.string(),
});

export const MonthlyBreakdownEntrySchema = z
  .object({
    month: z.number().int().min(1).max(12),
    monthLabel: z.string(),
    summary: z.string(),
    /** One relatable hook line per sub-category for that month. Absent on rows generated before 2026-07-06. */
    categoryHooks: SubCategoryHooksSchema.optional(),
  })
  .openapi('MonthlyBreakdownEntry');

export const CategoryReadingSchema = z
  .object({
    hook: z.string(),
    description: z.string(),
    advice: z.string(),
    quality: z.enum(['good', 'moderate', 'challenging', 'avoid']),
    score: z.number().int().min(1).max(5),
  })
  .openapi('CategoryReading');

export const StructuredHoroscopeSchema = z
  .object({
    hook: z.string(),
    description: z.string(),
    advice: z.string(),
    quality: z.enum(['good', 'moderate', 'challenging', 'avoid']),
    score: z.number().int().min(1).max(5),
    luckyColor: z.string(),
    luckyNumber: z.number().int().min(1).max(9),
    categories: z.object({
      overall: CategoryReadingSchema,
      health: CategoryReadingSchema,
      career: CategoryReadingSchema,
      marriage: CategoryReadingSchema,
      finance: CategoryReadingSchema,
      education: CategoryReadingSchema,
    }),
  })
  .openapi('StructuredHoroscope');

/** Plain-language reading of the user's current Vimshottari dasha — same shape on all 4 periods. */
export const DashaReadingSchema = z
  .object({
    mahadashaPlanet: z.string(),
    antardashaPlanet: z.string().nullable(),
    hook: z.string(),
    meaning: z.string(),
    activeUntil: z.string().nullable().describe('ISO date the current Mahadasha ends'),
  })
  .openapi('DashaReading');

export const HoroscopeSchema = z
  .object({
    forDate: z.string().describe('ISO date (YYYY-MM-DD, IST) the period starts on'),
    period: HoroscopePeriodSchema,
    periodKey: z.string().describe('Cache key within the period, e.g. YYYY-MM-DD / YYYY-MM / YYYY'),
    summary: z.string(),
    /** Only present on period: 'yearly' — a short blurb per calendar month. */
    monthlyBreakdown: z.array(MonthlyBreakdownEntrySchema).optional(),
    /** Only present on daily/weekly/monthly — the rich Plain-view fields. */
    structured: StructuredHoroscopeSchema.optional(),
    /** Current dasha reading, same on all 4 periods; absent if no kundli yet. */
    dasha: DashaReadingSchema.optional(),
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
  /** Request-scoped language override — see GET /kundli/houses/{house}/insight
   * for why this is preferred over the unreliable `user.contentLanguage`. */
  language: z
    .string()
    .min(2)
    .max(35)
    .optional()
    .openapi({ param: { name: 'language', in: 'query' } }),
});

/** 202 body when a horoscope isn't ready yet — the client should poll GET again. */
export const HoroscopeStatusSchema = z
  .object({
    status: z.enum(['generating', 'failed']),
  })
  .openapi('HoroscopeStatus');

/** Result summary of one period's CRON batch run. */
export const HoroscopeRunResultSchema = z
  .object({
    period: HoroscopePeriodSchema,
    forDate: z.string(),
    processed: z.number().int(),
    generated: z.number().int(),
    skipped: z.number().int(),
    failed: z.number().int(),
  })
  .openapi('HoroscopeRunResult');

/** Response of the generalized cron trigger: one result if `period` was given, else all 4. */
export const HoroscopeRunResponseSchema = z.union([
  HoroscopeRunResultSchema,
  z.array(HoroscopeRunResultSchema),
]);

/** Optional body for the cron trigger (for testing / backfill). Omitting `period` runs all 4. */
export const HoroscopeRunBodySchema = z
  .object({
    period: HoroscopePeriodSchema.optional().describe('Run only this period; omit to run all 4.'),
    forDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
      .optional()
      .describe('Override the date; defaults to the current period (IST).'),
    force: z.boolean().optional().describe('Regenerate even if one already exists for the period.'),
    limit: z.number().int().positive().max(100000).optional().describe('Cap users processed.'),
    includeDormant: z
      .boolean()
      .optional()
      .describe(
        'Include users with no activity in HOROSCOPE_ACTIVE_WINDOW_DAYS (default: excluded). ' +
          'For admin backfills that intentionally want to reach every user.',
      ),
  })
  .strict()
  .openapi('HoroscopeRunBody');

/** @deprecated kept only for the transitional /cron/daily-horoscopes alias — use HoroscopeRunResultSchema. */
export const DailyHoroscopeRunSchema = z
  .object({
    forDate: z.string(),
    processed: z.number().int(),
    generated: z.number().int(),
    skipped: z.number().int(),
    failed: z.number().int(),
  })
  .openapi('DailyHoroscopeRun');

/** @deprecated kept only for the transitional /cron/daily-horoscopes alias — use HoroscopeRunBodySchema. */
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
