import { z } from '@hono/zod-openapi';

export const BillingPlanResponseSchema = z
  .object({
    plan: z.string().openapi({ example: 'free' }),
    expiresAt: z.string().nullable().optional(),
    features: z.array(z.string()).optional(),
  })
  .openapi('BillingPlanResponse');

export const BillingBalanceResponseSchema = z
  .object({
    credits: z.number().openapi({ example: 0 }),
    currency: z.string().default('INR').openapi({ example: 'INR' }),
  })
  .openapi('BillingBalanceResponse');
