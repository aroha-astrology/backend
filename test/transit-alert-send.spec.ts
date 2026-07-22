import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  listEventsDueToSend: vi.fn(),
  listEventsNeedingDraft: vi.fn(),
  listCopyForEvent: vi.fn(),
  listTransitRecipients: vi.fn(),
  insertTransitNotifications: vi.fn(),
  insertCopyRows: vi.fn(),
  setEventStatus: vi.fn(),
  sendPushBatch: vi.fn(),
  getOrCreateBatchRun: vi.fn(),
  completeBatchRun: vi.fn(),
  failBatchRun: vi.fn(),
  generateTransitCopy: vi.fn(),
}));

vi.mock('../src/modules/cron/transit-alert.repo.js', () => ({
  listEventsDueToSend: state.listEventsDueToSend,
  listEventsNeedingDraft: state.listEventsNeedingDraft,
  listCopyForEvent: state.listCopyForEvent,
  listTransitRecipients: state.listTransitRecipients,
  insertTransitNotifications: state.insertTransitNotifications,
  insertCopyRows: state.insertCopyRows,
  setEventStatus: state.setEventStatus,
  insertTransitEvents: vi.fn(),
  listPendingFutureEvents: vi.fn(),
}));
vi.mock('../src/lib/notifications/fcm.js', () => ({ sendPushBatch: state.sendPushBatch }));
vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  getOrCreateBatchRun: state.getOrCreateBatchRun,
  completeBatchRun: state.completeBatchRun,
  failBatchRun: state.failBatchRun,
}));
vi.mock('../src/lib/llm/transit-alert.js', async (importOriginal) => {
  // Keep the real validator and house maths; only the network call is faked.
  const actual = await importOriginal<typeof TransitAlertModule>();
  return { ...actual, generateTransitCopy: state.generateTransitCopy };
});

import { draftTransitCopy, sendTransitAlerts } from '../src/modules/cron/transit-alert.service.js';
import type * as TransitAlertModule from '../src/lib/llm/transit-alert.js';

const SATURN_INGRESS = {
  id: 'evt-1',
  planet: 'Saturn',
  eventType: 'ingress' as const,
  fromSign: 'Aquarius',
  toSign: 'Pisces',
  forDate: '2025-03-29',
  exactAt: new Date('2025-03-29T16:16:00Z'),
  pushAt: new Date('2025-03-27T13:30:00Z'),
  weight: 100,
  status: 'drafted' as const,
  skipReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const NOW = new Date('2025-03-27T13:35:00Z'); // just after the push moment

function freshRun(status: 'running' | 'completed' | 'failed' = 'running') {
  return { id: 'run-1', status, lastId: null, processed: 0, generated: 0, skipped: 0, failed: 0 };
}

describe('sendTransitAlerts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.getOrCreateBatchRun.mockResolvedValue(freshRun());
    state.sendPushBatch.mockResolvedValue({ success: 1, failure: 0 });
    state.listCopyForEvent.mockResolvedValue([]);
    state.insertTransitNotifications.mockResolvedValue(undefined);
    state.setEventStatus.mockResolvedValue(undefined);
    state.completeBatchRun.mockResolvedValue(undefined);
  });

  it('does nothing at all when no event is due', async () => {
    state.listEventsDueToSend.mockResolvedValue([]);

    const result = await sendTransitAlerts({ now: NOW });

    expect(result).toEqual(expect.objectContaining({ skipped: true, reason: 'nothing-due' }));
    expect(state.getOrCreateBatchRun).not.toHaveBeenCalled();
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });

  it('refuses to re-send once the IST date is already completed', async () => {
    state.listEventsDueToSend.mockResolvedValue([SATURN_INGRESS]);
    state.getOrCreateBatchRun.mockResolvedValue(freshRun('completed'));

    const result = await sendTransitAlerts({ now: NOW });

    // A push cannot be recalled, so "already sent" must never mean "send again".
    expect(result).toEqual(expect.objectContaining({ skipped: true, reason: 'already-sent' }));
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });

  it('force overrides the already-sent guard', async () => {
    state.listEventsDueToSend.mockResolvedValue([SATURN_INGRESS]);
    state.getOrCreateBatchRun.mockResolvedValue(freshRun('completed'));
    state.listTransitRecipients.mockResolvedValue([
      { token: 'tok-1', locale: 'en', userId: 'u1', moonSign: 'Aries' },
    ]);

    const result = await sendTransitAlerts({ now: NOW, force: true });

    expect(result.skipped).toBe(false);
    expect(state.sendPushBatch).toHaveBeenCalledTimes(1);
  });

  it('groups devices by (moon sign, language) and sends one batch per group', async () => {
    state.listEventsDueToSend.mockResolvedValue([SATURN_INGRESS]);
    state.listTransitRecipients.mockResolvedValue([
      { token: 'a', locale: 'en-US', userId: 'u1', moonSign: 'Aries' },
      { token: 'b', locale: 'en-IN', userId: 'u2', moonSign: 'Aries' }, // same group as a
      { token: 'c', locale: 'hi-IN', userId: 'u3', moonSign: 'Aries' },
      { token: 'd', locale: 'en-US', userId: 'u4', moonSign: 'Leo' },
    ]);
    state.listCopyForEvent.mockResolvedValue([
      { moonSign: 'Aries', lang: 'en', title: 'T-ar-en', body: 'B-ar-en' },
      { moonSign: 'Aries', lang: 'hi', title: 'T-ar-hi', body: 'B-ar-hi' },
      { moonSign: 'Leo', lang: 'en', title: 'T-leo-en', body: 'B-leo-en' },
    ]);

    await sendTransitAlerts({ now: NOW });

    expect(state.sendPushBatch).toHaveBeenCalledTimes(3);
    const ariesEn = state.sendPushBatch.mock.calls.find((c) => c[1] === 'T-ar-en');
    expect(ariesEn?.[0]).toEqual(['a', 'b']);
    expect(ariesEn?.[3]).toEqual(
      expect.objectContaining({ type: 'transit_alert', eventId: 'evt-1' }),
    );
  });

  it('falls back to static copy for a group drafting did not cover', async () => {
    // A device that registered between draft and send has no copy row; it must
    // still receive something true rather than be dropped from the send.
    state.listEventsDueToSend.mockResolvedValue([SATURN_INGRESS]);
    state.listTransitRecipients.mockResolvedValue([
      { token: 'new', locale: 'bn-IN', userId: 'u9', moonSign: 'Virgo' },
    ]);
    state.listCopyForEvent.mockResolvedValue([]);

    await sendTransitAlerts({ now: NOW });

    expect(state.sendPushBatch).toHaveBeenCalledTimes(1);
    const [tokens, title, body] = state.sendPushBatch.mock.calls[0]!;
    expect(tokens).toEqual(['new']);
    // Bengali fallback, localized — not English, not a raw template.
    expect(body).toContain('শনি');
    expect(body).not.toMatch(/\{[a-z]+\}/);
    expect(title).toBeTruthy();
  });

  it('writes one inbox row per user and marks the event sent', async () => {
    state.listEventsDueToSend.mockResolvedValue([SATURN_INGRESS]);
    state.listTransitRecipients.mockResolvedValue([
      { token: 'phone', locale: 'en', userId: 'u1', moonSign: 'Aries' },
      { token: 'tablet', locale: 'en', userId: 'u1', moonSign: 'Aries' }, // same user, 2 devices
      { token: 'other', locale: 'en', userId: 'u2', moonSign: 'Aries' },
    ]);
    state.listCopyForEvent.mockResolvedValue([
      { moonSign: 'Aries', lang: 'en', title: 'T', body: 'B' },
    ]);

    await sendTransitAlerts({ now: NOW });

    // Two devices for one user is one inbox row, not two — the row is also the
    // dormancy ledger, so duplicates would distort the 15-day throttle.
    const entries = state.insertTransitNotifications.mock.calls[0]![0];
    expect(entries.map((e: { userId: string }) => e.userId).sort()).toEqual(['u1', 'u2']);
    expect(state.setEventStatus).toHaveBeenCalledWith('evt-1', 'sent');
  });

  it('dryRun resolves everything but touches neither FCM nor the database', async () => {
    state.listEventsDueToSend.mockResolvedValue([SATURN_INGRESS]);
    state.listTransitRecipients.mockResolvedValue([
      { token: 'a', locale: 'en', userId: 'u1', moonSign: 'Aries' },
    ]);
    state.listCopyForEvent.mockResolvedValue([
      { moonSign: 'Aries', lang: 'en', title: 'T', body: 'B' },
    ]);

    const result = await sendTransitAlerts({ now: NOW, dryRun: true });

    expect(state.sendPushBatch).not.toHaveBeenCalled();
    expect(state.insertTransitNotifications).not.toHaveBeenCalled();
    expect(state.setEventStatus).not.toHaveBeenCalled();
    expect(state.completeBatchRun).not.toHaveBeenCalled();
    expect(result.recipients).toBe(1);
  });

  it('records the run as failed if recipients cannot be loaded', async () => {
    state.listEventsDueToSend.mockResolvedValue([SATURN_INGRESS]);
    state.listTransitRecipients.mockRejectedValue(new Error('db down'));

    const result = await sendTransitAlerts({ now: NOW });

    expect(state.failBatchRun).toHaveBeenCalledWith('run-1', 'db down');
    expect(state.sendPushBatch).not.toHaveBeenCalled();
    expect(result.success).toBe(0);
  });
});

describe('draftTransitCopy', () => {
  const detected = { ...SATURN_INGRESS, status: 'detected' as const };

  beforeEach(() => {
    vi.resetAllMocks();
    state.insertCopyRows.mockResolvedValue(undefined);
    state.setEventStatus.mockResolvedValue(undefined);
  });

  it('only generates the (sign, language) combinations that have a live device', async () => {
    state.listEventsNeedingDraft.mockResolvedValue([detected]);
    state.listTransitRecipients.mockResolvedValue([
      { token: 'a', locale: 'en', userId: 'u1', moonSign: 'Aries' },
      { token: 'b', locale: 'en', userId: 'u2', moonSign: 'Aries' }, // duplicate combo
      { token: 'c', locale: 'hi', userId: 'u3', moonSign: 'Leo' },
    ]);
    state.generateTransitCopy.mockResolvedValue({ title: 'T', body: 'B' });

    const result = await draftTransitCopy({ now: NOW });

    // Two distinct combos, not 3 recipients and not the full 12x7 grid.
    expect(state.generateTransitCopy).toHaveBeenCalledTimes(2);
    expect(result.generated).toBe(2);
    expect(state.setEventStatus).toHaveBeenCalledWith('evt-1', 'drafted');
  });

  it('substitutes static copy and flags it when generation fails', async () => {
    state.listEventsNeedingDraft.mockResolvedValue([detected]);
    state.listTransitRecipients.mockResolvedValue([
      { token: 'a', locale: 'hi', userId: 'u1', moonSign: 'Aries' },
    ]);
    // generateTransitCopy returns null after its own retries are exhausted.
    state.generateTransitCopy.mockResolvedValue(null);

    const result = await draftTransitCopy({ now: NOW });

    expect(result.fallbacks).toBe(1);
    expect(result.generated).toBe(0);
    const rows = state.insertCopyRows.mock.calls[0]![0];
    expect(rows).toHaveLength(1);
    expect(rows[0].isFallback).toBe(true);
    expect(rows[0].body).toContain('शनि'); // Hindi fallback, not English
    // The event is still marked drafted — a fallback is a degraded send, not a
    // cancelled one.
    expect(state.setEventStatus).toHaveBeenCalledWith('evt-1', 'drafted');
  });

  it('is a no-op when nothing is in the draft window', async () => {
    state.listEventsNeedingDraft.mockResolvedValue([]);

    const result = await draftTransitCopy({ now: NOW });

    expect(result).toEqual({ events: 0, generated: 0, fallbacks: 0 });
    expect(state.listTransitRecipients).not.toHaveBeenCalled();
  });
});
