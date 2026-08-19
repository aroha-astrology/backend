import { describe, expect, it } from 'vitest';

import {
  deletionActionToken,
  formatDeletionSubject,
  formatTicketSubject,
  parseDeletionUserIdFromSubject,
  parseTicketIdFromSubject,
  verifyDeletionToken,
} from '../src/lib/notifications/support-email.js';
import {
  classifyMessage,
  parseDeletionCommand,
  stripQuotedReply,
} from '../src/modules/support/support-mail.service.js';

const TICKET_ID = '3f2b1a44-9c0e-4d21-8b77-1e5a6c9d0f31';
const USER_ID = 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('support mailbox — subject tags', () => {
  it('round-trips a ticket id through a Re:-prefixed subject', () => {
    const subject = `Re: ${formatTicketSubject(TICKET_ID, 'billing')}`;
    expect(parseTicketIdFromSubject(subject)).toBe(TICKET_ID);
  });

  it('round-trips a deletion user id, with and without the pending-days variant', () => {
    expect(parseDeletionUserIdFromSubject(`Re: ${formatDeletionSubject(USER_ID)}`)).toBe(USER_ID);
    expect(parseDeletionUserIdFromSubject(`Re: ${formatDeletionSubject(USER_ID, 9)}`)).toBe(
      USER_ID,
    );
  });

  it('never cross-matches: a deletion subject is not read as a ticket, or vice versa', () => {
    // The whole routing decision in the poller hangs on these two being
    // mutually exclusive — a deletion mail parsed as a ticket reply would
    // write an APPROVE command into some stranger's complaint thread.
    expect(parseTicketIdFromSubject(formatDeletionSubject(USER_ID))).toBeUndefined();
    expect(parseDeletionUserIdFromSubject(formatTicketSubject(TICKET_ID, 'billing'))).toBe(
      undefined,
    );
  });

  it('ignores unrelated mail and stray hashes', () => {
    expect(parseTicketIdFromSubject('Re: invoice #12345')).toBeUndefined();
    expect(parseTicketIdFromSubject(undefined)).toBeUndefined();
    expect(parseDeletionUserIdFromSubject('Your Amazon order')).toBeUndefined();
  });
});

describe('support mailbox — quote stripping', () => {
  it('keeps only the new text above a Gmail quote', () => {
    const raw = [
      'Refunded to your wallet, should show up in a minute.',
      '',
      'On Tue, 19 Aug 2026 at 15:04, Aroha Support <s@example.com> wrote:',
      '> A new support ticket was submitted.',
      '> User: abc',
    ].join('\n');
    expect(stripQuotedReply(raw)).toBe('Refunded to your wallet, should show up in a minute.');
  });

  it('cuts at the EARLIEST marker when a mail carries several', () => {
    const raw = [
      'Sorted now.',
      '',
      '-- ',
      'Priya',
      '',
      'On Tue, 19 Aug 2026, Aroha Support wrote:',
      '> original',
    ].join('\n');
    expect(stripQuotedReply(raw)).toBe('Sorted now.');
  });

  it('strips an Outlook-style quote and a mobile signature', () => {
    expect(stripQuotedReply('Done.\n\n-----Original Message-----\nFrom: x')).toBe('Done.');
    expect(stripQuotedReply('Done.\n\nSent from my iPhone')).toBe('Done.');
  });

  it('leaves an unquoted reply untouched', () => {
    expect(stripQuotedReply('  Just this.  ')).toBe('Just this.');
  });

  it('still cuts when the crude HTML-to-text fallback leaves residue right after "wrote:"', () => {
    // e.g. an undecoded &nbsp; or unstripped tag fragment on the same line —
    // this used to survive because the marker required the line to end
    // right at "wrote:".
    const raw =
      'good\n\nOn Wed, 19 Aug 2026 at 11:20, Aroha Support <s@example.com> wrote:&nbsp;Test subir';
    expect(stripQuotedReply(raw)).toBe('good');
  });
});

describe('support mailbox — deletion commands', () => {
  it('finds the command wherever the human put it', () => {
    const token = 'a'.repeat(16);
    expect(parseDeletionCommand(`APPROVE ${token}`)).toEqual({ action: 'approve', token });
    expect(parseDeletionCommand(`thanks — reject ${token}, they changed their mind`)).toEqual({
      action: 'reject',
      token,
    });
  });

  it('is undefined when there is no command, or the token is malformed', () => {
    expect(parseDeletionCommand('please go ahead and delete this one')).toBeUndefined();
    expect(parseDeletionCommand('APPROVE')).toBeUndefined();
    expect(parseDeletionCommand('APPROVE abc123')).toBeUndefined();
  });
});

describe('support mailbox — classifying an inbound message', () => {
  const reply = { isAuto: false, isReply: true };

  it('routes a ticket reply to the ticket', () => {
    expect(
      classifyMessage({
        ...reply,
        subject: `Re: ${formatTicketSubject(TICKET_ID, 'billing')}`,
        body: 'Refunded, sorry about that.',
      }),
    ).toEqual({ kind: 'reply', ticketId: TICKET_ID, body: 'Refunded, sorry about that.' });
  });

  it('acts on a deletion command carrying the right token', () => {
    expect(
      classifyMessage({
        ...reply,
        subject: `Re: ${formatDeletionSubject(USER_ID)}`,
        body: `APPROVE ${deletionActionToken(USER_ID)}`,
      }),
    ).toEqual({ kind: 'deletion', userId: USER_ID, action: 'approve' });
  });

  it('NEVER acts on our own outgoing mail', () => {
    // The bug this pins down actually happened in testing: the mailbox
    // addresses itself, so our own deletion notification lands back in the
    // inbox — and its body contains `APPROVE <valid token>` as the
    // instructions we print for the human. Without the auto-header guard the
    // next poll reads that as an approval and irreversibly erases the very
    // account the mail was reporting.
    const ourOwnDeletionMail = {
      isAuto: true,
      isReply: false,
      subject: formatDeletionSubject(USER_ID),
      body: `Reply with:\n\n  APPROVE ${deletionActionToken(USER_ID)}\n  REJECT ${deletionActionToken(USER_ID)}`,
    };
    expect(classifyMessage(ourOwnDeletionMail).kind).toBe('skip');

    // ...and the same for the ticket half, which would otherwise paste our
    // internal notification text into what the user reads.
    expect(
      classifyMessage({
        isAuto: true,
        isReply: false,
        subject: formatTicketSubject(TICKET_ID, 'billing'),
        body: 'A new support ticket was submitted. User: …',
      }).kind,
    ).toBe('skip');
  });

  it('refuses a deletion command that is not a reply, even with a valid token', () => {
    // Belt-and-braces behind the auto-header check: a freshly composed mail
    // (no In-Reply-To/References) never decides a deletion.
    expect(
      classifyMessage({
        isAuto: false,
        isReply: false,
        subject: formatDeletionSubject(USER_ID),
        body: `APPROVE ${deletionActionToken(USER_ID)}`,
      }),
    ).toEqual({ kind: 'skip', reason: 'deletion command is not a reply' });
  });

  it('refuses a deletion command with a forged token', () => {
    expect(
      classifyMessage({
        ...reply,
        subject: `Re: ${formatDeletionSubject(USER_ID)}`,
        body: 'APPROVE 0123456789abcdef',
      }),
    ).toEqual({ kind: 'skip', reason: 'invalid deletion token' });
  });

  it('leaves unrelated mail and empty replies alone', () => {
    expect(classifyMessage({ ...reply, subject: 'Your Amazon order', body: 'hi' })).toEqual({
      kind: 'skip',
      reason: 'not ours',
    });
    expect(
      classifyMessage({ ...reply, subject: formatTicketSubject(TICKET_ID, 'billing'), body: '' }),
    ).toEqual({ kind: 'skip', reason: 'empty ticket reply' });
  });
});

describe('support mailbox — deletion token (irreversible-erasure gate)', () => {
  it('accepts only the token minted for that exact user', () => {
    // The security property being pinned: a forged `From:` is not enough to
    // erase an account, because the token exists nowhere but the mailbox.
    const token = deletionActionToken(USER_ID);
    expect(token).toMatch(/^[0-9a-f]{16}$/);
    expect(verifyDeletionToken(USER_ID, token!)).toBe(true);

    const otherUser = 'ffffffff-1111-4222-8333-444444444444';
    expect(verifyDeletionToken(otherUser, token!)).toBe(false);
  });

  it('rejects a wrong, empty, or truncated token without throwing', () => {
    // timingSafeEqual throws on a length mismatch if it is reached unguarded —
    // an attacker-controlled string must never be able to crash the poller.
    expect(verifyDeletionToken(USER_ID, '')).toBe(false);
    expect(verifyDeletionToken(USER_ID, 'deadbeefdeadbeef')).toBe(false);
    expect(verifyDeletionToken(USER_ID, deletionActionToken(USER_ID)!.slice(0, 8))).toBe(false);
  });
});
