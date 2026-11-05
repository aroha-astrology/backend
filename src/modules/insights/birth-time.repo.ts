import { and, desc, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  birthTimeRectifications,
  type BirthTimeRectificationRow,
  type NewBirthTimeRectificationRow,
} from '../../db/schema.js';
import {
  decryptField,
  decryptJson,
  encryptField,
  encryptJson,
} from '../../lib/crypto/field-encryption.js';
import type { EventMatch, LifeEvent } from '../../lib/astro-engine/calculations/rectification.js';

export interface RectificationDetail {
  events: LifeEvent[];
  eventMatches: EventMatch[];
  reasoning: string;
  /** How sure the reader was of the time when the check ran. 'unknown' = they only knew the part of the day. */
  statedAccuracy?: 'exact' | 'approximate' | 'unknown' | null;
  offsetMinutes: number;
}

/** A row with its encrypted columns opened up. */
export interface Rectification extends Omit<
  BirthTimeRectificationRow,
  'statedTime' | 'suggestedTime' | 'detail'
> {
  statedTime: string;
  suggestedTime: string;
  detail: RectificationDetail;
}

function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(birthTimeRectifications.birthProfileId)
    : eq(birthTimeRectifications.birthProfileId, birthProfileId);
}

function decrypt(row: BirthTimeRectificationRow): Rectification {
  return {
    ...row,
    statedTime: decryptField(row.statedTime) ?? '',
    suggestedTime: decryptField(row.suggestedTime) ?? '',
    detail: decryptJson<RectificationDetail>(row.detail) ?? {
      events: [],
      eventMatches: [],
      reasoning: '',
      offsetMinutes: 0,
    },
  };
}

export async function insertRectification(values: {
  userId: string;
  birthProfileId: string | null;
  statedTime: string;
  suggestedTime: string;
  detail: RectificationDetail;
  confidence: NewBirthTimeRectificationRow['confidence'];
  confidencePct: number;
  pricePaidPaise: number;
  /** When the answer may be shown. Omit to show it at once. */
  revealAt?: Date | null;
}): Promise<Rectification> {
  const [row] = await db
    .insert(birthTimeRectifications)
    .values({
      ...values,
      statedTime: encryptField(values.statedTime)!,
      suggestedTime: encryptField(values.suggestedTime)!,
      detail: encryptJson(values.detail)!,
    })
    .returning();
  if (!row) throw new Error('Failed to insert birth-time rectification');
  return decrypt(row);
}

/** The most recent check for this profile, applied or not. */
export async function findLatestRectification(
  userId: string,
  birthProfileId: string | null,
): Promise<Rectification | undefined> {
  const [row] = await db
    .select()
    .from(birthTimeRectifications)
    .where(and(eq(birthTimeRectifications.userId, userId), profileFilter(birthProfileId)))
    .orderBy(desc(birthTimeRectifications.createdAt))
    .limit(1);
  return row ? decrypt(row) : undefined;
}

/** The most recent check the user actually applied to this profile. */
export async function findLatestAppliedRectification(
  userId: string,
  birthProfileId: string | null,
): Promise<Rectification | undefined> {
  const [row] = await db
    .select()
    .from(birthTimeRectifications)
    .where(
      and(
        eq(birthTimeRectifications.userId, userId),
        profileFilter(birthProfileId),
        isNotNull(birthTimeRectifications.appliedAt),
      ),
    )
    .orderBy(desc(birthTimeRectifications.appliedAt))
    .limit(1);
  return row ? decrypt(row) : undefined;
}

export async function findRectificationForUser(
  id: string,
  userId: string,
): Promise<Rectification | undefined> {
  const [row] = await db
    .select()
    .from(birthTimeRectifications)
    .where(and(eq(birthTimeRectifications.id, id), eq(birthTimeRectifications.userId, userId)))
    .limit(1);
  return row ? decrypt(row) : undefined;
}

/**
 * Claims the held-back checks whose time has come, so each one gets its push
 * exactly once even if two sweeps overlap: the UPDATE only matches rows still
 * un-notified, and hands back only the rows this call flipped.
 */
export async function claimDueRectifications(
  now: Date,
  limit: number,
): Promise<{ id: string; userId: string }[]> {
  const due = db
    .select({ id: birthTimeRectifications.id })
    .from(birthTimeRectifications)
    .where(
      and(
        isNotNull(birthTimeRectifications.revealAt),
        lte(birthTimeRectifications.revealAt, now),
        isNull(birthTimeRectifications.notifiedAt),
      ),
    )
    .limit(limit);
  return db
    .update(birthTimeRectifications)
    .set({ notifiedAt: now })
    .where(
      and(inArray(birthTimeRectifications.id, due), isNull(birthTimeRectifications.notifiedAt)),
    )
    .returning({ id: birthTimeRectifications.id, userId: birthTimeRectifications.userId });
}

/** Marks a check applied. Returns false if it was already applied (single-use). */
export async function markRectificationApplied(id: string, userId: string): Promise<boolean> {
  const rows = await db
    .update(birthTimeRectifications)
    .set({ appliedAt: new Date() })
    .where(
      and(
        eq(birthTimeRectifications.id, id),
        eq(birthTimeRectifications.userId, userId),
        isNull(birthTimeRectifications.appliedAt),
      ),
    )
    .returning({ id: birthTimeRectifications.id });
  return rows.length > 0;
}
