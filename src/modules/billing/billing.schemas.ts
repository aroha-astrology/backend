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
    walletBalancePaise: z.number().openapi({ example: 0 }),
    currency: z.string().default('INR').openapi({ example: 'INR' }),
  })
  .openapi('BillingBalanceResponse');

/* -------------------------------------------------------------------------- */
/* Credit packs                                                                */
/* -------------------------------------------------------------------------- */

export const TopUpAmountSchema = z
  .object({
    id: z.string().openapi({ example: 'topup_200' }),
    amountPaise: z.number().openapi({ example: 20000 }),
    currency: z.string().openapi({ example: 'INR' }),
    label: z.string().openapi({ example: '₹200' }),
    popular: z.boolean().optional(),
  })
  .openapi('TopUpAmount');

export const TopUpAmountsResponseSchema = z
  .object({ amounts: z.array(TopUpAmountSchema) })
  .openapi('TopUpAmountsResponse');

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
    walletBalancePaise: z.number().openapi({ description: "User's new wallet balance in paise" }),
  })
  .openapi('ConfirmOrderResponse');

export const OrdersResponseSchema = z
  .object({ orders: z.array(OrderSchema) })
  .openapi('OrdersResponse');

export const ConfirmGooglePlayBodySchema = z
  .object({
    purchaseToken: z.string().min(1),
    productId: z.string().min(1),
  })
  .openapi('ConfirmGooglePlayBody');
