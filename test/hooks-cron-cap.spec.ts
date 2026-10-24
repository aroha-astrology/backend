import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_REGISTRY } from '../src/config/features';
import { categoryOf } from '../src/lib/notifications/notification-prefs';
import { resetWorld, world } from './helpers/hooks-world';

vi.mock('../src/modules/hooks/hooks.repo', async () => {
  const w = await import('./helpers/hooks-world');
  return {
    ...w.hooksRepoMock,
    usersWithHook: async (hook: string) => [...new Set([...w.world.progress.values()].filter((r) => r.hook === hook).map((r) => r.userId))],
    usersWithRecentSleep: async () => [...new Set([...w.world.sleep.values()].map((r) => r.userId as string))],
  };
});
vi.mock('../src/modules/users/users.repo', async () => ({
  ...(await import('./helpers/hooks-world')).usersRepoMock,
  findActiveUserById: async (id: string) => (globalThis as { __users?: Record<string, unknown> }).__users?.[id],
}));
vi.mock('../src/modules/features/features.service', async () => (await import('./helpers/hooks-world')).featuresServiceMock);
vi.mock('../src/lib/entitlements', () => ({ passEntitlement: async () => null }));
vi.mock('../src/lib/cache/locks', () => ({ acquire: async () => ({ ok: true, owner: 'x' }), release: async () => {} }));
vi.mock('../src/lib/notifications/notify-user', () => ({
  notifyUser: async (_u: string, p: { type: string; title: string; body: string; link?: string }) => {
    (await import('./helpers/hooks-world')).world.pushes.push(p);
  },
}));
vi.mock('../src/modules/astro/astro.service', () => ({ isValidTimeZone: () => true }));
vi.mock('../src/modules/hooks/diya.service', () => ({
  getDiya: async () => ({ place: { tz: 'Asia/Kolkata' }, window: { startMin: 700, start: '11:40', end: '12:28', why: 'Abhijit' }, lit: false, state: 'open' }),
}));
vi.mock('../src/modules/hooks/kavach.service', () => ({
  getKavach: async () => ({ today: { name: 'Bhanu', beadsTarget: 11, planetHindi: 'Budh', done: false } }),
}));
vi.mock('../src/modules/hooks/mystery.service', () => ({
  getMystery: async () => ({ state: 'ready', cards: [{ scratched: false }] }),
}));
vi.mock('../src/modules/hooks/receipts.service', () => ({
  getReceipts: async () => ({ cards: [{ verdict: null, status: 'past' }] }),
}));
vi.mock('../src/modules/hooks/rahasya.service', () => ({
  refreshRahasya: async () => ({ openCount: 3, slots: [{ n: 1, via: 'first', title: 'a' }, { n: 2, via: 'daily', title: 'Your Moon' }, { n: 3, via: 'daily', title: 'Your Sun' }] }),
}));

import { HOOK_PUSH_TYPE, HOOKS, underCap, clampPushCap, DEFAULT_PUSH_CAP, addDays, runEndingOn, refFor, publicCount } from '../src/modules/hooks/hooks-rules';
import { runHooksCron } from '../src/modules/hooks/hooks-cron.service';
import { pushCap, sendHookPush } from '../src/modules/hooks/hooks-common';
import { getHookPrefs, setHookPref } from '../src/modules/hooks/hooks-prefs.service';

const mk = (id: string, tz = 'Asia/Kolkata') => ({ id, locale: 'en', currentTimezone: tz, skyMode: 'HOME', homeLocation: { name: 'Delhi', lat: 28.6, lon: 77.2, tz }, currentLocation: null }) as never;
const at = (day: number, hhmmIst: string) => {
  const [h, m] = hhmmIst.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, day, h! - 5, m! - 30));
};
const seed = (userId: string, hook: string, date = '2026-10-25', profileKey = '') =>
  world.progress.set(`${userId}|${hook}|${profileKey}|${date}`, { userId, hook, profileKey, localDate: date, data: {} });

beforeEach(() => {
  resetWorld();
  (globalThis as { __users?: Record<string, unknown> }).__users = { u1: mk('u1'), u2: mk('u2') };
});

describe('the switches', () => {
  const KEYS = ['hooks.kundliRahasya', 'hooks.shubhLabh', 'hooks.gharKavach', 'hooks.sankalpDiya', 'hooks.cosmicReceipts', 'hooks.textTiming', 'hooks.sleepSync', 'hooks.mysteryDrop', 'home.timeMorph'];
  it.each(KEYS)('%s ships off and tagged new', (key) => {
    const d = FEATURE_REGISTRY.find((f) => f.key === key)!;
    expect(d).toBeDefined();
    expect(d.defaultEnabled).toBe(false);
    expect(d.tag).toBe('new');
    expect(key.startsWith(`${d.group}.`)).toBe(true);
  });
  it('four are built for the Indian look and four for the international look', () => {
    const aud = (k: string) => FEATURE_REGISTRY.find((f) => f.key === k)!.defaultAudience;
    expect(['hooks.kundliRahasya', 'hooks.shubhLabh', 'hooks.gharKavach', 'hooks.sankalpDiya'].map(aud)).toEqual(['classic', 'classic', 'classic', 'classic']);
    expect(['hooks.cosmicReceipts', 'hooks.textTiming', 'hooks.sleepSync', 'hooks.mysteryDrop'].map(aud)).toEqual(['cosmic', 'cosmic', 'cosmic', 'cosmic']);
  });
  it('the amounts are the owner\'s prices', () => {
    const p = (k: string) => FEATURE_REGISTRY.find((f) => f.key === k)!.defaultPricePaise;
    expect([p('hooks.rahasyaUnlock'), p('hooks.wealthWeek'), p('hooks.peekTomorrow'), p('hooks.textAlert'), p('hooks.sleepReport'), p('hooks.diyaReward')]).toEqual([1500, 1500, 1500, 1500, 4900, 500]);
  });
  it('every hook push type belongs to the "hooks" notification category', () => {
    for (const h of HOOKS) expect(categoryOf(HOOK_PUSH_TYPE[h])).toBe('hooks');
  });
});

describe('rules', () => {
  it('the cap defaults to 3 and the owner\'s value is clamped to 0-8', () => {
    expect(DEFAULT_PUSH_CAP).toBe(3);
    expect(clampPushCap(5)).toBe(5);
    expect(clampPushCap(0)).toBe(0);
    expect(clampPushCap(9)).toBe(3);
    expect(clampPushCap(-1)).toBe(3);
    expect(clampPushCap('x')).toBe(3);
    expect(underCap(2, 3)).toBe(true);
    expect(underCap(3, 3)).toBe(false);
  });
  it('dates and runs', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(runEndingOn(new Set(['2026-10-24', '2026-10-25', '2026-10-26']), '2026-10-26')).toBe(3);
    expect(runEndingOn(new Set(['2026-10-24', '2026-10-26']), '2026-10-26')).toBe(1);
    expect(runEndingOn(new Set(), '2026-10-26')).toBe(0);
  });
  it('a real count shows from 20, and ids are stable', () => {
    expect(publicCount(19)).toBeNull();
    expect(publicCount(20)).toBe(20);
    expect(refFor('sankalpDiya', '', '2026-10-26', 'gift')).toBe('sankalpDiya:self:2026-10-26:gift');
  });
});

describe('sending under the cap', () => {
  const u = mk('u1');
  const push = (hook: (typeof HOOKS)[number] = 'sankalpDiya') => ({ hook, title: 't', body: 'b', link: '/x' });

  it('sends nothing for a hook that is off for the reader', async () => {
    expect(await sendHookPush(u, push(), at(26, '12:00'))).toBe(false);
    expect(world.pushes).toEqual([]);
  });

  it('three a day, then no more, counted per local day', async () => {
    for (const h of HOOKS) world.features.add(`hooks.${h}`);
    expect(await sendHookPush(u, push('sankalpDiya'), at(26, '08:00'))).toBe(true);
    expect(await sendHookPush(u, push('gharKavach'), at(26, '09:00'))).toBe(true);
    expect(await sendHookPush(u, push('mysteryDrop'), at(26, '18:00'))).toBe(true);
    expect(await sendHookPush(u, push('cosmicReceipts'), at(26, '20:30'))).toBe(false);
    expect(world.pushes).toHaveLength(3);
    expect(await sendHookPush(u, push('cosmicReceipts'), at(27, '20:30'))).toBe(true); // a new local day
  });

  it('the owner can change the cap', async () => {
    for (const h of HOOKS) world.features.add(`hooks.${h}`);
    world.settings = { pushCap: 1 };
    expect(await pushCap()).toBe(1);
    expect(await sendHookPush(u, push('sankalpDiya'), at(26, '08:00'))).toBe(true);
    expect(await sendHookPush(u, push('gharKavach'), at(26, '09:00'))).toBe(false);
    world.settings = { pushCap: 0 };
    expect(await sendHookPush(u, push('mysteryDrop'), at(27, '09:00'))).toBe(false);
  });

  it('a reader can switch one hook off and keep the others', async () => {
    for (const h of HOOKS) world.features.add(`hooks.${h}`);
    await setHookPref(u, 'gharKavach', false);
    expect((await getHookPrefs(u)).off).toEqual(['gharKavach']);
    expect(await sendHookPush(u, push('gharKavach'), at(26, '09:00'))).toBe(false);
    expect(await sendHookPush(u, push('sankalpDiya'), at(26, '09:00'))).toBe(true);
    await setHookPref(u, 'gharKavach', true);
    expect((await getHookPrefs(u)).off).toEqual([]);
  });
});

describe('the scheduled run', () => {
  it('does nothing while every hook is off', async () => {
    expect(await runHooksCron({ now: at(26, '20:00') })).toMatchObject({ skipped: true, reason: 'off' });
  });

  it('sends the Rahasya push at 20:00 local to a reader who used it and has a new scroll, once', async () => {
    world.features.add('hooks.kundliRahasya');
    seed('u1', 'kundliRahasya', '-');
    const r1 = await runHooksCron({ now: at(26, '20:05') });
    expect(r1.pushed).toBe(1);
    expect(world.pushes[0]).toMatchObject({ type: 'hook_rahasya', link: '/hooks/rahasya' });
    expect(world.pushes[0]!.body).toContain('Scroll 3');
    const r2 = await runHooksCron({ now: at(26, '20:10') });
    expect(r2.pushed).toBe(0); // the same quarter hour again: the claim is taken
    expect(world.pushes).toHaveLength(1);
  });

  it('is silent outside the hook\'s quarter hour and for readers who never used the hook', async () => {
    world.features.add('hooks.kundliRahasya');
    seed('u1', 'kundliRahasya', '-');
    expect((await runHooksCron({ now: at(26, '21:00') })).pushed).toBe(0);
    expect((await runHooksCron({ now: at(26, '19:50') })).pushed).toBe(0);
    resetWorld();
    world.features.add('hooks.kundliRahasya');
    expect((await runHooksCron({ now: at(26, '20:05') })).pushed).toBe(0);
  });

  it('uses each reader\'s own clock', async () => {
    world.features.add('hooks.kundliRahasya');
    (globalThis as { __users?: Record<string, unknown> }).__users = { u1: mk('u1', 'America/New_York') };
    seed('u1', 'kundliRahasya', '-');
    // 20:05 in New York on 26 Oct 2026 (EDT, UTC-4) is 00:05 UTC on the 27th
    const r = await runHooksCron({ now: new Date('2026-10-27T00:05:00Z') });
    expect(r.pushed).toBe(1);
  });

  it('every hook has its own time: Kavach 05:00, Mystery 18:00, Receipts 20:30, Sleep 07:30, Diya when the window opens', async () => {
    for (const h of HOOKS) world.features.add(`hooks.${h}`);
    for (const h of ['gharKavach', 'mysteryDrop', 'cosmicReceipts', 'sankalpDiya']) seed('u1', h);
    world.sleep.set('u1|2026-10-24', { userId: 'u1', localDate: '2026-10-24', score: 3, nakshatraIndex: 1, signIndex: 1 });
    const types = async (when: string) => {
      world.pushes.length = 0;
      world.pushLog.length = 0;
      world.progress.forEach((_, k) => k.includes('|push|') && world.progress.delete(k));
      await runHooksCron({ now: at(26, when) });
      return world.pushes.map((p) => p.type);
    };
    expect(await types('05:02')).toEqual(['hook_kavach']);
    expect(await types('07:32')).toEqual(['hook_sleep']);
    expect(await types('18:01')).toEqual(['hook_mystery']);
    expect(await types('20:31')).toEqual(['hook_receipts']);
    expect(await types('11:41')).toEqual(['hook_diya']);
    expect(await types('13:00')).toEqual([]);
  });

  it('the daily cap holds across hooks', async () => {
    for (const h of HOOKS) world.features.add(`hooks.${h}`);
    world.settings = { pushCap: 1 };
    seed('u1', 'gharKavach');
    seed('u1', 'sankalpDiya');
    await runHooksCron({ now: at(26, '05:02') });
    await runHooksCron({ now: at(26, '11:41') });
    expect(world.pushes.map((p) => p.type)).toEqual(['hook_kavach']);
  });

  it('alarms the reader asked for go out when due, once, and ignore the cap', async () => {
    world.features.add('hooks.shubhLabh');
    world.settings = { pushCap: 0 };
    world.alarms.push({ id: 'a1', userId: 'u1', hook: 'shubhLabh', ref: '2026-10-26:700', fireAt: at(26, '11:35'), title: 'Your best window opens in 5 minutes', body: '11:40', link: '/panchang', sentAt: null });
    expect((await runHooksCron({ now: at(26, '11:34') })).alarms).toBe(0);
    expect((await runHooksCron({ now: at(26, '11:36') })).alarms).toBe(1);
    expect((await runHooksCron({ now: at(26, '11:37') })).alarms).toBe(0);
    expect(world.pushes).toHaveLength(1);
    expect(world.pushes[0]!.type).toBe('hook_shubh_labh');
  });

  it('an alarm for a reader whose hook has since been switched off is dropped, not sent', async () => {
    world.features.add('hooks.textTiming');
    world.alarms.push({ id: 'a2', userId: 'u1', hook: 'shubhLabh', ref: 'x', fireAt: at(26, '11:35'), title: 't', body: 'b', link: null, sentAt: null });
    await runHooksCron({ now: at(26, '11:36') });
    expect(world.pushes).toEqual([]);
  });

  it('a dry run counts but sends nothing', async () => {
    world.features.add('hooks.kundliRahasya');
    seed('u1', 'kundliRahasya', '-');
    const r = await runHooksCron({ now: at(26, '20:05'), dryRun: true });
    expect(r.considered).toBe(1);
    expect(r.pushed).toBe(0);
    expect(world.pushes).toEqual([]);
  });
});
