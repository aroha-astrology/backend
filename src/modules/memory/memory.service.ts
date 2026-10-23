// =============================================================================
// Baba Ji memory — vault, planning and the hourly check-in run
// =============================================================================
// Switches (all off): memory.babaMemory (remember dated events + the hourly check-in + the free first reply),
// memory.vault (the reader sees, deletes and forgets), memory.rectifyChip (offer the birth-time check after
// a confirmed past event).
// =============================================================================

import { logger } from '../../lib/logger.js';
import { acquire, release } from '../../lib/cache/locks.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { dateInZone, userZone } from '../../lib/user-time-zone.js';
import { normalizePushLang } from '../../lib/push-lang.js';
import { memoryChatLine, memoryCheckInPush } from '../../lib/push-copy/sprint4-copy.js';
import { isFeatureOn, isFeatureOnGlobally } from '../features/features.service.js';
import { createChatSession } from '../astro/chat-sessions.repo.js';
import type { NewUserFact } from '../astro/user-facts.repo.js';
import {
  CHECK_IN_WINDOW,
  FREE_REPLY_HOURS,
  canConfirmEvent,
  displayFact,
  isPoliteHour,
  planEvent,
} from './memory-rules.js';
import {
  claimFollowUp,
  countRectifyAnchors,
  deleteAllMemory,
  deleteMemoryItem,
  getMemoryItem,
  hasFreeReply,
  lastCheckInAt,
  listDueFollowUps,
  listMemory,
  updateMemoryStatus,
  setFreeReplyUntil,
  type MemoryItem,
} from './memory.repo.js';

export const MEMORY_NOTIFICATION_TYPE = 'baba_memory';

/** A check-in older than this past its moment is dropped silently rather than sent late ("how did it go" a month on). */
export const STALE_AFTER_DAYS = 5;
/** One memory check-in per reader in this many hours. */
export const MIN_HOURS_BETWEEN_CHECK_INS = 20;

/* -------------------------------------------------------------------------- */
/* Saving                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The extractor's facts, ready to store. With the memory switch off the event fields are dropped, so the
 * stored rows are exactly what they were before this feature existed.
 */
export function factsToSave(
  facts: NewUserFact[],
  memoryOn: boolean,
  timeZone: string | null | undefined,
  now: Date,
): NewUserFact[] {
  return facts.map((f) => {
    if (!memoryOn) return { fact: f.fact, followUpQuestion: f.followUpQuestion ?? null };
    const plan = planEvent({
      fact: f.fact,
      followUpQuestion: f.followUpQuestion ?? null,
      eventKind: f.eventKind,
      eventDate: f.eventDate,
      timeZone,
      now,
    });
    return {
      fact: f.fact,
      followUpQuestion: f.followUpQuestion ?? null,
      eventKind: plan.eventKind,
      eventDate: plan.eventDate,
      followUpAt: plan.followUpAt,
    };
  });
}

/** The reader's own calendar day, for the extractor's "TODAY" line (only asked for when memory is on). */
export function todayFor(timeZone: string | null | undefined, now: Date = new Date()): string {
  return dateInZone(now, userZone(timeZone));
}

/* -------------------------------------------------------------------------- */
/* Vault                                                                       */
/* -------------------------------------------------------------------------- */

export interface VaultEntry {
  id: string;
  text: string;
  toldByGuide: boolean;
  question: string | null;
  eventKind: string | null;
  eventDate: string | null;
  status: MemoryItem['status'];
  /** The reader can say "it happened" for a dated event that is not in the future and still open. */
  canConfirm: boolean;
  confirmed: boolean;
  createdAt: string;
}

export function toVaultEntry(item: MemoryItem, timeZone: string | null | undefined, now: Date): VaultEntry {
  const shown = displayFact(item.fact);
  return {
    id: item.id,
    text: shown.text,
    toldByGuide: shown.toldByGuide,
    question: item.followUpQuestion,
    eventKind: item.eventKind,
    eventDate: item.eventDate,
    status: item.status,
    canConfirm: item.status === 'ACTIVE' && canConfirmEvent(item.eventDate, timeZone, now),
    confirmed: item.rectifyFlag,
    createdAt: item.createdAt.toISOString(),
  };
}

export async function getVault(userId: string, timeZone: string | null | undefined, now: Date = new Date()) {
  const items = await listMemory(userId);
  return {
    items: items.map((i) => toVaultEntry(i, timeZone, now)),
    freeReply: await hasFreeReply(userId),
  };
}

export async function forgetOne(userId: string, id: string): Promise<boolean> {
  return deleteMemoryItem(userId, id);
}

export async function forgetAll(userId: string): Promise<number> {
  return deleteAllMemory(userId);
}

/** "It happened": the event is done and may anchor a birth-time check. Only for a date that is not in the future. */
export async function confirmEvent(
  userId: string,
  id: string,
  timeZone: string | null | undefined,
  now: Date = new Date(),
): Promise<'ok' | 'not-found' | 'not-yet'> {
  const item = await getMemoryItem(userId, id);
  if (!item) return 'not-found';
  if (!canConfirmEvent(item.eventDate, timeZone, now)) return 'not-yet';
  await updateMemoryStatus(userId, id, { status: 'DONE', rectifyFlag: true });
  return 'ok';
}

export async function dismissItem(userId: string, id: string): Promise<boolean> {
  return !!(await updateMemoryStatus(userId, id, { status: 'DISMISSED' }));
}

/** Everything the app needs to decide whether to show the memory hints and the "Sharpen birth time" chip. */
export async function memorySummary(
  userId: string,
  birthTimeAccuracy: string | null | undefined,
): Promise<{ freeReply: boolean; confirmedEvents: number; suggestRectify: boolean }> {
  const [freeReply, confirmedEvents, chipOn] = await Promise.all([
    hasFreeReply(userId),
    countRectifyAnchors(userId),
    isFeatureOn(userId, 'memory.rectifyChip').catch(() => false),
  ]);
  return {
    freeReply,
    confirmedEvents,
    suggestRectify: chipOn && confirmedEvents >= 1 && birthTimeAccuracy !== 'exact',
  };
}

/* -------------------------------------------------------------------------- */
/* The hourly run                                                              */
/* -------------------------------------------------------------------------- */

export interface BabaMemoryResult {
  skipped: boolean;
  reason?: string;
  due: number;
  sent: number;
  /** Due but held back this hour (outside the polite window, quiet hours, or already checked in today). */
  waiting: number;
  /** Too old to be worth sending; marked done without a push. */
  expired: number;
}

export async function runBabaMemory(
  opts: { now?: Date; dryRun?: boolean; limit?: number } = {},
): Promise<BabaMemoryResult> {
  const now = opts.now ?? new Date();
  const empty = { due: 0, sent: 0, waiting: 0, expired: 0 };

  if (!(await isFeatureOnGlobally('memory.babaMemory'))) return { skipped: true, reason: 'off', ...empty };

  const hourKey = now.toISOString().slice(0, 13);
  const lock = await acquire('baba-memory', hourKey, 600);
  if (!lock.ok) return { skipped: true, reason: 'already-running', ...empty };

  const result: BabaMemoryResult = { skipped: false, ...empty };
  const allLanguages = await isFeatureOnGlobally('lang.pushAll').catch(() => false);
  const sentTo = new Set<string>();
  try {
    const due = await listDueFollowUps(now, opts.limit ?? 200);
    result.due = due.length;
    for (const item of due) {
      try {
        if (!(await isFeatureOn(item.userId, 'memory.babaMemory'))) continue;

        const dueSince = now.getTime() - item.followUpAt.getTime();
        if (dueSince > STALE_AFTER_DAYS * 86_400_000) {
          if (!opts.dryRun) await claimFollowUp(item.id, now, null);
          result.expired++;
          continue;
        }

        if (!isPoliteHour(now, item.currentTimezone, item.quietHours)) {
          result.waiting++;
          continue;
        }
        const last = await lastCheckInAt(item.userId, MEMORY_NOTIFICATION_TYPE);
        const recently = last && now.getTime() - last.getTime() < MIN_HOURS_BETWEEN_CHECK_INS * 3_600_000;
        if (sentTo.has(item.userId) || recently) {
          result.waiting++;
          continue;
        }
        if (opts.dryRun) {
          result.sent++;
          continue;
        }

        // Claim first: a retried or overlapping run can never send the same check-in twice.
        if (!(await claimFollowUp(item.id, now, null))) continue;
        sentTo.add(item.userId);

        const lang = normalizePushLang(item.locale, allLanguages);
        const session = await createChatSession(
          item.userId,
          item.birthProfileId,
          item.eventKind ? `Check-in: ${item.eventKind}` : 'Check-in',
          [{ role: 'assistant', content: memoryChatLine(lang, item.followUpQuestion) }],
        );
        await setFreeReplyUntil(item.userId, new Date(now.getTime() + FREE_REPLY_HOURS * 3_600_000));

        const copy = memoryCheckInPush(lang);
        await notifyUser(item.userId, {
          title: copy.title,
          body: copy.body,
          type: MEMORY_NOTIFICATION_TYPE,
          link: session ? `/ai-chat?sessionId=${session.id}` : '/ai-chat',
        });
        result.sent++;
      } catch (err) {
        logger.warn({ err, factId: item.id }, 'baba-memory: item skipped');
      }
    }
  } finally {
    await release('baba-memory', hourKey, lock.owner).catch(() => {});
  }
  logger.info({ ...result, window: CHECK_IN_WINDOW }, 'baba-memory: run done');
  return result;
}
