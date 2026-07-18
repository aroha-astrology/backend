import type { NewUserRow, NewUserConsentLogRow, UserRow } from '../../db/schema.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { requestKundliGeneration } from '../kundli/kundli.service.js';
import { deleteHouseInsightsForUser } from '../kundli/house-insight.repo.js';
import { deleteGemstoneForUser } from '../gemstone/gemstone.repo.js';
import { HOROSCOPE_PERIODS, requestHoroscopeGeneration } from '../horoscope/horoscope.service.js';
import { resolveProfileContext } from '../birth-profiles/profile-context.js';
import type { ConsentInput, UpdateMeBody, UserDto } from './users.schemas.js';
import {
  claimBirthDetailsEdit,
  findActiveUserById,
  revokeDeviceTokensByUser,
  softDeleteBirthProfilesByOwner,
  anonymizeUserById,
  updateUserById,
  updateUserWithConsentLog,
} from './users.repo.js';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** A consent is currently in force when granted and not subsequently revoked. */
const consentActive = (grantedAt: Date | null, revokedAt: Date | null): boolean =>
  grantedAt != null && revokedAt == null;

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    firebaseUid: row.firebaseUid,
    phoneE164: row.phoneE164,

    displayName: row.displayName,
    gender: row.gender,
    email: row.email,
    avatarUrl: row.avatarUrl,

    dateOfBirth: row.dateOfBirth,
    timeOfBirth: row.timeOfBirth,
    placeOfBirth: row.placeOfBirth,
    birthTimeAccuracy: row.birthTimeAccuracy,
    birthTimeSource: row.birthTimeSource,
    birthTimeRectified: row.birthTimeRectified,
    birthTimeRectificationConfidence: row.birthTimeRectificationConfidence,
    birthLocationAccuracy: row.birthLocationAccuracy,
    canEditBirthDetails: row.birthDetailsEditedAt === null,
    gotra: row.gotra,
    sankalpaName: row.sankalpaName,

    preferredSystem: row.preferredSystem,
    preferredAyanamsa: row.preferredAyanamsa,
    preferredHouseSystem: row.preferredHouseSystem,
    preferredChartStyle: row.preferredChartStyle,
    preferredDashaSystem: row.preferredDashaSystem,
    preferredDashaYearLength: row.preferredDashaYearLength,
    preferredNodeType: row.preferredNodeType,
    preferredCalendarLocale: row.preferredCalendarLocale,
    chartPreferences: row.chartPreferences,

    currentLocation: row.currentLocation,
    currentLocationUpdatedAt: iso(row.currentLocationUpdatedAt),
    currentTimezone: row.currentTimezone,
    currentCountry: row.currentCountry,

    locale: row.locale,
    contentLanguage: row.contentLanguage,

    dailyHoroscopeSendHourLocal: row.dailyHoroscopeSendHourLocal,
    interestAreas: row.interestAreas,
    relationshipStatus: row.relationshipStatus,
    partnerSeekingIntent: row.partnerSeekingIntent,
    notificationPrefs: row.notificationPrefs,
    quietHours: row.quietHours,

    onboardingStatus: row.onboardingStatus,
    onboardingStep: row.onboardingStep,
    onboardingCompletedAt: iso(row.onboardingCompletedAt),
    profileCompletedAt: iso(row.profileCompletedAt),

    lastActiveAt: iso(row.lastActiveAt),
    streakCount: row.streakCount,
    streakLastDay: row.streakLastDay,
    appVersion: row.appVersion,
    platform: row.platform,
    credits: row.credits,
    unlockedHouses: row.unlockedHouses ?? [1],
    gemstoneUnlocked: row.gemstoneUnlockedAt !== null,

    referralSource: row.referralSource,
    referredByCode: row.referredByCode,
    referralCode: row.referralCode,

    // Consent: grant timestamp, revoke timestamp, and a derived "in force" flag
    // so a send-gate never has to reconstruct grant-vs-revoke ordering.
    marketingConsentAt: iso(row.marketingConsentAt),
    marketingConsentRevokedAt: iso(row.marketingConsentRevokedAt),
    marketingConsentActive: consentActive(row.marketingConsentAt, row.marketingConsentRevokedAt),
    whatsappOptInAt: iso(row.whatsappOptInAt),
    whatsappOptInRevokedAt: iso(row.whatsappOptInRevokedAt),
    whatsappOptInActive: consentActive(row.whatsappOptInAt, row.whatsappOptInRevokedAt),
    dataProcessingConsentAt: iso(row.dataProcessingConsentAt),
    dataProcessingConsentRevokedAt: iso(row.dataProcessingConsentRevokedAt),
    dataProcessingConsentActive: consentActive(
      row.dataProcessingConsentAt,
      row.dataProcessingConsentRevokedAt,
    ),
    termsAcceptedAt: iso(row.termsAcceptedAt),
    termsVersion: row.termsVersion,
    privacyPolicyAcceptedAt: iso(row.privacyPolicyAcceptedAt),
    privacyPolicyVersion: row.privacyPolicyVersion,

    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * A profile is complete once the chart-bearing fields are present. The birth
 * TIME requirement is satisfied by EITHER a recorded time OR an explicit
 * `birthTimeAccuracy === 'unknown'` — so a user who genuinely doesn't know
 * their birth time can still finish onboarding (they are never blocked
 * forever). `approximate` still requires a stated time; only `unknown` waives
 * it.
 */
export function isProfileComplete(row: UserRow): boolean {
  const coreFilled =
    row.displayName != null &&
    row.gender != null &&
    row.dateOfBirth != null &&
    row.placeOfBirth != null;
  const timeSatisfied = row.timeOfBirth != null || row.birthTimeAccuracy === 'unknown';
  return coreFilled && timeSatisfied;
}

/** Fields that map 1:1 from the request body onto a user row column. */
const DIRECT_FIELDS = [
  'displayName',
  'gender',
  'email',
  'avatarUrl',
  'dateOfBirth',
  'timeOfBirth',
  'placeOfBirth',
  'birthTimeAccuracy',
  'birthTimeSource',
  'birthTimeRectified',
  'birthTimeRectificationConfidence',
  'birthLocationAccuracy',
  'gotra',
  'sankalpaName',
  'preferredSystem',
  'preferredAyanamsa',
  'preferredHouseSystem',
  'preferredChartStyle',
  'preferredDashaSystem',
  'preferredDashaYearLength',
  'preferredNodeType',
  'preferredCalendarLocale',
  'chartPreferences',
  'currentLocation',
  'currentTimezone',
  'currentCountry',
  'locale',
  'contentLanguage',
  'dailyHoroscopeSendHourLocal',
  'interestAreas',
  'relationshipStatus',
  'partnerSeekingIntent',
  'notificationPrefs',
  'quietHours',
  'onboardingStatus',
  'onboardingStep',
  'appVersion',
  'platform',
  'referralSource',
  'referredByCode',
] as const satisfies readonly (keyof NewUserRow & keyof UpdateMeBody)[];

export type ConsentContext = { sourceIp?: string | null; userAgent?: string | null };

/** Translate a consent input into user-row timestamp patches + audit rows. */
function applyConsent(
  consent: ConsentInput,
  patch: Partial<NewUserRow>,
  userId: string,
  ctx: ConsentContext,
): NewUserConsentLogRow[] {
  const now = new Date();
  const logs: NewUserConsentLogRow[] = [];
  const base = {
    userId,
    occurredAt: now,
    sourceIp: ctx.sourceIp ?? null,
    userAgent: ctx.userAgent ?? null,
  };

  if (consent.terms) {
    patch.termsAcceptedAt = now;
    patch.termsVersion = consent.terms.version;
    logs.push({
      ...base,
      consentType: 'terms',
      action: 'granted',
      policyVersion: consent.terms.version,
    });
  }
  if (consent.privacy) {
    patch.privacyPolicyAcceptedAt = now;
    patch.privacyPolicyVersion = consent.privacy.version;
    logs.push({
      ...base,
      consentType: 'privacy',
      action: 'granted',
      policyVersion: consent.privacy.version,
    });
  }
  if (consent.dataProcessing !== undefined) {
    if (consent.dataProcessing) {
      patch.dataProcessingConsentAt = now;
      patch.dataProcessingConsentRevokedAt = null;
    } else {
      // Keep the original grant timestamp; record when it was withdrawn.
      patch.dataProcessingConsentRevokedAt = now;
    }
    logs.push({
      ...base,
      consentType: 'data_processing',
      action: consent.dataProcessing ? 'granted' : 'withdrawn',
    });
  }
  if (consent.marketing !== undefined) {
    if (consent.marketing) {
      patch.marketingConsentAt = now;
      patch.marketingConsentRevokedAt = null;
    } else {
      patch.marketingConsentRevokedAt = now;
    }
    logs.push({
      ...base,
      consentType: 'marketing',
      action: consent.marketing ? 'granted' : 'withdrawn',
    });
  }
  if (consent.whatsapp !== undefined) {
    if (consent.whatsapp) {
      patch.whatsappOptInAt = now;
      patch.whatsappOptInRevokedAt = null;
    } else {
      patch.whatsappOptInRevokedAt = now;
    }
    logs.push({
      ...base,
      consentType: 'whatsapp',
      action: consent.whatsapp ? 'granted' : 'withdrawn',
    });
  }
  return logs;
}

function buildPatch(body: UpdateMeBody): Partial<NewUserRow> {
  const out: Partial<NewUserRow> = {};
  for (const key of DIRECT_FIELDS) {
    const value = body[key];
    if (value !== undefined) {
      // Names and value types are aligned 1:1 between the body and the row.
      (out as Record<string, unknown>)[key] = value;
    }
  }

  // Residence timezone is denormalized from the location for the daily-send
  // cron's hot read; keep it authoritative by always re-deriving it (ignoring
  // any conflicting body value) whenever the location changes.
  if (body.currentLocation !== undefined) {
    out.currentLocationUpdatedAt = new Date();
    out.currentTimezone = body.currentLocation.tz;
  }
  return out;
}

export async function updateMe(
  userId: string,
  body: UpdateMeBody,
  ctx: ConsentContext = {},
): Promise<UserRow> {
  const current = await findActiveUserById(userId);
  if (!current) throw Errors.notFound('User not found');

  // Editing the birth event (DOB/time/place) on an ALREADY-complete profile
  // is capped at one lifetime edit — onboarding itself (profile not yet
  // complete, possibly filled in across several steps) is exempt, since
  // that's the initial set, not a correction. Claim atomically, up front,
  // so a rejected edit never partially applies alongside other fields in
  // the same request; if the rest of the patch below fails for an unrelated
  // reason, roll the claim back so the user doesn't lose their one edit to
  // an unrelated error.
  const touchedBirthEvent =
    body.dateOfBirth !== undefined ||
    body.timeOfBirth !== undefined ||
    body.placeOfBirth !== undefined;
  const isPostOnboardingBirthEdit = touchedBirthEvent && current.profileCompletedAt !== null;
  if (isPostOnboardingBirthEdit) {
    const claimed = await claimBirthDetailsEdit(userId);
    if (!claimed) throw Errors.conflict('Birth details can only be edited once');
  }

  const patch = buildPatch(body);
  const consentLogs = body.consent ? applyConsent(body.consent, patch, userId, ctx) : [];

  // Stamp the funnel-completion time server-side the first time the client
  // reports a terminal onboarding status (the column is otherwise never set).
  if (
    (body.onboardingStatus === 'completed' || body.onboardingStatus === 'skipped') &&
    current.onboardingCompletedAt === null
  ) {
    patch.onboardingCompletedAt = new Date();
  }

  let next: UserRow | undefined;
  try {
    next =
      consentLogs.length > 0
        ? await updateUserWithConsentLog(userId, patch, consentLogs)
        : await updateUserById(userId, patch);
  } catch (err) {
    if (isPostOnboardingBirthEdit) {
      await updateUserById(userId, { birthDetailsEditedAt: null }).catch(() => {});
    }
    if (isUniqueViolation(err)) throw Errors.conflict('That email is already in use');
    throw err;
  }
  if (!next) throw Errors.notFound('User not found');

  // The natal chart just changed under previously-unlocked houses — their
  // cached insight text no longer matches. Wipe it so it regenerates fresh
  // (lazily, on next view) rather than silently serving stale content;
  // houses stay unlocked, no re-charge.
  if (isPostOnboardingBirthEdit) {
    // This endpoint edits the `users` row itself (the primary/self profile) —
    // always the primary (birthProfileId: null) side, never an additional
    // birth_profiles entry.
    await deleteHouseInsightsForUser(userId, null).catch((err: unknown) => {
      logger.error({ err, userId }, 'house insight invalidation after birth-detail edit failed');
    });
    // The gemstone report is derived from the same natal chart — wipe it too so
    // it regenerates against the new chart. The unlock flag stays set (no re-charge).
    await deleteGemstoneForUser(userId).catch((err: unknown) => {
      logger.error({ err, userId }, 'gemstone invalidation after birth-detail edit failed');
    });
  }

  // Reconcile the completion latch in BOTH directions so the DTO never claims
  // a profile is complete after a required field (e.g. timeOfBirth) is cleared.
  const shouldComplete = isProfileComplete(next);
  if (shouldComplete !== (next.profileCompletedAt !== null)) {
    const finalized = await updateUserById(userId, {
      profileCompletedAt: shouldComplete ? new Date() : null,
    });
    if (finalized) next = finalized;
  }

  // Start kundli generation the moment onboarding completes — or when birth
  // inputs change on an already-complete profile. Fire-and-forget so the PATCH
  // returns immediately; the generation request is idempotent (DB-deduped).
  const becameComplete = current.profileCompletedAt === null && next.profileCompletedAt !== null;
  const touchedBirth =
    body.dateOfBirth !== undefined ||
    body.timeOfBirth !== undefined ||
    body.placeOfBirth !== undefined ||
    body.birthTimeAccuracy !== undefined ||
    body.preferredAyanamsa !== undefined ||
    body.preferredHouseSystem !== undefined;
  if (next.profileCompletedAt !== null && (becameComplete || touchedBirth)) {
    // Primary profile only — see the birthProfileId: null comment above.
    void requestKundliGeneration(userId, null).catch((err: unknown) => {
      logger.error({ err, userId }, 'kundli generation trigger failed');
    });
  }

  // Users who onboard with an admittedly-unknown birth time never get a
  // kundli (missingKundliParams always flags timeOfBirth for them), so the
  // usual post-kundli-ready horoscope trigger (kundli.service.ts#runGeneration)
  // never fires for this cohort. Fire directly here instead — the horoscope
  // context tolerates a missing kundli (generic reading) rather than blocking
  // on one. If they later add an exact time, touchedBirth's kundli trigger
  // above takes over and its own post-ready hook naturally overwrites this
  // with a grounded reading (force: true).
  if (
    next.profileCompletedAt !== null &&
    (becameComplete || touchedBirth) &&
    next.birthTimeAccuracy === 'unknown'
  ) {
    // Primary profile only — see the birthProfileId: null comment above.
    const primaryProfile = await resolveProfileContext(next, null);
    for (const period of HOROSCOPE_PERIODS) {
      void requestHoroscopeGeneration(next, primaryProfile, period, { retryForever: true }).catch(
        (err: unknown) => {
          logger.error(
            { err, userId, period },
            'horoscope generation trigger (unknown birth time) failed',
          );
        },
      );
    }
  }

  return next;
}

export async function deleteMe(userId: string): Promise<void> {
  const current = await findActiveUserById(userId);
  if (!current) throw Errors.notFound('User not found');
  // Cascade: stop processing third-party birth data and pushing to devices
  // BEFORE anonymizing — anonymizeUserById relies on tokens already being
  // revoked (it reuses their revoked-token uniqueness exemption).
  await softDeleteBirthProfilesByOwner(userId);
  await revokeDeviceTokensByUser(userId);
  await anonymizeUserById(userId);
}

export async function unlockHouse(userId: string, houseNumber: number): Promise<void> {
  const { unlockHouseForUser } = await import('./users.repo.js');
  const success = await unlockHouseForUser(userId, houseNumber);
  if (!success) {
    throw Errors.conflict('Insufficient credits or house already unlocked');
  }
}

export async function unlockGemstone(userId: string): Promise<void> {
  const { unlockGemstoneForUser } = await import('./users.repo.js');
  const success = await unlockGemstoneForUser(userId);
  if (!success) {
    throw Errors.conflict('Insufficient credits or gemstone report already unlocked');
  }
}
