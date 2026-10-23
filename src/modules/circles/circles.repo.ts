import { and, asc, count, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  birthProfiles,
  cosmicCircleInvites,
  cosmicCircleMembers,
  cosmicCirclePulses,
} from '../../db/schema.js';

export type CircleMemberRow = typeof cosmicCircleMembers.$inferSelect;
export type CirclePulseRow = typeof cosmicCirclePulses.$inferSelect;
export type CircleInviteRow = typeof cosmicCircleInvites.$inferSelect;

/** An owner's members, oldest first, leaving out anyone whose saved profile was deleted. */
export async function listMembers(ownerUserId: string): Promise<CircleMemberRow[]> {
  const rows = await db
    .select({ member: cosmicCircleMembers, deletedAt: birthProfiles.deletedAt })
    .from(cosmicCircleMembers)
    .leftJoin(birthProfiles, eq(birthProfiles.id, cosmicCircleMembers.profileId))
    .where(eq(cosmicCircleMembers.ownerUserId, ownerUserId))
    .orderBy(asc(cosmicCircleMembers.createdAt));
  return rows.filter((r) => !r.deletedAt).map((r) => r.member);
}

export async function countMembers(ownerUserId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(cosmicCircleMembers)
    .where(eq(cosmicCircleMembers.ownerUserId, ownerUserId));
  return row?.n ?? 0;
}

/** Inserts a member; undefined when the same person (identity hash) or profile is already in the circle. */
export async function insertMember(
  values: typeof cosmicCircleMembers.$inferInsert,
): Promise<CircleMemberRow | undefined> {
  const [row] = await db.insert(cosmicCircleMembers).values(values).onConflictDoNothing().returning();
  return row;
}

export async function deleteMember(ownerUserId: string, memberId: string): Promise<boolean> {
  const rows = await db
    .delete(cosmicCircleMembers)
    .where(and(eq(cosmicCircleMembers.id, memberId), eq(cosmicCircleMembers.ownerUserId, ownerUserId)))
    .returning({ id: cosmicCircleMembers.id });
  return rows.length > 0;
}

export async function pulsesFor(memberIds: string[], localDate: string): Promise<CirclePulseRow[]> {
  if (memberIds.length === 0) return [];
  return db
    .select()
    .from(cosmicCirclePulses)
    .where(and(inArray(cosmicCirclePulses.memberId, memberIds), eq(cosmicCirclePulses.localDate, localDate)));
}

export async function savePulse(row: {
  memberId: string;
  localDate: string;
  score: number;
  tone: CirclePulseRow['tone'];
}): Promise<void> {
  await db
    .insert(cosmicCirclePulses)
    .values(row)
    .onConflictDoUpdate({
      target: [cosmicCirclePulses.memberId, cosmicCirclePulses.localDate],
      set: { score: row.score, tone: row.tone },
    });
}

/** Marks a pulse pushed. False when it was already marked, so a retried cron never pushes twice. */
export async function markPulseNotified(memberId: string, localDate: string): Promise<boolean> {
  const rows = await db
    .update(cosmicCirclePulses)
    .set({ notified: true })
    .where(
      and(
        eq(cosmicCirclePulses.memberId, memberId),
        eq(cosmicCirclePulses.localDate, localDate),
        eq(cosmicCirclePulses.notified, false),
      ),
    )
    .returning({ memberId: cosmicCirclePulses.memberId });
  return rows.length > 0;
}

/** Whether any pulse of these members was already pushed on that local day. */
export async function anyNotified(memberIds: string[], localDate: string): Promise<boolean> {
  if (memberIds.length === 0) return false;
  const [row] = await db
    .select({ n: count() })
    .from(cosmicCirclePulses)
    .where(
      and(
        inArray(cosmicCirclePulses.memberId, memberIds),
        eq(cosmicCirclePulses.localDate, localDate),
        eq(cosmicCirclePulses.notified, true),
      ),
    );
  return (row?.n ?? 0) > 0;
}

/** Owners who have at least one member, for the daily pulse run. */
export async function ownersWithMembers(limit: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ ownerUserId: cosmicCircleMembers.ownerUserId })
    .from(cosmicCircleMembers)
    .limit(limit);
  return rows.map((r) => r.ownerUserId);
}

export async function insertInvite(values: typeof cosmicCircleInvites.$inferInsert): Promise<void> {
  await db.insert(cosmicCircleInvites).values(values);
}

export async function findInvite(code: string): Promise<CircleInviteRow | undefined> {
  const [row] = await db.select().from(cosmicCircleInvites).where(eq(cosmicCircleInvites.code, code)).limit(1);
  return row;
}

export async function countOpenInvites(inviterUserId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(cosmicCircleInvites)
    .where(
      and(
        eq(cosmicCircleInvites.inviterUserId, inviterUserId),
        isNull(cosmicCircleInvites.acceptedAt),
        gt(cosmicCircleInvites.expiresAt, sql`now()`),
      ),
    );
  return row?.n ?? 0;
}

/** Marks an invite used. False when someone else got there first, or it expired. */
export async function claimInvite(code: string, acceptedByUserId: string): Promise<boolean> {
  const rows = await db
    .update(cosmicCircleInvites)
    .set({ acceptedByUserId, acceptedAt: sql`now()` })
    .where(
      and(
        eq(cosmicCircleInvites.code, code),
        isNull(cosmicCircleInvites.acceptedAt),
        gt(cosmicCircleInvites.expiresAt, sql`now()`),
      ),
    )
    .returning({ code: cosmicCircleInvites.code });
  return rows.length > 0;
}
