// =============================================================================
// VarshikFacts, C5 part: eclipse class and visibility, the no-muhurat periods
// =============================================================================
// Eclipses: type and magnitude come from panchang/eclipse.ts (the one module chat, Calendar, Decide
// and every report read). Visibility is judged where the reader LIVES NOW when the account has a
// current location and the report is for the account owner; otherwise it is a labelled India-wide
// summary of five cities. Never the birth place.
//
// Closures: the year's Shukra Asta, Guru Asta, Kharmas and Chaturmas (varshik-muhurta.ts), which
// keep the "go" window of the marriage, commitment and home-move rows out of them.
// =============================================================================

import { z } from 'zod';
import {
  classifyEclipse,
  INDIA_ECLIPSE_CITIES,
  type EclipseEvent,
  type EclipsePlace,
} from '../panchang/eclipse.js';
import { CLOSURE_REASONS, type ClosureReason } from './varshik-muhurta.js';

const fin = z.number().finite();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const localStamp = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

export const eclipsePlaceZ = z.object({
  /** 'reader' = the reader's current location; 'india' = the five-city summary. */
  scope: z.enum(['reader', 'india']),
  /** "Pune", or "India (Delhi, Mumbai, Kolkata, Chennai, Bengaluru)". */
  name: z.string().min(2),
  /** The zone the eclipse times are written in. */
  tz: z.string().min(2),
});

export const eclipseInfoZ = z.object({
  subtype: z.enum(['total', 'annular', 'hybrid', 'partial', 'penumbral']),
  /** Solar: eclipse magnitude at greatest eclipse. Lunar: umbral magnitude (0 for a penumbral one). */
  magnitude: fin,
  /** Lunar only. */
  penumbralMagnitude: fin.nullable(),
  class: z.enum(['grahan', 'upachchaya', 'not_visible']),
  /** One row per place looked at; times are local in eclipsePlace.tz, on the eclipse's date. */
  places: z
    .array(
      z.object({
        name: z.string().min(2),
        visible: z.boolean(),
        from: hhmm.nullable(),
        to: hhmm.nullable(),
        /** Solar: fraction of the Sun's diameter covered, seen here. Lunar: umbral magnitude. */
        magnitude: fin.nullable(),
      }),
    )
    .min(1),
  /** Grahan only: Sutak from (local first contact minus 12 h solar / 9 h lunar) to the end, per visible place. */
  sutak: z.array(z.object({ place: z.string().min(2), from: localStamp, to: localStamp })),
  /** Only a Grahan may act as a personal trigger in the text; Upachchaya and unseen eclipses never do. */
  personalTrigger: z.boolean(),
});

export type EclipseInfo = z.infer<typeof eclipseInfoZ>;
export type EclipsePlaceFact = z.infer<typeof eclipsePlaceZ>;

export const closureZ = z.object({
  reason: z.enum(CLOSURE_REASONS as [ClosureReason, ...ClosureReason[]]),
  from: isoDate,
  to: isoDate,
});

/** The C5 fields on a decision row. */
export const decisionC5Z = z.object({
  /** A marriage, commitment or home-move row: its best window keeps out of every closure. */
  closed: z.boolean(),
  /** The open runs of days inside the best window (empty when `closed` is false). */
  openSpans: z.array(z.object({ from: isoDate, to: isoDate })),
  /** The closures that touch this row in the year, for the words (empty when `closed` is false). */
  closures: z.array(closureZ),
  /** Per closure: 'panchang' when drikpanchang states the rule for this event, 'report' when it is the report's own rule. */
  ruleSource: z.array(z.enum(['panchang', 'report'])),
  noOpenWindow: z.boolean(),
  /** A soft custom line: move-in (many families also avoid Kharmas and Chaturmas), engagement (the wedding rules). */
  note: z.enum(['move_custom', 'sagai_custom']).nullable(),
});

export interface ReaderPlace {
  name: string;
  lat: number;
  lon: number;
  tz: string;
}

/** Where eclipses are judged: the reader's current place, else the India summary. Never the birth place. */
export function eclipsePlaceOf(current: ReaderPlace | null | undefined): {
  fact: EclipsePlaceFact;
  places: EclipsePlace[];
} {
  if (current) {
    return {
      fact: { scope: 'reader', name: current.name || 'your current location', tz: current.tz },
      places: [{ name: current.name || 'your current location', lat: current.lat, lon: current.lon }],
    };
  }
  return {
    fact: {
      scope: 'india',
      name: `India (${INDIA_ECLIPSE_CITIES.map((c) => c.name).join(', ')})`,
      tz: 'Asia/Kolkata',
    },
    places: INDIA_ECLIPSE_CITIES,
  };
}

function hm(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

function stamp(d: Date, tz: string): string {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return `${date} ${hm(d, tz)}`;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** The eclipse block of one sky event. */
export async function eclipseInfo(
  e: EclipseEvent,
  where: ReturnType<typeof eclipsePlaceOf>,
): Promise<EclipseInfo> {
  const c = await classifyEclipse(e, where.places, where.fact.scope);
  const tz = where.fact.tz;
  return {
    subtype: e.subtype,
    magnitude: r3(e.magnitude),
    penumbralMagnitude: e.penumbralMagnitude === undefined ? null : r3(e.penumbralMagnitude),
    class: c.class,
    places: c.local.map((l) => ({
      name: l.place.name,
      visible: l.visible,
      from: l.fromAt ? hm(l.fromAt, tz) : null,
      to: l.toAt ? hm(l.toAt, tz) : null,
      magnitude: l.magnitude === null ? null : r3(l.magnitude),
    })),
    sutak: c.sutak.map((s) => ({ place: s.place, from: stamp(s.fromAt, tz), to: stamp(s.toAt, tz) })),
    personalTrigger: c.personalTrigger,
  };
}
