import { z } from '@hono/zod-openapi';

/* -------------------------------------------------------------------------- */
/* Reusable primitives                                                         */
/* -------------------------------------------------------------------------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

/** True for a real calendar date (no Feb 30), year >= 1900, not in the future. */
function isRealPastDate(s: string): boolean {
  const parts = s.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return false;
  }
  return y >= 1900 && dt.getTime() <= Date.now();
}

/** True for an in-range wall-clock time (00:00:00–23:59:59). */
function isRealTime(s: string): boolean {
  const parts = s.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const sec = parts[2] === undefined ? 0 : Number(parts[2]);
  return h <= 23 && m <= 59 && sec <= 59;
}

/** A birth date: real calendar date, not in the future. */
export const DateString = z
  .string()
  .regex(DATE_RE, 'Must be YYYY-MM-DD')
  .refine(isRealPastDate, 'Must be a real date, not in the future');

/** A wall-clock time of day. */
export const TimeString = z
  .string()
  .regex(TIME_RE, 'Must be HH:mm or HH:mm:ss')
  .refine(isRealTime, 'Must be a valid time of day');

export const PlaceSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: 'Mumbai, Maharashtra, India' }),
    lat: z.number().gte(-90).lte(90).openapi({ example: 19.076 }),
    lon: z.number().gte(-180).lte(180).openapi({ example: 72.8777 }),
    tz: z.string().min(1).max(64).openapi({ example: 'Asia/Kolkata' }),
    placeId: z.string().max(200).optional(),
    countryCode: z.string().length(2).optional().openapi({ example: 'IN' }),
    admin1: z.string().max(120).optional().openapi({ example: 'Maharashtra' }),
    source: z.enum(['geocoded', 'manual']).optional(),
  })
  .strict()
  .openapi('Place');

/** Back-compat alias — the birth place uses the same shape. */
export const PlaceOfBirthSchema = PlaceSchema;

export const GenderSchema = z.enum(['male', 'female', 'other']).openapi('Gender');

export const PreferredSystemSchema = z.enum(['vedic', 'western']).openapi('PreferredSystem');
export const AyanamsaSchema = z
  .enum(['lahiri', 'raman', 'krishnamurti', 'yukteshwar', 'true_chitrapaksha', 'fagan_bradley'])
  .openapi('Ayanamsa');
export const HouseSystemSchema = z
  .enum([
    'whole_sign',
    'equal',
    'placidus',
    'koch',
    'campanus',
    'regiomontanus',
    'porphyry',
    'topocentric',
    'alcabitius',
    'sripati',
    'kp_placidus',
  ])
  .openapi('HouseSystem');
export const ChartStyleSchema = z
  .enum(['north_indian', 'south_indian', 'east_indian'])
  .openapi('ChartStyle');
export const DashaSystemSchema = z
  .enum(['vimshottari', 'yogini', 'ashtottari', 'kalachakra', 'chara'])
  .openapi('DashaSystem');
export const DashaYearLengthSchema = z
  .enum(['savana_360', 'solar_365_25', 'drik_365_2425'])
  .openapi('DashaYearLength');
export const NodeTypeSchema = z.enum(['mean', 'true']).openapi('NodeType');
export const CalendarLocaleSchema = z.enum(['amanta', 'purnimanta']).openapi('CalendarLocale');

export const BirthTimeAccuracySchema = z
  .enum(['exact', 'approximate', 'unknown'])
  .openapi('BirthTimeAccuracy');
export const BirthTimeSourceSchema = z
  .enum(['birth_certificate', 'hospital_record', 'family_memory', 'rectified', 'unknown'])
  .openapi('BirthTimeSource');
export const RectificationConfidenceSchema = z
  .enum(['low', 'medium', 'high'])
  .openapi('RectificationConfidence');
export const BirthLocationAccuracySchema = z
  .enum(['exact', 'city', 'region', 'unknown'])
  .openapi('BirthLocationAccuracy');

export const RelationshipStatusSchema = z
  .enum([
    'single',
    'in_relationship',
    'engaged',
    'married',
    'divorced',
    'widowed',
    'separated',
    'complicated',
    'prefer_not_to_say',
  ])
  .openapi('RelationshipStatus');
export const PartnerSeekingIntentSchema = z
  .enum(['not_seeking', 'exploring', 'seeking_marriage'])
  .openapi('PartnerSeekingIntent');

export const OnboardingStatusSchema = z
  .enum(['not_started', 'in_progress', 'completed', 'skipped'])
  .openapi('OnboardingStatus');
export const PlatformSchema = z.enum(['ios', 'android', 'web']).openapi('Platform');

const ChannelPrefsSchema = z
  .object({
    push: z.boolean().optional(),
    email: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
    sms: z.boolean().optional(),
  })
  .strict();

export const NotificationPrefsSchema = z
  .object({
    dailyHoroscope: ChannelPrefsSchema.optional(),
    transitAlerts: ChannelPrefsSchema.optional(),
    muhurta: ChannelPrefsSchema.optional(),
    marketing: ChannelPrefsSchema.optional(),
  })
  .strict()
  .openapi('NotificationPrefs');

export const QuietHoursSchema = z
  .object({
    start: TimeString.openapi({ example: '22:00' }),
    end: TimeString.openapi({ example: '07:00' }),
  })
  .strict()
  .openapi('QuietHours');

export const ChartPreferencesSchema = z
  .object({
    defaultChartType: z.string().max(64).optional(),
    relocationPlace: PlaceSchema.optional(),
    aspectsToAngles: z.boolean().optional(),
    orbs: z.record(z.string(), z.number()).optional(),
    bodies: z
      .object({
        chiron: z.boolean().optional(),
        lilith: z.boolean().optional(),
        ceres: z.boolean().optional(),
        pallas: z.boolean().optional(),
        juno: z.boolean().optional(),
        vesta: z.boolean().optional(),
        arabicParts: z.boolean().optional(),
        vertex: z.boolean().optional(),
        midpoints: z.boolean().optional(),
      })
      .strict()
      .optional(),
    detectAspectPatterns: z.boolean().optional(),
  })
  .strict()
  .openapi('ChartPreferences');

/* -------------------------------------------------------------------------- */
/* User DTO (read model)                                                       */
/* -------------------------------------------------------------------------- */

export const UserSchema = z
  .object({
    id: z.string().uuid(),
    firebaseUid: z.string(),
    phoneE164: z.string().nullable(),

    displayName: z.string().nullable(),
    gender: GenderSchema.nullable(),
    email: z.string().nullable(),
    avatarUrl: z.string().nullable(),

    dateOfBirth: z.string().nullable().describe('ISO 8601 date (YYYY-MM-DD)'),
    timeOfBirth: z.string().nullable().describe('24h time (HH:mm or HH:mm:ss)'),
    placeOfBirth: PlaceSchema.nullable(),
    birthTimeAccuracy: BirthTimeAccuracySchema.nullable(),
    birthTimeSource: BirthTimeSourceSchema.nullable(),
    birthTimeRectified: z.boolean().nullable(),
    birthTimeRectificationConfidence: RectificationConfidenceSchema.nullable(),
    birthLocationAccuracy: BirthLocationAccuracySchema.nullable(),
    canEditBirthDetails: z
      .boolean()
      .describe('False once the user has used their one lifetime birth-detail edit'),
    gotra: z.string().nullable(),
    sankalpaName: z.string().nullable(),

    preferredSystem: PreferredSystemSchema.nullable(),
    preferredAyanamsa: AyanamsaSchema.nullable(),
    preferredHouseSystem: HouseSystemSchema.nullable(),
    preferredChartStyle: ChartStyleSchema.nullable(),
    preferredDashaSystem: DashaSystemSchema.nullable(),
    preferredDashaYearLength: DashaYearLengthSchema.nullable(),
    preferredNodeType: NodeTypeSchema.nullable(),
    preferredCalendarLocale: CalendarLocaleSchema.nullable(),
    chartPreferences: ChartPreferencesSchema.nullable(),

    currentLocation: PlaceSchema.nullable(),
    currentLocationUpdatedAt: z.string().nullable(),
    currentTimezone: z.string().nullable(),
    currentCountry: z.string().nullable(),

    locale: z.string().nullable(),
    contentLanguage: z.string().nullable(),

    dailyHoroscopeSendHourLocal: z.string().nullable(),
    interestAreas: z.array(z.string()).nullable(),
    relationshipStatus: RelationshipStatusSchema.nullable(),
    partnerSeekingIntent: PartnerSeekingIntentSchema.nullable(),
    notificationPrefs: NotificationPrefsSchema.nullable(),
    quietHours: QuietHoursSchema.nullable(),

    onboardingStatus: OnboardingStatusSchema.nullable(),
    onboardingStep: z.string().nullable(),
    onboardingCompletedAt: z.string().nullable(),
    profileCompletedAt: z.string().nullable().describe('ISO 8601 timestamp'),

    lastActiveAt: z.string().nullable(),
    streakCount: z.number().int().nullable(),
    streakLastDay: z.string().nullable(),
    appVersion: z.string().nullable(),
    platform: PlatformSchema.nullable(),
    credits: z.number().int(),
    unlockedHouses: z.array(z.number().int()),
    gemstoneUnlocked: z
      .boolean()
      .describe('True once the user has spent credits to unlock the gemstone report'),

    referralSource: z.string().nullable(),
    referredByCode: z.string().nullable(),
    referralCode: z.string().nullable(),

    marketingConsentAt: z.string().nullable(),
    marketingConsentRevokedAt: z.string().nullable(),
    marketingConsentActive: z.boolean().describe('Marketing consent currently in force'),
    whatsappOptInAt: z.string().nullable(),
    whatsappOptInRevokedAt: z.string().nullable(),
    whatsappOptInActive: z.boolean().describe('WhatsApp opt-in currently in force'),
    dataProcessingConsentAt: z.string().nullable(),
    dataProcessingConsentRevokedAt: z.string().nullable(),
    dataProcessingConsentActive: z.boolean().describe('Data-processing consent currently in force'),
    termsAcceptedAt: z.string().nullable(),
    termsVersion: z.string().nullable(),
    privacyPolicyAcceptedAt: z.string().nullable(),
    privacyPolicyVersion: z.string().nullable(),

    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('User');

export type UserDto = z.infer<typeof UserSchema>;

/* -------------------------------------------------------------------------- */
/* Consent input (translated to timestamps + audit log by the service)         */
/* -------------------------------------------------------------------------- */

export const ConsentInputSchema = z
  .object({
    /** Marketing comms. `false` records a withdrawal. */
    marketing: z.boolean().optional(),
    /** WhatsApp Business opt-in (Meta requires explicit per-channel opt-in). */
    whatsapp: z.boolean().optional(),
    /** Processing of sensitive birth/personal data for astrology features. */
    dataProcessing: z.boolean().optional(),
    /** Accept Terms of Service at a given document version. */
    terms: z
      .object({ version: z.string().min(1).max(64) })
      .strict()
      .optional(),
    /** Accept Privacy Policy at a given document version. */
    privacy: z
      .object({ version: z.string().min(1).max(64) })
      .strict()
      .optional(),
  })
  .strict()
  .openapi('ConsentInput');

export type ConsentInput = z.infer<typeof ConsentInputSchema>;

/* -------------------------------------------------------------------------- */
/* PATCH /v1/me body (progressive profile update)                              */
/* -------------------------------------------------------------------------- */

export const UpdateMeBodySchema = z
  .object({
    // identity
    displayName: z.string().min(1).max(120).optional(),
    gender: GenderSchema.optional(),
    email: z.string().email().max(254).optional(),
    avatarUrl: z.string().url().max(2048).optional(),

    // birth event
    dateOfBirth: DateString.optional(),
    timeOfBirth: TimeString.nullable().optional(),
    placeOfBirth: PlaceSchema.optional(),
    birthTimeAccuracy: BirthTimeAccuracySchema.optional(),
    birthTimeSource: BirthTimeSourceSchema.optional(),
    birthTimeRectified: z.boolean().optional(),
    birthTimeRectificationConfidence: RectificationConfidenceSchema.optional(),
    birthLocationAccuracy: BirthLocationAccuracySchema.optional(),
    gotra: z.string().max(120).optional(),
    sankalpaName: z.string().max(200).optional(),

    // astrology preferences
    preferredSystem: PreferredSystemSchema.optional(),
    preferredAyanamsa: AyanamsaSchema.optional(),
    preferredHouseSystem: HouseSystemSchema.optional(),
    preferredChartStyle: ChartStyleSchema.optional(),
    preferredDashaSystem: DashaSystemSchema.optional(),
    preferredDashaYearLength: DashaYearLengthSchema.optional(),
    preferredNodeType: NodeTypeSchema.optional(),
    preferredCalendarLocale: CalendarLocaleSchema.optional(),
    chartPreferences: ChartPreferencesSchema.optional(),

    // current residence
    currentLocation: PlaceSchema.optional(),
    currentTimezone: z.string().min(1).max(64).optional(),
    currentCountry: z.string().length(2).optional(),

    // localization
    locale: z.string().min(2).max(35).optional(),
    contentLanguage: z.string().min(2).max(35).optional(),

    // engagement / personalization
    dailyHoroscopeSendHourLocal: TimeString.optional(),
    interestAreas: z.array(z.string().min(1).max(40)).max(20).optional(),
    relationshipStatus: RelationshipStatusSchema.optional(),
    partnerSeekingIntent: PartnerSeekingIntentSchema.optional(),
    notificationPrefs: NotificationPrefsSchema.optional(),
    quietHours: QuietHoursSchema.optional(),

    // onboarding funnel
    onboardingStatus: OnboardingStatusSchema.optional(),
    onboardingStep: z.string().max(80).optional(),

    // client / acquisition
    appVersion: z.string().max(40).optional(),
    platform: PlatformSchema.optional(),
    referralSource: z.string().max(200).optional(),
    referredByCode: z.string().max(64).optional(),

    // consent (handled specially by the service)
    consent: ConsentInputSchema.optional(),
  })
  .strict()
  .openapi('UpdateMeBody');

export type UpdateMeBody = z.infer<typeof UpdateMeBodySchema>;

/* -------------------------------------------------------------------------- */
/* POST /v1/me/unlock-house body                                               */
/* -------------------------------------------------------------------------- */

export const UnlockHouseBodySchema = z
  .object({
    houseNumber: z.number().int().min(1).max(12),
  })
  .strict()
  .openapi('UnlockHouseBody');

export type UnlockHouseBody = z.infer<typeof UnlockHouseBodySchema>;
