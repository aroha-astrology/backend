import { z } from '@hono/zod-openapi';

/** `?language=` — request-scoped content language (preferred over the stale user.contentLanguage). */
export const LanguageQuerySchema = z.object({
  language: z.string().min(2).max(35).optional(),
});

export const GemstoneStrengthSchema = z
  .enum(['weak', 'average', 'strong'])
  .openapi('GemstoneStrength');

export const GemstoneItemSchema = z
  .object({
    planet: z.string(),
    planetHindi: z.string(),
    gemstone: z.string(),
    gemstoneHindi: z.string(),
    alternativeStones: z.array(z.string()),
    finger: z.string(),
    metal: z.string(),
    dayToWear: z.string(),
    mantra: z.string(),
    mantraCount: z.number().int(),
    weightCarats: z.string(),
    /** Hex accent for the UI gem swatch. */
    color: z.string(),
    dos: z.array(z.string()),
    donts: z.array(z.string()),
    strength: GemstoneStrengthSchema,
    /** How strongly this stone is preferred for the user: true = strongly recommended (weak/afflicted planet). */
    recommended: z.boolean(),
    /** 0-100 — how strongly this gemstone is preferred for the user (headline percentage). */
    preferencePercent: z.number().int().min(0).max(100),
    /** Deterministic dignity reason, e.g. "Debilitated in Libra". */
    reason: z.string(),
    /** AI-authored personal note (translated on read). */
    note: z.string(),
  })
  .openapi('GemstoneItem');

export const GemstoneReportSchema = z
  .object({
    status: z.literal('ready'),
    /** AI-authored personalized overview (translated on read). */
    intro: z.string(),
    gems: z.array(GemstoneItemSchema),
  })
  .openapi('GemstoneReport');

export const GemstoneStatusSchema = z
  .object({
    status: z.enum(['generating', 'failed']),
  })
  .openapi('GemstoneStatus');

export type GemstoneItemDto = z.infer<typeof GemstoneItemSchema>;
export type GemstoneReportDto = z.infer<typeof GemstoneReportSchema>;
