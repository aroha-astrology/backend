import { z } from '@hono/zod-openapi';
import { GenderSchema, PlaceOfBirthSchema } from '../users/users.schemas.js';

/**
 * `/v1/admin/*` phone-number path param. The client must URL-encode the
 * leading `+` (as `%2B`) — Hono decodes the path segment before this schema
 * ever sees it, so the plain E.164 string (with `+`) is what's validated here.
 */
export const PhoneParamSchema = z.object({
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Must be E.164 format, e.g. +919999999999')
    .openapi({ param: { name: 'phone', in: 'path' }, example: '+919999999999' }),
});

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/users/{phone}/inspect                                        */
/* -------------------------------------------------------------------------- */

export const AdminKundliSummarySchema = z
  .object({
    birthProfileId: z.string().uuid().nullable(),
    status: z.enum(['pending', 'generating', 'ready', 'failed']),
    error: z.string().nullable(),
    updatedAt: z.string(),
    chartData: z.record(z.string(), z.unknown()).nullable(),
    dashaData: z.record(z.string(), z.unknown()).nullable(),
    yogaData: z.record(z.string(), z.unknown()).nullable(),
    doshaData: z.record(z.string(), z.unknown()).nullable(),
    ashtakavargaData: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi('AdminKundliSummary');

export const AdminHoroscopeSummarySchema = z
  .object({
    birthProfileId: z.string().uuid().nullable(),
    period: z.enum(['daily', 'tomorrow', 'weekly', 'monthly', 'yearly']),
    forDate: z.string(),
    periodKey: z.string(),
    status: z.enum(['generating', 'ready', 'failed']),
    model: z.string().nullable(),
    summary: z.string().nullable(),
    structured: z.record(z.string(), z.unknown()).nullable(),
    monthlyBreakdown: z.array(z.record(z.string(), z.unknown())).nullable(),
    error: z.string().nullable(),
    updatedAt: z.string(),
  })
  .openapi('AdminHoroscopeSummary');

export const AdminUserInspectionSchema = z
  .object({
    user: z.object({
      id: z.string().uuid(),
      displayName: z.string().nullable(),
      phoneE164: z.string().nullable(),
      gender: GenderSchema.nullable(),
      dateOfBirth: z.string().nullable(),
      timeOfBirth: z.string().nullable(),
      placeOfBirth: PlaceOfBirthSchema.nullable(),
      onboardingStatus: z.string().nullable(),
      walletBalancePaise: z.number().int(),
      unlockedHouses: z.array(z.number().int()),
      gemstoneUnlockedAt: z.string().nullable(),
      createdAt: z.string(),
      deletedAt: z.string().nullable(),
    }),
    kundlis: z.array(AdminKundliSummarySchema),
    horoscopes: z.array(AdminHoroscopeSummarySchema),
  })
  .openapi('AdminUserInspection');

export type AdminUserInspection = z.infer<typeof AdminUserInspectionSchema>;

/* -------------------------------------------------------------------------- */
/* POST /v1/admin/users/{phone}/regenerate                                    */
/* -------------------------------------------------------------------------- */

/**
 * The real, currently-supported single-user regeneration categories — found
 * by reading all 6 scripts/regenerate-*.ts scripts (see plan "Before you
 * start"): 'horoscope' (all 5 periods, scripts/regenerate-one-user.ts),
 * 'dosha' (deterministic recompute, scripts/regenerate-all-doshas.ts), and
 * 'gemstone' (scripts/regenerate-gemstone-all.ts). 'all' runs all three.
 * Per-house-insight regeneration (scripts/force-regenerate.ts) is
 * deliberately NOT a category here — see the plan's Notes section.
 */
export const AdminRegenerateCategorySchema = z
  .enum(['gemstone', 'dosha', 'horoscope', 'all'])
  .openapi('AdminRegenerateCategory');

export const AdminRegenerateBodySchema = z
  .object({ category: AdminRegenerateCategorySchema })
  .strict()
  .openapi('AdminRegenerateBody');

export const AdminRegenerateResponseSchema = z
  .object({ status: z.literal('started') })
  .openapi('AdminRegenerateResponse');

export type AdminRegenerateCategory = z.infer<typeof AdminRegenerateCategorySchema>;

/* -------------------------------------------------------------------------- */
/* POST /v1/admin/users/{phone}/notify                                        */
/* -------------------------------------------------------------------------- */

export const AdminNotifyBodySchema = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(500),
  })
  .strict()
  .openapi('AdminNotifyBody');

export const AdminNotifyResponseSchema = z
  .object({
    tokenCount: z.number().int().nonnegative(),
    success: z.number().int().nonnegative(),
    failure: z.number().int().nonnegative(),
  })
  .openapi('AdminNotifyResponse');

/* -------------------------------------------------------------------------- */
/* GET /v1/admin/device-tokens/stats                                          */
/* -------------------------------------------------------------------------- */

export const AdminDeviceTokenStatsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    byPlatform: z.record(z.string(), z.number().int().nonnegative()),
  })
  .openapi('AdminDeviceTokenStats');
