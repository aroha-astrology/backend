// =============================================================================
// Cosmic Receipts — three timed cards for a day (pure)
// =============================================================================
// Each part of the local day (morning, afternoon, evening) gets one card: the tightest Western aspect
// (conjunction, sextile, square, trine, opposition) the transiting Moon makes to one of the reader's
// natal planets in that part, with the degrees as proof. If the Moon makes no aspect within the orb in
// that part the card says it was a quiet window; nothing is invented to fill the card.
//
// These are aspects in the Western sense, so the page calls them "aspects", not Vedic drishti. The
// angle between two points on the zodiac is the same in the sidereal and the tropical frame, so the
// reader's sidereal chart can be used as it is. The words are tendencies ("may feel"), and no accuracy
// figure is ever shown.
// =============================================================================

import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { RECEIPT_ASPECT_ORB_DEG, RECEIPT_ASPECTS } from './weights.js';

export const PARTS = [
  { part: 'morning', startMin: 360, endMin: 720 },
  { part: 'afternoon', startMin: 720, endMin: 1080 },
  { part: 'evening', startMin: 1080, endMin: 1440 },
] as const;
export type ReceiptPart = (typeof PARTS)[number]['part'];

export interface NatalPoint {
  planet: string;
  longitude: number;
}

/** The Moon's longitude at minutes after local midnight (a sample every 30 minutes or finer). */
export interface MoonPoint {
  atMin: number;
  longitude: number;
}

export interface ReceiptCard {
  part: ReceiptPart;
  startMin: number;
  endMin: number;
  /** The Moon's sign at the middle of the part. */
  moonSign: string;
  aspect: null | {
    name: string;
    tone: 'easy' | 'friction' | 'intense';
    natalPlanet: string;
    orbDeg: number;
    /** Minutes after local midnight when the Moon is closest to exact inside the part. */
    peakMin: number;
  };
  headline: string;
  text: string;
  /** The degrees behind the card, as one line the page shows under it. */
  proof: string;
}

const SIGN = (i: number): string => ZODIAC_SIGNS[((i % 12) + 12) % 12] as string;
const norm = (d: number): number => ((d % 360) + 360) % 360;
const sep = (a: number, b: number): number => {
  const d = Math.abs(norm(a) - norm(b));
  return d > 180 ? 360 - d : d;
};
export const degText = (lon: number): string => {
  const inSign = norm(lon) % 30;
  const d = Math.floor(inSign);
  const m = Math.round((inSign - d) * 60);
  return `${m === 60 ? d + 1 : d}°${String(m === 60 ? 0 : m).padStart(2, '0')}′ ${SIGN(Math.floor(norm(lon) / 30))}`;
};

const THEME: Record<string, string> = {
  Sun: 'your confidence and how visible you feel',
  Moon: 'your mood and your sense of home',
  Mercury: 'your thinking and how you talk things through',
  Venus: 'warmth, taste and closeness',
  Mars: 'your drive and how quickly you react',
  Jupiter: 'optimism and the wish to grow',
  Saturn: 'structure, patience and responsibility',
};

const TONE_WORDS = {
  easy: 'flows more easily',
  friction: 'may ask a little patience',
  intense: 'may feel concentrated',
} as const;

function moonLongitudeAt(track: MoonPoint[], min: number): number {
  let best = track[0]!;
  for (const p of track) if (Math.abs(p.atMin - min) < Math.abs(best.atMin - min)) best = p;
  return best.longitude;
}

/** The three cards of one local day. `natal` is the seven grahas; Rahu and Ketu are left out of aspects. */
export function buildReceipts(natal: NatalPoint[], track: MoonPoint[]): ReceiptCard[] {
  if (track.length < 24) throw new Error('need a Moon track for the whole day');
  const planets = natal.filter((n) => THEME[n.planet]);
  return PARTS.map(({ part, startMin, endMin }) => {
    let best: { orb: number; peak: number; asp: (typeof RECEIPT_ASPECTS)[number]; np: NatalPoint; moon: number } | null = null;
    for (const s of track) {
      if (s.atMin < startMin || s.atMin >= endMin) continue;
      for (const np of planets) {
        for (const asp of RECEIPT_ASPECTS) {
          const orb = Math.abs(sep(s.longitude, np.longitude) - asp.angle);
          if (orb <= RECEIPT_ASPECT_ORB_DEG && (!best || orb < best.orb)) best = { orb, peak: s.atMin, asp, np, moon: s.longitude };
        }
      }
    }
    const mid = moonLongitudeAt(track, (startMin + endMin) / 2);
    const moonSign = SIGN(Math.floor(norm(mid) / 30));
    if (!best) {
      return {
        part, startMin, endMin, moonSign, aspect: null,
        headline: 'A quiet window',
        text: `The Moon moves through ${moonSign} without a close aspect to your natal planets in this part of the day.`,
        proof: `Moon in ${moonSign}; no aspect within ${RECEIPT_ASPECT_ORB_DEG}° to a natal planet`,
      };
    }
    const orb = Math.round(best.orb * 100) / 100;
    return {
      part, startMin, endMin, moonSign,
      aspect: { name: best.asp.name, tone: best.asp.tone, natalPlanet: best.np.planet, orbDeg: orb, peakMin: best.peak },
      headline: `Moon ${best.asp.name} your ${best.np.planet}`,
      text: `The Moon makes a ${best.asp.name} to your natal ${best.np.planet}, which touches ${THEME[best.np.planet]}. This part of the day ${TONE_WORDS[best.asp.tone]}.`,
      proof: `Moon ${degText(best.moon)} ${best.asp.name} natal ${best.np.planet} ${degText(best.np.longitude)}, orb ${Math.floor(orb)}°${String(Math.round((orb % 1) * 60)).padStart(2, '0')}′`,
    };
  });
}

export type Verdict = 'nailed' | 'partly' | 'missed';
export const VERDICTS: readonly Verdict[] = ['nailed', 'partly', 'missed'];

/** What the share image may say: counts of the reader's own marks, never an accuracy percentage. */
export function shareLine(verdicts: Partial<Record<ReceiptPart, Verdict>>): { rated: number; nailed: number; partly: number; missed: number } {
  const v = Object.values(verdicts);
  return {
    rated: v.length,
    nailed: v.filter((x) => x === 'nailed').length,
    partly: v.filter((x) => x === 'partly').length,
    missed: v.filter((x) => x === 'missed').length,
  };
}
