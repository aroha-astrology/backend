import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasPass, requirePass } from '../src/lib/entitlements.js';
import { getPassStatus } from '../src/modules/pass/pass.service.js';
import { chargeQuestion } from '../src/modules/pass/question-billing.js';
import * as userGroupsRepo from '../src/modules/user-groups/user-groups.repo.js';
import * as passRepo from '../src/modules/pass/pass.repo.js';
import * as usersRepo from '../src/modules/users/users.repo.js';
import * as featuresService from '../src/modules/features/features.service.js';
import type { UserRow } from '../src/db/schema.js';

describe('Test Group Subscription & Zero-Charge Entitlements', () => {
  const testUserId = 'test-user-group-member-123';
  const normalUserId = 'normal-user-456';

  const mockUser: UserRow = {
    id: testUserId,
    firebaseUid: 'fb-123',
    phoneE164: '+919999999999',
    displayName: 'Test User',
    gender: 'male',
    dateOfBirth: null,
    timeOfBirth: null,
    placeOfBirth: null,
    profileCompletedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    email: null,
    avatarUrl: null,
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
    locale: 'en',
    contentLanguage: null,
    dailyHoroscopeSendHourLocal: null,
    interestAreas: null,
    relationshipStatus: null,
    partnerSeekingIntent: null,
    notificationPrefs: null,
    quietHours: null,
    onboardingStatus: 'completed',
    onboardingStep: null,
    onboardingCompletedAt: new Date(),
    lastActiveAt: new Date(),
    streakCount: null,
    streakLastDay: null,
    appVersion: null,
    platform: null,
    referralSource: null,
    referredByCode: null,
    referralCode: 'TEST01',
    marketingConsentAt: null,
    marketingConsentRevokedAt: null,
    whatsappOptInAt: null,
    whatsappOptInRevokedAt: null,
    dataProcessingConsentAt: new Date(),
    dataProcessingConsentRevokedAt: null,
    termsAcceptedAt: new Date(),
    termsVersion: '1.0.0',
    privacyPolicyAcceptedAt: new Date(),
    privacyPolicyVersion: '1.0.0',
    anonymizedAt: null,
    walletBalancePaise: 10000,
    unlockedHouses: [],
    birthDetailsEditedAt: null,
    gemstoneUnlockedAt: null,
    phoneE164Hash: 'hash',
    activeProfileId: null,
    referralEarningsPaise: 0,
    voiceConsentAt: null,
    voiceConsentRevokedAt: null,
    gemstoneWeightKg: null,
    lowBalanceAlertedAt: null,
    deletionRequestedAt: null,
    preferredLunarNode: null,
    toursCompleted: [],
    lastIp: '127.0.0.1',
    geoCountry: null,
    geoCity: null,
    geoResolvedAt: null,
    incomeBracket: null,
    familyIncomeBracket: null,
    nextReportVote: null,
    nextReportVotedAt: null,
    lastFreeFollowUpAt: null,
    questionCredits: 0,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(passRepo, 'findActivePass').mockResolvedValue(null);
    vi.spyOn(userGroupsRepo, 'listGroupIdsForUser').mockImplementation((userId: string) => {
      return Promise.resolve(userId === testUserId ? ['group-tester-1'] : []);
    });
    vi.spyOn(featuresService, 'resolveFeaturesForUser').mockResolvedValue({
      'nav.arohaPass': {
        enabled: false,
        pricePaise: null,
        originalPricePaise: null,
        model: null,
        enabledAt: null,
      },
    });
    vi.spyOn(usersRepo, 'deductWalletBalance').mockResolvedValue(true);
  });

  it('hasPass returns true for test group members even with no DB subscription row', async () => {
    expect(await hasPass(testUserId)).toBe(true);
    expect(await hasPass(normalUserId)).toBe(false);
  });

  it('requirePass does not throw for test group members', async () => {
    await expect(requirePass(testUserId)).resolves.toBeUndefined();
    await expect(requirePass(normalUserId)).rejects.toThrow('PASS_REQUIRED');
  });

  it('getPassStatus returns synthetic active pass for test group members', async () => {
    const status = await getPassStatus(mockUser);
    expect(status.enabled).toBe(true);
    expect(status.offer).toBeNull();
    expect(status.pass).not.toBeNull();
    expect(status.pass?.questionsLeft).toBeGreaterThan(0);
  });

  it('chargeQuestion is always free for test group members and never deducts wallet', async () => {
    const deductSpy = vi.spyOn(usersRepo, 'deductWalletBalance');
    const source = await chargeQuestion(testUserId, 800);
    expect(source).toBe('free');
    expect(deductSpy).not.toHaveBeenCalled();
  });
});
