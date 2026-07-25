import { beforeEach, describe, expect, it, vi } from 'vitest';

// FCM's messaging.sendEach() caps at 500 messages per call and throws above
// that — the old sendPushBatch comment claimed it "handles the batching
// internally", which isn't true. This suite pins the chunking behavior that
// makes a >500-token broadcast not fail outright.

const state = vi.hoisted(() => ({ sendEach: vi.fn() }));

vi.mock('../src/config/firebase.js', () => ({
  getFirebaseApp: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({ sendEach: state.sendEach })),
}));

import { sendPushBatch } from '../src/lib/notifications/fcm.js';

describe('sendPushBatch — chunking above the 500-message FCM ceiling', () => {
  beforeEach(() => {
    state.sendEach.mockReset();
  });

  it('sends everything in one call when at or under 500 tokens', async () => {
    state.sendEach.mockResolvedValueOnce({ successCount: 500, failureCount: 0 });
    const tokens = Array.from({ length: 500 }, (_, i) => `tok-${i}`);

    const result = await sendPushBatch(tokens, 'Title', 'Body');

    expect(state.sendEach).toHaveBeenCalledTimes(1);
    expect(state.sendEach.mock.calls[0]![0]).toHaveLength(500);
    expect(result).toEqual({ success: 500, failure: 0 });
  });

  it('splits into multiple <=500-message calls above the ceiling, and sums the results', async () => {
    state.sendEach
      .mockResolvedValueOnce({ successCount: 500, failureCount: 0 })
      .mockResolvedValueOnce({ successCount: 1, failureCount: 0 });
    const tokens = Array.from({ length: 501 }, (_, i) => `tok-${i}`);

    const result = await sendPushBatch(tokens, 'Title', 'Body');

    expect(state.sendEach).toHaveBeenCalledTimes(2);
    expect(state.sendEach.mock.calls[0]![0]).toHaveLength(500);
    expect(state.sendEach.mock.calls[1]![0]).toHaveLength(1);
    expect(result).toEqual({ success: 501, failure: 0 });
  });

  it('a failure in one chunk does not lose the successes already counted from another', async () => {
    state.sendEach
      .mockResolvedValueOnce({ successCount: 500, failureCount: 0 })
      .mockRejectedValueOnce(new Error('fcm down'));
    const tokens = Array.from({ length: 600 }, (_, i) => `tok-${i}`);

    const result = await sendPushBatch(tokens, 'Title', 'Body');

    expect(result).toEqual({ success: 500, failure: 100 });
  });

  it('never throws when Firebase itself fails to initialize — every caller relies on this', async () => {
    state.sendEach.mockRejectedValueOnce(new Error('unreachable — init should fail first'));
    const { getFirebaseApp } = await import('../src/config/firebase.js');
    vi.mocked(getFirebaseApp).mockImplementationOnce(() => {
      throw new Error('no service account configured');
    });

    const result = await sendPushBatch(['tok-1'], 'Title', 'Body');

    expect(result).toEqual({ success: 0, failure: 1 });
    expect(state.sendEach).not.toHaveBeenCalled();
  });
});
