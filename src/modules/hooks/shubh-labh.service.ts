// =============================================================================
// Shubh-Labh radar (v7 spec, Sprint 6, switch `hooks.shubhLabh`, ships off)
// =============================================================================
// A 24-hour green/amber/red strip of the best windows for money matters, from the day's hora,
// choghadiya, Rahu Kaal and (with a birth chart) the reader's own Tara and Moon strength.
//   - Today is free.
//   - The next 6 days and a "tell me 5 minutes before" alarm are one unlock (hooks.wealthWeek, coins).
// The score is an Aroha score (weights in lib/astro-tools/daily-hooks/weights.ts), not a classical rule.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import {
  buildShubhLabhStrip,
  clock,
  nextGreen,
  windowAt,
  type ShubhLabhStrip,
  type StripWindow,
} from '../../lib/astro-tools/daily-hooks/windows.js';
import { normalizePushLang } from '../../lib/push-lang.js';
import { zonedInstant } from '../../lib/user-time-zone.js';
import { isFeatureOnGlobally, priceOf } from '../features/features.service.js';
import { hookPushCopy } from './hooks-copy.js';
import { localDateFor, requireHook, resolvePlace, spendOnce, type Place, type PlaceQuery } from './hooks-common.js';
import { addDays, daysBetween, refFor } from './hooks-rules.js';
import { insertAlarm, listAlarms, listProgress, mergeProgress } from './hooks.repo.js';
import { loadDayWindows, loadNatal, moonTrack } from './sky-day.js';

const HOOK = 'shubhLabh' as const;
const WEEK_DAYS = 7;

export interface ShubhLabhQuery extends PlaceQuery {
  date?: string;
}

export interface ShubhLabhDay {
  date: string;
  place: { name: string | null; assumed: boolean; tz: string };
  basis: ShubhLabhStrip['basis'];
  sunrise: string;
  windows: { start: string; end: string; startMin: number; endMin: number; color: string; score: number; why: string[] }[];
  best: { start: string; end: string; score: number; why: string[] } | null;
  /** Only for today: the window the clock is in and the next green one. */
  now: {
    minute: number;
    clock: string;
    window: { color: string; score: number; start: string; end: string } | null;
    nextGreen: { start: string; end: string; score: number; inMin: number } | null;
  } | null;
  /** Always "Aroha score" wording for the Why sheet; no classical authority is claimed. */
  scoreNote: string;
}

export interface ShubhLabhView extends ShubhLabhDay {
  week: {
    unlocked: boolean;
    until: string | null;
    pricePaise: number;
    days: { date: string; best: { start: string; end: string; score: number } | null; green: number }[] | null;
    alarms: { date: string; at: string; start: string }[];
  };
}

const NOTE = 'Aroha score, built from the hora, the choghadiya, Rahu Kaal and Gulika, Abhijit, and (with your birth chart) your Tara and Moon strength. It is a guide for timing, not a classical rule or a promise.';

const brief = (w: StripWindow) => ({ start: w.start, end: w.end, score: w.score, why: w.why });

function minuteOf(now: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return Number(parts.hour) * 60 + Number(parts.minute);
}

async function dayFor(user: UserRow, place: Place, date: string, now: Date, withNow: boolean): Promise<ShubhLabhDay> {
  const dayW = await loadDayWindows(place, date);
  const natal = await loadNatal(user, now);
  const track = await moonTrack(place, date, dayW.sunrise);
  const strip = buildShubhLabhStrip(dayW, track, natal.natalMoon);
  let nowBlock: ShubhLabhDay['now'] = null;
  if (withNow) {
    let minute = minuteOf(now, place.tz);
    if (minute < strip.sunriseMin) minute += 1440; // the small hours belong to the previous Hindu day, handled by the caller
    const w = windowAt(strip, minute);
    const ng = nextGreen(strip, minute);
    nowBlock = {
      minute,
      clock: clock(minute),
      window: w ? { color: w.color, score: w.score, start: w.start, end: w.end } : null,
      nextGreen: ng ? { start: ng.window.start, end: ng.window.end, score: ng.window.score, inMin: ng.inMin } : null,
    };
  }
  return {
    date,
    place: { name: place.name, assumed: place.assumed, tz: place.tz },
    basis: strip.basis,
    sunrise: dayW.sunrise,
    windows: strip.windows.map((w) => ({ start: w.start, end: w.end, startMin: w.startMin, endMin: w.endMin, color: w.color, score: w.score, why: w.why })),
    best: strip.best ? brief(strip.best) : null,
    now: nowBlock,
    scoreNote: NOTE,
  };
}

/** The day after which the reader's unlocked week ends, or null when no week is unlocked today. */
export async function weekUntil(userId: string, today: string): Promise<string | null> {
  const rows = await listProgress(userId, HOOK, '', addDays(today, -(WEEK_DAYS - 1)), today);
  const open = rows.filter((r) => (r.data as { week?: boolean }).week === true).map((r) => r.localDate);
  if (open.length === 0) return null;
  const latest = open.sort().at(-1)!;
  return addDays(latest, WEEK_DAYS - 1);
}

export async function getShubhLabh(user: UserRow, q: ShubhLabhQuery, now: Date = new Date()): Promise<ShubhLabhView> {
  await requireHook(user.id, HOOK);
  const place = resolvePlace(user, q);
  const today = localDateFor(place.tz, now);
  const until = await weekUntil(user.id, today);
  const price = await weekPrice(user.id);

  let date = q.date ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Errors.badRequest('date must be YYYY-MM-DD');
  const offset = daysBetween(today, date);
  if (offset < 0 || offset >= WEEK_DAYS) throw Errors.badRequest('Only today and the next 6 days are available');
  if (offset > 0 && !until) throw Errors.forbidden('WEEK_LOCKED');

  // Before sunrise the strip that is running is still yesterday's.
  let withNow = date === today;
  let day = await dayFor(user, place, date, now, withNow);
  if (withNow && day.now && day.now.minute >= 1440 && q.date === undefined) {
    date = addDays(today, -1);
    day = await dayFor(user, place, date, now, true);
    withNow = true;
  }

  let days: ShubhLabhView['week']['days'] = null;
  if (until) {
    days = [];
    for (let i = 0; i < WEEK_DAYS; i++) {
      const d = addDays(today, i);
      const one = d === day.date ? day : await dayFor(user, place, d, now, false);
      days.push({ date: d, best: one.best ? { start: one.best.start, end: one.best.end, score: one.best.score } : null, green: one.windows.filter((w) => w.color === 'green').length });
    }
  }
  const alarms = (await listAlarms(user.id, HOOK, new Date(now.getTime() - 3_600_000))).map((a) => ({
    date: a.ref.split(':')[0]!,
    at: a.fireAt.toISOString(),
    start: a.body.match(/\d\d:\d\d/)?.[0] ?? '',
  }));
  return { ...day, week: { unlocked: Boolean(until), until, pricePaise: price, days, alarms } };
}

async function weekPrice(userId: string): Promise<number> {
  return priceOf(userId, 'hooks.wealthWeek', 1500);
}

/** Opens the next 6 days and the alarms for 7 days; one charge, once per local day it is asked on. */
export async function unlockWeek(user: UserRow, q: PlaceQuery, now: Date = new Date()): Promise<{ unlocked: true; until: string; chargedPaise: number }> {
  await requireHook(user.id, HOOK);
  const place = resolvePlace(user, q);
  const today = localDateFor(place.tz, now);
  const existing = await weekUntil(user.id, today);
  if (existing) return { unlocked: true, until: existing, chargedPaise: 0 };
  const res = await spendOnce(user, {
    hook: HOOK,
    ref: refFor(HOOK, '', today, 'week'),
    priceKey: 'hooks.wealthWeek',
    fallbackPaise: 1500,
    reason: 'hook_shubh_labh_week',
  });
  await mergeProgress(user.id, HOOK, '', today, { week: true });
  return { unlocked: true, until: addDays(today, WEEK_DAYS - 1), chargedPaise: res.chargedPaise };
}

/** "Tell me 5 minutes before" the day's best window. Needs the unlocked week. */
export async function armAlarm(
  user: UserRow,
  q: PlaceQuery & { date: string },
  now: Date = new Date(),
): Promise<{ armed: boolean; at: string | null; reason?: string }> {
  await requireHook(user.id, HOOK);
  const place = resolvePlace(user, q);
  const today = localDateFor(place.tz, now);
  const until = await weekUntil(user.id, today);
  if (!until) throw Errors.forbidden('WEEK_LOCKED');
  const offset = daysBetween(today, q.date);
  if (offset < 0 || offset >= WEEK_DAYS || q.date > until) throw Errors.badRequest('That day is outside your week');
  const day = await dayFor(user, place, q.date, now, false);
  const best = day.best;
  if (!best) return { armed: false, at: null, reason: 'no green window that day' };
  const bestWin = day.windows.find((w) => w.start === best.start && w.color === 'green')!;
  const fireAt = zonedInstant(q.date, place.tz, bestWin.startMin - 5);
  if (fireAt.getTime() <= now.getTime()) return { armed: false, at: null, reason: 'that window has already begun' };
  const copy = hookPushCopy(normalizePushLang(user.locale, await isFeatureOnGlobally('lang.pushAll').catch(() => false)), 'shubhLabhAlarm', {
    label: 'Your best window', start: best.start, end: best.end, score: best.score,
  });
  const created = await insertAlarm({
    userId: user.id,
    hook: HOOK,
    ref: `${q.date}:${bestWin.startMin}`,
    fireAt,
    title: copy.title,
    body: copy.body,
    link: '/hooks/shubh-labh',
  });
  return { armed: true, at: fireAt.toISOString(), reason: created ? undefined : 'already set' };
}
