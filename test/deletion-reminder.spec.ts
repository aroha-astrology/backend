import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  listPendingDeletionRequestsBefore: vi.fn(),
  notifyAccountDeletionRequest: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/modules/users/users.repo.js', () => ({
  listPendingDeletionRequestsBefore: state.listPendingDeletionRequestsBefore,
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifyAccountDeletionRequest: state.notifyAccountDeletionRequest,
}));

import {
  DELETION_REMINDER_AFTER_DAYS,
  runDeletionRequestReminder,
} from '../src/modules/cron/deletion-reminder.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

describe('runDeletionRequestReminder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.notifyAccountDeletionRequest.mockResolvedValue(true);
  });

  it('asks for requests older than the reminder threshold, and no others', async () => {
    state.listPendingDeletionRequestsBefore.mockResolvedValue([]);

    const before = Date.now();
    await runDeletionRequestReminder();

    const cutoff = state.listPendingDeletionRequestsBefore.mock.calls[0]?.[0] as Date;
    // Anything requested AFTER the cutoff is still inside its review window.
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(
      before - DELETION_REMINDER_AFTER_DAYS * DAY_MS - 1000,
    );
    expect(cutoff.getTime()).toBeLessThanOrEqual(
      Date.now() - DELETION_REMINDER_AFTER_DAYS * DAY_MS,
    );
  });

  it('sends one message per pending request, with the age in days', async () => {
    state.listPendingDeletionRequestsBefore.mockResolvedValue([
      makeUserRow({ id: 'user-a', deletionRequestedAt: daysAgo(7), phoneE164: '+911111111111' }),
      makeUserRow({ id: 'user-b', deletionRequestedAt: daysAgo(30), phoneE164: null, email: null }),
    ]);

    const result = await runDeletionRequestReminder();

    expect(result).toEqual({ pending: 2, reminded: 2 });
    expect(state.notifyAccountDeletionRequest).toHaveBeenCalledTimes(2);
    expect(state.notifyAccountDeletionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a', contact: '+911111111111', pendingDays: 7 }),
    );
    expect(state.notifyAccountDeletionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-b', contact: null, pendingDays: 30 }),
    );
  });

  it('counts a failed Telegram send as not reminded, and keeps going', async () => {
    state.listPendingDeletionRequestsBefore.mockResolvedValue([
      makeUserRow({ id: 'user-a', deletionRequestedAt: daysAgo(7) }),
      makeUserRow({ id: 'user-b', deletionRequestedAt: daysAgo(8) }),
    ]);
    state.notifyAccountDeletionRequest.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    // A dead Telegram must not strand the second request — the whole point of
    // this cron is that it re-fires tomorrow regardless.
    expect(await runDeletionRequestReminder()).toEqual({ pending: 2, reminded: 1 });
    expect(state.notifyAccountDeletionRequest).toHaveBeenCalledTimes(2);
  });

  it('does nothing when nothing is pending', async () => {
    state.listPendingDeletionRequestsBefore.mockResolvedValue([]);

    expect(await runDeletionRequestReminder()).toEqual({ pending: 0, reminded: 0 });
    expect(state.notifyAccountDeletionRequest).not.toHaveBeenCalled();
  });
});
