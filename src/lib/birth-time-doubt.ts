/**
 * What an unknown birth time does to the Moon, the one thing the unknown-time guidance tells the
 * model to trust (lib/birth-time-window.ts: "ground everything in the Moon's sign and nakshatra").
 *
 * The chart of an 'unknown'-accuracy reader is cast for one time inside the part-of-day window they
 * named, so their true birth time can be anywhere in that window. The Moon moves about 13 degrees a
 * day, so across a 6 hour window it covers 3 to 4 degrees: enough to change sign for about 1 chart
 * in 10 and birth star for about 1 in 4 (audit H3, 2026-10-28: 3 and 10 of 51 unknown-time charts in
 * production). Sade Sati, Dhaiya, the Moon-sign horoscope, matching and the whole Vimshottari
 * sequence hang on those two facts.
 *
 * Pure and synchronous for the geometry (`birthTimeDoubt`), async only for the Saturn states of each
 * candidate Moon sign (`birthTimeDoubtFacts`). Chat, voice, the horoscope and reports all take their
 * lines from `birthTimeDoubtFacts`, so they cannot drift apart.
 */

import {
  NAKSHATRAS,
  NAKSHATRA_LORDS,
  NAKSHATRA_SPAN,
  VIMSHOTTARI_YEARS,
  ZODIAC_SIGNS,
} from '@aroha-astrology/shared';

import { birthTimeWindowFor } from './birth-time-window.js';
import { calculateVimshottariDasha } from './astro-engine/dashas/index.js';
import { detectCurrentSadeSati } from './astro-engine/doshas/sadeSati.js';
import { detectCurrentDhaiya } from './astro-engine/doshas/dhaiya.js';

/** Mean daily motion of the Moon, used only when the stored Moon has no speed. */
const MEAN_MOON_SPEED = 13.176;
const MS_PER_DAY = 86_400_000;
const UNIX_EPOCH_JD = 2440587.5;

export interface MoonPoint {
  longitude: number;
  sign: string;
  signIndex: number;
  nakshatra: string;
  nakshatraIndex: number;
  nakshatraLord: string;
}

export interface BirthTimeDoubt {
  /** English range of the part of the day the reader named, e.g. '06:00–12:00'. */
  windowRange: string;
  /** Degrees the Moon travels between the two ends of the window. */
  spanDegrees: number;
  start: MoonPoint;
  end: MoonPoint;
  signDiffers: boolean;
  nakshatraDiffers: boolean;
  /** The distinct (sign, star) the Moon could be in, window start first. One entry when nothing crosses. */
  candidates: MoonPoint[];
  /** Mahadasha lord the chart's own Moon star gives. */
  birthDashaLord: string;
  /** Every dasha date can move this many years either way if the star does not change. */
  dashaMarginYears: number;
  /** Birth instant the chart was cast for. */
  birthInstant: Date;
}

function pointAt(longitude: number): MoonPoint {
  const lon = ((longitude % 360) + 360) % 360;
  const signIndex = Math.floor(lon / 30);
  const nakshatraIndex = Math.min(26, Math.floor(lon / NAKSHATRA_SPAN));
  return {
    longitude: lon,
    sign: ZODIAC_SIGNS[signIndex] as string,
    signIndex,
    nakshatra: NAKSHATRAS[nakshatraIndex] as string,
    nakshatraIndex,
    nakshatraLord: NAKSHATRA_LORDS[nakshatraIndex] as string,
  };
}

function hoursOfDay(time: string): number | null {
  const [h, m] = time.split(':');
  const hours = Number(h);
  const minutes = Number(m ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours + minutes / 60;
}

/**
 * Where the Moon is at both ends of the window the reader named. The window comes from the stored
 * clock time (`birthTimeWindowFor`), and the offsets are measured from THAT time, because the chart
 * was cast for it: a midpoint for onboarding rows, the typed time for older rows.
 *
 * The Moon is moved in a straight line from its stored longitude and speed. Across 6 hours that is
 * good to about 0.01 degrees (checked against the ephemeris in test/birth-time-doubt.spec.ts).
 */
export function birthTimeDoubt(
  chart: Record<string, unknown> | null,
  timeOfBirth: string | null | undefined,
): BirthTimeDoubt | null {
  const w = birthTimeWindowFor(timeOfBirth);
  const t = timeOfBirth ? hoursOfDay(timeOfBirth) : null;
  const planets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  const moon = planets.find((p) => p.planet === 'Moon');
  if (!w || t == null || !moon || !Number.isFinite(Number(moon.longitude))) return null;

  const lon = Number(moon.longitude);
  const rawSpeed = Number(moon.speed);
  const speed = Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed : MEAN_MOON_SPEED;
  const startLon = lon + (speed * (w.startH - t)) / 24;
  const endLon = lon + (speed * (w.endH - t)) / 24;
  const start = pointAt(startLon);
  const end = pointAt(endLon);

  const signDiffers = start.signIndex !== end.signIndex;
  const nakshatraDiffers = start.nakshatraIndex !== end.nakshatraIndex;
  const candidates = signDiffers || nakshatraDiffers ? [start, end] : [start];

  const chartMoon = pointAt(lon);
  const reach = Math.max(Math.abs(lon - startLon), Math.abs(endLon - lon));
  const years = VIMSHOTTARI_YEARS[chartMoon.nakshatraLord as keyof typeof VIMSHOTTARI_YEARS] ?? 0;
  const jd = Number(chart?.julianDay);

  return {
    windowRange: w.range,
    spanDegrees: Math.abs(endLon - startLon),
    start,
    end,
    signDiffers,
    nakshatraDiffers,
    candidates,
    birthDashaLord: chartMoon.nakshatraLord,
    dashaMarginYears: (reach / NAKSHATRA_SPAN) * years,
    birthInstant: new Date(Number.isFinite(jd) ? (jd - UNIX_EPOCH_JD) * MS_PER_DAY : Date.now()),
  };
}

/** The year of a date the engine hands back as a Date, or as an ISO string once saved. */
function year(d: unknown): string {
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? '' : String(d.getUTCFullYear());
  return d ? String(d).slice(0, 4) : '';
}

/** One candidate Moon sign as a Saturn line: Sade Sati and Dhaiya, years only. */
async function saturnStates(sign: string, asOf: Date): Promise<string> {
  const [sade, dhaiya] = await Promise.allSettled([
    detectCurrentSadeSati(sign as never, asOf),
    detectCurrentDhaiya(sign as never, asOf),
  ]);
  const parts: string[] = [];
  if (sade.status === 'fulfilled') {
    const s = sade.value as unknown as Record<string, unknown>;
    parts.push(
      s.active
        ? `Sade Sati ACTIVE (${String(s.phase)} phase, running ${year(s.startDate)} to ${year(s.endDate)})`
        : `Sade Sati not active${s.next ? ` (next one starts ${year((s.next as Record<string, unknown>).startDate)})` : ''}`,
    );
  }
  if (dhaiya.status === 'fulfilled') {
    const d = dhaiya.value as unknown as Record<string, unknown>;
    parts.push(
      d.active
        ? `Shani Dhaiya ACTIVE (${String(d.phase)} from the Moon, running ${year(d.startDate)} to ${year(d.endDate)})`
        : 'Shani Dhaiya not active',
    );
  }
  return parts.join('; ');
}

function dashaToday(moon: MoonPoint, birth: Date, asOf: Date): string {
  const d = calculateVimshottariDasha(moon.longitude, birth, asOf) as unknown as {
    currentMahadasha?: { planet?: string };
  };
  return d.currentMahadasha?.planet ?? moon.nakshatraLord;
}

/**
 * The fact lines every surface adds for an unknown birth time, after the general guidance
 * (`unknownBirthTimeGuidance`): which Moon sign and star the reader may have, what Saturn and the
 * dasha look like for each, and how far every dasha date can move. Empty without a usable Moon.
 */
export async function birthTimeDoubtFacts(
  chart: Record<string, unknown> | null,
  timeOfBirth: string | null | undefined,
  opts: { asOf?: Date } = {},
): Promise<string[]> {
  const doubt = birthTimeDoubt(chart, timeOfBirth);
  if (!doubt) return [];
  const asOf = opts.asOf ?? new Date();
  const facts: string[] = [];
  const margin = doubt.dashaMarginYears.toFixed(1);

  if (doubt.candidates.length === 1) {
    const c = doubt.candidates[0]!;
    facts.push(
      `BIRTH TIME DOUBT (Moon): the reader's window (${doubt.windowRange}) is wide enough for the Moon to move ${doubt.spanDegrees.toFixed(1)} degrees, but the Moon sign and birth star are the same across the whole window (${c.sign}, ${c.nakshatra}). Sade Sati, Dhaiya, the Moon-sign reading and the birth star are safe to use.`,
    );
  } else {
    const [a, b] = doubt.candidates as [MoonPoint, MoonPoint];
    const what: string[] = [];
    if (doubt.signDiffers) what.push(`the Moon sign may be ${a.sign} or ${b.sign}`);
    if (doubt.nakshatraDiffers)
      what.push(
        `the birth star may be ${a.nakshatra} (dasha sequence starts with ${a.nakshatraLord}) or ${b.nakshatra} (starts with ${b.nakshatraLord})`,
      );
    facts.push(
      `BIRTH TIME DOUBT (Moon): the reader only knows their birth time to within ${doubt.windowRange}, and in that window the Moon moves ${doubt.spanDegrees.toFixed(1)} degrees across a boundary, so ${what.join(' and ')}. The chart below was cast for one time in the window, so it shows one of these.`,
    );
    const todayA = dashaToday(a, doubt.birthInstant, asOf);
    const todayB = dashaToday(b, doubt.birthInstant, asOf);
    const dashaLine = (x: MoonPoint, y: MoonPoint): string =>
      todayA === todayB
        ? `The Mahadasha today is ${todayA} on either reading; its sub-periods and dates still depend on the exact time.`
        : `The Mahadasha today would be ${todayA} for ${x.nakshatra} or ${todayB} for ${y.nakshatra}.`;
    if (doubt.signDiffers) {
      for (const c of doubt.candidates) {
        facts.push(
          `If the Moon is in ${c.sign} (${c.nakshatra}): ${await saturnStates(c.sign, asOf)}.`,
        );
      }
      facts.push(dashaLine(a, b));
    } else {
      facts.push(
        `Sade Sati and Dhaiya are the same either way (Moon in ${a.sign}): ${await saturnStates(a.sign, asOf)}. ${dashaLine(a, b)}`,
      );
    }
    facts.push(
      'Do not pick one of the two and state it as fact. Say honestly that this depends on the exact birth time, give both readings side by side when the question turns on the Moon sign, birth star, Sade Sati, Dhaiya or the dasha, and say a confirmed birth time settles it.',
    );
  }

  facts.push(
    `DASHA MARGIN: with the birth time only known to within ${doubt.windowRange}, every Mahadasha and Antardasha start and end date can be off by about ${margin} years either way (the birth dasha is ${doubt.birthDashaLord}). Give dasha periods by year only, never a month or day. Leave out the pratyantardasha (sub-minor period) and any day-level dasha date.`,
  );
  return facts;
}
