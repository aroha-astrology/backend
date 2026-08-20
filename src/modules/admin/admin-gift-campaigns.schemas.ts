import { z } from '@hono/zod-openapi';

export const GiftCampaignRowSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    title: z.string(),
    amountPaise: z.number().int(),
    audienceMaxBalancePaise: z.number().int().nullable(),
    deliveryMode: z.enum(['self_claim', 'auto_credit']),
    claimWindowDays: z.number().int().nullable(),
    creditExpiryDays: z.number().int().nullable(),
    scheduledSendAt: z.string().nullable(),
    status: z.enum(['draft', 'scheduled', 'sent', 'canceled']),
    validFrom: z.string().nullable(),
    validUntil: z.string().nullable(),
    sentAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('GiftCampaignRow');

export const GiftCampaignsResponseSchema = z
  .object({ campaigns: z.array(GiftCampaignRowSchema) })
  .openapi('GiftCampaignsResponse');

export const CreateGiftCampaignBodySchema = z
  .object({
    title: z.string().min(1),
    amountPaise: z.number().int().positive(),
    audienceMaxBalancePaise: z.number().int().positive().nullable(),
    deliveryMode: z.enum(['self_claim', 'auto_credit']),
    claimWindowDays: z.number().int().positive().nullable(),
    creditExpiryDays: z.number().int().positive().nullable(),
    scheduledSendAt: z.string().datetime().nullable(),
  })
  .openapi('CreateGiftCampaignBody');

export const GiftCampaignIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});

export const PreviewAudienceBodySchema = z
  .object({
    amountPaise: z.number().int().positive(),
    audienceMaxBalancePaise: z.number().int().positive().nullable(),
  })
  .openapi('PreviewAudienceBody');

export const AudiencePreviewResponseSchema = z
  .object({
    eligibleCount: z.number().int(),
    pushableCount: z.number().int(),
    totalCostPaise: z.number().int(),
  })
  .openapi('AudiencePreviewResponse');
