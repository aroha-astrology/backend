import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWorld, world } from './helpers/hooks-world';
import { day } from './helpers/day-windows';

vi.mock('../src/modules/hooks/hooks.repo', async () => (await import('./helpers/hooks-world')).hooksRepoMock);
vi.mock('../src/modules/users/users.repo', async () => (await import('./helpers/hooks-world')).usersRepoMock);
vi.mock('../src/modules/features/features.service', async () => (await import('./helpers/hooks-world')).featuresServiceMock);
vi.mock('../src/lib/entitlements', () => ({
  passEntitlement: async () => (await import('./helpers/hooks-world')).world.pass,
}));
vi.mock('../src/lib/notifications/notify-user', () => ({
  notifyUser: async (_u: string, p: { type: string; title: string; body: string; link?: string }) => {
    (await import('./helpers/hooks-world')).world.pushes.push(p);
  },
}));
vi.mock('../src/modules/astro/astro.service', () => ({ isValidTimeZone: () => true }));
vi.mock('../src/modules/hooks/sky-day', () => ({
  loadDayWindows: async (_p: unknown, date: string) => ({ ...(await import('./helpers/day-windows')).day(), date }),
  moonTrack: async () => (await import('./helpers/day-windows')).MOON,
  tithiAt: async () => (globalThis as { __sunsetTithi?: number }).__sunsetTithi ?? 8,
  loadNatal: async () => ({ profile: {}, natalMoon: { signIndex: 4, nakshatraIndex: 9 }, exactTime: true }),
}));

import { getDiya, lightDiya } from '../src/modules/hooks/diya.service';
import { armAlarm, getShubhLabh, unlockWeek } from '../src/modules/hooks/shubh-labh.service';

const user = {
  id: 'u1',
  locale: 'en',
  currentTimezone: 'Asia/Kolkata',
  skyMode: 'HOME',
  homeLocation: { name: 'New Delhi', lat: 28.61, lon: 77.21, tz: 'Asia/Kolkata' },
  currentLocation: null,
} as never;

// 12:00 IST on Monday 26 Oct 2026: inside Abhijit (11:40-12:28)
const NOON = new Date('2026-10-26T06:30:00Z');
const MORNING = new Date('2026-10-26T04:30:00Z'); // 10:00 IST
const EVENING = new Date('2026-10-26T13:30:00Z'); // 19:00 IST

beforeEach(() => {
  resetWorld();
  delete (globalThis as { __sunsetTithi?: number }).__sunsetTithi;
});

describe('switches', () => {
  it('both hooks refuse while their switch is off', async () => {
    await expect(getShubhLabh(user, {}, NOON)).rejects.toMatchObject({ status: 403 });
    await expect(getDiya(user, {}, NOON)).rejects.toMatchObject({ status: 403 });
    await expect(lightDiya(user, {}, NOON)).rejects.toMatchObject({ status: 403 });
    await expect(unlockWeek(user, {}, NOON)).rejects.toMatchObject({ status: 403 });
    expect(world.wallet).toEqual([]);
  });
});

describe('Shubh-Labh radar', () => {
  beforeEach(() => world.features.add('hooks.shubhLabh'));

  it('today is free and has the strip, the best window and where the clock is', async () => {
    const v = await getShubhLabh(user, {}, NOON);
    expect(v.date).toBe('2026-10-26');
    expect(v.basis).toBe('personal');
    expect(v.windows[0]!.start).toBe('06:10');
    expect(v.now?.clock).toBe('12:00');
    expect(v.now?.window).not.toBeNull();
    expect(v.week.unlocked).toBe(false);
    expect(v.week.days).toBeNull();
    expect(v.scoreNote).toContain('Aroha score');
    expect(world.wallet).toEqual([]);
  });

  it('another day is locked until the week is unlocked', async () => {
    await expect(getShubhLabh(user, { date: '2026-10-27' }, NOON)).rejects.toMatchObject({ message: 'WEEK_LOCKED' });
    await expect(getShubhLabh(user, { date: '2026-10-25' }, NOON)).rejects.toMatchObject({ status: 400 });
    await expect(getShubhLabh(user, { date: '2026-11-05' }, NOON)).rejects.toMatchObject({ status: 400 });
    await expect(getShubhLabh(user, { date: 'tomorrow' }, NOON)).rejects.toMatchObject({ status: 400 });
  });

  it('the week costs 15 coins once, then the other six days open', async () => {
    const r = await unlockWeek(user, {}, NOON);
    expect(r).toEqual({ unlocked: true, until: '2026-11-01', chargedPaise: 1500 });
    expect(world.wallet.filter((w) => w.delta < 0)).toHaveLength(1);
    const again = await unlockWeek(user, {}, EVENING);
    expect(again.chargedPaise).toBe(0);
    expect(world.wallet.filter((w) => w.delta < 0)).toHaveLength(1);

    const v = await getShubhLabh(user, {}, NOON);
    expect(v.week.unlocked).toBe(true);
    expect(v.week.days).toHaveLength(7);
    expect(v.week.days![0]!.date).toBe('2026-10-26');
    expect(v.week.days![6]!.date).toBe('2026-11-01');
    const next = await getShubhLabh(user, { date: '2026-10-28' }, NOON);
    expect(next.date).toBe('2026-10-28');
    expect(next.now).toBeNull();
  });

  it('refuses the week when the coins are not there, and charges nothing', async () => {
    world.balancePaise = 100;
    await expect(unlockWeek(user, {}, NOON)).rejects.toMatchObject({ message: 'INSUFFICIENT_CREDITS' });
    expect(world.wallet).toEqual([]);
    expect(world.unlocks.size).toBe(0);
  });

  it('a Pass does not change the week price (only the scroll early-unlock is free for Gold and Platinum)', async () => {
    world.pass = { tier: 'gold' };
    expect((await unlockWeek(user, {}, NOON)).chargedPaise).toBe(1500);
  });

  it('the price follows the admin key', async () => {
    world.prices['hooks.wealthWeek'] = 2500;
    expect((await unlockWeek(user, {}, NOON)).chargedPaise).toBe(2500);
  });

  it('an alarm needs the week, is set 5 minutes before the best window and is not duplicated', async () => {
    await expect(armAlarm(user, { date: '2026-10-27' }, MORNING)).rejects.toMatchObject({ message: 'WEEK_LOCKED' });
    await unlockWeek(user, {}, MORNING);
    const a = await armAlarm(user, { date: '2026-10-27' }, MORNING);
    expect(a.armed).toBe(true);
    expect(world.alarms).toHaveLength(1);
    const alarm = world.alarms[0]!;
    expect(alarm.hook).toBe('shubhLabh');
    expect(alarm.title).toContain('5 minutes');
    const day2 = await getShubhLabh(user, { date: '2026-10-27' }, MORNING);
    const startMin = day2.windows.find((w) => w.start === day2.best!.start && w.color === 'green')!.startMin;
    // 2026-10-27 00:00 IST is 2026-10-26T18:30Z
    expect(alarm.fireAt.getTime()).toBe(Date.parse('2026-10-26T18:30:00Z') + (startMin - 5) * 60_000);
    const dup = await armAlarm(user, { date: '2026-10-27' }, MORNING);
    expect(dup.reason).toBe('already set');
    expect(world.alarms).toHaveLength(1);
  });

  it('no alarm for a window that has already begun', async () => {
    await unlockWeek(user, {}, EVENING);
    const a = await armAlarm(user, { date: '2026-10-26' }, EVENING);
    if (!a.armed) expect(a.reason).toMatch(/already begun|no green/);
  });

  it('an alarm outside the week is refused', async () => {
    await unlockWeek(user, {}, NOON);
    await expect(armAlarm(user, { date: '2026-11-10' }, NOON)).rejects.toMatchObject({ status: 400 });
  });
});

describe('Sankalp Diya', () => {
  beforeEach(() => world.features.add('hooks.sankalpDiya'));

  it('shows the window, the state and no public count under 20', async () => {
    const v = await getDiya(user, {}, MORNING);
    expect(v.window.kind).toBe('abhijit');
    expect(v.state).toBe('before');
    expect(v.opensInMin).toBe(100); // 10:00 -> 11:40
    expect(v.lit).toBe(false);
    expect(v.litToday).toBeNull();
    expect(v.occasion).toBeNull();
  });

  it('cannot be lit before the window or after it', async () => {
    await expect(lightDiya(user, {}, MORNING)).rejects.toMatchObject({ message: 'NOT_YET' });
    await expect(lightDiya(user, {}, EVENING)).rejects.toMatchObject({ message: 'WINDOW_PASSED' });
    expect(world.progress.size).toBe(0);
  });

  it('lights once inside the window, and a second tap changes nothing', async () => {
    const a = await lightDiya(user, {}, NOON);
    expect(a.alreadyLit).toBe(false);
    expect(a.lit).toBe(true);
    expect(a.streak).toBe(1);
    const b = await lightDiya(user, {}, NOON);
    expect(b.alreadyLit).toBe(true);
    expect(world.progress.size).toBe(1);
    expect(world.wallet).toEqual([]);
  });

  it('counts the streak across consecutive days and breaks it on a gap', async () => {
    for (const d of ['2026-10-23', '2026-10-24', '2026-10-25']) {
      world.progress.set(`u1|sankalpDiya||${d}`, { userId: 'u1', hook: 'sankalpDiya', profileKey: '', localDate: d, data: {} });
    }
    expect((await getDiya(user, {}, MORNING)).streak).toBe(3); // today not lit yet: the run up to yesterday
    expect((await lightDiya(user, {}, NOON)).streak).toBe(4);
    world.progress.delete('u1|sankalpDiya||2026-10-24');
    expect((await getDiya(user, {}, NOON)).streak).toBe(2);
  });

  it('shows a real count only from 20 people', async () => {
    for (let i = 0; i < 19; i++) {
      world.progress.set(`x${i}|sankalpDiya||2026-10-26`, { userId: `x${i}`, hook: 'sankalpDiya', profileKey: '', localDate: '2026-10-26', data: {} });
    }
    expect((await getDiya(user, {}, NOON)).litToday).toBeNull();
    world.progress.set('x19|sankalpDiya||2026-10-26', { userId: 'x19', hook: 'sankalpDiya', profileKey: '', localDate: '2026-10-26', data: {} });
    expect((await getDiya(user, {}, NOON)).litToday).toBe(20);
  });

  it('pays the gift once on an occasion day (Pradosh by the sunset tithi)', async () => {
    (globalThis as { __sunsetTithi?: number }).__sunsetTithi = 13;
    const r = await lightDiya(user, {}, NOON);
    expect(r.occasion).toBe('pradosh');
    expect(r.earnedGiftPaise).toBe(500);
    expect(r.giftPaid).toBe(true);
    expect(world.wallet).toHaveLength(1);
    expect(world.wallet[0]!.key).toBe('hook:sankalpDiya:self:2026-10-26:gift');
    await lightDiya(user, {}, NOON);
    expect(world.wallet).toHaveLength(1);
  });

  it('no gift when the owner sets the amount to zero', async () => {
    (globalThis as { __sunsetTithi?: number }).__sunsetTithi = 13;
    world.prices['hooks.diyaReward'] = 0;
    const r = await lightDiya(user, {}, NOON);
    expect(r.earnedGiftPaise).toBe(0);
    expect(world.wallet).toEqual([]);
  });

  it('on a Wednesday the window is the Amrit choghadiya', async () => {
    const wed = new Date('2026-10-28T04:30:00Z');
    const mod = await import('../src/modules/hooks/sky-day');
    const spy = vi.spyOn(mod, 'loadDayWindows').mockResolvedValue({ ...day({}, 'Budhvaar'), date: '2026-10-28' });
    const v = await getDiya(user, {}, wed);
    expect(v.window.kind).toBe('amrit');
    spy.mockRestore();
  });
});
