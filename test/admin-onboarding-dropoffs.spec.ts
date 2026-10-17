import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/admin/admin.repo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/admin/admin.repo.js')>();
  return {
    ...actual,
    onboardingDropoffs: vi.fn(async () => ({
      signedUp: 5,
      finished: 2,
      rows: [
        {
          id: 'u1',
          displayName: null,
          email: 'janedoe.10001@gmail.com',
          phoneE164: null,
          createdAt: new Date('2026-10-14T09:11:12Z'),
          lastActiveAt: new Date('2026-10-14T09:11:12Z'),
          onboardingStep: 'name',
          contentLanguage: 'ja',
          platform: null,
          geoCountry: null,
          geoCity: null,
          secondsActive: 180,
          activeDays: 1,
        },
        {
          id: 'u2',
          displayName: null,
          email: null,
          phoneE164: '+919800000000',
          createdAt: new Date('2026-10-13T10:00:00Z'),
          lastActiveAt: null,
          onboardingStep: null,
          contentLanguage: null,
          platform: 'android',
          geoCountry: 'India',
          geoCity: 'Kolkata',
          secondsActive: 0,
          activeDays: 0,
        },
        {
          id: 'u3',
          displayName: null,
          email: 'robotdevice-lvl-02@cloudtestlabaccounts.com',
          phoneE164: null,
          createdAt: new Date('2026-10-05T15:18:47Z'),
          lastActiveAt: null,
          onboardingStep: null,
          contentLanguage: null,
          platform: null,
          geoCountry: null,
          geoCity: null,
          secondsActive: 60,
          activeDays: 1,
        },
      ],
    })),
  };
});

const { likelyTestAccount, getOnboardingDropoffs } = await import(
  '../src/modules/admin/admin.service.js'
);

describe('likelyTestAccount', () => {
  it('flags Firebase Test Lab accounts', () => {
    expect(likelyTestAccount('robotdevice-lvl-01@cloudtestlabaccounts.com')).toBe(
      'test_lab',
    );
  });

  it('flags the firstnamelastname.12345@gmail.com review-device pattern', () => {
    expect(likelyTestAccount('samplename.20002@gmail.com')).toBe('play_review');
    expect(likelyTestAccount('TestPerson.30003@gmail.com')).toBe('play_review');
  });

  it('leaves real-looking addresses alone', () => {
    expect(likelyTestAccount('realuser2024@gmail.com')).toBeNull();
    expect(likelyTestAccount('first.last@gmail.com')).toBeNull();
    expect(likelyTestAccount('john.smith.1234@gmail.com')).toBeNull();
    expect(likelyTestAccount('ann.lee.12345@outlook.com')).toBeNull();
    expect(likelyTestAccount(null)).toBeNull();
  });
});

describe('getOnboardingDropoffs', () => {
  it('maps rows and totals for the admin card', async () => {
    const res = await getOnboardingDropoffs(30, new Date('2026-10-17T00:00:00Z'));
    expect(res).toMatchObject({ days: 30, signedUp: 5, finished: 2, left: 3, likelyTest: 2 });
    expect(res.users.map((u) => [u.id, u.signInMethod, u.likelyTest, u.minutesActive])).toEqual([
      ['u1', 'email', 'play_review', 3],
      ['u2', 'phone', null, 0],
      ['u3', 'email', 'test_lab', 1],
    ]);
    expect(res.users[0]).toMatchObject({ lastStep: 'name', language: 'ja' });
    expect(res.users[1]).toMatchObject({ country: 'India', city: 'Kolkata', lastActiveAt: null });
  });
});
