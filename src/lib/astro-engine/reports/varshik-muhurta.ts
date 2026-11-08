// =============================================================================
// Varshik C5: the classical no-muhurat periods of the year
// =============================================================================
// Four periods close the "go" window for marriage, commitment and a move into a new home:
//   shukra_asta  Venus combust: within 10 deg of the Sun (8 deg when retrograde)
//   guru_asta    Jupiter combust: within 11 deg of the Sun
//   kharmas      the Sun in Sagittarius (Dhanu) or Pisces (Meena)
//   chaturmas    Devshayani Ekadashi up to (not including) Devuthani Ekadashi, from the festival table
//
// The orbs are the shared `isCombust` table (calculations/planet-state.ts), the same one the Decide
// screen uses, so the report and the app never disagree on a combust day. Days are judged at the
// middle of the reader's local day, the same sample the rest of the year's scoring uses.
//
// Sources (checked 2026-11-09):
//   - Orbs: Surya Siddhanta as quoted by drikpanchang's Shukra Asta and Guru Asta pages
//     ("10 deg on both sides of the Sun when Venus is in forward motion, 8 deg when retrograde";
//     "for Jupiter ... 11 deg"). Drikpanchang's own published asta dates use visibility
//     (Tara Asta, 2027: Venus 21 Jul-9 Sep, Jupiter 17 Aug-13 Sep), which falls inside the
//     orb windows here, so the orb windows are the stricter of the two.
//   - Marriage: drikpanchang "Choosing an auspicious marriage date": no marriage while Shukra
//     or Guru Tara is set; Dhanu month (Kharmas) and Meena are prohibited solar months (the
//     solar-month rule is the one it attributes to Muhurta Chintamani); none in Chaturmas.
//     Its 2027 Vivah list has no dates 1-14 Jan, 15 Mar-14 Apr, Aug-Oct or 16-31 Dec, and
//     labels 14 Jul-9 Nov "Prohibited Chaturmas" where nothing else already closes the day.
//   - Griha pravesh: drikpanchang's Griha Pravesh page removes days when Shukra or Guru Tara is
//     set and lists no 2027 date in Jul-Oct.
//   - Kharmas and Chaturmas for a home move, and all four for a commitment (roka, engagement),
//     are the owner's rule for this report (C5 plan), NOT a panchang rule: drikpanchang lists
//     griha pravesh dates inside Meena (Mar 2027) and property-purchase dates inside Chaturmas.
//     The words the reader sees say so (`ruleSource`).
// =============================================================================

import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { HINDU_FESTIVALS } from '../../../config/hindu-festivals.js';
import { isCombust } from '../calculations/planet-state.js';
import type { VarshikContext } from './varshik-context.js';

export type ClosureReason = 'shukra_asta' | 'guru_asta' | 'kharmas' | 'chaturmas';

export const CLOSURE_REASONS: readonly ClosureReason[] = ['shukra_asta', 'guru_asta', 'kharmas', 'chaturmas'];

/** The decision rows that must never get a "go" window inside a closure. */
export const CLOSED_DECISION_KEYS: readonly string[] = ['marriage', 'commit_relationship', 'move_home'];

/**
 * Where each (row, reason) rule comes from. 'panchang' = drikpanchang states it for this kind of
 * event (the text may say "traditionally no muhurat"); 'report' = this report's own rule (the text
 * says the report keeps the window clear, never that a panchang forbids it).
 */
export function ruleSource(key: string, reason: ClosureReason): 'panchang' | 'report' {
  if (key === 'marriage') return 'panchang';
  if (key === 'move_home') return reason === 'shukra_asta' || reason === 'guru_asta' ? 'panchang' : 'report';
  return 'report';
}

export interface Closure {
  reason: ClosureReason;
  /** First and last closed day, inclusive, local dates YYYY-MM-DD. */
  from: string;
  to: string;
  /** Day indexes into ctx.days, inclusive. */
  fromDay: number;
  toDay: number;
}

const SAGITTARIUS = ZODIAC_SIGNS.indexOf('Sagittarius' as (typeof ZODIAC_SIGNS)[number]);
const PISCES = ZODIAC_SIGNS.indexOf('Pisces' as (typeof ZODIAC_SIGNS)[number]);

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
  // A day is closed when the period covers ANY part of it (a wedding muhurat needs the whole day
  // clear), so each day is judged at its start, middle and end. The start and end longitudes are
  // the midpoints between neighbouring midday samples (planets move smoothly; error is minutes).
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
      case 'guru_asta': {
        const planet = reason === 'shukra_asta' ? 'Venus' : 'Jupiter';
        return EDGES.some((edge) => {
          const sun = lonAt('Sun', i, edge);
          const lon = lonAt(planet, i, edge);
          return sun !== undefined && lon !== undefined && isCombust(planet, lon, sun, Boolean(d.retro[planet]));
        });
      }
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
