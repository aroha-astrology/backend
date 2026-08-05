import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  rearmRecoveredLowBalanceUsers: vi.fn(),
  findUnalertedLowBalanceUserIds: vi.fn(),
  markLowBalanceAlerted: vi.fn(),
  notifyUser: vi.fn(),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  rearmRecoveredLowBalanceUsers: state.rearmRecoveredLowBalanceUsers,
  findUnalertedLowBalanceUserIds: state.findUnalertedLowBalanceUserIds,
  markLowBalanceAlerted: state.markLowBalanceAlerted,
}));

vi.mock('../src/lib/notifications/notify-user.js', () => ({
  notifyUser: state.notifyUser,
}));

import {
  runLowBalanceAlert,
  LOW_BALANCE_NOTIFICATION_TYPE,
} from '../src/modules/cron/low-balance-alert.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runLowBalanceAlert', () => {
  it('notifies and marks every unalerted below-threshold user, and reports rearm count', async () => {
    state.rearmRecoveredLowBalanceUsers.mockResolvedValue(3);
    state.findUnalertedLowBalanceUserIds.mockResolvedValue(['u1', 'u2']);
    state.notifyUser.mockResolvedValue(undefined);
    state.markLowBalanceAlerted.mockResolvedValue(undefined);

    const result = await runLowBalanceAlert();

    expect(result).toEqual({ rearmed: 3, alerted: 2 });
    expect(state.notifyUser).toHaveBeenCalledTimes(2);
    expect(state.notifyUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ type: LOW_BALANCE_NOTIFICATION_TYPE }),
    );
    expect(state.markLowBalanceAlerted).toHaveBeenCalledWith('u1');
    expect(state.markLowBalanceAlerted).toHaveBeenCalledWith('u2');
  });

  it('never re-notifies a user with no candidates (rearmed-only tick)', async () => {
    state.rearmRecoveredLowBalanceUsers.mockResolvedValue(1);
    state.findUnalertedLowBalanceUserIds.mockResolvedValue([]);

    const result = await runLowBalanceAlert();

    expect(result).toEqual({ rearmed: 1, alerted: 0 });
    expect(state.notifyUser).not.toHaveBeenCalled();
  });

  it('keeps processing remaining users when one fails, and does not mark the failed one alerted', async () => {
    state.rearmRecoveredLowBalanceUsers.mockResolvedValue(0);
    state.findUnalertedLowBalanceUserIds.mockResolvedValue(['bad', 'good']);
    state.notifyUser.mockImplementation((userId: string) =>
      userId === 'bad' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined),
    );

    const result = await runLowBalanceAlert();

    expect(result).toEqual({ rearmed: 0, alerted: 1 });
    expect(state.markLowBalanceAlerted).toHaveBeenCalledTimes(1);
    expect(state.markLowBalanceAlerted).toHaveBeenCalledWith('good');
  });
});
