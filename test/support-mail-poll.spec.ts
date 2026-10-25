import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake ImapFlow: tests set how connect() behaves and inspect the listeners and close().
const imap = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  close: vi.fn(),
  on: vi.fn(),
}));

vi.mock('imapflow', () => ({
  ImapFlow: vi.fn(() => ({ connect: imap.connect, close: imap.close, on: imap.on })),
}));

vi.mock('../src/lib/notifications/support-email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/notifications/support-email.js')>()),
  isSupportEmailConfigured: () => true,
}));

const { runSupportMailPoll } = await import('../src/modules/support/support-mail.service.js');

describe('support mailbox poll — Gmail refuses the login', () => {
  beforeEach(() => {
    imap.connect.mockReset();
    imap.close.mockReset();
    imap.on.mockReset();
    imap.connect.mockRejectedValue(
      Object.assign(new Error('Command failed'), {
        authenticationFailed: true,
        responseText: 'Invalid credentials (Failure)',
      }),
    );
  });

  it('fails the poll instead of reporting an empty, successful run', async () => {
    await expect(runSupportMailPoll()).rejects.toThrow(/Invalid credentials/);
  });

  it('closes the connection and listens for its socket errors', async () => {
    await runSupportMailPoll().catch(() => undefined);
    expect(imap.close).toHaveBeenCalled();
    // Without an 'error' listener, the dead socket's later timeout is an uncaughtException.
    expect(imap.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
