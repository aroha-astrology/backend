// =============================================================================
// Astro Journal (roadmap step 8, ships off)
// =============================================================================
// A quick daily check-in (mood, energy, career, relationships, money on 1-5, a
// note, and any big life events), stamped with the owner's sky that day. The
// insights group the owner's own entries by dasha period and by the day's
// tara — self-reflection, not proof — and dated life events can feed Birth
// Time Confidence. Always the account owner's chart, whichever profile is
// active: it's their diary.
// =============================================================================

import { NAKSHATRAS } from '@aroha-astrology/shared';
import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { LifeEventDomain } from '../../lib/astro-engine/calculations/rectification.js';
import { taraOf } from '../../lib/astro-tools/decision-engine.js';
import { buildChartContext } from '../../lib/intelligence/chart-context.js';
import type { LifeArea } from '../../lib/intelligence/areas.js';
import { resolveProfileContext } from '../birth-profiles/profile-context.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { istDate } from '../insights/calendar.service.js';
import { istNoon } from '../insights/insights.service.js';
import {
  RATING_FIELDS,
  deleteJournalEntry,
  listJournalEntries,
  upsertJournalEntry,
  type JournalEntry,
  type JournalSnapshot,
  type RatingField,
} from './journal.repo.js';

export const MAX_NOTE_LENGTH = 2000;
export const MAX_EVENTS_PER_DAY = 5;
const DEFAULT_LIST_DAYS = 60;
const MS_PER_DAY = 86_400_000;
const GOOD_TARAS = new Set([2, 4, 6, 8, 9]);
const BAD_TARAS = new Set([3, 5, 7]);
const MIN_TARA_SAMPLE = 3;

/** The life area each kind of event belongs to, for the insights. */
export const EVENT_AREA: Record<LifeEventDomain, LifeArea> = {
  job_started: 'career',
  promotion: 'career',
  job_loss: 'career',
  retirement: 'career',
  business_started: 'business',
  engagement: 'relationships',
  marriage: 'relationships',
  divorce: 'relationships',
  childbirth: 'family',
  bereavement: 'family',
  property_bought: 'family',
  vehicle_bought: 'money',
  big_financial_gain: 'money',
  relocation: 'relocation',
  foreign_travel: 'relocation',
  health_crisis: 'health',
  accident_injury: 'health',
  legal_case: 'overall',
  education_milestone: 'education',
};

export interface JournalEntryDto {
  date: string;
  mood: number | null;
  energy: number | null;
  career: number | null;
  relationship: number | null;
  money: number | null;
  note: string | null;
  events: LifeEventDomain[];
  snapshot: JournalSnapshot | null;
}

function toDto(e: JournalEntry): JournalEntryDto {
  return {
    date: e.entryDate,
    mood: e.mood,
    energy: e.energy,
    career: e.career,
    relationship: e.relationship,
    money: e.money,
    note: e.note,
    events: e.events,
    snapshot: e.snapshot,
  };
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The owner's dasha lords and the Moon's sign, star and tara on `date`; null until the chart exists. */
export async function journalSnapshot(
  user: UserRow,
  date: string,
): Promise<JournalSnapshot | null> {
  const kundli = await findKundliByUserId(user.id, null);
  if (!kundli) return null;
  const profile = await resolveProfileContext(user, null);
  const ctx = await buildChartContext(kundli, profile, istNoon(date));
  const moon = ctx?.transits.find((t) => t.planet === 'Moon');
  if (!ctx || !moon) return null;
  return {
    maha: ctx.dasha.mahadasha?.planet ?? null,
    antar: ctx.dasha.antardasha?.planet ?? null,
    moonSign: moon.sign,
    moonNakshatra: NAKSHATRAS[moon.nakshatraIndex] ?? '',
    tara: taraOf(ctx.moonNakshatraIndex, moon.nakshatraIndex),
  };
}

export async function listEntries(
  user: UserRow,
  range: { from?: string; to?: string },
): Promise<{ today: string; entries: JournalEntryDto[] }> {
  const today = istDate(new Date());
  const to = range.to ?? today;
  const from = range.from ?? addDays(to, -(DEFAULT_LIST_DAYS - 1));
  const entries = await listJournalEntries(user.id, { from, to });
  return { today, entries: entries.map(toDto) };
}

export interface SaveEntryInput extends Partial<Record<RatingField, number | null>> {
  note?: string | null;
  events?: LifeEventDomain[];
}

/**
 * Saves the check-in for `date`, merging into what's already there: a field
 * left out keeps its value, null clears it. So the Home card can log just a
 * mood without wiping the day's note.
 */
export async function saveEntry(
  user: UserRow,
  date: string,
  input: SaveEntryInput,
): Promise<JournalEntryDto> {
  if (date > istDate(new Date())) throw Errors.badRequest('JOURNAL_DATE_IN_FUTURE');
  const [existing] = await listJournalEntries(user.id, { from: date, to: date, limit: 1 });

  const ratings = Object.fromEntries(
    RATING_FIELDS.map((f) => [f, input[f] !== undefined ? input[f] : (existing?.[f] ?? null)]),
  ) as Record<RatingField, number | null>;
  const note = input.note !== undefined ? input.note?.trim() || null : (existing?.note ?? null);
  const events = input.events !== undefined ? [...new Set(input.events)] : (existing?.events ?? []);

  const snapshot =
    existing?.snapshot ??
    (await journalSnapshot(user, date).catch((err: unknown) => {
      logger.warn({ err, userId: user.id }, 'journal snapshot failed — saving without it');
      return null;
    }));

  const saved = await upsertJournalEntry({
    userId: user.id,
    entryDate: date,
    ratings,
    body: { note, events },
    snapshot,
  });
  return toDto(saved);
}

export async function removeEntry(user: UserRow, date: string): Promise<void> {
  const deleted = await deleteJournalEntry(user.id, date);
  if (!deleted) throw Errors.notFound('JOURNAL_ENTRY_NOT_FOUND');
}

export type JournalHighlight =
  | { kind: 'dashaEvents'; maha: string; antar: string; area: LifeArea; count: number }
  | { kind: 'taraMood'; good: number; bad: number };

export interface JournalInsights {
  total: number;
  /** Consecutive days logged, ending today or yesterday. */
  streak: number;
  /** Average of each rating over the last 30 days (null with no ratings). */
  averages: Record<RatingField, number | null>;
  eventsByArea: Partial<Record<LifeArea, number>>;
  byDasha: Array<{
    maha: string;
    antar: string;
    entries: number;
    events: number;
    avgMood: number | null;
  }>;
  highlights: JournalHighlight[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function average(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  return nums.length ? round1(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

/** Streak of consecutive logged days ending today (or yesterday, so it survives until tonight's entry). */
export function streakOf(dates: readonly string[], today: string): number {
  const set = new Set(dates);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

/** Pure: the insight numbers from a list of entries. */
export function buildInsights(entries: readonly JournalEntryDto[], today: string): JournalInsights {
  const recent = entries.filter((e) => e.date > addDays(today, -30));
  const averages = Object.fromEntries(
    RATING_FIELDS.map((f) => [f, average(recent.map((e) => e[f]))]),
  ) as Record<RatingField, number | null>;

  const eventsByArea: Partial<Record<LifeArea, number>> = {};
  for (const e of entries) {
    for (const ev of e.events)
      eventsByArea[EVENT_AREA[ev]] = (eventsByArea[EVENT_AREA[ev]] ?? 0) + 1;
  }

  const groups = new Map<string, { maha: string; antar: string; list: JournalEntryDto[] }>();
  for (const e of entries) {
    if (!e.snapshot?.maha || !e.snapshot.antar) continue;
    const key = `${e.snapshot.maha}-${e.snapshot.antar}`;
    const g = groups.get(key) ?? { maha: e.snapshot.maha, antar: e.snapshot.antar, list: [] };
    g.list.push(e);
    groups.set(key, g);
  }
  const byDasha = [...groups.values()]
    .map((g) => ({
      maha: g.maha,
      antar: g.antar,
      entries: g.list.length,
      events: g.list.reduce((n, e) => n + e.events.length, 0),
      avgMood: average(g.list.map((e) => e.mood)),
    }))
    .sort((a, b) => b.entries - a.entries)
    .slice(0, 5);

  const highlights: JournalHighlight[] = [];
  // The dasha period and area with the most marked events ("5 career events during this period").
  let best: { maha: string; antar: string; area: LifeArea; count: number } | null = null;
  for (const g of groups.values()) {
    const perArea = new Map<LifeArea, number>();
    for (const e of g.list)
      for (const ev of e.events)
        perArea.set(EVENT_AREA[ev], (perArea.get(EVENT_AREA[ev]) ?? 0) + 1);
    for (const [area, count] of perArea) {
      if (count >= 2 && (!best || count > best.count))
        best = { maha: g.maha, antar: g.antar, area, count };
    }
  }
  if (best) highlights.push({ kind: 'dashaEvents', ...best });

  const good = entries.filter(
    (e) => e.snapshot && GOOD_TARAS.has(e.snapshot.tara) && e.mood != null,
  );
  const bad = entries.filter((e) => e.snapshot && BAD_TARAS.has(e.snapshot.tara) && e.mood != null);
  if (good.length >= MIN_TARA_SAMPLE && bad.length >= MIN_TARA_SAMPLE) {
    const g = average(good.map((e) => e.mood))!;
    const b = average(bad.map((e) => e.mood))!;
    if (Math.abs(g - b) >= 0.3) highlights.push({ kind: 'taraMood', good: g, bad: b });
  }

  return {
    total: entries.length,
    streak: streakOf(
      entries.map((e) => e.date),
      today,
    ),
    averages,
    eventsByArea,
    byDasha,
    highlights,
  };
}

export async function journalInsights(user: UserRow): Promise<JournalInsights> {
  const entries = await listJournalEntries(user.id, { limit: 1000 });
  return buildInsights(entries.map(toDto), istDate(new Date()));
}

/** Every dated life event in the journal, oldest first — ready for a Birth Time Confidence check. */
export async function journalLifeEvents(
  user: UserRow,
): Promise<{ events: Array<{ date: string; domain: LifeEventDomain }> }> {
  const entries = await listJournalEntries(user.id, { limit: 1000, order: 'asc' });
  const seen = new Set<string>();
  const events: Array<{ date: string; domain: LifeEventDomain }> = [];
  for (const e of entries) {
    for (const domain of e.events) {
      const key = `${e.entryDate}:${domain}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({ date: e.entryDate, domain });
    }
  }
  return { events };
}
