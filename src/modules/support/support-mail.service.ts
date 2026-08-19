// =============================================================================
// Support mailbox — inbound half
// =============================================================================
// Reads replies out of the support Gmail inbox and acts on them:
//
//   * a reply to a TICKET mail  -> appended to that ticket's user-visible note,
//     which shows up in the app's Help/complaint section and fires a push (both
//     via appendTicketReply -> updateTicketForAdmin, the same path the admin
//     panel takes);
//   * a reply to a DELETION mail carrying `APPROVE <token>` / `REJECT <token>`
//     -> routed into the exact same cmdApproveDelete/cmdRejectDelete the
//     Telegram bot calls, so the guards (must be an active user, must have a
//     live request) are enforced in one place only.
//
// Driven by POST /cron/support-mail-poll, following this codebase's existing
// "cron is an HTTP endpoint hit by the OS crontab" convention rather than
// holding a long-lived IMAP connection open inside the app process. That
// matters here: the box runs pm2 and restarts, and a persistent IDLE
// connection would need its own reconnect/UID-checkpoint machinery. A poll
// that connects, drains, and disconnects has no state to lose.
//
// Idempotency is layered, because "mark as read" can fail after the write:
//   1. only \Unseen mail is fetched;
//   2. a message is flagged \Seen as soon as it has been acted on;
//   3. appendTicketReply refuses a reply already at the tail of the note, and
//      cmdApproveDelete/cmdRejectDelete both no-op without a live request.
// Layer 3 is the one that actually saves us when the process dies between the
// write and the flag.
// =============================================================================

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import {
  emailActionResult,
  isSupportEmailConfigured,
  parseDeletionUserIdFromSubject,
  parseTicketIdFromSubject,
  verifyDeletionToken,
} from '../../lib/notifications/support-email.js';
import { cmdApproveDelete, cmdRejectDelete } from '../telegram-bot/telegram-bot.commands.js';
import { appendTicketReply } from './support.service.js';

export interface SupportMailPollResult {
  /** Unread messages examined this run. */
  scanned: number;
  /** Replies written onto a ticket. */
  replies: number;
  /** Deletion requests approved or rejected by email. */
  decisions: number;
  /** Left untouched — no tag, empty after quote-stripping, or a bad/missing token. */
  skipped: number;
}

/* -------------------------------------------------------------------------- */
/* Quote stripping                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Where the human's new text stops and the quoted original begins. Each entry
 * is a client's way of introducing the quote; we cut at whichever appears
 * EARLIEST, since a single mail often contains several of them.
 *
 * ponytail: heuristic, not a parser — there is no reliable structural marker
 * for "reply vs quote" in email, and every library that claims otherwise is
 * also doing regexes underneath. If a client shows up that slips through, add
 * its marker here rather than reaching for a dependency.
 */
const QUOTE_MARKERS: readonly RegExp[] = [
  // No `$` anchor after "wrote:": the crude HTML-to-text fallback below can
  // leave stray residue (an unstripped tag, an undecoded &nbsp;) right after
  // it, and requiring the rest of the line to be blank let that residue
  // defeat the cut entirely — the quote header itself ended up in the
  // user-visible reply instead of being removed.
  /^\s*On .*wrote:/m, // Gmail / Apple Mail, English
  /^\s*>/m, // any quoted block
  /^\s*-{2,}\s*Original Message\s*-{2,}/im, // Outlook
  /^\s*_{10,}\s*$/m, // Outlook (horizontal rule above the quote)
  /^\s*From:\s.*\nSent:\s/m, // Outlook header block
  /^-- \s*$/m, // RFC 3676 signature delimiter
  /^\s*Sent from my \w+/m, // mobile client signature
];

export function stripQuotedReply(text: string): string {
  let cut = text.length;
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(text);
    if (match && match.index < cut) cut = match.index;
  }
  return text.slice(0, cut).trim();
}

/**
 * `APPROVE <token>` / `REJECT <token>`, case-insensitive, anywhere in the
 * reply — people top-post, bottom-post, and add "thanks" around it.
 */
const DELETION_COMMAND_RE = /\b(APPROVE|REJECT)\s+([0-9a-f]{16})\b/i;

export function parseDeletionCommand(
  body: string,
): { action: 'approve' | 'reject'; token: string } | undefined {
  const match = DELETION_COMMAND_RE.exec(body);
  if (!match?.[1] || !match[2]) return undefined;
  return {
    action: match[1].toLowerCase() === 'approve' ? 'approve' : 'reject',
    token: match[2].toLowerCase(),
  };
}

/* -------------------------------------------------------------------------- */
/* The poll                                                                   */
/* -------------------------------------------------------------------------- */

type PendingAction =
  | { kind: 'reply'; uid: number; from: string; ticketId: string; body: string }
  | {
      kind: 'deletion';
      uid: number;
      from: string;
      userId: string;
      action: 'approve' | 'reject';
    };

/** What {@link classifyMessage} decided to do with one message. */
export type MessageVerdict =
  | { kind: 'skip'; reason: string }
  | { kind: 'reply'; ticketId: string; body: string }
  | { kind: 'deletion'; userId: string; action: 'approve' | 'reject' };

/**
 * The whole routing decision for one message, as a pure function of what the
 * message says — deliberately separated from the IMAP plumbing so it can be
 * tested exhaustively without a mailbox.
 *
 * It is extracted precisely BECAUSE one of its outcomes is irreversible: the
 * approve path erases a user's data, and a rule that can only be exercised by
 * connecting to a live Gmail account is a rule that never gets tested.
 *
 * @param isAuto  message carries our own auto-generated headers
 * @param isReply message carries In-Reply-To/References (i.e. a human replied)
 */
export function classifyMessage(input: {
  isAuto: boolean;
  isReply: boolean;
  subject: string | undefined;
  body: string;
}): MessageVerdict {
  // Our OWN outgoing mail, which lands right back in this inbox because the
  // mailbox addresses itself. Never processed: a deletion mail's body contains
  // `APPROVE <valid token>` as its instructions, so reading our own
  // notification would erase the very account it was reporting about.
  // See AUTO_HEADERS in support-email.ts.
  if (input.isAuto) return { kind: 'skip', reason: 'our own outgoing mail' };

  const ticketId = parseTicketIdFromSubject(input.subject);
  if (ticketId) {
    return input.body
      ? { kind: 'reply', ticketId, body: input.body }
      : { kind: 'skip', reason: 'empty ticket reply' };
  }

  const userId = parseDeletionUserIdFromSubject(input.subject);
  if (!userId) return { kind: 'skip', reason: 'not ours' };

  // Second, independent guard on the only irreversible action here. A genuine
  // reply always carries In-Reply-To/References; mail we composed ourselves
  // carries neither. The isAuto check above should already have caught our own
  // mail — this is deliberate belt-and-braces, because the failure mode is
  // permanently erased user data.
  if (!input.isReply) return { kind: 'skip', reason: 'deletion command is not a reply' };

  const command = parseDeletionCommand(input.body);
  // A reply on a deletion thread with no command in it — probably a human
  // talking. Left unread so it stays visible in the inbox.
  if (!command) return { kind: 'skip', reason: 'no deletion command' };

  // Either a stale token or a forged instruction. Never acted on, because the
  // alternative is silent erasure.
  if (!verifyDeletionToken(userId, command.token)) {
    return { kind: 'skip', reason: 'invalid deletion token' };
  }

  return { kind: 'deletion', userId, action: command.action };
}

/** Plain text of a parsed mail, with the quoted history removed. */
function bodyTextOf(parsed: { text?: string | undefined; html?: string | false }): string {
  if (parsed.text) return stripQuotedReply(parsed.text);
  const html = typeof parsed.html === 'string' ? parsed.html : '';
  // An HTML-only reply has no text/plain part; a crude tag-strip is enough
  // because all we want back is the words the human actually typed.
  return stripQuotedReply(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+/g, ' '),
  );
}

export async function runSupportMailPoll(): Promise<SupportMailPollResult> {
  const empty: SupportMailPollResult = { scanned: 0, replies: 0, decisions: 0, skipped: 0 };
  if (!isSupportEmailConfigured()) {
    logger.debug('support-mail: mailbox not configured, skipping poll');
    return empty;
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: env.SUPPORT_EMAIL_USER!, pass: env.SUPPORT_EMAIL_APP_PASSWORD! },
    // imapflow logs every IMAP command at info level by default, which would
    // bury the app's own logs on every poll.
    logger: false,
  });

  try {
    await client.connect();
  } catch (err) {
    logger.error({ err }, 'support-mail: IMAP connect failed');
    return empty;
  }

  const pending: PendingAction[] = [];
  let scanned = 0;
  let skipped = 0;

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Drained into an array BEFORE any flag writes: imapflow forbids issuing
      // other commands while a fetch iterator is still open.
      for await (const message of client.fetch({ seen: false }, { source: true, uid: true })) {
        scanned++;
        try {
          if (!message.source) {
            // `source: true` was requested, so this only happens if the server
            // truncated the response. Left unread for the next poll to retry.
            skipped++;
            continue;
          }
          const parsed = await simpleParser(message.source);
          const from = parsed.from?.value?.[0]?.address ?? 'unknown';

          const verdict = classifyMessage({
            isAuto: Boolean(
              parsed.headers.get('x-aroha-auto') || parsed.headers.get('auto-submitted'),
            ),
            isReply: Boolean(parsed.headers.get('in-reply-to') || parsed.headers.get('references')),
            subject: parsed.subject,
            body: bodyTextOf(parsed),
          });

          if (verdict.kind === 'skip') {
            // Left unread, so anything genuinely addressed to a human still
            // sits visibly in the inbox.
            skipped++;
            if (verdict.reason === 'invalid deletion token') {
              logger.warn(
                { from, subject: parsed.subject },
                'support-mail: REJECTED deletion command with an invalid token',
              );
            }
            continue;
          }

          pending.push({ ...verdict, uid: message.uid, from });
        } catch (err) {
          skipped++;
          logger.warn({ err, uid: message.uid }, 'support-mail: failed to parse message');
        }
      }
    } finally {
      lock.release();
    }

    let replies = 0;
    let decisions = 0;

    for (const item of pending) {
      try {
        if (item.kind === 'reply') {
          const written = await appendTicketReply(item.ticketId, item.body, `email:${item.from}`);
          if (written) replies++;
          else skipped++;
        } else {
          const outcome =
            item.action === 'approve'
              ? await cmdApproveDelete(item.userId)
              : await cmdRejectDelete(item.userId);
          decisions++;
          logger.warn(
            { userId: item.userId, action: item.action, from: item.from },
            'support-mail: deletion decision applied by email',
          );
          void emailActionResult({
            ok: true,
            heading: item.action === 'approve' ? 'Deletion approved' : 'Deletion rejected',
            subject: `[Aroha] Deletion ${item.action}d — ${item.userId}`,
            facts: [
              ['User', item.userId],
              ['Action', item.action],
              ['By', item.from],
            ],
            // The command handlers return Telegram-escaped markdown; the
            // backslashes are noise in an email but the wording is the
            // authoritative account of what happened, so it is unescaped
            // rather than rewritten in a second place that could drift.
            message: outcome.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1'),
          }).catch(() => {});
        }
        // Flagged read whether or not it changed anything: a reply whose ticket
        // is gone, or a duplicate, would otherwise be retried forever.
        await client.messageFlagsAdd({ uid: String(item.uid) }, ['\\Seen'], { uid: true });
      } catch (err) {
        // Deliberately NOT flagged read — the next poll retries it, and the
        // layer-3 guards stop a double-apply if the write was the half that
        // actually succeeded.
        logger.error({ err, kind: item.kind, uid: item.uid }, 'support-mail: failed to apply');
      }
    }

    logger.info({ scanned, replies, decisions, skipped }, 'support-mail: poll complete');
    return { scanned, replies, decisions, skipped };
  } finally {
    await client.logout().catch(() => client.close());
  }
}
