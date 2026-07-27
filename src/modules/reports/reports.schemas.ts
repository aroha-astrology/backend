import { z } from '@hono/zod-openapi';

export const LanguageQuerySchema = z.object({
  language: z
    .string()
    .optional()
    .openapi({ param: { name: 'language', in: 'query' }, example: 'hi' }),
});

export const PartnerBirthDetailsSchema = z
  .object({
    dateOfBirth: z.string(),
    timeOfBirth: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string(),
  })
  .openapi('PartnerBirthDetails');

export const PurchaseReportBodySchema = z
  .object({
    reportKey: z.string(),
    /** 'YYYY-MM' strings — monthly reports only. */
    months: z.array(z.string().regex(/^\d{4}-\d{2}$/)).optional(),
    birthProfileId: z.string().uuid().nullable().optional(),
    /** kundli_milan only. */
    partner: PartnerBirthDetailsSchema.optional(),
  })
  .openapi('PurchaseReportBody');

export type PurchaseReportBody = z.infer<typeof PurchaseReportBodySchema>;

export const PreviewReportBodySchema = z
  .object({
    reportKey: z.string(),
    birthProfileId: z.string().uuid().nullable().optional(),
  })
  .openapi('PreviewReportBody');

export type PreviewReportBody = z.infer<typeof PreviewReportBodySchema>;

export const PreviewReportResponseSchema = z
  .object({
    id: z.string(),
    reportKey: z.string(),
    status: z.enum(['generating', 'ready', 'failed']),
  })
  .openapi('PreviewReportResponse');

export type PreviewReportResponseDto = z.infer<typeof PreviewReportResponseSchema>;

export const PurchasedReportSummarySchema = z
  .object({
    id: z.string(),
    reportKey: z.string(),
    periodMonth: z.string().nullable(),
    status: z.enum(['generating', 'ready', 'failed']),
  })
  .openapi('PurchasedReportSummary');

export const PurchaseReportResponseSchema = z
  .object({
    reports: z.array(PurchasedReportSummarySchema),
  })
  .openapi('PurchaseReportResponse');

export const ReportCataloguePurchaseSchema = z
  .object({
    id: z.string(),
    periodMonth: z.string().nullable(),
    status: z.enum(['generating', 'ready', 'failed']),
  })
  .openapi('ReportCataloguePurchase');

export const ReportCatalogueEntrySchema = z
  .object({
    key: z.string(),
    label: z.string(),
    isMonthly: z.boolean(),
    requiresPartner: z.boolean(),
    enabled: z.boolean(),
    /** Never hardcode a price client-side — always read it from here. */
    pricePaise: z.number().int(),
    /** "Strikethrough" MRP for the discount treatment. Null means no discount
     * is configured — never a fabricated value derived from pricePaise. */
    originalPricePaise: z.number().int().nullable(),
    purchases: z.array(ReportCataloguePurchaseSchema),
  })
  .openapi('ReportCatalogueEntry');

export const ReportCatalogueResponseSchema = z
  .object({
    reports: z.array(ReportCatalogueEntrySchema),
  })
  .openapi('ReportCatalogueResponse');

/** Public social-proof counts — `{ [reportKey]: readyCount }`, ready & non-preview,
 * aggregated across ALL users. See GET /reports/stats. */
export const ReportStatsResponseSchema = z
  .record(z.string(), z.number().int())
  .openapi('ReportStatsResponse');

export type ReportStatsDto = z.infer<typeof ReportStatsResponseSchema>;

export const ReportSectionSchema = z
  .object({
    heading: z.string(),
    paragraphs: z.array(z.string()),
  })
  .openapi('ReportSection');

export const ReportGeneratingSchema = z
  .object({ status: z.literal('generating') })
  .openapi('ReportGenerating');

export const ReportFailedSchema = z
  .object({ status: z.literal('failed'), error: z.string().nullable() })
  .openapi('ReportFailed');

export const ReportReadySchema = z
  .object({
    status: z.literal('ready'),
    reportKey: z.string(),
    periodMonth: z.string().nullable(),
    /** Deterministic facts recomputed fresh from the live chart on every read — see
     * ReportGenerator['computeScores']. Shape differs per report type. */
    scores: z.record(z.string(), z.unknown()),
    sections: z.array(ReportSectionSchema),
    /** True for a free "generate and blur" preview row that hasn't been purchased yet — tells the
     * client to render the paywall/blur over these sections rather than the full report. */
    isPreview: z.boolean(),
  })
  .openapi('ReportReady');

export const ReportDtoSchema = z
  .union([ReportGeneratingSchema, ReportFailedSchema, ReportReadySchema])
  .openapi('ReportDto');

export type ReportDto = z.infer<typeof ReportDtoSchema>;
export type ReportCatalogueEntryDto = z.infer<typeof ReportCatalogueEntrySchema>;
export type PurchasedReportSummaryDto = z.infer<typeof PurchasedReportSummarySchema>;

export const ReportIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});
