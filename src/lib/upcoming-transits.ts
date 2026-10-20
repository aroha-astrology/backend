// =============================================================================
// Upcoming transits — the dated sky events chat and voice are allowed to quote
// =============================================================================
// Chat used to see only where each planet is TODAY (fullGocharFacts in
// chat-grounding.ts). Asked when Jupiter enters Leo, it had no date to go on
// and made one up: "August 8, 2027", for an ingress the engine (and every
// Lahiri almanac) puts at 31 October 2026. This block hands the model every
// sign change, station and slow-planet nakshatra change ahead, to the minute,
// so a transit date is always quoted and never worked out.
//
// The dates come from the same ephemeris scan as transit alerts and the
// insights calendar (astro-tools/transit-events.ts), so chat cannot disagree
// with them.
// =============================================================================

import type { PlanetPosition } from '@aroha-astrology/shared';
import { NAKSHATRAS } from '@aroha-astrology/shared';
import { calculatePlanetPositions } from './astro-engine/calculations/planetPositions.js';
import {
  findNakshatraChanges,
  findTransitEvents,
  istDateString,
  jdFromDate,
  type NakshatraChange,
  type TransitEvent,
} from './astro-tools/transit-events.js';
import { SIGNS } from './astro-tools/transit.js';

/** Planets listed with two years of events, nakshatra changes included. */
export const SLOW_PLANETS: readonly string[] = ['Jupiter', 'Saturn', 'Rahu', 'Ketu'];
/** Planets listed with three months of sign changes and stations only. */
export const FAST_PLANETS: readonly string[] = ['Sun', 'Mercury', 'Venus', 'Mars'];

export const SLOW_HORIZON_DAYS = 730;
export const FAST_HORIZON_DAYS = 90;

const MS_PER_DAY = 86_400_000;
const NAKSHATRA_SPAN = 360 / 27;
/** An ingress and a nakshatra change this close together are the same crossing. */
const SAME_MOMENT_MS = 5 * 60_000;

export interface SkyEvents {
  events: TransitEvent[];
  nakshatraChanges: NakshatraChange[];
  /** End of the scanned range: nothing after this is known to the block. */
  scannedTo: Date;
}

// ---------------------------------------------------------------------------
// Scan (shared by every user, once per IST day)
// ---------------------------------------------------------------------------

const skyCache = new Map<string, Promise<SkyEvents>>();

/**
 * Every ingress and station for two years from the start of today (IST),
 * plus the slow planets' nakshatra changes. The sky is the same for every
 * user, so one scan a day serves every chat; it takes well under a second.
 */
export function upcomingSkyEvents(now: Date): Promise<SkyEvents> {
  const day = istDateString(now);
  const hit = skyCache.get(day);
  if (hit) return hit;

  const from = new Date(`${day}T00:00:00+05:30`);
  const to = new Date(from.getTime() + SLOW_HORIZON_DAYS * MS_PER_DAY);
  const value = (async (): Promise<SkyEvents> => ({
    events: await findTransitEvents(from, to),
    nakshatraChanges: await findNakshatraChanges(from, to, SLOW_PLANETS),
    scannedTo: to,
  }))();

  // Only today's scan is ever asked for again.
  skyCache.clear();
  skyCache.set(day, value);
  value.catch(() => skyCache.delete(day));
  return value;
}

// ---------------------------------------------------------------------------
// Formatting (pure)
// ---------------------------------------------------------------------------

/** "31 Oct 2026, 12:03 IST" */
export function formatIst(date: Date): string {
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${text} IST`;
}

/** "PurvaPhalguni" -> "Purva Phalguni", the way a reader writes it. */
function nakshatraName(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * The nakshatra a planet stands in just after crossing into `toSignIndex`:
 * the first one of the sign when it moves forward, the last one when it
 * moves backward (a retrograde planet, or Rahu/Ketu).
 */
function nakshatraOnEntry(toSignIndex: number, forward: boolean): string {
  const longitude = forward ? toSignIndex * 30 + 1e-6 : toSignIndex * 30 + 30 - 1e-6;
  return nakshatraName(NAKSHATRAS[Math.floor(longitude / NAKSHATRA_SPAN)] ?? '');
}

function houseOf(signIndex: number, fromSignIndex: number): number {
  return ((signIndex - fromSignIndex + 12) % 12) + 1;
}

function houseNote(
  signIndex: number,
  ascSignIndex: number | null,
  moonSignIndex: number | null,
): string {
  const parts: string[] = [];
  if (ascSignIndex != null) parts.push(`house ${houseOf(signIndex, ascSignIndex)} from your Lagna`);
  if (moonSignIndex != null)
    parts.push(`house ${houseOf(signIndex, moonSignIndex)} from your Moon`);
  return parts.join(', ');
}

interface Dated {
  at: Date;
  text: string;
}

function eventText(
  e: TransitEvent,
  ascSignIndex: number | null,
  moonSignIndex: number | null,
): string {
  if (e.eventType !== 'ingress') {
    const verb = e.eventType === 'retrograde' ? 'turns retrograde' : 'turns direct';
    return `${verb} ${formatIst(e.exactAt)} in ${e.fromSign}`;
  }
  const from = SIGNS.indexOf(e.fromSign);
  const to = SIGNS.indexOf(e.toSign ?? '');
  const forward = to === (from + 1) % 12;
  // Rahu and Ketu always move backward through the signs, so for them the
  // next sign is simply entered, not returned to.
  const node = e.planet === 'Rahu' || e.planet === 'Ketu';
  const verb = forward || node ? 'enters' : 'moves back into';
  const where = [
    `${nakshatraOnEntry(to, forward)} nakshatra`,
    houseNote(to, ascSignIndex, moonSignIndex),
  ]
    .filter(Boolean)
    .join('; ');
  return `${verb} ${e.toSign} ${formatIst(e.exactAt)} (${where})`;
}

/**
 * On a forward entry the planet will reverse out of before settling:
 * " — first entry only: back in Cancer from 25 Jan 2027, settles in Leo from
 * 26 Jun 2027". Put on the date itself because a prompt rule alone did not
 * stop the model quoting Jupiter's 31 Oct entry as the whole story.
 */
function firstEntryNote(e: TransitEvent, later: TransitEvent[]): string {
  if (e.eventType !== 'ingress' || e.planet === 'Rahu' || e.planet === 'Ketu') return '';
  const from = SIGNS.indexOf(e.fromSign);
  if (SIGNS.indexOf(e.toSign ?? '') !== (from + 1) % 12) return '';
  const out = later.find((x) => x.eventType === 'ingress');
  if (!out || out.toSign !== e.fromSign) return '';
  const settle = later
    .slice(later.indexOf(out) + 1)
    .find((x) => x.eventType === 'ingress' && x.toSign === e.toSign);
  const settles = settle ? `, settles in ${e.toSign} from ${formatIstDay(settle.exactAt)}` : '';
  return ` — first entry only: back in ${e.fromSign} from ${formatIstDay(out.exactAt)}${settles}`;
}

function currentText(
  p: PlanetPosition,
  ascSignIndex: number | null,
  moonSignIndex: number | null,
): string {
  // Rahu and Ketu always move backward; calling it out would add nothing.
  const node = p.planet === 'Rahu' || p.planet === 'Ketu';
  const retro = p.isRetrograde && !node ? ', retrograde' : '';
  const house = houseNote(p.signIndex, ascSignIndex, moonSignIndex);
  return `now in ${SIGNS[p.signIndex]} ${p.signDegree.toFixed(1)}° (${nakshatraName(p.nakshatra)} nakshatra${retro})${house ? `, ${house}` : ''}`;
}

/** "31 Oct 2026" */
function formatIstDay(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Each sign the planet will be in, with its span: "Leo 31 Oct 2026 - 25 Jan
 * 2027, Cancer 25 Jan 2027 - 26 Jun 2027, ...". Spelled out because, given only
 * the list of crossings, the model quoted Jupiter's first entry into Leo and
 * left out that it slips back into Cancer for five months before settling.
 */
function staysText(currentSignIndex: number, ingresses: TransitEvent[], until: Date): string {
  const spans: string[] = [];
  let sign = SIGNS[currentSignIndex];
  let from: string | null = null;
  for (const e of ingresses) {
    spans.push(`${sign} ${from ? `${from} - ` : 'until '}${formatIstDay(e.exactAt)}`);
    sign = e.toSign ?? sign;
    from = formatIstDay(e.exactAt);
  }
  spans.push(`${sign} from ${from} (beyond ${istDateString(until)} not computed)`);
  return spans.join(', ');
}

/**
 * One line per planet: where it is now, then every event ahead within its
 * horizon, in order, each with its exact IST moment. Pure: the caller
 * supplies the scan, today's positions and the user's Lagna/Moon signs.
 */
export function upcomingTransitFacts(
  sky: SkyEvents,
  current: PlanetPosition[],
  now: Date,
  ascSignIndex: number | null,
  moonSignIndex: number | null,
): string[] {
  const fastUntil = new Date(now.getTime() + FAST_HORIZON_DAYS * MS_PER_DAY);
  const lines: string[] = [];

  for (const planet of [...SLOW_PLANETS, ...FAST_PLANETS]) {
    const p = current.find((x) => x.planet === planet);
    if (!p) continue;
    const slow = SLOW_PLANETS.includes(planet);
    const until = slow ? sky.scannedTo : fastUntil;
    const ahead = (at: Date) => at > now && at < until;

    const ingresses = sky.events.filter(
      (e) => e.planet === planet && e.eventType === 'ingress' && ahead(e.exactAt),
    );
    const items: Dated[] = sky.events
      .filter((e) => e.planet === planet && ahead(e.exactAt))
      .map((e, i, all) => ({
        at: e.exactAt,
        text: eventText(e, ascSignIndex, moonSignIndex) + firstEntryNote(e, all.slice(i + 1)),
      }));

    if (slow) {
      for (const n of sky.nakshatraChanges) {
        if (n.planet !== planet || !ahead(n.exactAt)) continue;
        // A sign change on a nakshatra boundary already names the nakshatra.
        const sameAsIngress = ingresses.some(
          (e) => Math.abs(e.exactAt.getTime() - n.exactAt.getTime()) < SAME_MOMENT_MS,
        );
        if (sameAsIngress) continue;
        items.push({
          at: n.exactAt,
          text: `moves into ${nakshatraName(n.toNakshatra)} nakshatra ${formatIst(n.exactAt)}`,
        });
      }
    }
    items.sort((a, b) => a.at.getTime() - b.at.getTime());

    const untilText = istDateString(until);
    const next =
      items.length > 0
        ? `Next: ${items.map((i) => i.text).join('; ')}.`
        : `No change of sign${slow ? ' or nakshatra' : ''} before ${untilText}.`;
    const stays =
      slow && ingresses.length > 0
        ? ` Signs in turn: ${staysText(p.signIndex, ingresses, until)}.`
        : '';
    lines.push(`${planet} — ${currentText(p, ascSignIndex, moonSignIndex)}. ${next}${stays}`);
  }

  if (lines.length === 0) return [];
  const header =
    `UPCOMING TRANSITS (exact moments from the Aroha ephemeris, Lahiri sidereal, in IST; ` +
    `Jupiter/Saturn/Rahu/Ketu through ${istDateString(sky.scannedTo)}, the others for the next ${FAST_HORIZON_DAYS} days). ` +
    `These are the only transit dates you may state: quote them exactly as given, never work one out or recall one. ` +
    `"House N from your Lagna/Moon" is the house that sign is for this user.`;
  return [header, ...lines];
}

/**
 * The grounding lines for chat and voice. Best-effort like every other
 * transit fact: a scan failure leaves the block out rather than breaking
 * the reply, and the model is already told not to invent what is missing.
 */
export async function upcomingTransitFactsNow(
  now: Date,
  ascSignIndex: number | null,
  moonSignIndex: number | null,
): Promise<string[]> {
  try {
    const [sky, current] = await Promise.all([
      upcomingSkyEvents(now),
      calculatePlanetPositions(jdFromDate(now)),
    ]);
    return upcomingTransitFacts(sky, current, now, ascSignIndex, moonSignIndex);
  } catch {
    return [];
  }
}
