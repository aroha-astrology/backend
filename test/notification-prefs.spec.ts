import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ findNotificationSettings: vi.fn() }));

vi.mock('../src/modules/preferences/preferences.repo.js', () => ({
  findNotificationSettings: state.findNotificationSettings,
}));

import {
  categoryOf,
  isWithinQuietHours,
  pushAllowedUserIds,
  shouldSendPush,
} from '../src/lib/notifications/notification-prefs.js';

// 2026-09-24 16:30 UTC = 22:00 IST.
const TEN_PM_IST = new Date('2026-09-24T16:30:00Z');
// 2026-09-24 06:30 UTC = 12:00 IST.
const NOON_IST = new Date('2026-09-24T06:30:00Z');

const settings = (over: Partial<Parameters<typeof shouldSendPush>[0] & object> = {}) => ({
  notificationPrefs: null,
  quietHours: null,
  currentTimezone: 'Asia/Kolkata',
  ...over,
});

describe('categoryOf', () => {
  it('maps optional push types to a settings category', () => {
    expect(categoryOf('transit_alert')).toBe('transitAlerts');
    expect(categoryOf('saturn_phase_alert')).toBe('transitAlerts');
    expect(categoryOf('festival_alert')).toBe('muhurta');
    expect(categoryOf('gift_campaign')).toBe('marketing');
    expect(categoryOf('daily_reading')).toBe('dailyHoroscope');
  });

  it('treats things the user is waiting for as transactional', () => {
    for (const type of [
      'report_ready',
      'palm_reading_ready',
      'support_reply',
      'referral_bonus',
      'purchase_plan_ready',
    ]) {
      expect(categoryOf(type)).toBeNull();
    }
  });
});

describe('isWithinQuietHours', () => {
  const overnight = { start: '22:00', end: '07:00' };

  it('handles a window that wraps midnight, in the user timezone', () => {
    expect(isWithinQuietHours(overnight, TEN_PM_IST, 'Asia/Kolkata')).toBe(true);
    expect(isWithinQuietHours(overnight, NOON_IST, 'Asia/Kolkata')).toBe(false);
    // 22:00 IST is 16:30 in London (BST) — outside the window there.
    expect(isWithinQuietHours(overnight, TEN_PM_IST, 'Europe/London')).toBe(false);
  });

  it('handles a same-day window', () => {
    expect(isWithinQuietHours({ start: '11:00', end: '13:00' }, NOON_IST, 'Asia/Kolkata')).toBe(
      true,
    );
    expect(isWithinQuietHours({ start: '13:00', end: '15:00' }, NOON_IST, 'Asia/Kolkata')).toBe(
      false,
    );
  });

  it('ignores missing, malformed or empty windows and falls back to IST for an unknown zone', () => {
    expect(isWithinQuietHours(null, TEN_PM_IST, 'Asia/Kolkata')).toBe(false);
    expect(isWithinQuietHours({ start: 'late', end: '07:00' }, TEN_PM_IST, 'Asia/Kolkata')).toBe(
      false,
    );
    expect(isWithinQuietHours({ start: '07:00', end: '07:00' }, TEN_PM_IST, 'Asia/Kolkata')).toBe(
      false,
    );
    expect(isWithinQuietHours(overnight, TEN_PM_IST, 'Not/AZone')).toBe(true);
  });
});

describe('shouldSendPush', () => {
  it('blocks a category the user switched off', () => {
    const s = settings({ notificationPrefs: { marketing: { push: false } } });
    expect(shouldSendPush(s, 'gift_campaign', NOON_IST)).toBe(false);
    expect(shouldSendPush(s, 'transit_alert', NOON_IST)).toBe(true);
  });

  it('blocks optional pushes during quiet hours but never transactional ones', () => {
    const s = settings({ quietHours: { start: '22:00', end: '07:00' } });
    expect(shouldSendPush(s, 'festival_alert', TEN_PM_IST)).toBe(false);
    expect(shouldSendPush(s, 'report_ready', TEN_PM_IST)).toBe(true);
  });

  it('lets transactional pushes through even with every category off', () => {
    const s = settings({
      notificationPrefs: {
        marketing: { push: false },
        transitAlerts: { push: false },
        muhurta: { push: false },
        dailyHoroscope: { push: false },
      },
    });
    expect(shouldSendPush(s, 'support_reply', NOON_IST)).toBe(true);
  });

  it('sends when no settings were ever saved', () => {
    expect(shouldSendPush(undefined, 'transit_alert', TEN_PM_IST)).toBe(true);
    expect(shouldSendPush(settings(), 'transit_alert', TEN_PM_IST)).toBe(true);
  });
});

describe('pushAllowedUserIds', () => {
  beforeEach(() => {
    state.findNotificationSettings.mockReset();
  });

  it('filters recipients by their own settings in one query', async () => {
    state.findNotificationSettings.mockResolvedValue([
      { id: 'u1', ...settings({ notificationPrefs: { transitAlerts: { push: false } } }) },
      { id: 'u2', ...settings() },
    ]);
    const allowed = await pushAllowedUserIds(['u1', 'u2', 'u2'], 'transit_alert', NOON_IST);
    expect([...allowed]).toEqual(['u2']);
    expect(state.findNotificationSettings).toHaveBeenCalledTimes(1);
    expect(state.findNotificationSettings).toHaveBeenCalledWith(['u1', 'u2']);
  });

  it('skips the query for transactional types', async () => {
    const allowed = await pushAllowedUserIds(['u1'], 'report_ready');
    expect([...allowed]).toEqual(['u1']);
    expect(state.findNotificationSettings).not.toHaveBeenCalled();
  });

  it('fails open when the settings read errors', async () => {
    state.findNotificationSettings.mockImplementation(() => Promise.reject(new Error('db blip')));
    const allowed = await pushAllowedUserIds(['u1', 'u2'], 'gift_campaign');
    expect([...allowed]).toEqual(['u1', 'u2']);
  });
});
