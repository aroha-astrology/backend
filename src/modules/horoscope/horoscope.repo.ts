import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  dailyHoroscopes,
  users,
  type DailyHoroscopeRow,
  type MonthlyBreakdownEntry,
  type StructuredHoroscope,
  type UserRow,
} from '../../db/schema.js';
import type { HoroscopePeriod } from './horoscope.schemas.js';

/** Keyset page of active users (deletedAt IS NULL), ordered by id for stable paging. */
export async function listActiveUsersAfter(
  afterId: string | null,
  limit: number,
): Promise<UserRow[]> {
  const where = afterId
    ? and(isNull(users.deletedAt), gt(users.id, afterId))
    : isNull(users.deletedAt);
  return db.select().from(users).where(where).orderBy(asc(users.id)).limit(limit);
}

export async function findHoroscope(
  userId: string,
  period: HoroscopePeriod,
  periodKey: string,
): Promise<DailyHoroscopeRow | undefined> {
  const rows = await db
    .select()
    .from(dailyHoroscopes)
    .where(
      and(
        eq(dailyHoroscopes.userId, userId),
        eq(dailyHoroscopes.period, period),
        eq(dailyHoroscopes.periodKey, periodKey),
      ),
    )
    .limit(1);
  return rows[0];
}

/** Idempotent per (userId, period, periodKey): re-running overwrites cleanly. */
export async function upsertHoroscope(params: {
  userId: string;
  forDate: string;
  period: HoroscopePeriod;
  periodKey: string;
  summary: string;
  model: string;
  monthlyBreakdown?: MonthlyBreakdownEntry[];
  structured?: StructuredHoroscope;
}): Promise<void> {
  const { userId, forDate, period, periodKey, summary, model, monthlyBreakdown, structured } =
    params;
  const extraFields = {
    ...(monthlyBreakdown !== undefined ? { monthlyBreakdown } : {}),
    ...(structured !== undefined ? { structured } : {}),
  };
  await db
    .insert(dailyHoroscopes)
    .values({ userId, forDate, period, periodKey, summary, model, ...extraFields })
    .onConflictDoUpdate({
      target: [dailyHoroscopes.userId, dailyHoroscopes.period, dailyHoroscopes.periodKey],
      set: { summary, model, updatedAt: new Date(), ...extraFields },
    });
}
