// =============================================================================
// Varshik C5: the classical no-muhurat periods of the year
// =============================================================================
// Owner decisions 2026-11-09:
//   marriage     closed by all four periods below (drikpanchang's Vivah rules)
//   move_home    closed by Shukra and Guru Asta only (drikpanchang's Griha Pravesh rules); the report adds a
//                soft line that many families also avoid Kharmas and Chaturmas
//   commitment   (sagai, engagement) not closed: no source gives a rule; a soft line only
//   buy_property its own row, closed by nothing (drikpanchang's property calendar blocks none of the four)
//
//   shukra_asta  Venus Tara Asta, drikpanchang's PUBLISHED dates (config/asta-dates.ts, visibility based)
//   guru_asta    Jupiter Tara Asta, the same table
//   kharmas      the Sun in Sagittarius (Dhanu) or Pisces (Meena)
//   chaturmas    Devshayani Ekadashi up to (not including) Devuthani Ekadashi, from the festival table
//
// The fixed Surya Siddhanta orbs (isCombust) stay for planet strength and combustion in the scoring only.
// A day is closed when a period covers any part of it.
//
// Sources (checked 2026-11-09):
//   - Asta: drikpanchang's Shukra Asta and Guru Asta pages (2027: Venus 21 Jul 05:08 to 9 Sep 19:00,
//     Jupiter 17 Aug 19:32 to 13 Sep 05:22 IST), copied into config/asta-dates.ts with their URLs.
//   - Marriage: drikpanchang "Choosing an auspicious marriage date": no marriage while Shukra
//     or Guru Tara is set; Dhanu month (Kharmas) and Meena are prohibited solar months (the
//     solar-month rule is the one it attributes to Muhurta Chintamani); none in Chaturmas.
//     Its 2027 Vivah list has no dates 1-14 Jan, 15 Mar-14 Apr, Aug-Oct or 16-31 Dec, and
//     labels 14 Jul-9 Nov "Prohibited Chaturmas" where nothing else already closes the day.
//   - Griha pravesh: drikpanchang's Griha Pravesh page removes days when Shukra or Guru Tara is
//     set and lists no 2027 date in Jul-Oct.
//   - Property purchase: drikpanchang's property calendar lists dates inside all four periods.
// =============================================================================

import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { HINDU_FESTIVALS } from '../../../config/hindu-festivals.js';
import { ASTA_PERIODS, astaCovered } from '../../../config/asta-dates.js';
import type { VarshikContext } from './varshik-context.js';

export type ClosureReason = 'shukra_asta' | 'guru_asta' | 'kharmas' | 'chaturmas';

export const CLOSURE_REASONS: readonly ClosureReason[] = ['shukra_asta', 'guru_asta', 'kharmas', 'chaturmas'];

/** Which periods close which decision row (owner, 2026-11-09). Every rule here is drikpanchang's. */
export const CLOSURE_RULES: Readonly<Record<string, readonly ClosureReason[]>> = {
  marriage: ['shukra_asta', 'guru_asta', 'kharmas', 'chaturmas'],
  move_home: ['shukra_asta', 'guru_asta'],
};

/** The decision rows that must never get a "go" window inside one of their closures. */
export const CLOSED_DECISION_KEYS: readonly string[] = Object.keys(CLOSURE_RULES);

/** A soft line for rows where custom goes further than the panchang rule, or where no rule exists. */
export const ROW_NOTES: Readonly<Record<string, 'move_custom' | 'sagai_custom'>> = {
  move_home: 'move_custom',
  commit_relationship: 'sagai_custom',
};

/** The year's closures that apply to one decision row. */
export function closuresFor(key: string, closures: Closure[]): Closure[] {
  const reasons = CLOSURE_RULES[key];
  return reasons ? closures.filter((c) => reasons.includes(c.reason)) : [];
}

/** Every rule in CLOSURE_RULES is stated by drikpanchang for that event. Kept for the facts field. */
export function ruleSource(_key: string, _reason: ClosureReason): 'panchang' | 'report' {
  return 'panchang';
}

export { astaCovered };

export interface Closure {
  reason: ClosureReason;
  /** First and last closed day, inclusive, local dates YYYY-MM-DD. */
  from: string;
  to: string;
  /** Day indexes into ctx.days, inclusive. */
  fromDay: number;
  toDay: number;
}

const SAGITTARIUS = ZODIAC_SIGNS.indexOf('Sagittarius');
const PISCES = ZODIAC_SIGNS.indexOf('Pisces');

const signOf = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30);

/** The festival date of `name` in `year`, or null when the table has no entry. */
export function festivalDate(year: number, name: RegExp): string | null {
  for (const [date, list] of Object.entries(HINDU_FESTIVALS)) {
    if (date.startsWith(`${year}-`) && list.some((f) => name.test(f.name))) return date;
  }
  return null;
}

/** Devshayani to the day before Devuthani; null when the table lacks either for the year. */
export function chaturmasOf(year: number): { from: string; to: string } | null {
  const from = festivalDate(year, /^Devshayani Ekadashi/);
  const end = festivalDate(year, /^Devuthani Ekadashi/);
  if (!from || !end || end <= from) return null;
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return { from, to: d.toISOString().slice(0, 10) };
}

/**
 * Every closure in the year, as runs of whole local days. `dateOfDay(i)` is the local date of
 * ctx.days[i]. Contexts built with a mocked `positionsAt` carry no retrograde flags; Venus is then
 * judged at its direct orb.
 */
export function muhurtaClosures(ctx: VarshikContext, dateOfDay: (i: number) => string): Closure[] {
  const n = ctx.days.length;
  const chaturmas = chaturmasOf(ctx.year);
  // Asta from drikpanchang's published dates: a day is closed when the period covers any part of it.
  const astaMs = (planet: 'Venus' | 'Jupiter') =>
    ASTA_PERIODS.filter((p) => p.planet === planet).map((p) => [Date.parse(p.startsAt), Date.parse(p.endsAt)] as const);
  const venus = astaMs('Venus');
  const jupiter = astaMs('Jupiter');
  const dayStart = (i: number) => ctx.dayStartMs[i]!;
  const dayEnd = (i: number) => ctx.dayStartMs[i + 1] ?? ctx.dayStartMs[i]! + 86_400_000;
  const inAsta = (periods: ReadonlyArray<readonly [number, number]>, i: number) =>
    periods.some(([a, b]) => a < dayEnd(i) && b > dayStart(i));
  // Kharmas: the Sun's sign at the start, middle and end of the day; the edges are the midpoints between
  // neighbouring midday samples (the Sun moves about a degree a day; the error is minutes).
  const lonAt = (planet: 'Sun' | 'Venus' | 'Jupiter', i: number, edge: -1 | 0 | 1): number | undefined => {
    const here = ctx.days[i]!.lon[planet];
    if (here === undefined || edge === 0) return here;
    const other = ctx.days[i + edge]?.lon[planet];
    if (other === undefined) return here;
    let diff = other - here;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return here + diff / 2;
  };
  const EDGES = [-1, 0, 1] as const;
  const closedOn = (reason: ClosureReason, i: number): boolean => {
    const d = ctx.days[i]!;
    if (d.lon.Sun === undefined) return false;
    switch (reason) {
      case 'shukra_asta':
        return inAsta(venus, i);
      case 'guru_asta':
        return inAsta(jupiter, i);
      case 'kharmas':
        return EDGES.some((edge) => {
          const sun = lonAt('Sun', i, edge);
          if (sun === undefined) return false;
          const s = signOf(sun);
          return s === SAGITTARIUS || s === PISCES;
        });
      case 'chaturmas': {
        if (!chaturmas) return false;
        const date = dateOfDay(i);
        return date >= chaturmas.from && date <= chaturmas.to;
      }
    }
  };
  const out: Closure[] = [];
  for (const reason of CLOSURE_REASONS) {
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && closedOn(reason, i);
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        out.push({ reason, from: dateOfDay(start), to: dateOfDay(i - 1), fromDay: start, toDay: i - 1 });
        start = -1;
      }
    }
  }
  return out.sort((a, b) => a.fromDay - b.fromDay || CLOSURE_REASONS.indexOf(a.reason) - CLOSURE_REASONS.indexOf(b.reason));
}

/** A month needs at least this many open days to hold a "go" window for a closed row. */
export const MIN_OPEN_DAYS = 7;

/** Per month: how many of its days no closure touches. */
export function openDaysByMonth(ctx: VarshikContext, closures: Closure[]): number[] {
  const closed = new Array<boolean>(ctx.days.length).fill(false);
  for (const c of closures) for (let i = c.fromDay; i <= c.toDay; i++) closed[i] = true;
  const open = new Array<number>(12).fill(0);
  ctx.monthOfDay.forEach((m, i) => {
    if (!closed[i]) open[m]!++;
  });
  return open;
}

/** The open runs of days inside months [fromMonth, toMonth], as inclusive local date pairs. */
export function openSpans(
  ctx: VarshikContext,
  closures: Closure[],
  fromMonth: number,
  toMonth: number,
  dateOfDay: (i: number) => string,
): Array<{ from: string; to: string }> {
  const closed = new Array<boolean>(ctx.days.length).fill(false);
  for (const c of closures) for (let i = c.fromDay; i <= c.toDay; i++) closed[i] = true;
  const out: Array<{ from: string; to: string }> = [];
  let start = -1;
  for (let i = 0; i <= ctx.days.length; i++) {
    const m = ctx.monthOfDay[i];
    const on = i < ctx.days.length && m !== undefined && m >= fromMonth && m <= toMonth && !closed[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push({ from: dateOfDay(start), to: dateOfDay(i - 1) });
      start = -1;
    }
  }
  return out;
}
