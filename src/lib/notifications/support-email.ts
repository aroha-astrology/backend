// =============================================================================
// Support mailbox — outbound half
// =============================================================================
// Mirrors every new support ticket and account-deletion request into a Gmail
// inbox, so support can be worked from email instead of (well, alongside)
// Telegram and the admin panel.
//
// The inbound half lives in modules/support/support-mail.service.ts: it reads
// replies back out of that same inbox and either writes them onto the ticket
// (where the user sees them in the app's help/complaint section) or, for a
// deletion request, approves/rejects it. The two halves are joined by what is
// encoded in the SUBJECT line, so all the format/parse helpers are defined
// together here rather than drifting apart across two files.
//
// Everything here is best-effort: a broken mailbox must never fail a user's
// ticket submission or deletion request. Callers already treat it that way
// (`void ...catch()`), and every function below also swallows its own errors.
// =============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';

export function isSupportEmailConfigured(): boolean {
  return Boolean(env.SUPPORT_EMAIL_USER && env.SUPPORT_EMAIL_APP_PASSWORD);
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: env.SUPPORT_EMAIL_USER!, pass: env.SUPPORT_EMAIL_APP_PASSWORD! },
    });
  }
  return transporter;
}

/** Test seam — drops the memoized transport so a test can swap env and re-create it. */
export function __resetSupportEmailForTests(): void {
  transporter = undefined;
}

/* -------------------------------------------------------------------------- */
/* Subject tags: the ONLY link between an outgoing mail and its reply          */
/* -------------------------------------------------------------------------- */

/**
 * Ticket mail subject, e.g. `[Aroha ticket#3f2b…] billing`.
 *
 * The tag is `ticket#` and not a bare `#` so it cannot also match the
 * `delete#` tag below — a bare `#<uuid>` pattern matches INSIDE `delete#<uuid>`,
 * which silently routed every deletion mail down the ticket-reply path (the
 * poller tests for a ticket first). Keep the two prefixes distinct.
 *
 * The id rides in the SUBJECT rather than in a `Reply-To: tickets+<id>@…`
 * plus-address because there is exactly one mailbox here, and a human hitting
 * "Reply" in Gmail is the whole workflow — Gmail preserves the subject (with a
 * `Re:` prefix) but would send the reply to whatever `Reply-To` says, which
 * for a self-addressed mailbox has to stay the mailbox itself. The subject is
 * also the one part that survives a forward, so a ticket handed to a colleague
 * and answered by them still matches.
 */
export function formatTicketSubject(ticketId: string, category: string): string {
  return `[Aroha ticket#${ticketId}] ${category}`;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Pulls a ticket id back out of a (usually `Re:`-prefixed) subject.
 * Anchored on `ticket#` + a full UUID so it collides with neither a stray `#`
 * in someone's own subject line nor the `delete#` tag. Returns undefined for
 * any mail that is not a reply to a ticket — the poller leaves those alone.
 */
export function parseTicketIdFromSubject(subject: string | undefined): string | undefined {
  const match = new RegExp(`ticket#(${UUID_RE.source})`, 'i').exec(subject ?? '');
  return match?.[1]?.toLowerCase();
}

/** Deletion mail subject — a distinct `delete#` tag so the two never cross-match. */
export function formatDeletionSubject(userId: string, pendingDays?: number): string {
  return pendingDays === undefined
    ? `[Aroha delete#${userId}] Account deletion requested`
    : `[Aroha delete#${userId}] Deletion still pending (${pendingDays}d)`;
}

export function parseDeletionUserIdFromSubject(subject: string | undefined): string | undefined {
  const match = new RegExp(`delete#(${UUID_RE.source})`, 'i').exec(subject ?? '');
  return match?.[1]?.toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Deletion action tokens                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Approving a deletion by email erases a real person's data and cannot be
 * undone, and an email `From:` header is trivially forged — so the sender
 * address alone is NOT an authorisation. Every deletion mail therefore carries
 * a short HMAC of the user id, and a reply is only obeyed if it quotes that
 * token back.
 *
 * The security property is simply that the token exists nowhere except inside
 * the mailbox: someone who can forge a `From:` still cannot produce it without
 * having read the inbox, and someone who HAS read the inbox already has the
 * mailbox credentials. (Gmail's own SPF/DKIM checks are a second layer — the
 * poller only ever reads INBOX, and forged mail generally lands in Spam.)
 *
 * Keyed off ENCRYPTION_HASH_KEY (the existing dedicated non-reversible-hash
 * key) and NOT ENCRYPTION_KEY, keeping the same "one key per purpose" split
 * the field-encryption module already draws. Falls back to CRON_SECRET, which
 * is the other machine-to-machine secret on this box.
 */
function tokenSecret(): string | undefined {
  return env.ENCRYPTION_HASH_KEY ?? env.CRON_SECRET;
}

export function isDeletionByEmailEnabled(): boolean {
  return Boolean(tokenSecret());
}

export function deletionActionToken(userId: string): string | undefined {
  const secret = tokenSecret();
  if (!secret) return undefined;
  return createHmac('sha256', secret).update(`delete:${userId}`).digest('hex').slice(0, 16);
}

/** Timing-safe compare of a token quoted back in a reply. */
export function verifyDeletionToken(userId: string, candidate: string): boolean {
  const expected = deletionActionToken(userId);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(candidate.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/* HTML layout                                                                */
/* -------------------------------------------------------------------------- */

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface EmailBlock {
  /** Coloured band across the top of the card. */
  accent: string;
  heading: string;
  /** One line under the heading. */
  subheading: string;
  /** Label/value pairs rendered as a bordered table. */
  facts: Array<[string, string]>;
  /** The quoted user message, or the action instructions — already-escaped HTML. */
  bodyHtml: string;
  footer: string;
}

/**
 * Everything is INLINE-styled and table-based on purpose: Gmail strips
 * `<style>` blocks, and Outlook's rendering engine still ignores most modern
 * layout CSS. This is the boring, universally-supported shape — one centered
 * card, a coloured header band, a facts table, a body block.
 */
function renderEmail(block: EmailBlock): string {
  const facts = block.facts
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #ecebf3;color:#6b6880;font-size:13px;white-space:nowrap;">${esc(label)}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #ecebf3;color:#1c1a2e;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;">${esc(value)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<body style="margin:0;padding:24px 12px;background:#f4f3f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(28,26,46,0.08);">

        <tr><td style="height:4px;background:${block.accent};font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:28px 28px 8px 28px;">
          <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8b88a0;font-weight:600;">Aroha Astrology</div>
          <div style="margin-top:8px;font-size:21px;font-weight:700;color:#1c1a2e;line-height:1.3;">${esc(block.heading)}</div>
          <div style="margin-top:6px;font-size:14px;color:#6b6880;line-height:1.5;">${esc(block.subheading)}</div>
        </td></tr>

        <tr><td style="padding:20px 28px 0 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #ecebf3;border-radius:8px;">
            ${facts}
          </table>
        </td></tr>

        <tr><td style="padding:20px 28px 4px 28px;">${block.bodyHtml}</td></tr>

        <tr><td style="padding:16px 28px 28px 28px;">
          <div style="border-top:1px solid #ecebf3;padding-top:16px;font-size:12px;color:#8b88a0;line-height:1.6;">${block.footer}</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** A quoted block for the user's own words. */
const quoteHtml = (text: string): string =>
  `<div style="border-left:3px solid #ded9f0;padding:2px 0 2px 14px;color:#1c1a2e;font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(text)}</div>`;

/* -------------------------------------------------------------------------- */
/* Sending                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Marks mail this system generated, so the inbound poller can tell its OWN
 * output apart from a human's reply.
 *
 * This is load-bearing, not hygiene. The mailbox addresses itself, so every
 * outgoing mail lands right back in the INBOX the poller drains — and a
 * deletion mail's body literally contains the words `APPROVE <valid token>`
 * as its instructions. Without this header the very next poll would read our
 * own notification as an approval and irreversibly erase the account it was
 * telling us about. A reply is a new message composed by the mail client and
 * never inherits these, which is exactly the distinction we need.
 *
 * `Auto-Submitted` is the RFC 3834 standard spelling and additionally stops
 * other systems' vacation responders from answering us; `X-Aroha-Auto` is what
 * the poller actually keys on.
 */
export const AUTO_HEADERS = {
  'X-Aroha-Auto': '1',
  'Auto-Submitted': 'auto-generated',
} as const;

/** Returns false (never throws) when unconfigured or when the send fails. */
async function send(subject: string, text: string, html: string): Promise<boolean> {
  if (!isSupportEmailConfigured()) return false;
  try {
    await getTransporter().sendMail({
      from: `Aroha Support <${env.SUPPORT_EMAIL_USER!}>`,
      to: env.SUPPORT_EMAIL_TO ?? env.SUPPORT_EMAIL_USER!,
      replyTo: env.SUPPORT_EMAIL_USER!,
      subject,
      headers: { ...AUTO_HEADERS },
      // Both parts are sent: `text` is what non-HTML clients and the quoted
      // reply block show, `html` is what a human actually reads.
      text,
      html,
    });
    return true;
  } catch (err) {
    logger.warn({ err, subject }, 'support-email: send failed');
    return false;
  }
}

export async function emailSupportTicket(fields: {
  ticketId: string;
  userId: string;
  contact?: string | null;
  category: string;
  message: string;
}): Promise<boolean> {
  const facts: Array<[string, string]> = [
    ['Category', fields.category],
    ...(fields.contact ? ([['Contact', fields.contact]] as Array<[string, string]>) : []),
    ['User', fields.userId],
    ['Ticket', fields.ticketId],
  ];

  const html = renderEmail({
    accent: '#6d28d9',
    heading: 'New support ticket',
    subheading: 'A user submitted a request from the Help section of the app.',
    facts,
    bodyHtml: quoteHtml(fields.message),
    footer:
      '<b>Reply to this email</b> and your reply appears in the user&rsquo;s Help section in the app, ' +
      'and they get a push notification. Keep the subject line intact &mdash; the ticket id in it is ' +
      'how the reply finds its way back. Quoted text below your reply is stripped automatically.',
  });

  const text = [
    `A new support ticket was submitted.`,
    ``,
    ...facts.map(([label, value]) => `${label.padEnd(9)} ${value}`),
    ``,
    `Message:`,
    fields.message,
    ``,
    `---`,
    `Reply to this email and your reply is shown to the user in the app's Help`,
    `section, and they get a push notification. Keep the subject line intact —`,
    `the ticket id in it is how the reply finds its way back.`,
  ].join('\n');

  return send(formatTicketSubject(fields.ticketId, fields.category), text, html);
}

/**
 * Confirms back into the inbox what an emailed command actually did. Without
 * this, replying `APPROVE …` is a silent write — you'd have to open Telegram
 * or the admin panel to find out whether it took, which defeats the point of
 * working from email.
 */
export async function emailActionResult(fields: {
  ok: boolean;
  heading: string;
  subject: string;
  facts: Array<[string, string]>;
  message: string;
}): Promise<boolean> {
  const html = renderEmail({
    accent: fields.ok ? '#15803d' : '#dc2626',
    heading: fields.heading,
    subheading: fields.ok ? 'Your emailed instruction was carried out.' : 'No action was taken.',
    facts: fields.facts,
    bodyHtml: quoteHtml(fields.message),
    footer: 'Automatic confirmation &mdash; there is nothing to reply to here.',
  });

  const text = [
    fields.heading,
    ``,
    ...fields.facts.map(([label, value]) => `${label.padEnd(10)} ${value}`),
    ``,
    fields.message,
  ].join('\n');

  return send(fields.subject, text, html);
}

/**
 * A pending account-deletion request, answerable straight from the inbox.
 *
 * Replying `APPROVE <token>` erases the account; `REJECT <token>` withdraws
 * the request. The token is what makes that safe to accept over email at all
 * — see the tokenSecret() comment above. When no secret is configured the mail
 * still goes out, but as a read-only copy pointing at the Telegram commands.
 */
export async function emailDeletionRequest(fields: {
  userId: string;
  contact?: string | null;
  requestedAt: Date;
  pendingDays?: number;
}): Promise<boolean> {
  const token = deletionActionToken(fields.userId);

  const facts: Array<[string, string]> = [
    ...(fields.contact ? ([['Contact', fields.contact]] as Array<[string, string]>) : []),
    ['User', fields.userId],
    ['Requested', fields.requestedAt.toISOString()],
    ...(fields.pendingDays === undefined
      ? []
      : ([['Pending', `${fields.pendingDays} days`]] as Array<[string, string]>)),
  ];

  const actionsHtml = token
    ? `<div style="background:#faf9fd;border:1px solid #ecebf3;border-radius:8px;padding:18px;">
         <div style="font-size:13px;color:#6b6880;margin-bottom:12px;">
           <b style="color:#1c1a2e;">Reply to this email</b> with exactly one of these lines:
         </div>
         <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;color:#b91c1c;padding:8px 12px;background:#ffffff;border:1px solid #f0dede;border-radius:6px;">APPROVE ${esc(token)}</div>
         <div style="font-size:12px;color:#8b88a0;margin:4px 0 12px 2px;">Erases profile, chats, palm images and saved memory. Irreversible.</div>
         <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;color:#15803d;padding:8px 12px;background:#ffffff;border:1px solid #dcecdc;border-radius:6px;">REJECT ${esc(token)}</div>
         <div style="font-size:12px;color:#8b88a0;margin:4px 0 0 2px;">Withdraws the request; the account continues as normal.</div>
       </div>`
    : `<div style="background:#faf9fd;border:1px solid #ecebf3;border-radius:8px;padding:18px;font-size:13px;color:#6b6880;">
         Approve or reject with the Telegram bot:
         <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#1c1a2e;margin-top:8px;">/approvedelete ${esc(fields.userId)}<br>/rejectdelete ${esc(fields.userId)}</div>
       </div>`;

  const html = renderEmail({
    accent: '#dc2626',
    heading:
      fields.pendingDays === undefined
        ? 'Account deletion requested'
        : `Deletion still pending (${fields.pendingDays} days)`,
    subheading: 'Nothing has been erased. The account survives until someone decides.',
    facts,
    bodyHtml: actionsHtml,
    footer: token
      ? 'The code after APPROVE/REJECT proves the instruction came from this mailbox &mdash; a reply ' +
        'without it is ignored, because a <code>From:</code> address on its own can be forged. ' +
        'You can also use <code>/approvedelete</code> and <code>/rejectdelete</code> in Telegram.'
      : 'Email approval is off because no signing secret is configured on the server. ' +
        'Set ENCRYPTION_HASH_KEY (or CRON_SECRET) to enable it.',
  });

  const text = [
    `An account deletion request is awaiting a decision.`,
    `Nothing has been erased — the account survives until someone decides.`,
    ``,
    ...facts.map(([label, value]) => `${label.padEnd(10)} ${value}`),
    ``,
    ...(token
      ? [
          `Reply to this email with exactly one of these lines:`,
          ``,
          `  APPROVE ${token}     (erases the account — irreversible)`,
          `  REJECT ${token}      (withdraws the request)`,
          ``,
          `The code proves the instruction came from this mailbox; a reply without`,
          `it is ignored, because a From: address on its own can be forged.`,
        ]
      : [
          `Approve or reject with the Telegram bot:`,
          `  /approvedelete ${fields.userId}`,
          `  /rejectdelete ${fields.userId}`,
        ]),
  ].join('\n');

  return send(formatDeletionSubject(fields.userId, fields.pendingDays), text, html);
}
