// =============================================================================
// Ghar Ka Kavach (v7 spec, Sprint 6, switch `hooks.gharKavach`, ships off)
// =============================================================================
// Each morning one person in the reader's family circle is picked: the one whose day, read from their
// own birth Moon against today's Moon, could use the most care. The reader chants 11 beads for the
// planet of the day's star; the Kalash fills with each day finished. Seven days in a row unlock a free
// weekly family summary. The pick is made once per local day and then stays. Nothing here predicts
// harm: the words say "could use some care".
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { pickKavach, NAME_IN_HINDI, type KavachCandidate, type KavachPick } from '../../lib/astro-tools/daily-hooks/kavach.js';
import { KAVACH_BEADS, KAVACH_FULL_DAYS } from '../../lib/astro-tools/daily-hooks/weights.js';
import { loadCirclePeople } from './circle-people.js';
import { localDateFor, requireHook, resolvePlace, type PlaceQuery } from './hooks-common.js';
import { addDays, runEndingOn } from './hooks-rules.js';
import { createProgressOnce, getProgress, listProgress, mergeProgress } from './hooks.repo.js';

const HOOK = 'gharKavach' as const;

interface DayData {
  memberId: string;
  name: string;
  quality: string;
  taraName: string;
  taraNumber: number;
  chandraHouse: number;
  planet: string;
  mantra: string;
  beads: number;
  done: boolean;
  doneAt?: string;
}

export interface KavachView {
  date: string;
  /** 'empty' when the circle has no family member with a readable chart yet. */
  state: 'empty' | 'ready' | 'done';
  today: (DayData & { planetHindi: string; beadsTarget: number }) | null;
  /** Days in a row finished, up to today (or up to yesterday while today is still to do). */
  streak: number;
  /** 0-7: how full the Kalash is. */
  kalash: number;
  weekDays: number;
  summary: { unlocked: boolean; days: { date: string; name: string; taraName: string; done: boolean }[] } | null;
  blessing: { name: string; text: string } | null;
}

export interface KavachBeadResult extends KavachView {
  justFilled: boolean;
}

async function ensureToday(user: UserRow, date: string, now: Date): Promise<DayData | null> {
  const row = await getProgress(user.id, HOOK, '', date);
  if (row && (row.data as Partial<DayData>).memberId) return row.data as unknown as DayData;
  const people = await loadCirclePeople(user, date, now);
  const candidates: KavachCandidate[] = [];
  for (const p of people) {
    if (!(p.category === 'family' || p.category === 'romantic') || !p.chart) continue;
    const moon = p.chart.ctx.transits.find((t) => t.planet === 'Moon');
    if (!moon) continue;
    candidates.push({
      id: p.memberId,
      name: p.name,
      natalNakshatra: p.chart.ctx.moonNakshatraIndex,
      natalSign: p.chart.ctx.moonSignIndex,
      todayNakshatra: moon.nakshatraIndex,
      todaySign: moon.signIndex,
      pulse: p.pulse,
    });
  }
  const pick: KavachPick | null = pickKavach(candidates);
  if (!pick) return null;
  const data: DayData = {
    memberId: pick.id, name: pick.name, quality: pick.quality, taraName: pick.taraName, taraNumber: pick.taraNumber,
    chandraHouse: pick.chandraHouse, planet: pick.planet, mantra: pick.mantra, beads: 0, done: false,
  };
  const created = await createProgressOnce(user.id, HOOK, '', date, data as unknown as Record<string, unknown>);
  if (!created) {
    // Another device picked a moment ago: keep its pick.
    const again = await getProgress(user.id, HOOK, '', date);
    return (again?.data as unknown as DayData) ?? data;
  }
  return data;
}

async function build(user: UserRow, q: PlaceQuery, now: Date): Promise<KavachView> {
  const place = resolvePlace(user, q);
  const date = localDateFor(place.tz, now);
  const today = await ensureToday(user, date, now);

  const rows = await listProgress(user.id, HOOK, '', addDays(date, -60), date);
  const doneDates = new Set(rows.filter((r) => (r.data as Partial<DayData>).done === true).map((r) => r.localDate));
  const streak = doneDates.has(date) ? runEndingOn(doneDates, date) : runEndingOn(doneDates, addDays(date, -1));
  const kalash = streak === 0 ? 0 : ((streak - 1) % KAVACH_FULL_DAYS) + 1;
  const unlocked = streak >= KAVACH_FULL_DAYS;
  const weekDays = Math.min(streak, KAVACH_FULL_DAYS);

  return {
    date,
    state: !today ? 'empty' : today.done ? 'done' : 'ready',
    today: today ? { ...today, planetHindi: NAME_IN_HINDI[today.planet] ?? today.planet, beadsTarget: KAVACH_BEADS } : null,
    streak,
    kalash,
    weekDays,
    summary: unlocked
      ? {
          unlocked: true,
          days: rows
            .filter((r) => r.localDate > addDays(date, -KAVACH_FULL_DAYS))
            .map((r) => {
              const d = r.data as Partial<DayData>;
              return { date: r.localDate, name: d.name ?? '', taraName: d.taraName ?? '', done: d.done === true };
            }),
        }
      : null,
    blessing: today?.done ? { name: today.name, text: `Wishing ${today.name} a steady, gentle day.` } : null,
  };
}

export async function getKavach(user: UserRow, q: PlaceQuery, now: Date = new Date()): Promise<KavachView> {
  await requireHook(user.id, HOOK);
  return build(user, q, now);
}

/** Counts beads for today's pick. The 11th bead finishes the day. A day finishes once. */
export async function addBeads(user: UserRow, q: PlaceQuery & { count: number }, now: Date = new Date()): Promise<KavachBeadResult> {
  await requireHook(user.id, HOOK);
  if (!Number.isInteger(q.count) || q.count < 1 || q.count > KAVACH_BEADS) throw Errors.badRequest('count must be 1 to 11');
  const before = await build(user, q, now);
  if (!before.today) throw Errors.conflict('NO_FAMILY');
  if (before.today.done) return { ...before, justFilled: false };
  const total = Math.min(KAVACH_BEADS, before.today.beads + q.count);
  const done = total >= KAVACH_BEADS;
  await mergeProgress(user.id, HOOK, '', before.date, { beads: total, ...(done ? { done: true, doneAt: now.toISOString() } : {}) });
  return { ...(await build(user, q, now)), justFilled: done };
}
