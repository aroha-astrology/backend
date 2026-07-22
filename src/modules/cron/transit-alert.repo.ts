import { and, asc, eq, gt, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  notifications,
  transitAlertCopy,
  transitEvents,
  type NewTransitAlertCopyRow,
  type TransitAlertCopyRow,
  type TransitEventRow,
} from '../../db/schema.js';
import { pushAtForDate, type TransitEvent } from '../../lib/astro-tools/transit-events.js';

/**
 * How long a user must be away before the transit-alert throttle applies, and
 * how rarely a throttled user may be pinged. Matches the 7-day window the
 * nightly horoscope batch already uses for "dormant".
 */
export const DORMANT_AFTER_DAYS = 7;
export const DORMANT_MIN_GAP_DAYS = 15;

export const TRANSIT_NOTIFICATION_TYPE = 'transit_alert';

/**
 * Insert newly detected events, ignoring any that are already known.
 *
 * Detection is re-run monthly over an overlapping horizon, so most of what it
 * finds already exists; the unique index on (planet, event_type, for_date)
 * makes re-running free rather than duplicative.
 */
export async function insertTransitEvents(events: TransitEvent[]): Promise<number> {
  if (events.length === 0) return 0;

  const rows = events.map((e) => ({
    planet: e.planet,
    eventType: e.eventType,
    fromSign: e.fromSign,
    toSign: e.toSign,
    exactAt: e.exactAt,
    forDate: e.forDate,
    pushAt: pushAtForDate(e.forDate),
    weight: e.weight,
  }));

  const inserted = await db
    .insert(transitEvents)
    .values(rows)
    .onConflictDoNothing({
      target: [transitEvents.planet, transitEvents.eventType, transitEvents.forDate],
    })
    .returning({ id: transitEvents.id });

  return inserted.length;
}

/**
 * Every event still ahead of us that has not yet been sent.
 *
 * Collision selection re-runs over this whole set rather than over just the
 * newly-detected slice: an event found this month can legitimately outrank one
 * stored last month, and judging a new event only against its own batch would
 * let two pushes land a day apart.
 */
export async function listPendingFutureEvents(now: Date): Promise<TransitEventRow[]> {
  return db
    .select()
    .from(transitEvents)
    .where(
      and(gt(transitEvents.pushAt, now), inArray(transitEvents.status, ['detected', 'skipped'])),
    )
    .orderBy(asc(transitEvents.pushAt));
}

export async function setEventStatus(
  id: string,
  status: 'detected' | 'drafted' | 'sent' | 'skipped',
  skipReason: string | null = null,
): Promise<void> {
  await db
    .update(transitEvents)
    .set({ status, skipReason, updatedAt: new Date() })
    .where(eq(transitEvents.id, id));
}

/**
 * Events selected for delivery whose push window opens within `horizonHours`
 * and which have not had copy generated yet.
 */
export async function listEventsNeedingDraft(
  now: Date,
  horizonHours: number,
): Promise<TransitEventRow[]> {
  const horizon = new Date(now.getTime() + horizonHours * 3_600_000);
  return db
    .select()
    .from(transitEvents)
    .where(
      and(
        eq(transitEvents.status, 'detected'),
        gt(transitEvents.pushAt, now),
        lt(transitEvents.pushAt, horizon),
      ),
    )
    .orderBy(asc(transitEvents.pushAt));
}

/**
 * Drafted events due to be sent now — i.e. whose push moment has arrived but
 * is not more than `graceHours` stale.
 *
 * The grace window exists so a cron that failed or ran late still delivers,
 * while an event whose moment passed days ago stays unsent: a "2 days before"
 * alert arriving after the event would be worse than not arriving.
 */
export async function listEventsDueToSend(
  now: Date,
  graceHours: number,
): Promise<TransitEventRow[]> {
  const floor = new Date(now.getTime() - graceHours * 3_600_000);
  return db
    .select()
    .from(transitEvents)
    .where(
      and(
        eq(transitEvents.status, 'drafted'),
        gte(transitEvents.pushAt, floor),
        lt(transitEvents.pushAt, now),
      ),
    )
    .orderBy(asc(transitEvents.pushAt));
}

export async function insertCopyRows(rows: NewTransitAlertCopyRow[]): Promise<void> {
  if (rows.length === 0) return;
  // Split by whether moonSign is set: the two partial unique indexes cover
  // disjoint sets of rows, and onConflictDoNothing needs a single target.
  const withSign = rows.filter((r) => r.moonSign != null);
  const withoutSign = rows.filter((r) => r.moonSign == null);

  // `where` here is the conflict target's index predicate, which is what
  // drizzle 0.36 emits for a partial unique index — not a row filter.
  if (withSign.length > 0) {
    await db
      .insert(transitAlertCopy)
      .values(withSign)
      .onConflictDoNothing({
        target: [transitAlertCopy.eventId, transitAlertCopy.moonSign, transitAlertCopy.lang],
        where: sql`${transitAlertCopy.moonSign} is not null`,
      });
  }
  if (withoutSign.length > 0) {
    await db
      .insert(transitAlertCopy)
      .values(withoutSign)
      .onConflictDoNothing({
        target: [transitAlertCopy.eventId, transitAlertCopy.lang],
        where: sql`${transitAlertCopy.moonSign} is null`,
      });
  }
}

export async function listCopyForEvent(eventId: string): Promise<TransitAlertCopyRow[]> {
  return db.select().from(transitAlertCopy).where(eq(transitAlertCopy.eventId, eventId));
}

export interface TransitRecipient {
  token: string;
  locale: string | null;
  userId: string;
  /** Natal Moon sign from the user's primary chart, or null if they have none. */
  moonSign: string | null;
}

/**
 * Every device that should receive a transit alert right now.
 *
 * Three things are folded into this one query rather than filtered in
 * application code, because doing it per-user would mean a round trip per
 * device:
 *
 *  1. Active tokens only — unrevoked and not explicitly push-disabled. NULL
 *     pushEnabled means "OS permission state unknown", which counts as
 *     enabled (same three-valued-logic handling as device-tokens.repo.ts).
 *  2. Moon sign from the user's *primary* chart (birth_profile_id IS NULL) —
 *     the notification is about the account holder's own life, not one of
 *     their saved profiles. Read from the sadeSati block, which is where
 *     kundli.service.ts already reads it from.
 *  3. The dormancy throttle: a user who hasn't opened the app in
 *     DORMANT_AFTER_DAYS gets at most one transit alert per
 *     DORMANT_MIN_GAP_DAYS. COALESCE(last_active_at, created_at) matters —
 *     last_active_at is NULL for users who never returned after signup, and a
 *     bare comparison would treat every brand-new user as dormant.
 */
export function transitRecipientsQuery(): SQL {
  return sql`
    SELECT
      dpt.token           AS token,
      dpt.locale          AS locale,
      u.id                AS user_id,
      k.dosha_data->'sadeSati'->>'moonSign' AS moon_sign
    FROM device_push_tokens dpt
    JOIN users u ON u.id = dpt.user_id
    LEFT JOIN kundlis k
      ON k.user_id = u.id
     AND k.birth_profile_id IS NULL
    WHERE dpt.revoked_at IS NULL
      AND (dpt.push_enabled IS NULL OR dpt.push_enabled = TRUE)
      AND u.deleted_at IS NULL
      AND (
        COALESCE(u.last_active_at, u.created_at) > now() - ${DORMANT_AFTER_DAYS} * interval '1 day'
        OR NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = u.id
            AND n.type = ${TRANSIT_NOTIFICATION_TYPE}
            AND n.created_at > now() - ${DORMANT_MIN_GAP_DAYS} * interval '1 day'
        )
      )
  `;
}

export async function listTransitRecipients(): Promise<TransitRecipient[]> {
  const rows = await db.execute<{
    token: string;
    locale: string | null;
    user_id: string;
    moon_sign: string | null;
  }>(transitRecipientsQuery());

  return Array.from(rows).map((r) => ({
    token: r.token,
    locale: r.locale,
    userId: r.user_id,
    moonSign: r.moon_sign,
  }));
}

/**
 * Write the in-app inbox rows for a send.
 *
 * These do double duty: the alert survives a swiped-away push and stays
 * readable in the bell, and the rows are also the ledger that
 * listTransitRecipients' dormancy throttle reads on the next send.
 */
export async function insertTransitNotifications(
  entries: { userId: string; title: string; body: string }[],
): Promise<void> {
  if (entries.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    await db.insert(notifications).values(
      entries.slice(i, i + CHUNK).map((e) => ({
        userId: e.userId,
        title: e.title,
        body: e.body,
        type: TRANSIT_NOTIFICATION_TYPE,
      })),
    );
  }
}
