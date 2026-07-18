import type { DecodedIdToken } from 'firebase-admin/auth';
import type { UserRow } from '../../src/db/schema.js';
import type { ProfileContext } from '../../src/modules/birth-profiles/profile-context.js';

export function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: '00000000-0000-0000-0000-000000000001',
    firebaseUid: 'firebase-uid-1',
    phoneE164: '+919999999999',
    phoneE164Hash: 'mock-phone-hash',
    displayName: null,
    gender: null,
    email: null,
    avatarUrl: null,
    dateOfBirth: null,
    timeOfBirth: null,
    placeOfBirth: null,
    birthTimeAccuracy: null,
    birthTimeSource: null,
    birthTimeRectified: null,
    birthTimeRectificationConfidence: null,
    birthLocationAccuracy: null,
    gotra: null,
    sankalpaName: null,
    preferredSystem: null,
    preferredAyanamsa: null,
    preferredHouseSystem: null,
    preferredChartStyle: null,
    preferredDashaSystem: null,
    preferredDashaYearLength: null,
    preferredNodeType: null,
    preferredCalendarLocale: null,
    chartPreferences: null,
    currentLocation: null,
    currentLocationUpdatedAt: null,
    currentTimezone: null,
    currentCountry: null,
    locale: null,
    contentLanguage: null,
    dailyHoroscopeSendHourLocal: null,
    interestAreas: null,
    relationshipStatus: null,
    partnerSeekingIntent: null,
    notificationPrefs: null,
    quietHours: null,
    onboardingStatus: null,
    onboardingStep: null,
    onboardingCompletedAt: null,
    profileCompletedAt: null,
    lastActiveAt: null,
    streakCount: null,
    streakLastDay: null,
    appVersion: null,
    platform: null,
    referralSource: null,
    referredByCode: null,
    referralCode: null,
    marketingConsentAt: null,
    marketingConsentRevokedAt: null,
    whatsappOptInAt: null,
    whatsappOptInRevokedAt: null,
    dataProcessingConsentAt: null,
    dataProcessingConsentRevokedAt: null,
    termsAcceptedAt: null,
    termsVersion: null,
    privacyPolicyAcceptedAt: null,
    privacyPolicyVersion: null,
    anonymizedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    // multi-profile: null = primary/self profile is active (see profile-context.ts).
    activeProfileId: null,
    unlockedHouses: null,
    gemstoneUnlockedAt: null,
    ...overrides,
  };
}

/** Test fixture for the resolved profile bundle (see profile-context.ts). Defaults to an empty primary profile. */
export function makeProfileContext(overrides: Partial<ProfileContext> = {}): ProfileContext {
  return {
    birthProfileId: null,
    displayName: null,
    gender: null,
    dateOfBirth: null,
    timeOfBirth: null,
    placeOfBirth: null,
    birthTimeAccuracy: null,
    birthTimeSource: null,
    birthLocationAccuracy: null,
    unlockedHouses: [],
    gemstoneUnlockedAt: null,
    ...overrides,
  };
}

export function makeDecodedToken(uid = 'firebase-uid-1', phone = '+919999999999'): DecodedIdToken {
  const token: DecodedIdToken = {
    uid,
    aud: 'test',
    auth_time: 0,
    exp: 0,
    iat: 0,
    iss: 'test',
    sub: uid,
    firebase: { identities: {}, sign_in_provider: 'phone' },
    phone_number: phone,
  };
  return token;
}
