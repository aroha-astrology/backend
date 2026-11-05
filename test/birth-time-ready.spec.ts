import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  claimDueRectifications: vi.fn(),
  notifyUser: vi.fn(),
}));

vi.mock('../src/modules/insights/birth-time.repo.js', () => ({
  claimDueRectifications: state.claimDueRectifications,
}));
vi.mock('../src/lib/notifications/notify-user.js', () => ({ notifyUser: state.notifyUser }));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runBirthTimeReady } from '../src/modules/cron/birth-time-ready.service.js';

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset();
  state.notifyUser.mockResolvedValue(undefined);
});

describe('runBirthTimeReady', () => {
  it('pushes each claimed check once, with a link to the Kundli card', async () => {
    state.claimDueRectifications.mockResolvedValue([
      { id: 'r1', userId: 'u1' },
      { id: 'r2', userId: 'u2' },
    ]);

    await expect(runBirthTimeReady()).resolves.toEqual({ notified: 2 });

    expect(state.notifyUser).toHaveBeenCalledTimes(2);
    expect(state.notifyUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ type: 'birth_time_ready', link: '/kundli' }),
    );
  });

  it('does nothing when no check is due', async () => {
    state.claimDueRectifications.mockResolvedValue([]);
    await expect(runBirthTimeReady()).resolves.toEqual({ notified: 0 });
    expect(state.notifyUser).not.toHaveBeenCalled();
  });

  it('keeps going if one push throws', async () => {
    state.claimDueRectifications.mockResolvedValue([
      { id: 'r1', userId: 'u1' },
      { id: 'r2', userId: 'u2' },
    ]);
    state.notifyUser.mockRejectedValueOnce(new Error('fcm down')).mockResolvedValueOnce(undefined);
    await expect(runBirthTimeReady()).resolves.toEqual({ notified: 1 });
  });
});
