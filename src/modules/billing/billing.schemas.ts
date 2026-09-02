import { z } from '@hono/zod-openapi';

import { orderStatusEnum } from '../../db/schema.js';

// Read the order statuses off the pgEnum rather than re-listing them: migration
// 0053 added refund_pending/refunded to the DB enum and these hand-written
// copies silently fell behind, so every billing route returning an order
// stopped typechecking against its own OpenAPI response schema.
const OrderStatusSchema = z.enum(orderStatusEnum.enumValues);

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
  .object({
    amounts: z.array(TopUpAmountSchema),
    /** False when this server has no Razorpay keys — the client hides that payment option. */
    razorpayEnabled: z.boolean().default(false),
  })
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
    status: OrderStatusSchema,
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

export const TransactionSchema = z
  .discriminatedUnion('kind', [
    z.object({
      id: z.string(),
      kind: z.literal('recharge'),
      createdAt: z.string(),
      amountPaise: z.number(),
      status: OrderStatusSchema,
    }),
    z.object({
      id: z.string(),
      kind: z.enum([
        'chat',
        'vastu_report',
        'gemstone_unlock',
        'profile_creation',
        'referral_bonus',
        'admin_adjustment',
        'daily_reward',
      ]),
      createdAt: z.string(),
      amountPaise: z.number(),
      balanceAfterPaise: z.number(),
      isRefund: z.boolean(),
      isCredit: z.boolean(),
      expiresAt: z.string().optional(),
    }),
    z.object({
      id: z.string(),
      kind: z.literal('house_unlock'),
      createdAt: z.string(),
      amountPaise: z.number(),
      balanceAfterPaise: z.number(),
      isRefund: z.boolean(),
      isCredit: z.boolean(),
      expiresAt: z.string().optional(),
      houseNumber: z.number(),
    }),
    z.object({
      id: z.string(),
      kind: z.literal('report_unlock'),
      createdAt: z.string(),
      amountPaise: z.number(),
      balanceAfterPaise: z.number(),
      isRefund: z.boolean(),
      isCredit: z.boolean(),
      expiresAt: z.string().optional(),
      reportKey: z.string(),
      periodMonth: z.string().optional(),
      bundleMonths: z.number().optional(),
    }),
  ])
  .openapi('Transaction');

export const TransactionsResponseSchema = z
  .object({ transactions: z.array(TransactionSchema) })
  .openapi('TransactionsResponse');

/* -------------------------------------------------------------------------- */
/* Razorpay                                                                    */
/* -------------------------------------------------------------------------- */

export const RazorpayCheckoutResponseSchema = z
  .object({
    order: OrderSchema,
    razorpayOrderId: z.string().openapi({ example: 'order_Nq1v2w3x4y5z6a' }),
    razorpayKeyId: z
      .string()
      .openapi({ description: 'Publishable key id for checkout.js', example: 'rzp_test_xxx' }),
  })
  .openapi('RazorpayCheckoutResponse');

export const VerifyRazorpayBodySchema = z
  .object({
    orderId: z.string().uuid(),
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
  })
  .openapi('VerifyRazorpayBody');

export const ConfirmGooglePlayBodySchema = z
  .object({
    purchaseToken: z.string().min(1),
    productId: z.string().min(1),
  })
  .openapi('ConfirmGooglePlayBody');
