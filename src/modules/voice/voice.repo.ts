import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { voiceSessions, type VoiceSessionRow } from '../../db/schema.js';

export async function createVoiceSession(input: {
  userId: string;
  birthProfileId: string | null;
  locale: string | null;
}): Promise<VoiceSessionRow> {
  const [row] = await db
    .insert(voiceSessions)
    .values({
      userId: input.userId,
      birthProfileId: input.birthProfileId,
      locale: input.locale,
    })
    .returning();
  if (!row) throw new Error('createVoiceSession: insert returned no row');
  return row;
}

export async function getVoiceSession(id: string, userId: string): Promise<VoiceSessionRow | null> {
  const [row] = await db
    .select()
    .from(voiceSessions)
    .where(and(eq(voiceSessions.id, id), eq(voiceSessions.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * Claims the next paid minute, atomically.
 *
 * The ceiling check and the increment are ONE conditional UPDATE rather than a
 * read-then-write, for the same reason `deductWalletBalance` is: two mint
 * requests racing (a retry, a double-tap, two devices) must not both observe
 * "2 minutes used" and both proceed to a 3rd and 4th. The `minutes_charged <
 * maxMinutes` predicate in the WHERE clause is what makes the ceiling real —
 * without it the limit would be advisory.
 *
 * Returns the updated row on success, or null when the session is already at
 * the ceiling, already ended, or does not belong to this user. A null is
 * therefore "refuse to mint", and the caller must not charge the wallet.
 */
export async function claimVoiceMinute(
  id: string,
  userId: string,
  maxMinutes: number,
): Promise<VoiceSessionRow | null> {
  const [row] = await db
    .update(voiceSessions)
    .set({
      minutesCharged: sql`${voiceSessions.minutesCharged} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(voiceSessions.id, id),
        eq(voiceSessions.userId, userId),
        eq(voiceSessions.active, true),
        sql`${voiceSessions.minutesCharged} < ${maxMinutes}`,
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Gives a claimed minute back when the mint that followed it failed, so a
 * Google-side error doesn't silently consume part of the user's 3-minute
 * allowance. Guarded against dropping below zero.
 */
export async function releaseVoiceMinute(id: string, userId: string): Promise<void> {
  await db
    .update(voiceSessions)
    .set({
      minutesCharged: sql`greatest(${voiceSessions.minutesCharged} - 1, 0)`,
      updatedAt: new Date(),
    })
    .where(and(eq(voiceSessions.id, id), eq(voiceSessions.userId, userId)));
}

export async function endVoiceSession(id: string, userId: string): Promise<void> {
  const now = new Date();
  await db
    .update(voiceSessions)
    .set({ active: false, endedAt: now, updatedAt: now })
    .where(and(eq(voiceSessions.id, id), eq(voiceSessions.userId, userId)));
}

/**
 * Ends a session AND releases its most recently charged minute, in one atomic
 * update — for the one case that deserves a refund: the client never got a
 * working call out of the minute it just paid for.
 *
 * `updatedAt` is the signal, not a dedicated timestamp, because
 * `claimVoiceMinute` is the only thing that bumps both it and
 * `minutesCharged` together — so "updated within the grace window" already
 * means "the most recent charge is this recent", with no extra column needed.
 *
 * Everything that would make a refund wrong is folded into the WHERE clause
 * rather than checked beforehand, for the same reason `claimVoiceMinute` is
 * one UPDATE: a second call for the same session (a retry, `/end` firing from
 * both an error handler and a page-unload handler) must not double-refund.
 * The first call flips `active` to false, so every later call fails the
 * `active = true` predicate and returns null — refunding nothing.
 *
 * Returns the price to refund (so the caller can credit the wallet) if the
 * refund applied, or null if it did not — already ended, no minute to give
 * back, or outside the grace window, in which case the caller should fall
 * back to a plain `endVoiceSession`.
 */
export async function endVoiceSessionWithRefund(
  id: string,
  userId: string,
  graceMs: number,
): Promise<{ refundedMinutes: number } | null> {
  const graceSeconds = Math.ceil(graceMs / 1000);
  const [row] = await db
    .update(voiceSessions)
    .set({
      minutesCharged: sql`${voiceSessions.minutesCharged} - 1`,
      active: false,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(voiceSessions.id, id),
        eq(voiceSessions.userId, userId),
        eq(voiceSessions.active, true),
        sql`${voiceSessions.minutesCharged} > 0`,
        sql`${voiceSessions.updatedAt} > now() - ${graceSeconds} * interval '1 second'`,
      ),
    )
    .returning();
  return row ? { refundedMinutes: 1 } : null;
}
