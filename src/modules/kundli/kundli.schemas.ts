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
  })
  .openapi('Kundli');

export type KundliDto = z.infer<typeof KundliSchema>;

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
  })
  .openapi('KundliMissingParameters');
