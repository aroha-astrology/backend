import { and, eq, gte, sql } from 'drizzle-orm';
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
 * Free Pass minutes this user has spent on calls started since `since` (the
 * start of their Pass period).
 */
function freeMinutesUsedSince(userId: string, since: Date) {
  return db
    .select({ used: sql<number>`coalesce(sum(${voiceSessions.freeMinutes}), 0)` })
    .from(voiceSessions)
    .where(and(eq(voiceSessions.userId, userId), gte(voiceSessions.createdAt, since)));
}

export async function countFreeVoiceMinutesUsed(userId: string, since: Date): Promise<number> {
  const [row] = await freeMinutesUsedSince(userId, since);
  return Number(row?.used ?? 0);
}

/**
 * Claims the next minute as one of the member's free Pass minutes, atomically.
 *
 * Same one-UPDATE shape as `claimVoiceMinute`, with the allowance check in the
 * WHERE clause: the minute is only claimed while the free minutes spent across
 * ALL of this user's sessions since `since` are still under `allowance`. `since`
 * goes through a column-bound `gte`, never a bare Date in sql`` (that crashes
 * postgres-js — see pass.repo.ts).
 *
 * Returns the updated row, or null when the allowance is used up, the session
 * has ended, it has reached `maxMinutes`, or it isn't this user's. On null the
 * caller falls back to a wallet-paid minute, which re-checks the session.
 *
 * Two calls open at once on two devices can each read the same total and each
 * take a free minute, so the allowance can be passed by a minute in that race.
 * That costs one minute of voice once, and closing it would mean locking the
 * user's rows on every mint.
 */
export async function claimFreeVoiceMinute(
  id: string,
  userId: string,
  maxMinutes: number,
  since: Date,
  allowance: number,
): Promise<VoiceSessionRow | null> {
  const [row] = await db
    .update(voiceSessions)
    .set({
      minutesCharged: sql`${voiceSessions.minutesCharged} + 1`,
      freeMinutes: sql`${voiceSessions.freeMinutes} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(voiceSessions.id, id),
        eq(voiceSessions.userId, userId),
        eq(voiceSessions.active, true),
        sql`${voiceSessions.minutesCharged} < ${maxMinutes}`,
        sql`(${freeMinutesUsedSince(userId, since)}) < ${allowance}`,
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Gives a claimed minute back when the mint that followed it failed, so a
 * Google-side error doesn't silently consume a minute the user never got.
 * `free` also hands the minute back to the Pass allowance. Guarded against
 * dropping below zero.
 */
export async function releaseVoiceMinute(id: string, userId: string, free = false): Promise<void> {
  await db
    .update(voiceSessions)
    .set({
      minutesCharged: sql`greatest(${voiceSessions.minutesCharged} - 1, 0)`,
      ...(free ? { freeMinutes: sql`greatest(${voiceSessions.freeMinutes} - 1, 0)` } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(voiceSessions.id, id), eq(voiceSessions.userId, userId)));
}

/**
 * Marks a session ended, returning the row IFF this call is the one that
 * actually flipped it. `active = true` in the WHERE clause is the whole
 * duplicate guard — a second call for the same session (a retry, or `/end`
 * firing from an error handler and a page-unload handler both) fails the
 * predicate and gets null back. voice.service.ts relies on that: only a
 * non-null return may persist the call's transcript, which is what keeps a
 * duplicate `/end` from saving the same call to chat history twice. Same
 * one-UPDATE-as-the-guard pattern claimVoiceMinute and
 * endVoiceSessionWithRefund above already use.
 */
export async function endVoiceSession(id: string, userId: string): Promise<VoiceSessionRow | null> {
  const now = new Date();
  const [row] = await db
    .update(voiceSessions)
    .set({ active: false, endedAt: now, updatedAt: now })
    .where(
      and(
        eq(voiceSessions.id, id),
        eq(voiceSessions.userId, userId),
        eq(voiceSessions.active, true),
      ),
    )
    .returning();
  return row ?? null;
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
 * Returns what was given back if the refund applied, or null if it did not —
 * already ended, no minute to give back, or outside the grace window, in which
 * case the caller should fall back to a plain `endVoiceSession`. `free` says
 * the minute was one of the member's free Pass minutes: it goes back to the
 * allowance and the caller must NOT credit the wallet for it.
 *
 * A call spends its free minutes first, so its latest minute was free exactly
 * when every minute so far was (`free_minutes = minutes_charged`). The free
 * case is tried first, as its own UPDATE with that predicate; whichever UPDATE
 * matches flips `active`, so the other can never also apply.
 */
export async function endVoiceSessionWithRefund(
  id: string,
  userId: string,
  graceMs: number,
): Promise<{ refundedMinutes: number; free: boolean } | null> {
  const graceSeconds = Math.ceil(graceMs / 1000);
  const refundable = and(
    eq(voiceSessions.id, id),
    eq(voiceSessions.userId, userId),
    eq(voiceSessions.active, true),
    sql`${voiceSessions.minutesCharged} > 0`,
    sql`${voiceSessions.updatedAt} > now() - ${graceSeconds} * interval '1 second'`,
  );

  const [freeRow] = await db
    .update(voiceSessions)
    .set({
      minutesCharged: sql`${voiceSessions.minutesCharged} - 1`,
      freeMinutes: sql`${voiceSessions.freeMinutes} - 1`,
      active: false,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(refundable, sql`${voiceSessions.freeMinutes} = ${voiceSessions.minutesCharged}`))
    .returning();
  if (freeRow) return { refundedMinutes: 1, free: true };

  const [row] = await db
    .update(voiceSessions)
    .set({
      minutesCharged: sql`${voiceSessions.minutesCharged} - 1`,
      active: false,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(refundable)
    .returning();
  return row ? { refundedMinutes: 1, free: false } : null;
}
