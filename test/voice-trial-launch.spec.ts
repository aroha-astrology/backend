import { beforeEach, describe, expect, it, vi } from 'vitest';

const held = vi.hoisted(
  (): {
    audience: Array<{ userId: string; locale: string | null }>;
    sent: Set<string>;
  } => ({ audience: [], sent: new Set() }),
);
const state = vi.hoisted(() => ({ notifyUser: vi.fn() }));

vi.mock('../src/modules/gift-campaigns/gift-campaigns.repo.js', () => ({
  resolveAudience: () => Promise.resolve(held.audience),
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({
  listUserIdsNotified: () => Promise.resolve(held.sent),
}));
vi.mock('../src/lib/notifications/notify-user.js', () => ({ notifyUser: state.notifyUser }));

import {
  VOICE_TRIAL_LAUNCH_LINK,
  VOICE_TRIAL_LAUNCH_TEST_TYPE,
  VOICE_TRIAL_LAUNCH_TYPE,
  sendVoiceTrialLaunch,
  voiceTrialLaunchCopy,
} from '../src/modules/voice/voice-trial-launch.service.js';
import { categoryOf } from '../src/lib/notifications/notification-prefs.js';

beforeEach(() => {
  held.audience = [
    { userId: 'u1', locale: 'en' },
    { userId: 'u2', locale: 'bn-IN' },
    { userId: 'u3', locale: null },
  ];
  held.sent = new Set();
  state.notifyUser.mockReset().mockResolvedValue(undefined);
});

describe('sendVoiceTrialLaunch', () => {
  it('sends every user the notification in their language, opening the call', async () => {
    const result = await sendVoiceTrialLaunch();

    expect(result).toEqual({ attempted: 3, failed: 0, skipped: 0 });
    expect(state.notifyUser).toHaveBeenCalledWith('u2', {
      ...voiceTrialLaunchCopy('bn'),
      type: VOICE_TRIAL_LAUNCH_TYPE,
      link: VOICE_TRIAL_LAUNCH_LINK,
    });
    expect(state.notifyUser).toHaveBeenCalledWith(
      'u3',
      expect.objectContaining({ title: voiceTrialLaunchCopy('en').title }),
    );
    expect(VOICE_TRIAL_LAUNCH_LINK).toBe('/ai-chat?call=1');
  });

  it('never sends twice: a second send only reaches the users the first one missed', async () => {
    held.sent = new Set(['u1', 'u3']);

    const result = await sendVoiceTrialLaunch();

    expect(result).toEqual({ attempted: 1, failed: 0, skipped: 2 });
    expect(state.notifyUser).toHaveBeenCalledTimes(1);
    expect(state.notifyUser.mock.calls[0]![0]).toBe('u2');
  });

  it('a try-out goes to that one user and does not count as their launch notification', async () => {
    await sendVoiceTrialLaunch({ onlyUser: { id: 'admin', locale: 'hi' } });

    expect(state.notifyUser).toHaveBeenCalledTimes(1);
    expect(state.notifyUser).toHaveBeenCalledWith(
      'admin',
      expect.objectContaining({ type: VOICE_TRIAL_LAUNCH_TEST_TYPE, ...voiceTrialLaunchCopy('hi') }),
    );
  });

  it('is filed under Offers, so a user who turned Offers off gets no push', () => {
    expect(categoryOf(VOICE_TRIAL_LAUNCH_TYPE)).toBe('marketing');
    expect(categoryOf(VOICE_TRIAL_LAUNCH_TEST_TYPE)).toBe('marketing');
  });

  it('says 3 minutes and Yogi Baba in every language, and never mentions AI', () => {
    for (const lang of ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu']) {
      const { title, body } = voiceTrialLaunchCopy(lang);
      expect(`${title} ${body}`, lang).toMatch(/3|৩/);
      expect(`${title} ${body}`, lang).not.toMatch(/\bAI\b/i);
    }
  });
});
