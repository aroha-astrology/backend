import { z } from '@hono/zod-openapi';

export const PreferencesResponseSchema = z
  .object({
    locale: z.string().nullable(),
    contentLanguage: z.string().nullable(),
    preferredSystem: z.string().nullable(),
    preferredAyanamsa: z.string().nullable(),
    preferredHouseSystem: z.string().nullable(),
    preferredChartStyle: z.string().nullable(),
    preferredDashaSystem: z.string().nullable(),
    preferredNodeType: z.string().nullable(),
    preferredCalendarLocale: z.string().nullable(),
    dailyHoroscopeSendHourLocal: z.string().nullable(),
    interestAreas: z.array(z.string()).nullable(),
    notificationPrefs: z.record(z.any()).nullable(),
    quietHours: z
      .object({ start: z.string(), end: z.string() })
      .nullable(),
  })
  .openapi('PreferencesResponse');

export const UpdatePreferencesBodySchema = z
  .object({
    locale: z.string().optional(),
    contentLanguage: z.string().optional(),
    preferredSystem: z.enum(['vedic', 'western']).optional(),
    preferredAyanamsa: z
      .enum(['lahiri', 'raman', 'krishnamurti', 'yukteshwar', 'true_chitrapaksha', 'fagan_bradley'])
      .optional(),
    preferredHouseSystem: z
      .enum([
        'whole_sign', 'equal', 'placidus', 'koch', 'campanus',
        'regiomontanus', 'porphyry', 'topocentric', 'alcabitius', 'sripati', 'kp_placidus',
      ])
      .optional(),
    preferredChartStyle: z.enum(['north_indian', 'south_indian', 'east_indian']).optional(),
    preferredDashaSystem: z
      .enum(['vimshottari', 'yogini', 'ashtottari', 'kalachakra', 'chara'])
      .optional(),
    preferredNodeType: z.enum(['mean', 'true']).optional(),
    preferredCalendarLocale: z.enum(['amanta', 'purnimanta']).optional(),
    dailyHoroscopeSendHourLocal: z.string().optional(),
    interestAreas: z.array(z.string()).optional(),
    notificationPrefs: z.record(z.any()).optional(),
    quietHours: z
      .object({ start: z.string(), end: z.string() })
      .optional(),
  })
  .strict()
  .openapi('UpdatePreferencesBody');
