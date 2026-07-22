// =============================================================================
// Transit pre-alerts — detect, draft, send
// =============================================================================
// Three separately-scheduled phases, deliberately decoupled so a failure in
// one never silently becomes a bad send in another:
//
//   detect  monthly   — extend the computed transit calendar, pick which
//                       events get airtime
//   draft   daily     — write and validate the copy for events pushing soon
//   send    daily     — deliver whatever is due right now
//
// Drafting runs a full day ahead of sending so a Gemini outage has slack to
// recover in rather than degrading the copy at the last minute.
// =============================================================================

import { logger } from '../../lib/logger.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import {
  findTransitEvents,
  selectPushableEvents,
  istDateString,
  type TransitEvent,
} from '../../lib/astro-tools/transit-events.js';
import { generateTransitCopy, type TransitCopy } from '../../lib/llm/transit-alert.js';
import {
  getOrCreateBatchRun,
  completeBatchRun,
  failBatchRun,
} from '../horoscope/horoscope.repo.js';
import { normalizeLang, type LangCode } from './broadcast-copy.js';
import { getFallbackCopy } from './transit-copy-fallback.js';
import {
  insertCopyRows,
  insertTransitEvents,
  insertTransitNotifications,
  listCopyForEvent,
  listEventsDueToSend,
  listEventsNeedingDraft,
  listPendingFutureEvents,
  listTransitRecipients,
  setEventStatus,
  type TransitRecipient,
} from './transit-alert.repo.js';
import type { TransitEventRow } from '../../db/schema.js';

const TRANSIT_JOB_NAME = 'transit-alert';

/** How far ahead detection keeps the calendar populated. */
const DEFAULT_HORIZON_DAYS = 400;

/** How far ahead of its push moment an event gets its copy written. */
const DRAFT_HORIZON_HOURS = 48;

/**
 * How late a due send may still go out. Long enough to survive a missed or
 * retried cron, short enough that a "two days before" alert can never land
 * after the event it is warning about.
 */
const SEND_GRACE_HOURS = 6;

/** The sign an event happens in: the entered sign for an ingress, the standing sign otherwise. */
function eventSign(row: TransitEventRow): string {
  return row.toSign ?? row.fromSign;
}

// ---------------------------------------------------------------------------
// Phase 1 — detect
// ---------------------------------------------------------------------------

export interface DetectResult {
  scanned: number;
  inserted: number;
  selected: number;
  skipped: number;
}

/**
 * Extend the transit calendar and decide which events get pushed.
 *
 * Selection deliberately re-runs over *all* pending future events, not just
 * the ones found in this pass — a newly-detected Saturn ingress must be able
 * to displace a Mercury ingress that was selected a month ago, and vice versa.
 * Events already sent are untouched.
 */
export async function detectAndStoreTransits(
  opts: { horizonDays?: number; now?: Date } = {},
): Promise<DetectResult> {
  const now = opts.now ?? new Date();
  const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const to = new Date(now.getTime() + horizonDays * 86_400_000);

  logger.info({ from: now.toISOString(), to: to.toISOString() }, 'transit-alert:detect start');

  const events = await findTransitEvents(now, to);
  const inserted = await insertTransitEvents(events);

  // Re-select across everything still ahead of us.
  const pending = await listPendingFutureEvents(now);
  const asEvents: TransitEvent[] = pending.map((row) => ({
    planet: row.planet,
    eventType: row.eventType,
    fromSign: row.fromSign,
    toSign: row.toSign,
    exactAt: row.exactAt,
    forDate: row.forDate,
    weight: row.weight,
  }));

  const decisions = selectPushableEvents(asEvents);
  let selected = 0;
  let skipped = 0;

  for (let i = 0; i < decisions.length; i++) {
    const decision = decisions[i]!;
    const row = pending[i]!;
    const nextStatus = decision.selected ? 'detected' : 'skipped';
    const nextReason = decision.selected ? null : (decision.skipReason ?? 'collision');

    if (decision.selected) selected++;
    else skipped++;

    // Only write when something actually changed — this runs over the whole
    // future calendar every month and most rows are already correct.
    if (row.status !== nextStatus || row.skipReason !== nextReason) {
      await setEventStatus(row.id, nextStatus, nextReason);
    }
  }

  logger.info({ scanned: events.length, inserted, selected, skipped }, 'transit-alert:detect done');
  return { scanned: events.length, inserted, selected, skipped };
}

// ---------------------------------------------------------------------------
// Phase 2 — draft
// ---------------------------------------------------------------------------

export interface DraftResult {
  events: number;
  generated: number;
  fallbacks: number;
}

/** Distinct (moonSign, lang) pairs that actually have a device waiting. */
function neededCombos(
  recipients: TransitRecipient[],
): { moonSign: string | null; lang: LangCode }[] {
  const seen = new Map<string, { moonSign: string | null; lang: LangCode }>();
  for (const r of recipients) {
    const lang = normalizeLang(r.locale);
    const key = `${r.moonSign ?? '-'}|${lang}`;
    if (!seen.has(key)) seen.set(key, { moonSign: r.moonSign, lang });
  }
  return Array.from(seen.values());
}

/**
 * Write the copy for every event whose push moment is inside the draft window.
 *
 * Only combinations that have a live device are generated — asking Gemini for
 * all 12 signs x 7 languages would mostly pay for text nobody receives.
 */
export async function draftTransitCopy(
  opts: { now?: Date; horizonHours?: number } = {},
): Promise<DraftResult> {
  const now = opts.now ?? new Date();
  const events = await listEventsNeedingDraft(now, opts.horizonHours ?? DRAFT_HORIZON_HOURS);
  if (events.length === 0) {
    logger.info('transit-alert:draft nothing to draft');
    return { events: 0, generated: 0, fallbacks: 0 };
  }

  const recipients = await listTransitRecipients();
  const combos = neededCombos(recipients);
  logger.info(
    { events: events.length, combos: combos.length, recipients: recipients.length },
    'transit-alert:draft start',
  );

  let generated = 0;
  let fallbacks = 0;

  for (const event of events) {
    const sign = eventSign(event);
    const rows = [];

    for (const combo of combos) {
      const ai = await generateTransitCopy({
        planet: event.planet,
        eventType: event.eventType,
        sign,
        forDate: event.forDate,
        moonSign: combo.moonSign,
        lang: combo.lang,
      });

      const copy: TransitCopy =
        ai ?? getFallbackCopy(event.eventType, event.planet, sign, event.forDate, combo.lang);
      if (ai) generated++;
      else fallbacks++;

      rows.push({
        eventId: event.id,
        moonSign: combo.moonSign,
        lang: combo.lang,
        title: copy.title,
        body: copy.body,
        isFallback: ai === null,
      });
    }

    await insertCopyRows(rows);
    await setEventStatus(event.id, 'drafted');
  }

  if (fallbacks > 0) {
    logger.warn(
      { generated, fallbacks },
      'transit-alert:draft fell back to static copy for some combinations',
    );
  }
  logger.info({ events: events.length, generated, fallbacks }, 'transit-alert:draft done');
  return { events: events.length, generated, fallbacks };
}

// ---------------------------------------------------------------------------
// Phase 3 — send
// ---------------------------------------------------------------------------

export interface SendResult {
  skipped: boolean;
  reason?: string;
  events: number;
  recipients: number;
  success: number;
  failure: number;
}

/**
 * Deliver every transit alert that is due.
 *
 * Idempotent per IST date via cron_batch_runs: a broadcast cannot be recalled,
 * so "already sent today" must never mean "send again". `dryRun` resolves the
 * full recipient grouping and copy without touching FCM, for inspecting a send
 * before it happens.
 */
export async function sendTransitAlerts(
  opts: { force?: boolean; dryRun?: boolean; now?: Date } = {},
): Promise<SendResult> {
  const now = opts.now ?? new Date();
  const dateStr = istDateString(now);

  const events = await listEventsDueToSend(now, SEND_GRACE_HOURS);
  if (events.length === 0) {
    logger.info({ dateStr }, 'transit-alert:send nothing due');
    return {
      skipped: true,
      reason: 'nothing-due',
      events: 0,
      recipients: 0,
      success: 0,
      failure: 0,
    };
  }

  const run = await getOrCreateBatchRun(TRANSIT_JOB_NAME, 'transit', dateStr);
  if (!opts.force && !opts.dryRun && run.status === 'completed') {
    logger.info({ dateStr }, 'transit-alert:send skipped — already sent today');
    return {
      skipped: true,
      reason: 'already-sent',
      events: 0,
      recipients: 0,
      success: 0,
      failure: 0,
    };
  }

  let recipients: TransitRecipient[];
  try {
    recipients = await listTransitRecipients();
  } catch (err) {
    logger.error({ err }, 'transit-alert:send failed to fetch recipients');
    await failBatchRun(run.id, err instanceof Error ? err.message : String(err));
    return { skipped: false, events: events.length, recipients: 0, success: 0, failure: 0 };
  }

  if (recipients.length === 0) {
    logger.info('transit-alert:send no eligible recipients');
    await completeBatchRun(run.id, { processed: 0, generated: 0, skipped: 0, failed: 0 });
    return { skipped: false, events: events.length, recipients: 0, success: 0, failure: 0 };
  }

  let success = 0;
  let failure = 0;

  for (const event of events) {
    const sign = eventSign(event);
    const copyRows = await listCopyForEvent(event.id);
    const copyByKey = new Map(
      copyRows.map((r) => [`${r.moonSign ?? '-'}|${r.lang}`, { title: r.title, body: r.body }]),
    );

    // Group devices by the copy variant they should receive.
    const groups = new Map<
      string,
      { moonSign: string | null; lang: LangCode; tokens: string[]; userIds: Set<string> }
    >();
    for (const r of recipients) {
      const lang = normalizeLang(r.locale);
      const key = `${r.moonSign ?? '-'}|${lang}`;
      const group = groups.get(key);
      if (group) {
        group.tokens.push(r.token);
        group.userIds.add(r.userId);
      } else {
        groups.set(key, {
          moonSign: r.moonSign,
          lang,
          tokens: [r.token],
          userIds: new Set([r.userId]),
        });
      }
    }

    const inboxEntries: { userId: string; title: string; body: string }[] = [];

    for (const [key, group] of groups) {
      // A missing copy row means drafting didn't cover this combination — a
      // device registered between the draft and the send, most likely. Render
      // the static fallback rather than dropping the user from the send.
      const copy =
        copyByKey.get(key) ??
        getFallbackCopy(event.eventType, event.planet, sign, event.forDate, group.lang);

      if (opts.dryRun) {
        logger.info(
          {
            event: `${event.planet}-${event.eventType}-${event.forDate}`,
            moonSign: group.moonSign,
            lang: group.lang,
            tokens: group.tokens.length,
            title: copy.title,
            body: copy.body,
          },
          'transit-alert:send [dry-run]',
        );
        success += group.tokens.length;
        continue;
      }

      const result = await sendPushBatch(group.tokens, copy.title, copy.body, {
        type: 'transit_alert',
        navigate: '/horoscope',
        eventId: event.id,
      });
      success += result.success;
      failure += result.failure;

      for (const userId of group.userIds) {
        inboxEntries.push({ userId, title: copy.title, body: copy.body });
      }
    }

    if (!opts.dryRun) {
      // Inbox rows are written after the push, and are also the ledger the
      // dormancy throttle reads next time.
      await insertTransitNotifications(inboxEntries);
      await setEventStatus(event.id, 'sent');
    }
  }

  if (!opts.dryRun) {
    await completeBatchRun(run.id, {
      processed: recipients.length,
      generated: success,
      skipped: 0,
      failed: failure,
    });
  }

  logger.info(
    {
      dateStr,
      events: events.length,
      recipients: recipients.length,
      success,
      failure,
      dryRun: opts.dryRun ?? false,
    },
    'transit-alert:send done',
  );

  return {
    skipped: false,
    events: events.length,
    recipients: recipients.length,
    success,
    failure,
  };
}
