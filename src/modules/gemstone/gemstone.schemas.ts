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
    /** Also the i18n lookup key on the frontend — kundli.gemstone.data.<planet>.* — for all locale-dependent facts (name, alternatives, finger, metal, day, weight, dos, donts). */
    planet: z.string(),
    /** Sanskrit chant text — locale-invariant, same for every language. */
    mantra: z.string(),
    /** Practical mantra practice: N times per day for N days (uniform across all 9 stones). */
    mantraPerDay: z.number().int(),
    mantraDays: z.number().int(),
    /** Hex accent for the UI gem swatch. */
    color: z.string(),
    strength: GemstoneStrengthSchema,
    /** How strongly this stone is preferred for the user: true = strongly recommended (weak/afflicted planet). */
    recommended: z.boolean(),
    /** 0-100 — how strongly this gemstone is preferred for the user (headline percentage). */
    preferencePercent: z.number().int().min(0).max(100),
    /** True only when this planet's chart-specific caution actually applies to this user (e.g. rules a dusthana house) — the frontend shows the matching translated caution line only when true. */
    conditionalCautionApplies: z.boolean(),
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
