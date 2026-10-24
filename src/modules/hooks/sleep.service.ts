// =============================================================================
// Sleep Sync (v7 spec, Sprint 6, switch `hooks.sleepSync`, ships off)
// =============================================================================
// One manual 1-5 score each morning for the night before, shown beside where the Moon was that night
// (its nakshatra and sign, and the Moon's Ashtakavarga bindus in that sign of the reader's chart). After
// 7 nights a first top-3 / bottom-3 of nakshatras; a 30-day pattern report costs coins (hooks.sleepReport).
// Manual only: no device data, no health claims, and the words say it is a reflection, not a reading.
// =============================================================================

import { NAKSHATRAS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { calculateAshtakavarga } from '../../lib/astro-engine/calculations/ashtakavarga.js';
import { calculatePlanetPositions } from '../../lib/astro-engine/calculations/planetPositions.js';
import { jdFromDate } from '../../lib/astro-tools/transit-events.js';
import { sleepPattern, sleepReport, type SleepNight, type SleepPattern, type SleepReport } from '../../lib/astro-tools/daily-hooks/sleep.js';
import { zonedInstant } from '../../lib/user-time-zone.js';
import { loadBondChart } from '../bonds/bonds.service.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { priceOf } from '../features/features.service.js';
import { localDateFor, requireHook, resolvePlace, spendOnce, type PlaceQuery } from './hooks-common.js';
import { refFor } from './hooks-rules.js';
import { hasUnlock, listSleep, upsertSleep } from './hooks.repo.js';

const HOOK = 'sleepSync' as const;
const NOTE = 'A reflection on your own numbers beside the Moon, not a health reading.';

export interface SleepNightView extends SleepNight {
  nakshatra: string;
  sign: string;
}

export interface SleepView {
  date: string;
  /** The Moon during last night (02:00 on the reader's clock), whether or not a score was logged. */
  lastNight: { nakshatraIndex: number; nakshatra: string; signIndex: number; sign: string; bindus: number | null };
  logged: number | null;
  recent: SleepNightView[];
  pattern: SleepPattern & { topNames: string[]; bottomNames: string[] };
  report: { unlocked: boolean; pricePaise: number; data: SleepReport | null };
  note: string;
}

const nakName = (i: number): string => String(NAKSHATRAS[i] ?? '');

async function moonThatNight(tz: string, date: string): Promise<{ nakshatraIndex: number; signIndex: number }> {
  const sky = await calculatePlanetPositions(jdFromDate(zonedInstant(date, tz, 120)), 'lahiri');
  const m = sky.find((p) => p.planet === 'Moon');
  if (!m) throw Errors.internal('Moon position unavailable');
  return { nakshatraIndex: m.nakshatraIndex, signIndex: m.signIndex };
}

async function moonBindus(user: UserRow, signIndex: number, now: Date): Promise<number | null> {
  const profile = await resolveActiveProfileContext(user);
  const chart = await loadBondChart(user, profile, now).catch(() => null);
  if (!chart) return null;
  const av = calculateAshtakavarga(chart.chartData as never);
  return av.bhinna.find((b) => b.planet === 'Moon')?.bindus[signIndex] ?? null;
}

async function build(user: UserRow, q: PlaceQuery, now: Date): Promise<SleepView> {
  const place = resolvePlace(user, q);
  const date = localDateFor(place.tz, now);
  const moon = await moonThatNight(place.tz, date);
  const rows = await listSleep(user.id, 120);
  const nights: SleepNight[] = rows.map((r) => ({ localDate: r.localDate, score: r.score, nakshatraIndex: r.nakshatraIndex, signIndex: r.signIndex }));
  const pattern = sleepPattern(nights);
  const unlocked = await hasUnlock(user.id, HOOK, refFor(HOOK, '', date, 'report'));
  return {
    date,
    lastNight: {
      nakshatraIndex: moon.nakshatraIndex,
      nakshatra: nakName(moon.nakshatraIndex),
      signIndex: moon.signIndex,
      sign: String(ZODIAC_SIGNS[moon.signIndex]),
      bindus: await moonBindus(user, moon.signIndex, now),
    },
    logged: nights.find((n) => n.localDate === date)?.score ?? null,
    recent: nights.slice(0, 14).map((n) => ({ ...n, nakshatra: nakName(n.nakshatraIndex), sign: String(ZODIAC_SIGNS[n.signIndex]) })),
    pattern: {
      ...pattern,
      topNames: pattern.top.map((r) => nakName(r.nakshatraIndex)),
      bottomNames: pattern.bottom.map((r) => nakName(r.nakshatraIndex)),
    },
    report: {
      unlocked,
      pricePaise: await priceOf(user.id, 'hooks.sleepReport', 4900),
      data: unlocked ? sleepReport(nights, date) : null,
    },
    note: NOTE,
  };
}

export async function getSleep(user: UserRow, q: PlaceQuery, now: Date = new Date()): Promise<SleepView> {
  await requireHook(user.id, HOOK);
  return build(user, q, now);
}

/** Saves this morning's score for last night; saying it again the same day changes the score. */
export async function logSleep(user: UserRow, q: PlaceQuery & { score: number }, now: Date = new Date()): Promise<SleepView> {
  await requireHook(user.id, HOOK);
  if (!Number.isInteger(q.score) || q.score < 1 || q.score > 5) throw Errors.badRequest('score must be 1 to 5');
  const place = resolvePlace(user, q);
  const date = localDateFor(place.tz, now);
  const moon = await moonThatNight(place.tz, date);
  await upsertSleep({ userId: user.id, localDate: date, score: q.score, nakshatraIndex: moon.nakshatraIndex, signIndex: moon.signIndex });
  return build(user, q, now);
}

/** Opens the 30-day report for today (coins, once per local day). */
export async function unlockSleepReport(user: UserRow, q: PlaceQuery, now: Date = new Date()): Promise<SleepView & { chargedPaise: number }> {
  await requireHook(user.id, HOOK);
  const place = resolvePlace(user, q);
  const date = localDateFor(place.tz, now);
  const res = await spendOnce(user, {
    hook: HOOK,
    ref: refFor(HOOK, '', date, 'report'),
    priceKey: 'hooks.sleepReport',
    fallbackPaise: 4900,
    reason: 'hook_sleep_report',
  });
  return { ...(await build(user, q, now)), chargedPaise: res.chargedPaise };
}
