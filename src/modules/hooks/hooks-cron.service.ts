// =============================================================================
// Daily-return hooks — the scheduled pushes (v7 spec, Sprint 6)
// =============================================================================
// Meant to run every 15 minutes. Each hook has one local time of day; a reader is looked at only while
// their own clock is inside that quarter hour, and only if they have used that hook before. A push is
// claimed with a one-shot marker row before it is sent, so a retried run never repeats it. The daily
// cap (3 unless the owner changed it), the reader's per-hook switch, quiet hours and the "hooks"
// notification category are applied in sendHookPush. Paid alarms (the Shubh-Labh window, the text
// peak) are separate: the reader asked for them, so they are not counted against the cap.
// =============================================================================

import { logger } from '../../lib/logger.js';
import { acquire, release } from '../../lib/cache/locks.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { normalizePushLang } from '../../lib/push-lang.js';
import { dateInZone } from '../../lib/user-time-zone.js';
import { isFeatureOnGlobally } from '../features/features.service.js';
import { findActiveUserById } from '../users/users.repo.js';
import { localClock } from '../widgets/live-now.js';
import type { UserRow } from '../../db/schema.js';
import { getDiya } from './diya.service.js';
import { hookPushCopy } from './hooks-copy.js';
import { hookOn, resolvePlace, sendHookPush } from './hooks-common.js';
import { addDays, HOOK_PUSH_TYPE, HOOKS, hookSwitch, type HookName } from './hooks-rules.js';
import { claimAlarm, createProgressOnce, dueAlarms, getProgress, listSleep, mergeProgress, usersWithHook, usersWithRecentSleep } from './hooks.repo.js';
import { getKavach } from './kavach.service.js';
import { getMystery } from './mystery.service.js';
import { refreshRahasya } from './rahasya.service.js';
import { getReceipts } from './receipts.service.js';

export interface HooksCronResult {
  skipped: boolean;
  reason?: string;
  considered: number;
  pushed: number;
  alarms: number;
}

/** Local minute of day each hook pushes at, and the quarter hour it may be sent in. */
export const PUSH_MINUTES: Partial<Record<HookName, number>> = {
  gharKavach: 5 * 60,
  sankalpDiya: -1, // the minute the diya window opens (varies by day)
  sleepSync: 7 * 60 + 30,
  mysteryDrop: 18 * 60,
  kundliRahasya: 20 * 60,
  cosmicReceipts: 20 * 60 + 30,
};
export const WINDOW_MIN = 15;

const inQuarter = (minute: number, target: number): boolean => minute >= target && minute < target + WINDOW_MIN;

/** One-shot marker: true when this call took it. */
async function claim(userId: string, hook: HookName, localDate: string): Promise<boolean> {
  return createProgressOnce(userId, hook, 'push', localDate, { at: new Date().toISOString() });
}

async function langOf(user: UserRow, all: boolean) {
  return normalizePushLang(user.locale, all);
}

type Build = (user: UserRow, now: Date, lang: Awaited<ReturnType<typeof langOf>>) => Promise<{ title: string; body: string; link: string } | null>;

const BUILDERS: Partial<Record<HookName, Build>> = {
  gharKavach: async (user, now, lang) => {
    const v = await getKavach(user, {}, now);
    if (!v.today || v.today.done) return null;
    const c = hookPushCopy(lang, 'kavach', { name: v.today.name, beads: v.today.beadsTarget, planet: v.today.planetHindi });
    return { ...c, link: '/hooks/ghar-kavach' };
  },
  sankalpDiya: async (user, now, lang) => {
    const v = await getDiya(user, {}, now);
    const minute = localClock(now, v.place.tz).minutes;
    if (v.lit || v.state !== 'open' || minute >= v.window.startMin + WINDOW_MIN) return null;
    return { ...hookPushCopy(lang, 'diya', { start: v.window.start, end: v.window.end, why: v.window.why }), link: '/hooks/sankalp-diya' };
  },
  sleepSync: async (user, now, lang) => {
    const place = resolvePlace(user, {});
    const date = dateInZone(now, place.tz);
    const last = (await listSleep(user.id, 1))[0];
    if (last?.localDate === date) return null; // already logged this morning
    return { ...hookPushCopy(lang, 'sleep'), link: '/hooks/sleep-sync' };
  },
  mysteryDrop: async (user, now, lang) => {
    const v = await getMystery(user, {}, now);
    if (v.state !== 'ready' || v.cards.every((c) => c.scratched)) return null;
    return { ...hookPushCopy(lang, 'mystery'), link: '/hooks/mystery' };
  },
  kundliRahasya: async (user, now, lang) => {
    const v = await refreshRahasya(user, now);
    const marker = await getProgress(user.id, 'kundliRahasya', 'push', '-');
    const known = (marker?.data as { count?: number } | undefined)?.count ?? 1;
    await mergeProgress(user.id, 'kundliRahasya', 'push', '-', { count: Math.max(known, v.openCount) });
    if (v.openCount <= known) return null;
    const n = Math.max(...v.slots.filter((s) => s.via === 'daily').map((s) => s.n));
    return { ...hookPushCopy(lang, 'rahasya', { n, title: v.slots[n - 1]!.title }), link: '/hooks/rahasya' };
  },
  cosmicReceipts: async (user, now, lang) => {
    const v = await getReceipts(user, {}, now);
    if (v.cards.every((c) => c.verdict !== null || c.status === 'upcoming')) return null;
    return { ...hookPushCopy(lang, 'receipts'), link: '/hooks/cosmic-receipts' };
  },
};

export async function runHooksCron(opts: { now?: Date; dryRun?: boolean } = {}): Promise<HooksCronResult> {
  const now = opts.now ?? new Date();
  const result: HooksCronResult = { skipped: false, considered: 0, pushed: 0, alarms: 0 };

  const anyOn = (await Promise.all(HOOKS.map((h) => isFeatureOnGlobally(hookSwitch(h)).catch(() => false)))).some(Boolean);
  if (!anyOn) return { ...result, skipped: true, reason: 'off' };

  const slot = `${now.toISOString().slice(0, 13)}:${Math.floor(now.getUTCMinutes() / WINDOW_MIN)}`;
  const lock = await acquire('hooks-cron', slot, 600);
  if (!lock.ok) return { ...result, skipped: true, reason: 'already-running' };
  const allLanguages = await isFeatureOnGlobally('lang.pushAll').catch(() => false);

  try {
    for (const hook of Object.keys(BUILDERS) as HookName[]) {
      if (!(await isFeatureOnGlobally(hookSwitch(hook)).catch(() => false))) continue;
      const ids =
        hook === 'sleepSync'
          ? await usersWithRecentSleep(addDays(now.toISOString().slice(0, 10), -10))
          : await usersWithHook(hook);
      for (const id of ids) {
        try {
          const user = await findActiveUserById(id);
          if (!user || !(await hookOn(user.id, hook))) continue;
          const zone = resolvePlace(user, {}).tz; // the same clock the hook screens use
          const minute = localClock(now, zone).minutes;
          let target = PUSH_MINUTES[hook]!;
          if (target < 0) {
            // the diya window opens at a different minute each day: ask for it
            const v = await getDiya(user, {}, now);
            target = v.window.startMin;
          }
          if (!inQuarter(minute, target)) continue;
          result.considered++;
          if (opts.dryRun) continue;
          const date = dateInZone(now, zone);
          if (!(await claim(user.id, hook, date))) continue;
          const copy = await BUILDERS[hook]!(user, now, await langOf(user, allLanguages));
          if (!copy) continue;
          if (await sendHookPush(user, { hook, ...copy }, now)) result.pushed++;
        } catch (err) {
          logger.warn({ err, userId: id, hook }, 'hooks-cron: reader skipped');
        }
      }
    }

    // alarms the reader asked for: not counted against the cap
    for (const a of await dueAlarms(now)) {
      try {
        if (opts.dryRun || !(await claimAlarm(a.id, now))) continue;
        const user = await findActiveUserById(a.userId);
        if (!user || !(await hookOn(user.id, a.hook as HookName))) continue;
        await notifyUser(a.userId, { title: a.title, body: a.body, type: HOOK_PUSH_TYPE[a.hook as HookName] ?? 'hook_shubh_labh', link: a.link ?? undefined });
        result.alarms++;
      } catch (err) {
        logger.warn({ err, alarmId: a.id }, 'hooks-cron: alarm skipped');
      }
    }
  } finally {
    await release('hooks-cron', slot, lock.owner).catch(() => {});
  }
  return result;
}
