import { z } from '@hono/zod-openapi';

export const PurchasePlanCategorySchema = z.enum(['vehicle', 'home', 'commercial', 'other']);

export const AnalyzePurchasePlanBodySchema = z
  .object({
    category: PurchasePlanCategorySchema,
    metadata: z.record(z.string(), z.string()).optional().default({}),
    costBracket: z.string().optional(),
    bookingDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    deliveryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    panchangDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    language: z.string().optional().default('en'),
  })
  .refine((body) => body.bookingDate || body.deliveryDate, {
    message: 'At least one of bookingDate or deliveryDate is required',
  })
  .openapi('AnalyzePurchasePlanBody');

export type AnalyzePurchasePlanBody = z.infer<typeof AnalyzePurchasePlanBodySchema>;

export const PurchasePlanSchema = z
  .object({
    id: z.string(),
    category: PurchasePlanCategorySchema,
    metadata: z.record(z.string(), z.string()),
    costBracket: z.string().nullable(),
    resolvedBookingDate: z.string(),
    resolvedDeliveryDate: z.string(),
    status: z.enum(['pending', 'processing', 'done', 'error']),
    analysis: z.record(z.string(), z.unknown()).nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .openapi('PurchasePlan');

export type PurchasePlanDto = z.infer<typeof PurchasePlanSchema>;

export const PlanIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});
