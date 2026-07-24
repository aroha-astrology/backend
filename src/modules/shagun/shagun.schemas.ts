import { z } from '@hono/zod-openapi';

export const ShagunProductCategorySchema = z.enum([
  'gemstone',
  'rudraksha',
  'yantra',
  'mala',
  'idol',
  'puja-item',
  'gift-set',
]);

export type ShagunProductCategory = z.infer<typeof ShagunProductCategorySchema>;

/**
 * Public read model — deliberately omits `affiliateUrl` (same "don't expose
 * the raw link/secret" reasoning as device-tokens.schemas.ts's
 * DeviceTokenSchema omitting the raw push token). Clients link to
 * GET /shagun/products/{id}/redirect instead, so every visit is click-tracked.
 */
export const ShagunProductSchema = z
  .object({
    id: z.string().uuid(),
    category: ShagunProductCategorySchema,
    name: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string().nullable(),
    priceRangeText: z.string().nullable(),
    sortOrder: z.number().int(),
  })
  .openapi('ShagunProduct');

export type ShagunProductDto = z.infer<typeof ShagunProductSchema>;

export const ShagunProductListSchema = z
  .object({ items: z.array(ShagunProductSchema) })
  .openapi('ShagunProductList');

export const ShagunProductListQuerySchema = z.object({
  category: ShagunProductCategorySchema.optional().openapi({
    param: { name: 'category', in: 'query' },
    example: 'gemstone',
  }),
});

export const ShagunProductIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});
