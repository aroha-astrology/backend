import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findActiveTokensForUser, sendPushBatch } = vi.hoisted(() => ({
  findActiveTokensForUser: vi.fn(),
  sendPushBatch: vi.fn(),
}));

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  findActiveTokensForUser,
}));
vi.mock('../src/lib/notifications/fcm.js', () => ({
  sendPushBatch,
}));

import { pushDailyHoroscopeReady } from '../src/modules/horoscope/horoscope.service.js';
import type { UserRow, StructuredHoroscope } from '../src/db/schema.js';

const user = { id: 'user-1' } as UserRow;

const structured: StructuredHoroscope = {
  hook: 'h',
  description: 'd',
  advice: 'a',
  quality: 'good',
  score: 4,
  luckyColor: 'blue',
  luckyNumber: 7,
  categories: {
    overall: {
      hook: 'A strong window today.',
      description: 'd',
      advice: 'a',
      quality: 'good',
      score: 4,
    },
    health: { hook: 'h', description: 'd', advice: 'a', quality: 'good', score: 4 },
    career: { hook: 'h', description: 'd', advice: 'a', quality: 'good', score: 4 },
    marriage: { hook: 'h', description: 'd', advice: 'a', quality: 'good', score: 4 },
  },
};

describe('pushDailyHoroscopeReady', () => {
  beforeEach(() => {
    findActiveTokensForUser.mockReset();
    sendPushBatch.mockReset();
  });

  it('does nothing when structured/overall hook is missing', async () => {
    await expect(pushDailyHoroscopeReady(user, undefined)).resolves.toBeUndefined();
    expect(findActiveTokensForUser).not.toHaveBeenCalled();
  });

  it('does nothing when the user has no registered tokens', async () => {
    findActiveTokensForUser.mockResolvedValue([]);
    await pushDailyHoroscopeReady(user, structured);
    expect(sendPushBatch).not.toHaveBeenCalled();
  });

  it('sends a push using the overall hook as the body', async () => {
    findActiveTokensForUser.mockResolvedValue([{ token: 'tok-1' }, { token: 'tok-2' }]);
    sendPushBatch.mockResolvedValue({ success: 2, failure: 0 });
    await pushDailyHoroscopeReady(user, structured);
    expect(sendPushBatch).toHaveBeenCalledWith(
      ['tok-1', 'tok-2'],
      expect.any(String),
      'A strong window today.',
      expect.objectContaining({ type: 'daily_horoscope', userId: 'user-1' }),
    );
  });

  it('never throws when token lookup rejects', async () => {
    findActiveTokensForUser.mockRejectedValue(new Error('db down'));
    await expect(pushDailyHoroscopeReady(user, structured)).resolves.toBeUndefined();
  });

  it('never throws when sendPushBatch rejects', async () => {
    findActiveTokensForUser.mockResolvedValue([{ token: 'tok-1' }]);
    sendPushBatch.mockRejectedValue(new Error('fcm down'));
    await expect(pushDailyHoroscopeReady(user, structured)).resolves.toBeUndefined();
  });
});
