import { z } from '@hono/zod-openapi';

export const ReportTypeParamSchema = z.object({
  reportType: z.string().min(1).max(60),
});

export const PrimeReportCatalogueItemSchema = z
  .object({
    reportType: z.string(),
    title: z.string(),
    pricePaise: z.number().int(),
    unlocked: z.boolean(),
  })
  .openapi('PrimeReportCatalogueItem');

export const PrimeReportCatalogueSchema = z
  .object({ items: z.array(PrimeReportCatalogueItemSchema) })
  .openapi('PrimeReportCatalogue');

export const PrimeReportDtoSchema = z
  .object({
    status: z.literal('ready'),
    reportType: z.string(),
    content: z.record(z.string(), z.unknown()),
  })
  .openapi('PrimeReportDto');

export const PrimeReportStatusSchema = z
  .object({ status: z.enum(['generating', 'failed']) })
  .openapi('PrimeReportStatus');

export const PrimeReportUnlockResponseSchema = z
  .object({ status: z.literal('unlocked') })
  .openapi('PrimeReportUnlockResponse');

export const PeriodQuerySchema = z.object({
  period: z
    .string()
    .min(1)
    .max(60)
    .optional()
    .openapi({
      param: { name: 'period', in: 'query' },
      example: 'western',
      description:
        'Report variant/period key. Most report types ignore this (always treated as "lifetime"). Report types that support multiple variants (e.g. baby-name style choices) require a value from their own supported list, and reject any other value before charging.',
    }),
});
