// =============================================================================
// Live now — what is running at a place right this minute
// =============================================================================
// One small answer for the Home "Now Bar" and the Android home-screen widget:
// the hora, the choghadiya, whether Rahu Kaal or Abhijit Muhurta is on, and the
// next good window. Built from the day's panchang (already cached per place and
// day), so the only work here is reading it at the minute in question.
//
// The whole payload stays under 2 KB (a test pins it) because a widget fetches it
// on a timer. Names are English; the app writes them in the reader's language.
// =============================================================================

import type { Choghadiya, Hora, PanchangData } from '@aroha-astrology/shared';

export const LIVE_NOW_MAX_BYTES = 2048;
/** The answer is valid for this long; the route and the in-memory cache both use it. */
export const LIVE_NOW_TTL_SECONDS = 15 * 60;

type Window = { start: string; end: string };

export interface LiveNow {
  v: 1;
  /** When this was built (ISO). */
  asOf: string;
  tz: string;
  /** The reader's local date and clock, so a widget can show them without a second call. */
  date: string;
  clock: string;
  tithi: { n: number; name: string; paksha: 'Shukla' | 'Krishna' };
  nakshatra: { name: string; pada: number };
  vara: string;
  hora: { planet: string; start: string; end: string; good: boolean } | null;
  choghadiya: { name: string; type: 'good' | 'bad' | 'neutral'; start: string; end: string } | null;
  rahuKaal: { start: string; end: string; on: boolean };
  abhijit: { start: string; end: string; on: boolean };
  /** The next good stretch today (a good choghadiya or Abhijit), if any is still to come. */
  nextGood: { label: string; start: string; inMin: number } | null;
  /** When the next cautious stretch (Rahu Kaal) begins today, if it has not started yet. */
  nextCaution: { label: string; start: string; inMin: number } | null;
  sunrise: string;
  sunset: string;
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Is `now` inside [start, end)? A window that runs past midnight wraps. */
export function inWindow(startMin: number, endMin: number, now: number): boolean {
  if (startMin === endMin) return false;
  return startMin < endMin ? now >= startMin && now < endMin : now >= startMin || now < endMin;
}

const within = (w: Window | { startTime: string; endTime: string }, now: number): boolean =>
  'start' in w
    ? inWindow(toMin(w.start), toMin(w.end), now)
    : inWindow(toMin(w.startTime), toMin(w.endTime), now);

/** Minutes from `now` until the clock reaches `startMin` later today; null when it already has. */
function untilToday(startMin: number, now: number): number | null {
  return startMin > now ? startMin - now : null;
}

/** The reader's local date (YYYY-MM-DD) and minutes after midnight at `at`. */
export function localClock(at: Date, timeZone: string): { date: string; minutes: number; clock: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const hh = parts.hour!.padStart(2, '0');
  const mm = parts.minute!.padStart(2, '0');
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(hh) * 60 + Number(mm),
    clock: `${hh}:${mm}`,
  };
}

type PanchangForNow = Pick<
  PanchangData,
  'tithi' | 'nakshatra' | 'vara' | 'rahuKaal' | 'abhijitMuhurta' | 'sunriseTime' | 'sunsetTime'
> & { choghadiya?: { day: Choghadiya[]; night: Choghadiya[] }; hora?: Hora[] };

/** The live answer for one place at one instant, from that day's panchang. */
export function buildLiveNow(panchang: PanchangForNow, at: Date, timeZone: string): LiveNow {
  const { date, minutes: now, clock } = localClock(at, timeZone);

  const horaNow = (panchang.hora ?? []).find((h) => within(h, now)) ?? null;
  const chogs = [...(panchang.choghadiya?.day ?? []), ...(panchang.choghadiya?.night ?? [])];
  const chogNow = chogs.find((c) => within(c, now)) ?? null;

  type Upcoming = { label: string; start: string; inMin: number };
  const goods: Upcoming[] = [];
  for (const c of chogs) {
    if (c.type !== 'good') continue;
    const inMin = untilToday(toMin(c.startTime), now);
    if (inMin !== null) goods.push({ label: c.name, start: c.startTime, inMin });
  }
  const abhijitIn = untilToday(toMin(panchang.abhijitMuhurta.start), now);
  if (abhijitIn !== null) {
    goods.push({ label: 'Abhijit', start: panchang.abhijitMuhurta.start, inMin: abhijitIn });
  }
  goods.sort((a, b) => a.inMin - b.inMin);

  const rahuIn = untilToday(toMin(panchang.rahuKaal.start), now);

  return {
    v: 1,
    asOf: at.toISOString(),
    tz: timeZone,
    date,
    clock,
    tithi: {
      n: panchang.tithi.number,
      name: panchang.tithi.name,
      paksha: panchang.tithi.paksha,
    },
    nakshatra: { name: panchang.nakshatra.name, pada: panchang.nakshatra.pada },
    vara: panchang.vara,
    hora: horaNow
      ? { planet: horaNow.planet, start: horaNow.startTime, end: horaNow.endTime, good: horaNow.isAuspicious }
      : null,
    choghadiya: chogNow
      ? { name: chogNow.name, type: chogNow.type, start: chogNow.startTime, end: chogNow.endTime }
      : null,
    rahuKaal: { ...panchang.rahuKaal, on: within(panchang.rahuKaal, now) },
    abhijit: { ...panchang.abhijitMuhurta, on: within(panchang.abhijitMuhurta, now) },
    nextGood: goods[0] ?? null,
    nextCaution: rahuIn !== null ? { label: 'Rahu Kaal', start: panchang.rahuKaal.start, inMin: rahuIn } : null,
    sunrise: panchang.sunriseTime,
    sunset: panchang.sunsetTime,
  };
}

/** The 15-minute slot an instant falls in: the cache key's time part. */
export function slotOf(at: Date): number {
  return Math.floor(at.getTime() / (LIVE_NOW_TTL_SECONDS * 1000));
}

/** Coordinates to the nearest 0.01° (about 1 km): enough for a panchang, and it keeps the cache shared. */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A tiny in-process cache: one entry per (15-minute slot, rounded place, zone). Old slots are
 * dropped on every write, so it never holds more than the current slot's places.
 */
export class LiveNowCache {
  private readonly entries = new Map<string, { slot: number; value: LiveNow }>();

  key(lat: number, lon: number, timeZone: string): string {
    return `${roundCoord(lat)}|${roundCoord(lon)}|${timeZone}`;
  }

  get(lat: number, lon: number, timeZone: string, at: Date): LiveNow | undefined {
    const hit = this.entries.get(this.key(lat, lon, timeZone));
    return hit && hit.slot === slotOf(at) ? hit.value : undefined;
  }

  set(lat: number, lon: number, timeZone: string, at: Date, value: LiveNow): void {
    const slot = slotOf(at);
    for (const [k, v] of this.entries) if (v.slot !== slot) this.entries.delete(k);
    this.entries.set(this.key(lat, lon, timeZone), { slot, value });
  }

  get size(): number {
    return this.entries.size;
  }
}
