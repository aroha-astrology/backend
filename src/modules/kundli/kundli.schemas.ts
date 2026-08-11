import { z } from '@hono/zod-openapi';

const JsonObject = z.record(z.string(), z.unknown());

/** 200 — the computed kundli. */
export const KundliSchema = z
  .object({
    status: z.literal('ready'),
    id: z.string().uuid(),
    timeKnown: z
      .boolean()
      .nullable()
      .describe('false = degraded sign-level kundli (birth time unknown)'),
    ayanamsa: z.string().nullable(),
    houseSystem: z.string().nullable(),
    chart: JsonObject.nullable().describe('planets, houses, ascendant'),
    dasha: JsonObject.nullable(),
    yogas: JsonObject.nullable(),
    doshas: JsonObject.nullable(),
    generatedAt: z.string().nullable(),
    /** The profile's declared confidence in the birth time this chart was computed from —
     * 'exact'/'approximate' only (a 'ready' chart can never come from an 'unknown' time, see
     * missingKundliParams). Drives the frontend's accuracy caveat, see `warning`. Optional on
     * the base type only because toKundliDto (kundli.service.ts) builds it from the row alone
     * before the route layer's withAccuracy attaches this from the resolved profile — every
     * actual HTTP response includes it. */
    birthTimeAccuracy: z.enum(['exact', 'approximate']).nullable().optional(),
    /** Non-null only for `birthTimeAccuracy: 'approximate'` — user-facing caveat that
     * ascendant/houses/dasha timing may shift with a more exact time. Same optionality
     * rationale as birthTimeAccuracy above. */
    warning: z.string().nullable().optional(),
  })
  .openapi('Kundli');

export type KundliDto = z.infer<typeof KundliSchema>;

/** Optional request-scoped language override for yoga/dosha name+description — same convention as HouseInsightQuerySchema. */
export const KundliQuerySchema = z.object({
  language: z
    .string()
    .min(2)
    .max(35)
    .optional()
    .openapi({ param: { name: 'language', in: 'query' } }),
});

/** 202 — generation status while the kundli is not yet available. */
export const KundliStatusSchema = z
  .object({
    status: z.enum(['pending', 'generating', 'failed']),
    message: z.string().optional(),
  })
  .openapi('KundliStatus');

/**
 * 422 — the user's profile is missing one or more parameters required to
 * compute a kundli. `missing` lists exactly which fields the frontend must
 * collect (all are captured during onboarding).
 */
export const KundliMissingParamsSchema = z
  .object({
    status: z.literal('missing_parameters'),
    missing: z
      .array(z.string())
      .describe('Required fields that are absent, e.g. ["timeOfBirth","placeOfBirth"]'),
    message: z.string(),
    /** Only meaningful when `timeOfBirth` is in `missing` — distinguishes "never entered a
     * birth time" (show the normal entry field) from "declared it unknown" (route straight
     * to the birth-time rectification flow instead of asking again for a time the user has
     * already said they don't have). Undefined when `timeOfBirth` isn't the blocker. */
    nextStep: z.enum(['enter_birth_time', 'rectify_birth_time']).optional(),
  })
  .openapi('KundliMissingParameters');

export const HouseParamSchema = z.object({
  house: z.coerce
    .number()
    .int()
    .min(1)
    .max(12)
    .openapi({ param: { name: 'house', in: 'path' } }),
});

/** Optional request-scoped language override — mirrors PurchasePlanModal's `language: i18n.language`, not the (currently unsynced) `user.contentLanguage` profile field. */
export const HouseInsightQuerySchema = z.object({
  language: z
    .string()
    .min(2)
    .max(35)
    .optional()
    .openapi({ param: { name: 'language', in: 'query' } }),
});

/** 200 — the personalized per-house insight (generated lazily on first unlock). */
export const HouseInsightSchema = z
  .object({
    status: z.literal('ready'),
    text: z.string(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
  })
  .openapi('HouseInsight');

/** 202 — generation in progress, or the last attempt failed — poll again. */
export const HouseInsightStatusSchema = z
  .object({
    status: z.enum(['generating', 'failed']),
  })
  .openapi('HouseInsightStatus');
