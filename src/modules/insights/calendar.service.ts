// =============================================================================
// Aroha Calendar — one personal list of what's coming
// =============================================================================
// Merges what the app already computes into dated events for one chart:
// - planet sign changes and retrograde/direct stations, placed in the user's
//   own houses (counted from the natal Moon) and marked favourable or not by
//   classical gochara;
// - Sade Sati / Dhaiya phase changes for the natal Moon;
// - Antardasha changes, and Pratyantardasha periods whose lord speaks for a
//   life area ("a career window begins");
// - eclipses, Hindu festivals, and the next week's Moon sign changes.
// No AI call. Titles are built on the device from the event kind and params.
// =============================================================================

import { ZODIAC_SIGNS, type Planet } from '@aroha-astrology/shared';
import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  findTransitEvents,
  PLANET_WEIGHT,
  type TransitEvent,
} from '../../lib/astro-tools/transit-events.js';
import { findMoonChanges } from '../../lib/astro-tools/moon-events.js';
import { buildSaturnPhaseTimeline } from '../../lib/astro-engine/doshas/saturnPhaseTimeline.js';
import { eclipsesBetween } from '../../lib/astro-engine/panchang/eclipse.js';
import {
  dashaPeriodsInRange,
  type StoredMahadasha,
} from '../../lib/astro-engine/dashas/dasha-range.js';
import { getFestivalsForDate } from '../../config/hindu-festivals.js';
import { houseFrom, type ChartContext } from '../../lib/intelligence/chart-context.js';
import {
  areaOfHouse,
  isFavourableTransit,
  placementEffect,
  planetAreas,
} from '../../lib/intelligence/why.js';
import type { LifeArea } from '../../lib/intelligence/areas.js';
import type { WhyFactor } from '../../lib/intelligence/types.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { loadChartContext } from './insights.service.js';

export type CalendarEventKind =
  | 'ingress'
  | 'retrograde'
  | 'direct'
  | 'dashaChange'
  | 'areaWindow'
  | 'saturnPhase'
  | 'eclipse'
  | 'festival'
  | 'moonSign';

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  /** IST calendar date the event starts, YYYY-MM-DD. */
  date: string;
  /** Exact instant when the event has one (sign changes, stations, eclipses). */
  exactAt?: string;
  /** Last day of a period-type event (dasha, window, Saturn phase, a transit's stay in a sign). */
  endDate?: string;
  /** Middle of a period-type event. */
  peakDate?: string;
  area?: LifeArea;
  /** +1 favourable, -1 needs care, 0 neutral/informational. */
  tone: -1 | 0 | 1;
  /** 0-100, how much it matters — the Home card shows the heaviest upcoming one. */
  weight: number;
  params: Record<string, string | number>;
  why: WhyFactor[];
}

export interface CalendarResponse {
  from: string;
  to: string;
  events: CalendarEvent[];
}

export const MAX_CALENDAR_DAYS = 180;
const MOON_SIGN_DAYS = 7;

/** YYYY-MM-DD in IST. */
export function istDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(at);
}

function midpoint(start: Date, end: Date): string {
  return istDate(new Date((start.getTime() + end.getTime()) / 2));
}

/* ---------------------------- global transit cache ------------------------- */
// Planet movements are the same for every user, so a day's scan is shared.

const transitCache = new Map<string, { at: number; value: Promise<TransitEvent[]> }>();
const TRANSIT_TTL_MS = 12 * 3_600_000;

function transitsBetween(from: Date, to: Date): Promise<TransitEvent[]> {
  const key = `${istDate(from)}:${istDate(to)}`;
  const hit = transitCache.get(key);
  if (hit && Date.now() - hit.at < TRANSIT_TTL_MS) return hit.value;
  const value = findTransitEvents(from, to);
  transitCache.set(key, { at: Date.now(), value });
  value.catch(() => transitCache.delete(key));
  if (transitCache.size > 64) transitCache.delete(transitCache.keys().next().value!);
  return value;
}

/* -------------------------------- builders -------------------------------- */

export function transitEvents(ctx: ChartContext, transits: TransitEvent[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const t of transits) {
    const signName = t.eventType === 'ingress' ? t.toSign! : t.fromSign;
    const signIndex = ZODIAC_SIGNS.indexOf(signName as (typeof ZODIAC_SIGNS)[number]);
    if (signIndex < 0) continue;
    const house = houseFrom(ctx.moonSignIndex, signIndex);
    const favourable = isFavourableTransit(t.planet, house);
    // A station matters less than a sign change; the weight table ranks planets.
    const base = PLANET_WEIGHT[t.planet] ?? 10;
    const weight = t.eventType === 'ingress' ? base : Math.round(base * 0.7);
    const tone: -1 | 1 = favourable ? 1 : -1;
    const event: CalendarEvent = {
      id: `${t.eventType}:${t.planet}:${t.exactAt.toISOString()}`,
      kind: t.eventType,
      date: t.forDate,
      exactAt: t.exactAt.toISOString(),
      area: areaOfHouse(house),
      tone,
      weight,
      params: { planet: t.planet, sign: signName, house },
      why: [
        {
          kind: 'transit',
          planet: t.planet,
          house,
          sign: signName,
          effect: tone,
          textKey: t.eventType === 'retrograde' ? 'why.transitRetro' : 'why.transit',
          params: { planet: t.planet, house, sign: signName },
        },
      ],
    };
    out.push(event);
  }
  // How long each planet stays: until its next sign change in the same list.
  const ingress = out.filter((e) => e.kind === 'ingress');
  for (const e of ingress) {
    const next = ingress.find(
      (n) => n.params.planet === e.params.planet && n.exactAt! > e.exactAt!,
    );
    if (next) {
      e.endDate = next.date;
      e.peakDate = midpoint(new Date(e.exactAt!), new Date(next.exactAt!));
    }
  }
  return out;
}

export function dashaEvents(
  ctx: ChartContext,
  mahadashas: StoredMahadasha[],
  from: Date,
  to: Date,
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const startsInRange = (d: Date) => d.getTime() >= from.getTime() && d.getTime() < to.getTime();

  for (const span of dashaPeriodsInRange(mahadashas, from, to, 1)) {
    if (!startsInRange(span.startDate)) continue;
    const planet = span.planet;
    const placed = ctx.natal.find((p) => p.planet === planet)?.house;
    const tone = placementEffect(placed);
    const areas = planetAreas(ctx, planet);
    out.push({
      id: `antardasha:${span.lords.join('-')}:${span.startDate.toISOString()}`,
      kind: 'dashaChange',
      date: istDate(span.startDate),
      endDate: istDate(span.endDate),
      peakDate: midpoint(span.startDate, span.endDate),
      ...(areas[0] ? { area: areas[0] } : {}),
      tone,
      weight: 80,
      params: { level: 'antardasha', planet, mahadasha: span.lords[0]! },
      why: [
        {
          kind: 'dasha',
          level: 'antardasha',
          planet,
          effect: tone,
          textKey: 'why.dasha.antardasha',
          params: { planet, until: istDate(span.endDate) },
        },
      ],
    });
  }

  for (const span of dashaPeriodsInRange(mahadashas, from, to, 2)) {
    if (!startsInRange(span.startDate)) continue;
    const planet: Planet = span.planet;
    const areas = planetAreas(ctx, planet);
    const area =
      areas.find((a) => a === 'career' || a === 'relationships' || a === 'money') ?? areas[0];
    if (!area) continue;
    const placed = ctx.natal.find((p) => p.planet === planet)?.house;
    const tone = placementEffect(placed);
    if (tone === 0) continue; // only windows that lean one way are worth a calendar entry
    out.push({
      id: `pratyantar:${span.lords.join('-')}:${span.startDate.toISOString()}`,
      kind: 'areaWindow',
      date: istDate(span.startDate),
      endDate: istDate(span.endDate),
      peakDate: midpoint(span.startDate, span.endDate),
      area,
      tone,
      weight: tone > 0 ? 60 : 50,
      params: { planet, level: 'pratyantardasha' },
      why: [
        {
          kind: 'dasha',
          level: 'pratyantardasha',
          planet,
          effect: tone,
          textKey: 'why.dasha.antardashaKaraka',
          params: { planet, until: istDate(span.endDate) },
        },
      ],
    });
  }
  return out;
}

export async function saturnPhaseEvents(
  ctx: ChartContext,
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  const segments = await buildSaturnPhaseTimeline(ctx.moonSignIndex, from, to);
  return segments
    .filter((s) => s.phase !== 'none' && s.startDate.getTime() > from.getTime())
    .map((s) => {
      const sign = ZODIAC_SIGNS[s.saturnSignIndex] ?? '';
      return {
        id: `saturn:${s.phase}:${s.startDate.toISOString()}`,
        kind: 'saturnPhase' as const,
        date: istDate(s.startDate),
        endDate: istDate(s.endDate),
        area: 'overall' as const,
        tone: -1 as const,
        weight: 90,
        params: { phase: s.phase, sign, house: s.houseFromMoon },
        why: [
          {
            kind: 'transit' as const,
            planet: 'Saturn',
            house: s.houseFromMoon,
            sign,
            effect: -1 as const,
            textKey: 'why.transit',
            params: { planet: 'Saturn', house: s.houseFromMoon, sign },
          },
        ],
      };
    });
}

export function festivalEvents(from: Date, to: Date): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += 86_400_000) {
    const date = istDate(new Date(t));
    for (const f of getFestivalsForDate(date)) {
      out.push({
        id: `festival:${date}:${f.name}`,
        kind: 'festival',
        date,
        tone: 0,
        weight: f.importance === 'major' ? 40 : 15,
        params: { name: f.name, emoji: f.emoji },
        why: [],
      });
    }
  }
  return out;
}

/* ---------------------------------- main ---------------------------------- */

export async function getCalendar(
  user: UserRow,
  fromDate: string,
  days: number,
): Promise<CalendarResponse> {
  const span = Math.min(Math.max(days, 1), MAX_CALENDAR_DAYS);
  const from = new Date(`${fromDate}T00:00:00+05:30`);
  const to = new Date(from.getTime() + span * 86_400_000);

  const loaded = await loadChartContext(user, from);
  if (!loaded) throw Errors.conflict('CHART_NOT_READY');
  const { profile, ctx } = loaded;
  const kundli = await findKundliByUserId(user.id, profile.birthProfileId);
  const mahadashas =
    (kundli?.dashaData as { vimshottari?: { mahadashas?: StoredMahadasha[] } } | null)?.vimshottari
      ?.mahadashas ?? [];

  const safe = async <T>(label: string, work: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await work();
    } catch (err) {
      logger.warn({ err, userId: user.id, label }, 'calendar: a source failed, skipping it');
      return [];
    }
  };

  const moonEnd = new Date(Math.min(to.getTime(), from.getTime() + MOON_SIGN_DAYS * 86_400_000));
  const [transits, saturn, eclipses, moons] = await Promise.all([
    safe('transits', async () => transitEvents(ctx, await transitsBetween(from, to))),
    safe('saturn', () => saturnPhaseEvents(ctx, from, to)),
    safe('eclipses', async () =>
      (await eclipsesBetween(from, to)).map(
        (e): CalendarEvent => ({
          id: `eclipse:${e.kind}:${e.at.toISOString()}`,
          kind: 'eclipse',
          date: istDate(e.at),
          exactAt: e.at.toISOString(),
          tone: -1,
          weight: 70,
          params: { eclipse: e.kind },
          why: [],
        }),
      ),
    ),
    safe('moon', async () =>
      (await findMoonChanges(from, moonEnd, ['sign'])).map(
        (m): CalendarEvent => ({
          id: `moon:${m.exactAt.toISOString()}`,
          kind: 'moonSign',
          date: m.forDate,
          exactAt: m.exactAt.toISOString(),
          area: areaOfHouse(houseFrom(ctx.moonSignIndex, m.toIndex)),
          tone: isFavourableTransit('Moon', houseFrom(ctx.moonSignIndex, m.toIndex)) ? 1 : -1,
          weight: 5,
          params: { sign: m.to, house: houseFrom(ctx.moonSignIndex, m.toIndex) },
          why: [],
        }),
      ),
    ),
  ]);

  const events = [
    ...transits,
    ...dashaEvents(ctx, mahadashas, from, to),
    ...saturn,
    ...eclipses,
    ...festivalEvents(from, to),
    ...moons,
  ].sort((a, b) => a.date.localeCompare(b.date) || b.weight - a.weight);

  return { from: istDate(from), to: istDate(new Date(to.getTime() - 1)), events };
}
