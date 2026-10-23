import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasPass, requirePass } from '../src/lib/entitlements.js';
import { getPassStatus } from '../src/modules/pass/pass.service.js';
import { chargeQuestion, refundQuestion } from '../src/modules/pass/question-billing.js';
import { chatPricingFact } from '../src/lib/chat-pricing.js';
import * as userGroupsRepo from '../src/modules/user-groups/user-groups.repo.js';
import * as passRepo from '../src/modules/pass/pass.repo.js';
import * as chatGiftsRepo from '../src/modules/pass/chat-gifts.repo.js';
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
    groupQuestionsUsed: 0,
    freeProfilesUsed: 0,
    signupDrip: false,
    uiSkin: null,
    groupQuestionsPeriodStart: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(passRepo, 'findActivePass').mockResolvedValue(null);
    // No festival gift running: these cases are about the group allowance itself.
    vi.spyOn(chatGiftsRepo, 'consumeChatGift').mockResolvedValue(false);
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
    // The group Pass is the top tier, so even the Platinum-only feature opens.
    await expect(requirePass(testUserId, 'relocation')).resolves.toBeUndefined();
    await expect(requirePass(normalUserId, 'timeline')).rejects.toThrow('PASS_REQUIRED');
  });

  it('getPassStatus returns synthetic active pass for test group members', async () => {
    const status = await getPassStatus(mockUser);
    expect(status.enabled).toBe(true);
    expect(status.offers).toEqual([]);
    expect(status.pass).toMatchObject({ tier: 'platinum', source: 'group', questionsLeft: 60 });
    expect(status.pass?.questionsLeft).toBeGreaterThan(0);
  });

  it('chargeQuestion never deducts the wallet for test group members', async () => {
    const deductSpy = vi.spyOn(usersRepo, 'deductWalletBalance');
    vi.spyOn(passRepo, 'consumeGroupQuestion').mockResolvedValue(false);
    const source = await chargeQuestion(testUserId, 800);
    expect(source).toBe('free');
    expect(deductSpy).not.toHaveBeenCalled();
  });

  // The owner's phone showed "60 questions left" after several questions: group
  // members were never counted. They now count down like a buyer, still for free.
  describe('group members count down their questions', () => {
    const NOW = new Date('2026-10-15T08:00:00Z');
    const DAY = 86_400_000;

    it('getPassStatus subtracts the questions asked this period', async () => {
      const status = await getPassStatus({
        ...mockUser,
        groupQuestionsUsed: 2,
        groupQuestionsPeriodStart: new Date(Date.now() - 3 * DAY),
      });
      expect(status.pass).toMatchObject({ source: 'group', questionsLeft: 58 });
    });

    it('a lapsed 30-day period shows the full allowance again', async () => {
      const status = await getPassStatus({
        ...mockUser,
        groupQuestionsUsed: 60,
        groupQuestionsPeriodStart: new Date(Date.now() - 31 * DAY),
      });
      expect(status.pass?.questionsLeft).toBe(60);
    });

    it('groupQuestionsLeft never goes below 0', () => {
      expect(
        passRepo.groupQuestionsLeft(
          { groupQuestionsUsed: 75, groupQuestionsPeriodStart: new Date(NOW.getTime() - DAY) },
          NOW,
        ),
      ).toBe(0);
      expect(
        passRepo.groupQuestionsLeft(
          { groupQuestionsUsed: 0, groupQuestionsPeriodStart: null },
          NOW,
        ),
      ).toBe(60);
    });

    it('chargeQuestion spends a group question and never touches the wallet', async () => {
      const consume = vi.spyOn(passRepo, 'consumeGroupQuestion').mockResolvedValue(true);
      const deductSpy = vi.spyOn(usersRepo, 'deductWalletBalance');
      expect(await chargeQuestion(testUserId, 800)).toBe('group');
      expect(consume).toHaveBeenCalledWith(testUserId);
      expect(deductSpy).not.toHaveBeenCalled();
    });

    it('once the allowance is used up the question is still free', async () => {
      vi.spyOn(passRepo, 'consumeGroupQuestion').mockResolvedValue(false);
      const credit = vi.spyOn(passRepo, 'consumeQuestionCredit');
      expect(await chargeQuestion(testUserId, 800)).toBe('free');
      expect(credit).not.toHaveBeenCalled();
    });

    it('a member who also holds a real Pass spends from that Pass', async () => {
      vi.spyOn(passRepo, 'findActivePass').mockResolvedValue({ id: 'sub-1' } as never);
      vi.spyOn(passRepo, 'consumePassQuestion').mockResolvedValue(true);
      const group = vi.spyOn(passRepo, 'consumeGroupQuestion').mockResolvedValue(true);
      expect(await chargeQuestion(testUserId, 800)).toBe('pass');
      expect(group).not.toHaveBeenCalled();
    });

    it('a member whose real Pass is used up still pays nothing', async () => {
      vi.spyOn(passRepo, 'findActivePass').mockResolvedValue({ id: 'sub-1' } as never);
      vi.spyOn(passRepo, 'consumePassQuestion').mockResolvedValue(false);
      const deductSpy = vi.spyOn(usersRepo, 'deductWalletBalance');
      expect(await chargeQuestion(testUserId, 800)).toBe('free');
      expect(deductSpy).not.toHaveBeenCalled();
    });

    it('a refund gives the group question back', async () => {
      const refund = vi.spyOn(passRepo, 'refundGroupQuestion').mockResolvedValue();
      await refundQuestion(testUserId, 'group', 800);
      expect(refund).toHaveBeenCalledWith(testUserId);
    });

    it('the chat is told group questions are free', () => {
      expect(chatPricingFact(800, 'group')).toBe('CHAT PRICING: questions are free for this user.');
    });
  });
});
