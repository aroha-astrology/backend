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

/* -------------------------------------------------------------------------- */
/* Credit packs                                                                */
/* -------------------------------------------------------------------------- */

export const CreditPackSchema = z
  .object({
    id: z.string().openapi({ example: 'popular' }),
    credits: z.number().openapi({ example: 200 }),
    priceInPaise: z.number().openapi({ example: 14900 }),
    currency: z.string().openapi({ example: 'INR' }),
    label: z.string().openapi({ example: 'Popular' }),
    popular: z.boolean().optional(),
  })
  .openapi('CreditPack');

export const CreditPacksResponseSchema = z
  .object({ packs: z.array(CreditPackSchema) })
  .openapi('CreditPacksResponse');

/* -------------------------------------------------------------------------- */
/* Coupon validation                                                           */
/* -------------------------------------------------------------------------- */

export const ValidateCouponBodySchema = z
  .object({
    code: z.string().min(1).max(40),
    packId: z.string().min(1),
  })
  .openapi('ValidateCouponBody');

export const CouponValidationResponseSchema = z
  .object({
    valid: z.boolean(),
    code: z.string(),
    discountType: z.enum(['percent', 'flat']).optional(),
    discountValue: z.number().optional(),
    discountPaise: z.number().optional(),
    finalAmountPaise: z.number().optional(),
    message: z.string().optional(),
  })
  .openapi('CouponValidationResponse');

/* -------------------------------------------------------------------------- */
/* Checkout / orders                                                           */
/* -------------------------------------------------------------------------- */

export const CheckoutBodySchema = z
  .object({
    packId: z.string().min(1),
    couponCode: z.string().min(1).max(40).optional(),
  })
  .openapi('CheckoutBody');

export const OrderSchema = z
  .object({
    id: z.string(),
    packId: z.string(),
    credits: z.number(),
    amountPaise: z.number(),
    discountPaise: z.number(),
    finalAmountPaise: z.number(),
    currency: z.string(),
    couponCode: z.string().nullable(),
    status: z.enum(['pending', 'paid', 'failed', 'cancelled']),
    gatewayProvider: z.string(),
    createdAt: z.string(),
    paidAt: z.string().nullable(),
  })
  .openapi('Order');

export const OrderIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});

export const ConfirmOrderResponseSchema = z
  .object({
    order: OrderSchema,
    credits: z.number().openapi({ description: "User's new credit balance" }),
  })
  .openapi('ConfirmOrderResponse');
