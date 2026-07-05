import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  time,
  jsonb,
  boolean,
  integer,
  doublePrecision,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import type { PanchangData } from '@aroha-astrology/shared';

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);

/** Which zodiac/tradition the user's charts are computed against. */
export const preferredSystemEnum = pgEnum('preferred_system', ['vedic', 'western']);

/** Sidereal precession-offset model (Vedic). Read-time default: 'lahiri'. */
export const preferredAyanamsaEnum = pgEnum('preferred_ayanamsa', [
  'lahiri',
  'raman',
  'krishnamurti',
  'yukteshwar',
  'true_chitrapaksha',
  'fagan_bradley',
]);

/** Bhava/house cusp convention — union of Vedic + Western schools. */
export const houseSystemEnum = pgEnum('house_system', [
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
]);

/** Diagram style for rendering a Vedic chart. */
export const preferredChartStyleEnum = pgEnum('preferred_chart_style', [
  'north_indian',
  'south_indian',
  'east_indian',
]);

export const preferredDashaSystemEnum = pgEnum('preferred_dasha_system', [
  'vimshottari',
  'yogini',
  'ashtottari',
  'kalachakra',
  'chara',
]);

export const preferredDashaYearLengthEnum = pgEnum('preferred_dasha_year_length', [
  'savana_360',
  'solar_365_25',
  'drik_365_2425',
]);

/** Rahu/Ketu node convention. */
export const preferredNodeTypeEnum = pgEnum('preferred_node_type', ['mean', 'true']);

/** Amanta vs Purnimanta lunar-month reckoning. */
export const preferredCalendarLocaleEnum = pgEnum('preferred_calendar_locale', [
  'amanta',
  'purnimanta',
]);

/**
 * Confidence in a recorded birth time. `unknown` is a valid terminal state:
 * the profile can complete with no `time_of_birth` when accuracy is `unknown`.
 */
export const birthTimeAccuracyEnum = pgEnum('birth_time_accuracy', [
  'exact',
  'approximate',
  'unknown',
]);

export const birthTimeSourceEnum = pgEnum('birth_time_source', [
  'birth_certificate',
  'hospital_record',
  'family_memory',
  'rectified',
  'unknown',
]);

export const birthTimeRectificationConfidenceEnum = pgEnum('birth_time_rectification_confidence', [
  'low',
  'medium',
  'high',
]);

export const birthLocationAccuracyEnum = pgEnum('birth_location_accuracy', [
  'exact',
  'city',
  'region',
  'unknown',
]);

export const relationshipStatusEnum = pgEnum('relationship_status', [
  'single',
  'in_relationship',
  'engaged',
  'married',
  'divorced',
  'widowed',
  'separated',
  'complicated',
  'prefer_not_to_say',
]);

export const partnerSeekingIntentEnum = pgEnum('partner_seeking_intent', [
  'not_seeking',
  'exploring',
  'seeking_marriage',
]);

export const onboardingStatusEnum = pgEnum('onboarding_status', [
  'not_started',
  'in_progress',
  'completed',
  'skipped',
]);

export const platformEnum = pgEnum('platform', ['ios', 'android', 'web']);

export const birthProfileRelationshipEnum = pgEnum('birth_profile_relationship', [
  'partner',
  'prospective_match',
  'spouse',
  'child',
  'parent',
  'sibling',
  'friend',
  'other',
]);

export const consentTypeEnum = pgEnum('consent_type', [
  'terms',
  'privacy',
  'marketing',
  'data_processing',
  'whatsapp',
]);

export const consentActionEnum = pgEnum('consent_action', ['granted', 'withdrawn']);

/* -------------------------------------------------------------------------- */
/* JSONB value-object shapes                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A geocoded place. Used for `place_of_birth` (immutable) and
 * `current_location` (mutable residence). lat/lon/tz are required chart inputs;
 * the rest are optional geocoder metadata.
 */
export type PlaceOfBirth = {
  name: string;
  lat: number;
  lon: number;
  /** IANA timezone, e.g. "Asia/Kolkata". */
  tz: string;
  placeId?: string;
  /** ISO 3166-1 alpha-2. */
  countryCode?: string;
  /** Primary administrative division (state/province). */
  admin1?: string;
  source?: 'geocoded' | 'manual';
};

/** Per-category channel toggles for notifications. */
export type NotificationChannelPrefs = {
  push?: boolean;
  email?: boolean;
  whatsapp?: boolean;
  sms?: boolean;
};

/**
 * UX-layer notification toggles. Marketing/WhatsApp sends must ALSO pass the
 * legal consent gate (`marketingConsentAt` / `whatsappOptInAt`), not just this.
 */
export type NotificationPrefs = {
  dailyHoroscope?: NotificationChannelPrefs;
  transitAlerts?: NotificationChannelPrefs;
  muhurta?: NotificationChannelPrefs;
  marketing?: NotificationChannelPrefs;
};

/** Do-not-disturb window, interpreted in the user's current timezone. */
export type QuietHours = {
  /** 'HH:mm' local. */
  start: string;
  /** 'HH:mm' local. */
  end: string;
};

/** Western chart-rendering input preferences (parameterize, never store outputs). */
export type ChartPreferences = {
  defaultChartType?: string;
  relocationPlace?: PlaceOfBirth;
  aspectsToAngles?: boolean;
  /** Aspect name -> orb in degrees. */
  orbs?: Record<string, number>;
  bodies?: {
    chiron?: boolean;
    lilith?: boolean;
    ceres?: boolean;
    pallas?: boolean;
    juno?: boolean;
    vesta?: boolean;
    arabicParts?: boolean;
    vertex?: boolean;
    midpoints?: boolean;
  };
  detectAspectPatterns?: boolean;
};

/** First-touch attribution payload (MMP/UTM). Write-once at signup. */
export type AcquisitionAttribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  installId?: string;
  adgroup?: string;
};

/* -------------------------------------------------------------------------- */
/* users — the account holder                                                  */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    firebaseUid: text('firebase_uid').notNull().unique(),
    phoneE164: text('phone_e164').unique(),

    // --- identity / profile ------------------------------------------------
    displayName: text('display_name'),
    gender: genderEnum('gender'),
    email: text('email'),
    avatarUrl: text('avatar_url'),

    // --- birth event (chart inputs) ---------------------------------------
    dateOfBirth: date('date_of_birth'),
    timeOfBirth: time('time_of_birth'),
    placeOfBirth: jsonb('place_of_birth').$type<PlaceOfBirth>(),
    birthTimeAccuracy: birthTimeAccuracyEnum('birth_time_accuracy'),
    birthTimeSource: birthTimeSourceEnum('birth_time_source'),
    birthTimeRectified: boolean('birth_time_rectified'),
    birthTimeRectificationConfidence: birthTimeRectificationConfidenceEnum(
      'birth_time_rectification_confidence',
    ),
    birthLocationAccuracy: birthLocationAccuracyEnum('birth_location_accuracy'),
    gotra: text('gotra'),
    sankalpaName: text('sankalpa_name'),

    // --- astrology calculation preferences (read-time defaults; nullable) --
    preferredSystem: preferredSystemEnum('preferred_system'),
    preferredAyanamsa: preferredAyanamsaEnum('preferred_ayanamsa'),
    preferredHouseSystem: houseSystemEnum('preferred_house_system'),
    preferredChartStyle: preferredChartStyleEnum('preferred_chart_style'),
    preferredDashaSystem: preferredDashaSystemEnum('preferred_dasha_system'),
    preferredDashaYearLength: preferredDashaYearLengthEnum('preferred_dasha_year_length'),
    preferredNodeType: preferredNodeTypeEnum('preferred_node_type'),
    preferredCalendarLocale: preferredCalendarLocaleEnum('preferred_calendar_locale'),
    chartPreferences: jsonb('chart_preferences').$type<ChartPreferences>(),

    // --- current residence (transits / daily horoscope) -------------------
    currentLocation: jsonb('current_location').$type<PlaceOfBirth>(),
    currentLocationUpdatedAt: timestamp('current_location_updated_at', { withTimezone: true }),
    currentTimezone: text('current_timezone'),
    currentCountry: text('current_country'),

    // --- localization ------------------------------------------------------
    locale: text('locale'),
    contentLanguage: text('content_language'),

    // --- engagement / personalization -------------------------------------
    dailyHoroscopeSendHourLocal: time('daily_horoscope_send_hour_local'),
    interestAreas: text('interest_areas').array().$type<string[]>(),
    relationshipStatus: relationshipStatusEnum('relationship_status'),
    partnerSeekingIntent: partnerSeekingIntentEnum('partner_seeking_intent'),
    notificationPrefs: jsonb('notification_prefs').$type<NotificationPrefs>(),
    quietHours: jsonb('quiet_hours').$type<QuietHours>(),

    // --- onboarding funnel -------------------------------------------------
    onboardingStatus: onboardingStatusEnum('onboarding_status'),
    onboardingStep: text('onboarding_step'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    profileCompletedAt: timestamp('profile_completed_at', { withTimezone: true }),

    // --- activity / client -------------------------------------------------
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    streakCount: integer('streak_count'),
    streakLastDay: date('streak_last_day'),
    appVersion: text('app_version'),
    platform: platformEnum('platform'),

    // --- acquisition / referral -------------------------------------------
    referralSource: text('referral_source'),
    referredByCode: text('referred_by_code'),
    referralCode: text('referral_code'),
    acquisitionAttribution: jsonb('acquisition_attribution').$type<AcquisitionAttribution>(),

    // --- consent (current effective state; history in user_consent_log) ----
    marketingConsentAt: timestamp('marketing_consent_at', { withTimezone: true }),
    marketingConsentRevokedAt: timestamp('marketing_consent_revoked_at', { withTimezone: true }),
    whatsappOptInAt: timestamp('whatsapp_opt_in_at', { withTimezone: true }),
    whatsappOptInRevokedAt: timestamp('whatsapp_opt_in_revoked_at', { withTimezone: true }),
    dataProcessingConsentAt: timestamp('data_processing_consent_at', { withTimezone: true }),
    dataProcessingConsentRevokedAt: timestamp('data_processing_consent_revoked_at', {
      withTimezone: true,
    }),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    termsVersion: text('terms_version'),
    privacyPolicyAcceptedAt: timestamp('privacy_policy_accepted_at', { withTimezone: true }),
    privacyPolicyVersion: text('privacy_policy_version'),

    // --- lifecycle ---------------------------------------------------------
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    // firebase_uid and phone_e164 are already backed by unique-constraint
    // indexes (.unique()), so no separate plain index is needed.
    emailLowerUnique: uniqueIndex('users_email_lower_unique')
      .on(sql`lower(${table.email})`)
      .where(sql`${table.deletedAt} is null and ${table.email} is not null`),
    referralCodeUnique: uniqueIndex('users_referral_code_unique')
      .on(table.referralCode)
      .where(sql`${table.referralCode} is not null`),
    referredByCodeIdx: index('users_referred_by_code_idx').on(table.referredByCode),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/* -------------------------------------------------------------------------- */
/* birth_profiles — saved charts for OTHER people (matching / family)          */
/* -------------------------------------------------------------------------- */

export const birthProfiles = pgTable(
  'birth_profiles',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    relationship: birthProfileRelationshipEnum('relationship'),
    displayName: text('display_name'),
    gender: genderEnum('gender'),
    dateOfBirth: date('date_of_birth'),
    timeOfBirth: time('time_of_birth'),
    placeOfBirth: jsonb('place_of_birth').$type<PlaceOfBirth>(),
    birthTimeAccuracy: birthTimeAccuracyEnum('birth_time_accuracy'),
    birthTimeSource: birthTimeSourceEnum('birth_time_source'),
    birthLocationAccuracy: birthLocationAccuracyEnum('birth_location_accuracy'),
    gotra: text('gotra'),
    /** Owner attests they may store this third party's birth data. */
    addedWithConsent: boolean('added_with_consent'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    ownerIdx: index('birth_profiles_owner_user_id_idx')
      .on(table.ownerUserId)
      .where(sql`${table.deletedAt} is null`),
  }),
);

export type BirthProfileRow = typeof birthProfiles.$inferSelect;
export type NewBirthProfileRow = typeof birthProfiles.$inferInsert;

/* -------------------------------------------------------------------------- */
/* device_push_tokens — multi-device push registrations                        */
/* -------------------------------------------------------------------------- */

export const devicePushTokens = pgTable(
  'device_push_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: platformEnum('platform').notNull(),
    deviceId: text('device_id'),
    locale: text('locale'),
    appVersion: text('app_version'),
    osVersion: text('os_version'),
    /** OS-level push permission state on this device. */
    pushEnabled: boolean('push_enabled'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdx: index('device_push_tokens_user_id_idx')
      .on(table.userId)
      .where(sql`${table.revokedAt} is null`),
    tokenUnique: uniqueIndex('device_push_tokens_token_unique')
      .on(table.token)
      .where(sql`${table.revokedAt} is null`),
  }),
);

export type DevicePushTokenRow = typeof devicePushTokens.$inferSelect;
export type NewDevicePushTokenRow = typeof devicePushTokens.$inferInsert;

/* -------------------------------------------------------------------------- */
/* user_consent_log — append-only consent audit trail                          */
/* -------------------------------------------------------------------------- */

export const userConsentLog = pgTable(
  'user_consent_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      // RESTRICT, not CASCADE: an append-only audit trail must survive even a
      // hard delete of the user row. Erasure scrubs PII via users.anonymizedAt.
      .references(() => users.id, { onDelete: 'restrict' }),
    consentType: consentTypeEnum('consent_type').notNull(),
    action: consentActionEnum('action').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    policyVersion: text('policy_version'),
    sourceIp: text('source_ip'),
    userAgent: text('user_agent'),
  },
  (table) => ({
    userOccurredIdx: index('user_consent_log_user_id_occurred_at_idx').on(
      table.userId,
      table.occurredAt,
    ),
  }),
);

export type UserConsentLogRow = typeof userConsentLog.$inferSelect;
export type NewUserConsentLogRow = typeof userConsentLog.$inferInsert;

/* -------------------------------------------------------------------------- */
/* subscription_plans — billing tiers                                          */
/* -------------------------------------------------------------------------- */

export const subscriptionPlanStatusEnum = pgEnum('subscription_status', [
  'active',
  'cancelled',
  'expired',
  'trial',
]);

export const subscriptionPlans = pgTable('subscription_plans', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  monthlyPrice: integer('monthly_price').notNull().default(0),
  features: jsonb('features').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const userSubscriptions = pgTable(
  'user_subscriptions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id),
    status: subscriptionPlanStatusEnum('status').notNull().default('active'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdx: index('user_subscriptions_user_id_idx').on(table.userId),
  }),
);

/* -------------------------------------------------------------------------- */
/* credit_transactions — token wallet ledger                                   */
/* -------------------------------------------------------------------------- */

export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdx: index('credit_transactions_user_id_idx').on(table.userId),
  }),
);

/* -------------------------------------------------------------------------- */
/* prediction_feedback — user feedback on predictions                          */
/* -------------------------------------------------------------------------- */

export const predictionFeedback = pgTable(
  'prediction_feedback',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    predictionId: text('prediction_id'),
    rating: integer('rating'),
    helpful: boolean('helpful'),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdx: index('prediction_feedback_user_id_idx').on(table.userId),
  }),
);

/* -------------------------------------------------------------------------- */
/* ai_usage — LLM token/cost tracking                                          */
/* -------------------------------------------------------------------------- */

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    agent: text('agent').notNull(),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userIdx: index('ai_usage_user_id_idx').on(table.userId),
  }),
);

/* -------------------------------------------------------------------------- */
/* precompute_jobs — background job tracking                                    */
/* -------------------------------------------------------------------------- */

export const precomputeJobStatusEnum = pgEnum('precompute_job_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const precomputeJobs = pgTable(
  'precompute_jobs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id'),
    periodType: text('period_type').notNull(),
    periodKey: text('period_key').notNull(),
    status: precomputeJobStatusEnum('status').notNull().default('pending'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    userPeriodIdx: index('precompute_jobs_user_period_idx').on(
      table.userId,
      table.periodType,
      table.periodKey,
    ),
  }),
);

/* -------------------------------------------------------------------------- */
/* kundlis — one precomputed natal kundli per account holder                   */
/* -------------------------------------------------------------------------- */

export const kundliStatusEnum = pgEnum('kundli_status', [
  'pending',
  'generating',
  'ready',
  'failed',
]);

export const kundlis = pgTable('kundlis', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: kundliStatusEnum('status').notNull().default('pending'),
  /** Resolved ayanamsa actually used for the computation (engine-supported). */
  ayanamsa: text('ayanamsa'),
  /** Resolved house system actually used ('W' | 'P' | 'K' | 'E'). */
  houseSystem: text('house_system'),
  /**
   * false when birth time was unknown → a degraded sign-level kundli with no
   * ascendant/houses/dasha. Distinguishes a valid degraded chart from a bug.
   */
  timeKnown: boolean('time_known'),
  /** Hash of the birth inputs this kundli was computed from (staleness/dedupe). */
  birthHash: text('birth_hash'),
  chartData: jsonb('chart_data').$type<Record<string, unknown>>(),
  dashaData: jsonb('dasha_data').$type<Record<string, unknown>>(),
  yogaData: jsonb('yoga_data').$type<Record<string, unknown>>(),
  doshaData: jsonb('dosha_data').$type<Record<string, unknown>>(),
  ashtakavargaData: jsonb('ashtakavarga_data').$type<Record<string, unknown>>(),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type KundliRow = typeof kundlis.$inferSelect;
export type NewKundliRow = typeof kundlis.$inferInsert;

/* -------------------------------------------------------------------------- */
/* daily_horoscopes — one personalized horoscope per user per period           */
/* -------------------------------------------------------------------------- */

export const horoscopePeriodEnum = pgEnum('horoscope_period', [
  'daily',
  'weekly',
  'monthly',
  'yearly',
]);

/** A short per-month blurb, populated only on `period: 'yearly'` rows. */
export type MonthlyBreakdownEntry = {
  month: number; // 1-12
  monthLabel: string; // e.g. "January"
  summary: string;
};

/**
 * Rich structured reading — mirrors the shape the moon-sign forecast cards
 * already use (components/horoscope/types.ts DailyForecastData), so the
 * personalized card can reuse the same Plain-view UI. Populated on every
 * period's rows, including yearly (alongside its monthly breakdown).
 */
export type StructuredHoroscope = {
  hook: string;
  description: string;
  advice: string;
  quality: 'good' | 'moderate' | 'challenging' | 'avoid';
  score: number; // 1-5
  luckyColor: string;
  luckyNumber: number;
};

export const dailyHoroscopes = pgTable(
  'daily_horoscopes',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * The period's start date (in the app's IST timezone): the day itself for
     * 'daily', the Monday for 'weekly', the 1st for 'monthly'/'yearly'. Always
     * a real date so existing date-based sorting/display keeps working.
     */
    forDate: date('for_date').notNull(),
    period: horoscopePeriodEnum('period').notNull().default('daily'),
    /**
     * The cache/lookup key within a period — YYYY-MM-DD (daily/weekly, weekly
     * keyed by its Monday), YYYY-MM (monthly), YYYY (yearly). Paired with
     * `period` as the real identity of a row; `forDate` is derived from it.
     */
    periodKey: text('period_key').notNull(),
    /** The hook line — kept as plain text too for push-notification bodies and as a fallback render. */
    summary: text('summary').notNull(),
    /** Only set on `period: 'yearly'` rows — a short blurb per calendar month. */
    monthlyBreakdown: jsonb('monthly_breakdown').$type<MonthlyBreakdownEntry[]>(),
    /** The rich Plain-view fields, populated for every period. */
    structured: jsonb('structured').$type<StructuredHoroscope>(),
    /** Which model produced it ('stub' until the NVIDIA NIM engine is wired). */
    model: text('model'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    // One horoscope per user per period+key — the upsert conflict target.
    userPeriodKeyUnique: uniqueIndex('daily_horoscopes_user_period_key_unique').on(
      table.userId,
      table.period,
      table.periodKey,
    ),
  }),
);

export type DailyHoroscopeRow = typeof dailyHoroscopes.$inferSelect;
export type NewDailyHoroscopeRow = typeof dailyHoroscopes.$inferInsert;

/* -------------------------------------------------------------------------- */
/* panchang_cache — one row per (date, reference point), shared by all users   */
/* -------------------------------------------------------------------------- */

/**
 * Panchang depends only on date + location, never on the requesting user, so
 * it's cached once per (date, refKey) and reused for everyone hitting that
 * reference point on that day — not per-user like daily_horoscopes.
 * `refKey` is one of the named cities in astro-tools/panchang-reference-points.ts
 * for cron-warmed rows, or 'custom' for an ad-hoc lat/lon a user's geolocation
 * resolved to (still worth caching — same city, same day, many users).
 */
export const panchangCache = pgTable(
  'panchang_cache',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    forDate: date('for_date').notNull(),
    refKey: text('ref_key').notNull(),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    data: jsonb('data').notNull().$type<PanchangData>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    dateRefUnique: uniqueIndex('panchang_cache_date_ref_unique').on(table.forDate, table.refKey),
  }),
);

export type PanchangCacheRow = typeof panchangCache.$inferSelect;
export type NewPanchangCacheRow = typeof panchangCache.$inferInsert;
