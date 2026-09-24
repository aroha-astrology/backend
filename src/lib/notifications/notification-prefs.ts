// =============================================================================
// Push gate: the user's notification settings (Settings → Notifications)
// =============================================================================
// `users.notification_prefs` and `users.quiet_hours` were stored for a long
// time with no sender reading them. Every push path now asks this module which
// recipients may get an OS push. It only gates the PUSH — the Bell inbox row is
// still written, so nothing is lost, it just doesn't buzz the phone.
//
// Transactional pushes (something the user asked for is ready, a support reply,
// money credited) are never gated: turning off "Offers" must not hide "your
// report is ready".
// =============================================================================

import type { NotificationPrefs, QuietHours } from '../../db/schema.js';
import { findNotificationSettings } from '../../modules/preferences/preferences.repo.js';
import { logger } from '../logger.js';

export type NotificationCategory = keyof NotificationPrefs;

const CATEGORY_BY_TYPE: Record<string, NotificationCategory> = {
  transit_alert: 'transitAlerts',
  saturn_phase_alert: 'transitAlerts',
  fact_nudge: 'transitAlerts',
  festival_alert: 'muhurta',
  gift_campaign: 'marketing',
  referral_promo: 'marketing',
  low_balance_share: 'marketing',
  admin_broadcast: 'marketing',
  daily_reading: 'dailyHoroscope',
  weekly_reading: 'dailyHoroscope',
  monthly_reading: 'dailyHoroscope',
  yearly_reading: 'dailyHoroscope',
};

/** null = transactional (report_ready, support_reply, referral_bonus, …) — always pushed. */
export function categoryOf(type: string): NotificationCategory | null {
  return CATEGORY_BY_TYPE[type] ?? null;
}

const DEFAULT_TZ = 'Asia/Kolkata';

function minutesOfDay(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function localMinutes(now: Date, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    // An unknown IANA zone saved on the user row — fall back rather than throw.
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: DEFAULT_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** True when `now` falls inside the window, including windows that wrap midnight (22:00–07:00). */
export function isWithinQuietHours(
  quietHours: QuietHours | null | undefined,
  now: Date,
  timeZone: string | null | undefined,
): boolean {
  if (!quietHours) return false;
  const start = minutesOfDay(quietHours.start);
  const end = minutesOfDay(quietHours.end);
  if (start === null || end === null || start === end) return false;
  const current = localMinutes(now, timeZone || DEFAULT_TZ);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export interface NotificationSettings {
  notificationPrefs: NotificationPrefs | null;
  quietHours: QuietHours | null;
  currentTimezone: string | null;
}

export function shouldSendPush(
  settings: NotificationSettings | undefined,
  type: string,
  now: Date = new Date(),
): boolean {
  const category = categoryOf(type);
  if (!category || !settings) return true;
  if (settings.notificationPrefs?.[category]?.push === false) return false;
  return !isWithinQuietHours(settings.quietHours, now, settings.currentTimezone);
}

/**
 * Which of `userIds` may receive an OS push of this `type` right now. Fails
 * OPEN: if the settings read errors, everyone stays eligible — a DB blip must
 * not silently drop a whole broadcast.
 */
export async function pushAllowedUserIds(
  userIds: string[],
  type: string,
  now: Date = new Date(),
): Promise<Set<string>> {
  const unique = [...new Set(userIds)];
  if (!categoryOf(type) || unique.length === 0) return new Set(unique);
  try {
    const rows = await findNotificationSettings(unique);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return new Set(unique.filter((id) => shouldSendPush(byId.get(id), type, now)));
  } catch (err) {
    logger.warn(
      { err, type, count: unique.length },
      'notification-prefs: settings read failed, sending to all',
    );
    return new Set(unique);
  }
}
