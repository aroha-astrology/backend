// =============================================================================
// Kundli Rahasya (v7 spec, Sprint 6, switch `hooks.kundliRahasya`, ships off)
// =============================================================================
// 17 scrolls about the reader's own chart. Scroll 1 is open at once. After that one more opens each
// evening (20:00 on the reader's clock) for every day they showed up: the Morning Ritual was done
// (or, while the ritual is off for them, they opened this page). Any locked scroll can be opened at
// once for coins (hooks.rahasyaUnlock), free for Gold and Platinum. The content comes from
// lib/astro-tools/daily-hooks/rahasya.ts and never from a model.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { calculateAshtakavarga } from '../../lib/astro-engine/calculations/ashtakavarga.js';
import { buildScroll, SCROLL_COUNT, SCROLL_TITLES, type Scroll, type ScrollChart } from '../../lib/astro-tools/daily-hooks/rahasya.js';
import { priceOf, isFeatureOn } from '../features/features.service.js';
import { loadBondChart } from '../bonds/bonds.service.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { findCompletion } from '../ritual/ritual.repo.js';
import { localDateFor, requireHook, resolvePlace, spendOnce, type PlaceQuery } from './hooks-common.js';
import { addDays, daysBetween, refFor } from './hooks-rules.js';
import { getProgress, mergeProgress } from './hooks.repo.js';

const HOOK = 'kundliRahasya' as const;
export const EVENING_MINUTE = 20 * 60;
const LOOKBACK_DAYS = 40;

interface State {
  startDate: string;
  earnedDates: string[];
  paid: number[];
  /** Day through which earning has been checked. */
  checkedThrough: string | null;
}

export interface ScrollSlot {
  n: number;
  title: string;
  status: 'open' | 'locked';
  /** How it opened: the first scroll, the daily schedule, or coins. */
  via: 'first' | 'daily' | 'paid' | null;
}

export interface RahasyaView {
  date: string;
  profileId: string | null;
  slots: ScrollSlot[];
  openCount: number;
  /** The next scroll the schedule will open, and what it needs. */
  next: { n: number; needs: 'ritual' | 'visit'; ritualDoneToday: boolean; opensAtLocal: string } | null;
  unlockPricePaise: number;
  /** The scroll asked for, when it is open. */
  scroll: Scroll | null;
}

function minuteOf(now: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return Number(parts.hour) * 60 + Number(parts.minute);
}

async function readState(userId: string, profileKey: string, today: string): Promise<State> {
  const row = await getProgress(userId, HOOK, profileKey, '-');
  const d = (row?.data ?? {}) as Partial<State>;
  return {
    startDate: d.startDate ?? today,
    earnedDates: Array.isArray(d.earnedDates) ? d.earnedDates : [],
    paid: Array.isArray(d.paid) ? d.paid : [],
    checkedThrough: d.checkedThrough ?? null,
  };
}

const scheduled = (s: State): number => Math.min(SCROLL_COUNT, 1 + new Set(s.earnedDates).size);

export function openSet(s: State): Set<number> {
  const out = new Set<number>();
  for (let n = 1; n <= scheduled(s); n++) out.add(n);
  for (const n of s.paid) out.add(n);
  return out;
}

/** Did the reader show up on `date`? The ritual when it is on for them, else a visit to this page. */
async function showedUp(user: UserRow, profileKey: string, date: string, ritualOn: boolean): Promise<boolean> {
  if (ritualOn) return Boolean(await findCompletion(user.id, date));
  return Boolean(await getProgress(user.id, HOOK, `visit:${profileKey}`, date));
}

/** Adds the days that have earned a scroll since the last check; the evening rule decides which days are over. */
export async function settleDays(user: UserRow, profileKey: string, today: string, minute: number, st: State): Promise<{ state: State; changed: boolean }> {
  const ritualOn = await isFeatureOn(user.id, 'ritual.morning');
  const earned = new Set(st.earnedDates);
  const start = st.startDate > addDays(today, -LOOKBACK_DAYS) ? st.startDate : addDays(today, -LOOKBACK_DAYS);
  let changed = false;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (earned.has(d)) continue;
    if (d === today && minute < EVENING_MINUTE) continue; // tonight's scroll opens at 20:00
    if (d < st.startDate) continue;
    if (await showedUp(user, profileKey, d, ritualOn)) {
      earned.add(d);
      changed = true;
    }
  }
  const next: State = { ...st, earnedDates: [...earned].sort(), checkedThrough: today };
  return { state: next, changed };
}

async function chartFor(user: UserRow, now: Date): Promise<{ chart: ScrollChart; profileKey: string } | null> {
  const profile = await resolveActiveProfileContext(user);
  const loaded = await loadBondChart(user, profile, now).catch(() => null);
  if (!loaded) return null;
  const data = loaded.chartData as { planets: ScrollChart['planets']; ascendant?: { signIndex: number; degree: number } };
  const av = calculateAshtakavarga(data as never);
  const md = loaded.ctx.dasha.mahadasha;
  const ad = loaded.ctx.dasha.antardasha;
  return {
    profileKey: profile.birthProfileId ?? '',
    chart: {
      planets: data.planets,
      ascendant: data.ascendant ? { signIndex: data.ascendant.signIndex, degree: data.ascendant.degree } : null,
      exactTime: profile.birthTimeAccuracy === 'exact',
      bhinna: av.bhinna.map((b) => ({ planet: b.planet, bindus: b.bindus })),
      sarva: av.sarva.bindus,
      dasha: {
        mahadasha: md ? { planet: md.planet, startDate: md.startDate, endDate: md.endDate } : null,
        antardasha: ad ? { planet: ad.planet, startDate: ad.startDate, endDate: ad.endDate } : null,
      },
      asOf: now.toISOString(),
    },
  };
}

async function viewFor(user: UserRow, q: PlaceQuery, n: number | null, now: Date, markVisit: boolean): Promise<RahasyaView> {
  await requireHook(user.id, HOOK);
  const loaded = await chartFor(user, now);
  if (!loaded) throw Errors.unprocessable('NO_CHART');
  const place = resolvePlace(user, q);
  const today = localDateFor(place.tz, now);
  const { profileKey, chart } = loaded;

  if (markVisit) await mergeProgress(user.id, HOOK, `visit:${profileKey}`, today, { visited: true });
  let st = await readState(user.id, profileKey, today);
  const settled = await settleDays(user, profileKey, today, minuteOf(now, place.tz), st);
  st = settled.state;
  if (settled.changed || !(await getProgress(user.id, HOOK, profileKey, '-'))) {
    await mergeProgress(user.id, HOOK, profileKey, '-', { ...st });
  }

  const open = openSet(st);
  const sched = scheduled(st);
  const slots: ScrollSlot[] = Array.from({ length: SCROLL_COUNT }, (_, i) => {
    const k = i + 1;
    const isOpen = open.has(k);
    return {
      n: k,
      title: isOpen ? SCROLL_TITLES[i]! : `Scroll ${k}`,
      status: isOpen ? 'open' : 'locked',
      via: !isOpen ? null : k === 1 ? 'first' : k <= sched ? 'daily' : 'paid',
    };
  });
  const ritualOn = await isFeatureOn(user.id, 'ritual.morning');
  const nextN = Array.from({ length: SCROLL_COUNT }, (_, i) => i + 1).find((k) => k > sched);
  return {
    date: today,
    profileId: profileKey || null,
    slots,
    openCount: open.size,
    next: nextN
      ? {
          n: nextN,
          needs: ritualOn ? 'ritual' : 'visit',
          ritualDoneToday: ritualOn ? Boolean(await findCompletion(user.id, today)) : false,
          opensAtLocal: '20:00',
        }
      : null,
    unlockPricePaise: await priceOf(user.id, 'hooks.rahasyaUnlock', 1500),
    scroll: n !== null && open.has(n) ? buildScroll(n, chart) : null,
  };
}

export async function getRahasya(user: UserRow, q: PlaceQuery & { n?: number }, now: Date = new Date()): Promise<RahasyaView> {
  if (q.n !== undefined && (!Number.isInteger(q.n) || q.n < 1 || q.n > SCROLL_COUNT)) throw Errors.badRequest('n must be 1 to 17');
  return viewFor(user, q, q.n ?? null, now, true);
}

/** Opens one locked scroll now. Gold and Platinum pay nothing; the charge and the unlock are one-shot per scroll. */
export async function unlockScroll(user: UserRow, q: PlaceQuery & { n: number }, now: Date = new Date()): Promise<RahasyaView & { chargedPaise: number }> {
  if (!Number.isInteger(q.n) || q.n < 1 || q.n > SCROLL_COUNT) throw Errors.badRequest('n must be 1 to 17');
  const before = await viewFor(user, q, null, now, true);
  const profileKey = before.profileId ?? '';
  if (before.slots[q.n - 1]!.status === 'open') return { ...(await viewFor(user, q, q.n, now, false)), chargedPaise: 0 };

  const res = await spendOnce(user, {
    hook: HOOK,
    ref: refFor(HOOK, profileKey, 'scroll', String(q.n)),
    priceKey: 'hooks.rahasyaUnlock',
    fallbackPaise: 1500,
    freeForPass: true,
    reason: 'hook_rahasya_unlock',
  });
  const place = resolvePlace(user, q);
  const st = await readState(user.id, profileKey, localDateFor(place.tz, now));
  await mergeProgress(user.id, HOOK, profileKey, '-', { paid: [...new Set([...st.paid, q.n])].sort((a, b) => a - b) });
  return { ...(await viewFor(user, q, q.n, now, false)), chargedPaise: res.chargedPaise };
}

/** Days since the reader started (day 1 is the first). */
export const dayNumber = (startDate: string, today: string): number => daysBetween(startDate, today) + 1;
