// =============================================================================
// Sankalp Diya (v7 spec, Sprint 6, switch `hooks.sankalpDiya`, ships off)
// =============================================================================
// One diya a day, lit inside the day's best window: Abhijit Muhurta, or on a Wednesday the Amrit (else
// Shubh) choghadiya. A streak of days lit, a REAL count of diyas lit that day (shown from 20 people,
// never invented), and a small coin gift on Ekadashi, Pradosh, Purnima and Amavasya (hooks.diyaReward).
// Lighting is one-shot per local day: a second tap or a second device changes nothing.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { diyaOccasion, diyaWindow, toMin, type DiyaOccasion, type DiyaWindow } from '../../lib/astro-tools/daily-hooks/windows.js';
import { zonedInstant } from '../../lib/user-time-zone.js';
import { payoutOf } from '../features/features.service.js';
import { addWalletBalance } from '../users/users.repo.js';
import { localDateFor, requireHook, resolvePlace, type PlaceQuery } from './hooks-common.js';
import { addDays, publicCount, refFor, runEndingOn, walletKeyFor } from './hooks-rules.js';
import { countProgress, createProgressOnce, listProgress, mergeProgress } from './hooks.repo.js';
import { loadDayWindows, tithiAt } from './sky-day.js';

const HOOK = 'sankalpDiya' as const;

export interface DiyaView {
  date: string;
  place: { name: string | null; assumed: boolean; tz: string };
  window: DiyaWindow;
  /** 'before' the window opens, 'open' while it runs, 'closed' once it has passed. */
  state: 'before' | 'open' | 'closed';
  opensInMin: number | null;
  lit: boolean;
  litAt: string | null;
  /** Days in a row lit, up to today (or up to yesterday while today is still to do). */
  streak: number;
  occasion: DiyaOccasion | null;
  /** The gift in paise on an occasion day (0 when the gift switch is off). */
  giftPaise: number;
  giftPaid: boolean;
  /** Readers who lit a diya today; null below 20 (a tiny number would say little). */
  litToday: number | null;
}

export interface DiyaLightResult extends DiyaView {
  alreadyLit: boolean;
  earnedGiftPaise: number;
}

function minuteOf(now: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export function stateOf(w: DiyaWindow, minute: number): DiyaView['state'] {
  if (minute < w.startMin) return 'before';
  return minute < w.endMin ? 'open' : 'closed';
}

async function build(user: UserRow, q: PlaceQuery, now: Date): Promise<DiyaView> {
  const place = resolvePlace(user, q);
  const date = localDateFor(place.tz, now);
  const windows = await loadDayWindows(place, date);
  const window = diyaWindow(windows);
  const sunsetTithi = await tithiAt(zonedInstant(date, place.tz, toMin(windows.sunset)));
  const occasion = diyaOccasion(windows.tithiNumber, sunsetTithi);
  const minute = minuteOf(now, place.tz);

  const rows = await listProgress(user.id, HOOK, '', addDays(date, -120), date);
  const dates = new Set(rows.map((r) => r.localDate));
  const today = rows.find((r) => r.localDate === date);
  const streak = dates.has(date) ? runEndingOn(dates, date) : runEndingOn(dates, addDays(date, -1));
  const gift = occasion ? await payoutOf(user.id, 'hooks.diyaReward', 500) : 0;

  return {
    date,
    place: { name: place.name, assumed: place.assumed, tz: place.tz },
    window,
    state: stateOf(window, minute),
    opensInMin: minute < window.startMin ? window.startMin - minute : null,
    lit: Boolean(today),
    litAt: (today?.data as { litAt?: string } | undefined)?.litAt ?? null,
    streak,
    occasion,
    giftPaise: gift,
    giftPaid: Boolean((today?.data as { giftPaid?: boolean } | undefined)?.giftPaid),
    litToday: publicCount(await countProgress(HOOK, date)),
  };
}

export async function getDiya(user: UserRow, q: PlaceQuery, now: Date = new Date()): Promise<DiyaView> {
  await requireHook(user.id, HOOK);
  return build(user, q, now);
}

export async function lightDiya(user: UserRow, q: PlaceQuery, now: Date = new Date()): Promise<DiyaLightResult> {
  await requireHook(user.id, HOOK);
  const before = await build(user, q, now);
  if (before.lit) return { ...before, alreadyLit: true, earnedGiftPaise: 0 };
  if (before.state === 'before') throw Errors.conflict('NOT_YET');
  if (before.state === 'closed') throw Errors.conflict('WINDOW_PASSED');

  const first = await createProgressOnce(user.id, HOOK, '', before.date, {
    litAt: now.toISOString(),
    window: before.window.kind,
    occasion: before.occasion,
  });
  if (!first) {
    // Another device lit it a moment ago.
    return { ...(await build(user, q, now)), alreadyLit: true, earnedGiftPaise: 0 };
  }

  let earned = 0;
  if (before.occasion && before.giftPaise > 0) {
    const paid = await addWalletBalance(user.id, before.giftPaise, 'sankalp_diya_gift', {
      idempotencyKey: walletKeyFor(refFor(HOOK, '', before.date, 'gift')),
    });
    if (paid) {
      earned = before.giftPaise;
      await mergeProgress(user.id, HOOK, '', before.date, { giftPaid: true });
    }
  }
  return { ...(await build(user, q, now)), alreadyLit: false, earnedGiftPaise: earned };
}
