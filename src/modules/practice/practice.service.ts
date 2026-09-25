// =============================================================================
// Today's Practice (roadmap step 9, ships off)
// =============================================================================
// Three or four small things to do today, each with its reason:
//   remedy    the mantra today's horoscope picked, at its jap count;
//   dasha     108 japs to the deity traditionally worshipped for the running
//             Antardasha lord (Saturn → Hanuman, Venus → Lakshmi, …);
//   weekday   a short prayer to the weekday's deity (Thursday → Vishnu, …);
//   lalKitab  a Lal Kitab remedy on the days the Moon passes the 4th, 5th or
//             8th from the natal Moon (lalkitab/transitRemedies.ts).
// Every mantra is one of the 50 verses in the app's own Shlokas library, so
// the page can chant it on the same mala. Completions go in practice_log;
// the only "game" is a plain streak. No AI call beyond the existing reading.
// =============================================================================

import type { Planet } from '@aroha-astrology/shared';
import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { getMoonTransitRemedy } from '../../lib/astro-engine/lalkitab/transitRemedies.js';
import type { WhyFactor } from '../../lib/intelligence/types.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { findHoroscope } from '../horoscope/horoscope.repo.js';
import { istDate } from '../insights/calendar.service.js';
import { istNoon, loadChartContext } from '../insights/insights.service.js';
import { streakOf } from '../journal/journal.service.js';
import { listPracticeDone, markPracticeDone } from './practice.repo.js';

export const PRACTICE_ITEM_IDS = ['remedy', 'dasha', 'weekday', 'lalKitab'] as const;
export type PracticeItemId = (typeof PRACTICE_ITEM_IDS)[number];

/** The Shlokas-library verse traditionally chanted for each graha. */
export const DASHA_MANTRA: Record<Planet, string> = {
  Sun: 'surya-namaskar-mantra',
  Moon: 'shiva-panchakshari',
  Mars: 'hanuman-dhyana',
  Mercury: 'vishnu-dwadashakshari',
  Jupiter: 'guru-mantra',
  Venus: 'lakshmi-mantra',
  Saturn: 'hanuman-gayatri',
  Rahu: 'durga-mantra',
  Ketu: 'ganesh-vandana',
};

/** Each weekday's deity (0 = Sunday): Surya, Shiva, Hanuman, Ganesha, Vishnu, Lakshmi, Shani's Hanuman. */
export const WEEKDAY_SHLOKA = [
  'aditya-hrudayam',
  'shiva-dhyana',
  'hanuman-dhyana',
  'ganesh-vandana',
  'vishnu-shantakaram',
  'lakshmi-mantra',
  'hanuman-gayatri',
] as const;
/** Used when the weekday's verse is already today's remedy or dasha mantra. */
const WEEKDAY_FALLBACK = 'gayatri-mantra';

const DASHA_JAP = 108;
const WEEKDAY_JAP = 11;
/** The harder Moon houses the Lal Kitab table covers with an everyday action. */
const LAL_KITAB_HOUSES = new Set([4, 5, 8]);

export interface PracticeItem {
  id: PracticeItemId;
  kind: 'chant' | 'action';
  /** A Shlokas-library slug, for chants. */
  slug?: string;
  japCount?: number;
  /** The horoscope's own sentence for the remedy mantra (already in the reading's language). */
  reason?: string;
  /** Which Lal Kitab lines to show: the Moon's house from the natal Moon and the line indexes. */
  lalKitab?: { house: number; lines: number[] };
  why: WhyFactor[];
}

export interface PracticeToday {
  date: string;
  items: PracticeItem[];
  done: PracticeItemId[];
  streak: number;
  /** The last 7 days, oldest first, with how many items were done. */
  week: Array<{ date: string; done: number }>;
  /** Days in the last 30 with at least one item done. */
  monthDays: number;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Pure: the day's items from what's known about the reading, the dasha and the Moon. */
export function buildItems(opts: {
  weekday: number;
  remedy?: { slug: string; japCount: number; reason: string } | null;
  dasha?: { planet: Planet; level: 'mahadasha' | 'antardasha'; until: string } | null;
  moonHouseFromMoon?: number | null;
}): PracticeItem[] {
  const items: PracticeItem[] = [];
  const used = new Set<string>();

  if (opts.remedy) {
    items.push({
      id: 'remedy',
      kind: 'chant',
      slug: opts.remedy.slug,
      japCount: opts.remedy.japCount,
      reason: opts.remedy.reason,
      why: [],
    });
    used.add(opts.remedy.slug);
  }

  if (opts.dasha) {
    const slug = DASHA_MANTRA[opts.dasha.planet];
    items.push({
      id: 'dasha',
      kind: 'chant',
      slug,
      japCount: DASHA_JAP,
      why: [
        {
          kind: 'dasha',
          planet: opts.dasha.planet,
          level: opts.dasha.level,
          effect: 0,
          textKey: 'practice.why.dasha',
          params: { planet: opts.dasha.planet, until: opts.dasha.until },
        },
      ],
    });
    used.add(slug);
  }

  const weekdaySlug = WEEKDAY_SHLOKA[opts.weekday] ?? WEEKDAY_FALLBACK;
  items.push({
    id: 'weekday',
    kind: 'chant',
    slug: used.has(weekdaySlug) ? WEEKDAY_FALLBACK : weekdaySlug,
    japCount: WEEKDAY_JAP,
    why: [
      {
        kind: 'panchang',
        effect: 0,
        textKey: used.has(weekdaySlug) ? 'practice.why.gayatri' : 'practice.why.weekday',
        params: { weekday: opts.weekday },
      },
    ],
  });

  const house = opts.moonHouseFromMoon;
  if (house && LAL_KITAB_HOUSES.has(house)) {
    const remedy = getMoonTransitRemedy(house);
    if (remedy.covered) {
      items.push({
        id: 'lalKitab',
        kind: 'action',
        lalKitab: { house, lines: remedy.remedies.map((_, i) => i) },
        why: [
          {
            kind: 'transit',
            planet: 'Moon',
            house,
            effect: -1,
            textKey: house === 8 ? 'decide.why.chandrashtama' : 'decide.why.chandra',
            params: { house },
          },
        ],
      });
    }
  }
  return items;
}

/** Pure: today's done list, the streak, the week strip and the month count from raw completions. */
export function summarizeDone(
  rows: ReadonlyArray<{ date: string; itemId: string }>,
  today: string,
  items: readonly PracticeItem[],
): Pick<PracticeToday, 'done' | 'streak' | 'week' | 'monthDays'> {
  const offered = new Set(items.map((i) => i.id));
  const perDay = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = perDay.get(r.date) ?? new Set<string>();
    set.add(r.itemId);
    perDay.set(r.date, set);
  }
  const done = [...(perDay.get(today) ?? [])].filter((id): id is PracticeItemId =>
    offered.has(id as PracticeItemId),
  );
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, done: perDay.get(date)?.size ?? 0 };
  });
  const monthStart = addDays(today, -29);
  const monthDays = [...perDay.keys()].filter((d) => d >= monthStart && d <= today).length;
  return { done, streak: streakOf([...perDay.keys()], today), week, monthDays };
}

export async function getPracticeToday(
  user: UserRow,
  now: Date = new Date(),
): Promise<PracticeToday> {
  const date = istDate(now);
  const loaded = await loadChartContext(user, istNoon(date)).catch(() => null);
  const profile = loaded?.profile ?? (await resolveActiveProfileContext(user));
  const horoscope = await findHoroscope(user.id, profile.birthProfileId, 'daily', date);
  const remedy =
    horoscope?.status === 'ready'
      ? ((
          horoscope.structured as {
            remedy?: { slug: string; japCount: number; reason: string };
          } | null
        )?.remedy ?? null)
      : null;

  const ctx = loaded?.ctx;
  const running = ctx?.dasha.antardasha ?? ctx?.dasha.mahadasha ?? null;
  const items = buildItems({
    weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
    remedy,
    dasha: running
      ? {
          planet: running.planet,
          level: ctx?.dasha.antardasha ? 'antardasha' : 'mahadasha',
          until: running.endDate.slice(0, 10),
        }
      : null,
    moonHouseFromMoon: ctx?.transits.find((t) => t.planet === 'Moon')?.houseFromMoon ?? null,
  });

  const rows = await listPracticeDone(user.id, addDays(date, -60), date);
  return { date, items, ...summarizeDone(rows, date, items) };
}

/** Marks one of today's items done (idempotent) and returns the refreshed day. */
export async function completePractice(
  user: UserRow,
  itemId: PracticeItemId,
): Promise<PracticeToday> {
  const today = await getPracticeToday(user);
  if (!today.items.some((i) => i.id === itemId))
    throw Errors.badRequest('PRACTICE_ITEM_NOT_OFFERED');
  await markPracticeDone(user.id, today.date, itemId);
  const rows = await listPracticeDone(user.id, addDays(today.date, -60), today.date);
  return { ...today, ...summarizeDone(rows, today.date, today.items) };
}
