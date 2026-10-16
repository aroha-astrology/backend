import { and, count, desc, eq, gt, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { users, voiceSessions, type VoiceSessionRow } from '../../db/schema.js';
import { decryptField, encryptField } from '../../lib/crypto/field-encryption.js';

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
 * start of their Pass period). Trial minutes are free minutes too but are not
 * Pass minutes, so they are left out: they must not use up the month's Pass
 * allowance.
 */
function freeMinutesUsedSince(userId: string, since: Date) {
  return db
    .select({
      used: sql<number>`coalesce(sum(${voiceSessions.freeMinutes} - ${voiceSessions.trialMinutes}), 0)`,
    })
    .from(voiceSessions)
    .where(and(eq(voiceSessions.userId, userId), gte(voiceSessions.createdAt, since)));
}

/** Trial minutes this user has spent, over every call they have ever made. */
function trialMinutesUsed(userId: string) {
  return db
    .select({ used: sql<number>`coalesce(sum(${voiceSessions.trialMinutes}), 0)` })
    .from(voiceSessions)
    .where(eq(voiceSessions.userId, userId));
}

export async function countTrialVoiceMinutesUsed(userId: string): Promise<number> {
  const [row] = await trialMinutesUsed(userId);
  return Number(row?.used ?? 0);
}

/**
 * Claims the next minute as one of the user's one-time trial minutes,
 * atomically — the same one-UPDATE shape as `claimFreeVoiceMinute`, with the
 * lifetime trial count in the WHERE clause instead of the Pass period's.
 *
 * A trial minute is a free minute too, so `free_minutes` goes up with
 * `trial_minutes`: everything that asks "was this minute free" (the refund on a
 * failed connect, the money refund) keeps working unchanged.
 *
 * Returns null when the trial is used up, the session has ended, it has reached
 * `maxMinutes`, or it isn't this user's. The same two-device race as the Pass
 * allowance applies: at most one extra minute, once.
 */
export async function claimTrialVoiceMinute(
  id: string,
  userId: string,
  maxMinutes: number,
  allowance: number,
): Promise<VoiceSessionRow | null> {
  const [row] = await db
    .update(voiceSessions)
    .set({
      minutesCharged: sql`${voiceSessions.minutesCharged} + 1`,
      freeMinutes: sql`${voiceSessions.freeMinutes} + 1`,
      trialMinutes: sql`${voiceSessions.trialMinutes} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(voiceSessions.id, id),
        eq(voiceSessions.userId, userId),
        eq(voiceSessions.active, true),
        sql`${voiceSessions.minutesCharged} < ${maxMinutes}`,
        sql`(${trialMinutesUsed(userId)}) < ${allowance}`,
      ),
    )
    .returning();
  return row ?? null;
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

/** Where a minute came from: the one-time trial, the member's monthly Pass minutes, or the wallet. */
export type VoiceMinuteSource = 'trial' | 'pass' | 'paid';

/**
 * Gives a claimed minute back when the mint that followed it failed, so a
 * Google-side error doesn't silently consume a minute the user never got.
 * A `pass` minute also goes back to the Pass allowance and a `trial` minute to
 * the trial. Guarded against dropping below zero.
 */
export async function releaseVoiceMinute(
  id: string,
  userId: string,
  source: VoiceMinuteSource = 'paid',
): Promise<void> {
  await db
    .update(voiceSessions)
    .set({
      minutesCharged: sql`greatest(${voiceSessions.minutesCharged} - 1, 0)`,
      ...(source !== 'paid' ? { freeMinutes: sql`greatest(${voiceSessions.freeMinutes} - 1, 0)` } : {}),
      ...(source === 'trial'
        ? { trialMinutes: sql`greatest(${voiceSessions.trialMinutes} - 1, 0)` }
        : {}),
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
 * A call spends its trial minutes first, then its free Pass minutes, then paid
 * ones. So its latest minute was a trial minute exactly when every minute so
 * far was (`trial_minutes = minutes_charged`), and free exactly when every
 * minute so far was free (`free_minutes = minutes_charged`). The trial case is
 * tried first, then the free one, each as its own UPDATE with that predicate;
 * whichever UPDATE matches flips `active`, so no later one can also apply.
 * `free` is true for a trial minute too (no money was taken for either).
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

  const [trialRow] = await db
    .update(voiceSessions)
    .set({
      minutesCharged: sql`${voiceSessions.minutesCharged} - 1`,
      freeMinutes: sql`${voiceSessions.freeMinutes} - 1`,
      trialMinutes: sql`${voiceSessions.trialMinutes} - 1`,
      active: false,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(refundable, sql`${voiceSessions.trialMinutes} = ${voiceSessions.minutesCharged}`))
    .returning();
  if (trialRow) return { refundedMinutes: 1, free: true };

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

/**
 * Saves the caller's "how was your call?" answer onto the call's own row.
 *
 * One answer per call: the `feedback_at IS NULL` predicate makes a second
 * submit (a double-tap, a retry) a no-op instead of overwriting the first.
 * Only a call that was actually given a minute can be rated. Returns false
 * when nothing was saved: not this user's call, never connected, or already
 * rated.
 */
export async function saveVoiceFeedback(input: {
  id: string;
  userId: string;
  rating: number;
  tags: string[];
  comment?: string;
}): Promise<boolean> {
  const rows = await db
    .update(voiceSessions)
    .set({
      feedbackRating: input.rating,
      feedbackTags: input.tags,
      feedbackComment: input.comment ? (encryptField(input.comment) as string) : null,
      feedbackAt: new Date(),
    })
    .where(
      and(
        eq(voiceSessions.id, input.id),
        eq(voiceSessions.userId, input.userId),
        gt(voiceSessions.minutesCharged, 0),
        isNull(voiceSessions.feedbackAt),
      ),
    )
    .returning({ id: voiceSessions.id });
  return rows.length > 0;
}

export interface AdminVoiceFeedbackRow {
  voiceSessionId: string;
  userId: string;
  displayName: string | null;
  phoneE164: string | null;
  rating: number;
  tags: string[];
  comment: string | null;
  minutesCharged: number;
  callStartedAt: Date;
  callEndedAt: Date | null;
  feedbackAt: Date;
}

/** Every call answer across all users, newest first — powers /admin/voice-feedback. */
export async function listVoiceFeedback(
  limit: number,
  offset: number,
): Promise<{ rows: AdminVoiceFeedbackRow[]; total: number; averageRating: number | null }> {
  const rated = isNotNull(voiceSessions.feedbackAt);
  const [rows, totals] = await Promise.all([
    db
      .select({
        voiceSessionId: voiceSessions.id,
        userId: voiceSessions.userId,
        displayName: users.displayName,
        phoneE164: users.phoneE164,
        rating: voiceSessions.feedbackRating,
        tags: voiceSessions.feedbackTags,
        comment: voiceSessions.feedbackComment,
        minutesCharged: voiceSessions.minutesCharged,
        callStartedAt: voiceSessions.createdAt,
        callEndedAt: voiceSessions.endedAt,
        feedbackAt: voiceSessions.feedbackAt,
      })
      .from(voiceSessions)
      .innerJoin(users, eq(users.id, voiceSessions.userId))
      .where(rated)
      .orderBy(desc(voiceSessions.feedbackAt))
      .limit(limit)
      .offset(offset),
    db
      .select({
        total: count(),
        average: sql<string | null>`avg(${voiceSessions.feedbackRating})`,
      })
      .from(voiceSessions)
      .where(rated),
  ]);
  const average = totals[0]?.average;
  return {
    rows: rows.map((row) => ({
      ...row,
      phoneE164: decryptField(row.phoneE164),
      rating: row.rating ?? 0,
      tags: row.tags ?? [],
      comment: row.comment ? decryptField(row.comment) : null,
      feedbackAt: row.feedbackAt ?? row.callStartedAt,
    })),
    total: totals[0]?.total ?? 0,
    averageRating: average == null ? null : Math.round(Number(average) * 10) / 10,
  };
}
