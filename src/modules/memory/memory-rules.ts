// =============================================================================
// Baba Ji memory — the rules, kept free of the database so they can be tested directly
// =============================================================================
// A "dated event" is something the reader said is coming ("interview on 5 November"). The guide checks in
// once, the morning after, and only at a polite hour. Anything private (health, legal, family planning)
// never gets a follow-up, whatever the date says.
// =============================================================================

import type { QuietHours } from '../../db/schema.js';
import { isFactBlocked } from '../../lib/llm/fact-nudge.js';
import { isWithinQuietHours } from '../../lib/notifications/notification-prefs.js';
import { dateInZone, midnightInZone, userZone } from '../../lib/user-time-zone.js';

/** The only kinds of event a follow-up is ever planned for. Health and legal matters are not on the list. */
export const FOLLOW_UP_KINDS = [
  'interview',
  'exam',
  'result',
  'travel',
  'move',
  'launch',
  'wedding',
  'meeting',
  'other',
] as const;
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number];

export function isFollowUpKind(value: unknown): value is FollowUpKind {
  return typeof value === 'string' && (FOLLOW_UP_KINDS as readonly string[]).includes(value);
}

/** Local hour at which the morning-after check-in becomes due. */
export const CHECK_IN_HOUR = 10;
/** The check-in is only sent between these local hours (start inclusive, end exclusive). */
export const CHECK_IN_WINDOW = { startHour: 9, endHour: 20 } as const;
/** How long the free first reply stays open after a check-in. */
export const FREE_REPLY_HOURS = 48;
/** An event further away than this is not followed up (the reader may well change their mind). */
export const MAX_EVENT_DAYS_AHEAD = 365;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD ("2026-02-30" is not). */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface PlanInput {
  fact: string;
  followUpQuestion: string | null;
  eventKind: unknown;
  eventDate: unknown;
  timeZone: string | null | undefined;
  now: Date;
}

export interface PlannedEvent {
  eventKind: FollowUpKind | null;
  eventDate: string | null;
  /** When the one follow-up may go out; null = never (past event, too far ahead, or a private topic). */
  followUpAt: Date | null;
}

/**
 * What to store for one extracted fact. The date is kept when it is a real date (it also anchors a later
 * birth-time check); the follow-up is planned only for a future, polite, non-private event: 10:00 the next
 * morning on the reader's own clock.
 */
export function planEvent(input: PlanInput): PlannedEvent {
  const none: PlannedEvent = { eventKind: null, eventDate: null, followUpAt: null };
  if (!isValidDateString(input.eventDate)) return none;

  const eventKind = isFollowUpKind(input.eventKind) ? input.eventKind : null;
  const zone = userZone(input.timeZone);
  const today = dateInZone(input.now, zone);
  const ahead = daysBetween(today, input.eventDate);

  const privateTopic = isFactBlocked(input.fact) || (input.followUpQuestion ? isFactBlocked(input.followUpQuestion) : false);
  if (!eventKind || privateTopic || ahead < 0 || ahead > MAX_EVENT_DAYS_AHEAD) {
    // Keep the date only for a plain past/odd event with no private content; never for a private topic.
    return privateTopic ? none : { eventKind, eventDate: input.eventDate, followUpAt: null };
  }

  const dueDay = addDays(input.eventDate, 1);
  const followUpAt = new Date(midnightInZone(dueDay, zone).getTime() + CHECK_IN_HOUR * 3_600_000);
  return { eventKind, eventDate: input.eventDate, followUpAt };
}

/** Local hour (0-23) of `now` in the zone. */
function localHour(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
}

/**
 * May a check-in go out right now for this reader? Only inside the polite window, and never inside their own
 * quiet hours. A "not now" simply leaves the item due: the hourly job tries again an hour later.
 */
export function isPoliteHour(now: Date, timeZone: string | null | undefined, quietHours: QuietHours | null | undefined): boolean {
  const zone = userZone(timeZone);
  const hour = localHour(now, zone);
  if (hour < CHECK_IN_WINDOW.startHour || hour >= CHECK_IN_WINDOW.endHour) return false;
  return !isWithinQuietHours(quietHours, now, zone);
}

/** A past event the reader confirmed is worth a birth-time check only if it happened on or before today. */
export function canConfirmEvent(eventDate: string | null, timeZone: string | null | undefined, now: Date): boolean {
  if (!eventDate || !isValidDateString(eventDate)) return false;
  return eventDate <= dateInZone(now, userZone(timeZone));
}

/** Facts the reader sees in the vault never show the internal marker the extractor writes. */
export function displayFact(fact: string): { text: string; toldByGuide: boolean } {
  const m = /^PREVIOUSLY TOLD THEM:\s*/i.exec(fact);
  return m ? { text: fact.slice(m[0].length), toldByGuide: true } : { text: fact, toldByGuide: false };
}
