/**
 * Announcement registry — one-time modals shown to users on app load.
 *
 * To add an announcement:
 *   1. Append an entry to ANNOUNCEMENTS below.
 *   2. Give it a unique `id` (used as the localStorage key — change the id to re-show
 *      an announcement to users who already dismissed it).
 *   3. Set `audience` to 'all' for everyone, or to an array of phone digit-suffixes
 *      (last 10 digits or full international form, both work). Examples:
 *        audience: 'all'
 *        audience: ['8105472167']
 *        audience: ['8105472167', '9693816242']
 *
 * The modal shows the FIRST matching unseen announcement once per device, then never
 * again for that id. Multiple announcements queue: dismiss one, the next eligible one
 * appears on the next app load.
 */

export interface Announcement {
  /** Unique key — also used as the localStorage dismissal flag. */
  id: string;
  /** 'all' for every signed-in user, or an array of phone number digit-suffixes. */
  audience: 'all' | string[];
  /** Emoji or single character shown in the icon circle. */
  icon: string;
  /** Bold headline. Keep under ~50 chars. */
  title: string;
  /** Body copy. Plain text — keep under ~200 chars for mobile. */
  body: string;
  /** Button label that dismisses the modal. */
  cta: string;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'chat-upgraded-2026-05',
    audience: ['8105472167'],
    icon: '✨',
    title: 'Our AI chat just got an upgrade',
    body: 'You can now ask anything — your questions get richer, more accurate guidance. Thank you for being with us.',
    cta: 'Start chatting',
  },
];

/** Returns true if the given user phone matches the announcement's audience. */
export function matchesAudience(audience: Announcement['audience'], userPhone: string | null | undefined): boolean {
  if (audience === 'all') return true;
  if (!userPhone) return false;
  const digits = userPhone.replace(/\D/g, '');
  if (!digits) return false;
  return audience.some(target => {
    const t = target.replace(/\D/g, '');
    if (!t) return false;
    return digits === t || digits.endsWith(t) || digits.slice(-10) === t.slice(-10);
  });
}

const STORAGE_PREFIX = 'announcement_seen:';

export function isSeen(id: string): boolean {
  try { return localStorage.getItem(STORAGE_PREFIX + id) === '1'; }
  catch { return false; }
}

export function markSeen(id: string): void {
  try { localStorage.setItem(STORAGE_PREFIX + id, '1'); }
  catch { /* localStorage unavailable — accept that it may show again next session */ }
}
