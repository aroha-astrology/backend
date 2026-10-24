// =============================================================================
// Sleep Sync — reading the reader's own 1-5 sleep scores beside the Moon (pure)
// =============================================================================
// Manual logging only: one score each morning for the night before. Nothing here is a health reading
// and the words never say so. Patterns are the reader's own numbers grouped by the Moon's nakshatra or
// sign that night. The Moon visits the same nakshatra about every 27 days, so after a week the
// groups are single nights and the page says the pattern is early; it firms up with repeat visits.
// =============================================================================

import { SLEEP_NIGHTS_FOR_PATTERN, SLEEP_REPORT_DAYS } from './weights.js';

export interface SleepNight {
  localDate: string;
  score: number;
  nakshatraIndex: number;
  signIndex: number;
}

export interface Ranked {
  nakshatraIndex: number;
  average: number;
  nights: number;
}

export interface SleepPattern {
  nights: number;
  needed: number;
  ready: boolean;
  average: number | null;
  top: Ranked[];
  bottom: Ranked[];
  /** 'early' while any ranked nakshatra has fewer than 3 nights behind it. */
  confidence: 'early' | 'firming';
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function groupBy<K extends number>(nights: SleepNight[], key: (n: SleepNight) => K): Map<K, SleepNight[]> {
  const m = new Map<K, SleepNight[]>();
  for (const n of nights) m.set(key(n), [...(m.get(key(n)) ?? []), n]);
  return m;
}

const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

export function rankNakshatras(nights: SleepNight[]): Ranked[] {
  return [...groupBy(nights, (n) => n.nakshatraIndex)].map(([nakshatraIndex, rows]) => ({
    nakshatraIndex,
    average: round1(avg(rows.map((r) => r.score))),
    nights: rows.length,
  }));
}

export function sleepPattern(nights: SleepNight[]): SleepPattern {
  const ranked = rankNakshatras(nights);
  const ready = nights.length >= SLEEP_NIGHTS_FOR_PATTERN;
  const byBest = [...ranked].sort((a, b) => b.average - a.average || b.nights - a.nights || a.nakshatraIndex - b.nakshatraIndex);
  const byWorst = [...ranked].sort((a, b) => a.average - b.average || b.nights - a.nights || a.nakshatraIndex - b.nakshatraIndex);
  const top = ready ? byBest.slice(0, 3) : [];
  // the bottom three never repeat a nakshatra already in the top three
  const bottom = ready ? byWorst.filter((r) => !top.some((t) => t.nakshatraIndex === r.nakshatraIndex)).slice(0, 3) : [];
  return {
    nights: nights.length,
    needed: SLEEP_NIGHTS_FOR_PATTERN,
    ready,
    average: nights.length ? round1(avg(nights.map((n) => n.score))) : null,
    top,
    bottom,
    confidence: [...top, ...bottom].some((r) => r.nights < 3) ? 'early' : 'firming',
  };
}

export interface SleepReport {
  windowDays: number;
  nights: number;
  average: number | null;
  bestNights: SleepNight[];
  lowestNights: SleepNight[];
  bySign: { signIndex: number; average: number; nights: number }[];
  byNakshatra: Ranked[];
  byWeekday: { weekday: number; average: number; nights: number }[];
  /** Longest run of nights scored 4 or 5. */
  longestGoodRun: number;
}

const weekdayOf = (date: string): number => new Date(`${date}T12:00:00Z`).getUTCDay();

/** The 30-day report over the logged nights inside the window ending on `today`. */
export function sleepReport(all: SleepNight[], today: string): SleepReport {
  const start = new Date(`${today}T12:00:00Z`).getTime() - (SLEEP_REPORT_DAYS - 1) * 86_400_000;
  const nights = all
    .filter((n) => new Date(`${n.localDate}T12:00:00Z`).getTime() >= start && n.localDate <= today)
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  let run = 0;
  let longest = 0;
  let prev: string | null = null;
  for (const n of nights) {
    const consecutive = prev !== null && Math.round((Date.parse(n.localDate) - Date.parse(prev)) / 86_400_000) === 1;
    run = n.score >= 4 ? (consecutive && run > 0 ? run + 1 : 1) : 0;
    longest = Math.max(longest, run);
    prev = n.localDate;
  }
  return {
    windowDays: SLEEP_REPORT_DAYS,
    nights: nights.length,
    average: nights.length ? round1(avg(nights.map((n) => n.score))) : null,
    bestNights: [...nights].sort((a, b) => b.score - a.score || a.localDate.localeCompare(b.localDate)).slice(0, 3),
    lowestNights: [...nights].sort((a, b) => a.score - b.score || a.localDate.localeCompare(b.localDate)).slice(0, 3),
    bySign: [...groupBy(nights, (n) => n.signIndex)]
      .map(([signIndex, rows]) => ({ signIndex, average: round1(avg(rows.map((r) => r.score))), nights: rows.length }))
      .sort((a, b) => a.signIndex - b.signIndex),
    byNakshatra: rankNakshatras(nights).sort((a, b) => a.nakshatraIndex - b.nakshatraIndex),
    byWeekday: [...groupBy(nights, (n) => weekdayOf(n.localDate))]
      .map(([weekday, rows]) => ({ weekday, average: round1(avg(rows.map((r) => r.score))), nights: rows.length }))
      .sort((a, b) => a.weekday - b.weekday),
    longestGoodRun: longest,
  };
}
