import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  appSettings,
  hookAlarms,
  hookProgress,
  hookPushLog,
  hookUnlocks,
  sleepLogs,
} from '../../db/schema.js';

export type HookProgressRow = typeof hookProgress.$inferSelect;
export type HookAlarmRow = typeof hookAlarms.$inferSelect;
export type SleepLogRow = typeof sleepLogs.$inferSelect;

/* ------------------------------------------------------------------ progress */

export async function getProgress(
  userId: string,
  hook: string,
  profileKey: string,
  localDate: string,
): Promise<HookProgressRow | undefined> {
  const [row] = await db
    .select()
    .from(hookProgress)
    .where(
      and(
        eq(hookProgress.userId, userId),
        eq(hookProgress.hook, hook),
        eq(hookProgress.profileKey, profileKey),
        eq(hookProgress.localDate, localDate),
      ),
    )
    .limit(1);
  return row;
}

/** Creates the day's row or merges `patch` into its JSON body (top-level keys replace). */
export async function mergeProgress(
  userId: string,
  hook: string,
  profileKey: string,
  localDate: string,
  patch: Record<string, unknown>,
): Promise<HookProgressRow> {
  const [row] = await db
    .insert(hookProgress)
    .values({ userId, hook, profileKey, localDate, data: patch })
    .onConflictDoUpdate({
      target: [hookProgress.userId, hookProgress.hook, hookProgress.profileKey, hookProgress.localDate],
      set: { data: sql`${hookProgress.data} || ${JSON.stringify(patch)}::jsonb`, updatedAt: sql`now()` },
    })
    .returning();
  return row!;
}

/**
 * Creates the day's row only when it does not exist. True when this call created it, which is how
 * "light the diya" and "finish the day" stay one-shot across two devices.
 */
export async function createProgressOnce(
  userId: string,
  hook: string,
  profileKey: string,
  localDate: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const rows = await db
    .insert(hookProgress)
    .values({ userId, hook, profileKey, localDate, data })
    .onConflictDoNothing({
      target: [hookProgress.userId, hookProgress.hook, hookProgress.profileKey, hookProgress.localDate],
    })
    .returning({ id: hookProgress.id });
  return rows.length > 0;
}

export async function listProgress(
  userId: string,
  hook: string,
  profileKey: string,
  fromDate: string,
  toDate: string,
): Promise<HookProgressRow[]> {
  return db
    .select()
    .from(hookProgress)
    .where(
      and(
        eq(hookProgress.userId, userId),
        eq(hookProgress.hook, hook),
        eq(hookProgress.profileKey, profileKey),
        gte(hookProgress.localDate, fromDate),
        lte(hookProgress.localDate, toDate),
      ),
    )
    .orderBy(asc(hookProgress.localDate));
}

/** How many readers have a row for this hook on this local date (a real public count). */
export async function countProgress(hook: string, localDate: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(hookProgress)
    .where(and(eq(hookProgress.hook, hook), eq(hookProgress.localDate, localDate)));
  return row?.n ?? 0;
}

/* ------------------------------------------------------------------- unlocks */

/** True when this call recorded the unlock; false when (user, hook, ref) already had one. */
export async function insertUnlock(userId: string, hook: string, ref: string, coins: number): Promise<boolean> {
  const rows = await db
    .insert(hookUnlocks)
    .values({ userId, hook, ref, coins })
    .onConflictDoNothing({ target: [hookUnlocks.userId, hookUnlocks.hook, hookUnlocks.ref] })
    .returning({ id: hookUnlocks.id });
  return rows.length > 0;
}

export async function hasUnlock(userId: string, hook: string, ref: string): Promise<boolean> {
  const [row] = await db
    .select({ id: hookUnlocks.id })
    .from(hookUnlocks)
    .where(and(eq(hookUnlocks.userId, userId), eq(hookUnlocks.hook, hook), eq(hookUnlocks.ref, ref)))
    .limit(1);
  return Boolean(row);
}

export async function deleteUnlock(userId: string, hook: string, ref: string): Promise<void> {
  await db
    .delete(hookUnlocks)
    .where(and(eq(hookUnlocks.userId, userId), eq(hookUnlocks.hook, hook), eq(hookUnlocks.ref, ref)));
}

/* ----------------------------------------------------------------- push cap */

export async function pushCountOn(userId: string, localDate: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(hookPushLog)
    .where(and(eq(hookPushLog.userId, userId), eq(hookPushLog.localDate, localDate)));
  return row?.n ?? 0;
}

export async function logPush(userId: string, localDate: string, hook: string): Promise<void> {
  await db.insert(hookPushLog).values({ userId, localDate, hook });
}

/* -------------------------------------------------------------------- alarms */

/** True when the alarm was created; false when this (user, hook, ref) already has one. */
export async function insertAlarm(values: typeof hookAlarms.$inferInsert): Promise<boolean> {
  const rows = await db
    .insert(hookAlarms)
    .values(values)
    .onConflictDoNothing({ target: [hookAlarms.userId, hookAlarms.hook, hookAlarms.ref] })
    .returning({ id: hookAlarms.id });
  return rows.length > 0;
}

export async function dueAlarms(now: Date, limit = 200): Promise<HookAlarmRow[]> {
  return db
    .select()
    .from(hookAlarms)
    .where(and(isNull(hookAlarms.sentAt), lte(hookAlarms.fireAt, now)))
    .orderBy(asc(hookAlarms.fireAt))
    .limit(limit);
}

/** Claims an alarm for sending; false when another run already did. */
export async function claimAlarm(id: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(hookAlarms)
    .set({ sentAt: now })
    .where(and(eq(hookAlarms.id, id), isNull(hookAlarms.sentAt)))
    .returning({ id: hookAlarms.id });
  return rows.length > 0;
}

export async function listAlarms(userId: string, hook: string, from: Date): Promise<HookAlarmRow[]> {
  return db
    .select()
    .from(hookAlarms)
    .where(and(eq(hookAlarms.userId, userId), eq(hookAlarms.hook, hook), gte(hookAlarms.fireAt, from)))
    .orderBy(asc(hookAlarms.fireAt));
}

/* --------------------------------------------------------------------- sleep */

export async function upsertSleep(values: typeof sleepLogs.$inferInsert): Promise<void> {
  await db
    .insert(sleepLogs)
    .values(values)
    .onConflictDoUpdate({
      target: [sleepLogs.userId, sleepLogs.localDate],
      set: { score: values.score, nakshatraIndex: values.nakshatraIndex, signIndex: values.signIndex },
    });
}

export async function listSleep(userId: string, limit = 120): Promise<SleepLogRow[]> {
  return db
    .select()
    .from(sleepLogs)
    .where(eq(sleepLogs.userId, userId))
    .orderBy(desc(sleepLogs.localDate))
    .limit(limit);
}

/* ------------------------------------------------------------------ settings */

const SETTINGS_KEY = 'hooks.settings';

export async function readSettings(): Promise<Record<string, unknown>> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY)).limit(1);
  return (row?.value as Record<string, unknown> | undefined) ?? {};
}

export async function writeSettings(value: Record<string, unknown>, updatedBy: string | null): Promise<void> {
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now, updatedBy } });
}

/** Readers who have used a hook at least once (the only ones a scheduled push goes to). */
export async function usersWithHook(hook: string, limit = 2000): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: hookProgress.userId })
    .from(hookProgress)
    .where(eq(hookProgress.hook, hook))
    .limit(limit);
  return rows.map((r) => r.userId);
}

/** Readers with at least one sleep score in the last `days` days. */
export async function usersWithRecentSleep(sinceDate: string, limit = 2000): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: sleepLogs.userId })
    .from(sleepLogs)
    .where(gte(sleepLogs.localDate, sinceDate))
    .limit(limit);
  return rows.map((r) => r.userId);
}
