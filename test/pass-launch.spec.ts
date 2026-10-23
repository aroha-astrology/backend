import { beforeEach, describe, expect, it, vi } from 'vitest';

const held = vi.hoisted(
  (): {
    features: Record<string, { enabled: boolean }>;
    audience: Array<{ userId: string; locale: string | null }>;
    tokens: Array<{ userId: string }>;
    sent: Set<string>;
    playConfigured: boolean;
  } => ({ features: {}, audience: [], tokens: [], sent: new Set(), playConfigured: true }),
);
const state = vi.hoisted(() => ({ notifyUser: vi.fn() }));

vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeatures: () => Promise.resolve(held.features),
}));
vi.mock('../src/modules/gift-campaigns/gift-campaigns.repo.js', () => ({
  resolveAudience: () => Promise.resolve(held.audience),
}));
vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  getAllActiveTokens: () => Promise.resolve(held.tokens),
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({
  listUserIdsNotified: () => Promise.resolve(held.sent),
}));
vi.mock('../src/config/google-play.js', () => ({
  isGooglePlayConfigured: () => held.playConfigured,
}));
vi.mock('../src/lib/notifications/notify-user.js', () => ({ notifyUser: state.notifyUser }));

import {
  PASS_LAUNCH_TEST_TYPE,
  PASS_LAUNCH_TYPE,
  passLaunchCopy,
  passLaunchReadiness,
  sendPassLaunch,
} from '../src/modules/pass/pass-launch.service.js';

const on = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, { enabled: true }]));

const SILVER = ['paid.voiceChat', 'nav.lifeTimeline', 'nav.bonds', 'home.palmReading'];
const GOLD = [...SILVER, 'nav.decisions', 'panchang.findMyDate', 'home.birthTimeConfidence'];
const PLATINUM = [...GOLD, 'nav.relocation'];
const ALL_TIERS = ['paid.arohaPassA', 'paid.arohaPassB', 'paid.arohaPassC'];

beforeEach(() => {
  held.features = {};
  held.audience = [
    { userId: 'u1', locale: 'en' },
    { userId: 'u2', locale: 'hi-IN' },
    { userId: 'u3', locale: null },
  ];
  held.tokens = [{ userId: 'u1' }, { userId: 'u1' }, { userId: 'u3' }];
  held.sent = new Set();
  held.playConfigured = true;
  state.notifyUser.mockReset().mockResolvedValue(undefined);
});

describe('passLaunchReadiness', () => {
  it('is not ready while everything is off, and says which switches are needed', async () => {
    const r = await passLaunchReadiness();
    expect(r.ready).toBe(false);
    const needed = r.switches.filter((s) => s.need === 'required').map((s) => s.key);
    expect([...needed].sort()).toEqual(['nav.arohaPass', ...ALL_TIERS, ...PLATINUM].sort());
    expect(r.switches.find((s) => s.key === 'home.passLaunchPopup')?.need).toBe('optional');
  });

  it('is ready with all three tiers and every Pass feature on', async () => {
    held.features = on('nav.arohaPass', ...ALL_TIERS, ...PLATINUM);
    expect((await passLaunchReadiness()).ready).toBe(true);
  });

  it('a feature that a tier on sale promises holds it back while its own switch is off', async () => {
    held.features = on('nav.arohaPass', ...ALL_TIERS, ...GOLD);
    const r = await passLaunchReadiness();
    expect(r.ready).toBe(false);
    expect(r.switches.filter((s) => s.need === 'required' && !s.enabled).map((s) => s.key)).toEqual(
      ['nav.relocation'],
    );
  });

  it('selling Silver alone needs only what Silver promises', async () => {
    held.features = on('nav.arohaPass', 'paid.arohaPassA', ...SILVER);
    const r = await passLaunchReadiness();
    expect(r.ready).toBe(true);
    expect(r.switches.find((s) => s.key === 'nav.relocation')?.need).toBe('optional');
    expect(r.switches.find((s) => s.key === 'paid.arohaPassC')?.need).toBe('optional');
  });

  it('is not ready when the server cannot reach Google Play', async () => {
    held.features = on('nav.arohaPass', ...ALL_TIERS, ...PLATINUM);
    held.playConfigured = false;
    const r = await passLaunchReadiness();
    expect(r.playConfigured).toBe(false);
    expect(r.ready).toBe(false);
  });

  it('counts users, users with a push token (once each) and users already sent to', async () => {
    held.sent = new Set(['u2']);
    expect((await passLaunchReadiness()).audience).toEqual({
      users: 3,
      withPush: 2,
      alreadySent: 1,
    });
  });
});

describe('sendPassLaunch', () => {
  it('refuses while the Pass is not ready, and sends nothing', async () => {
    await expect(sendPassLaunch()).rejects.toThrow('PASS_NOT_READY');
    expect(state.notifyUser).not.toHaveBeenCalled();
  });

  it('sends each user the notification in their language, opening /pass', async () => {
    held.features = on('nav.arohaPass', ...ALL_TIERS, ...PLATINUM);
    expect(await sendPassLaunch()).toEqual({ attempted: 3, failed: 0, skipped: 0 });
    expect(state.notifyUser).toHaveBeenCalledWith('u1', {
      ...passLaunchCopy('en'),
      type: PASS_LAUNCH_TYPE,
      link: '/pass',
    });
    expect(state.notifyUser).toHaveBeenCalledWith('u2', {
      ...passLaunchCopy('hi'),
      type: PASS_LAUNCH_TYPE,
      link: '/pass',
    });
    expect(passLaunchCopy('hi').title).not.toBe(passLaunchCopy('en').title);
  });

  it('a second send only reaches the users the first one missed', async () => {
    held.features = on('nav.arohaPass', ...ALL_TIERS, ...PLATINUM);
    held.sent = new Set(['u1', 'u3']);
    expect(await sendPassLaunch()).toEqual({ attempted: 1, failed: 0, skipped: 2 });
    expect(state.notifyUser).toHaveBeenCalledTimes(1);
    expect(state.notifyUser.mock.calls[0]![0]).toBe('u2');
  });

  it('a try-out goes to that one admin, before the Pass is ready, and does not count as their launch notification', async () => {
    expect(await sendPassLaunch({ onlyUser: { id: 'admin', locale: 'en' } })).toEqual({
      attempted: 1,
      failed: 0,
      skipped: 0,
    });
    expect(state.notifyUser).toHaveBeenCalledTimes(1);
    expect(state.notifyUser).toHaveBeenCalledWith('admin', {
      ...passLaunchCopy('en'),
      type: PASS_LAUNCH_TEST_TYPE,
      link: '/pass',
    });
  });
});
