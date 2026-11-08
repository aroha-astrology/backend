// @ts-nocheck
import type { ChartData } from '@aroha-astrology/shared';

/**
 * Gandanta, after the Brihat Parashara Hora Shastra chapter 92 (Santhanam's numbering;
 * docs/engine-audit/D-source-register.md, BPHS-92; audit Sprint 10, G4).
 *
 * The text names three kinds, each a short stretch either side of a junction:
 *  - Tithi: the last 2 ghatikas of a Purna tithi (5, 10, 15) and the first 2 of a Nanda tithi (1, 6, 11).
 *  - Nakshatra: the last 2 ghatikas of Revati, Ashlesha and Jyeshtha and the first 2 of Ashwini, Magha and Moola.
 *  - Lagna: the last half ghatika of Pisces, Cancer and Scorpio and the first half ghatika of Aries, Leo and Sagittarius.
 * Verse 5 adds Abhukta Moola: the last 6 ghatikas of Jyeshtha and the first 8 of Moola.
 *
 * A ghatika is read as 1/60 of its unit: a nakshatra is 60 ghatikas (13d20m), a tithi 60 (12d), a sign 60 (30d).
 * That is the usual reading for the nakshatra and tithi. For the Lagna the text gives no unit, so the same
 * proportion is used (0.25 degree); a clock-time reading (12 minutes, about 3 degrees of Lagna) is the other
 * option and is NOT used. Blogs quote a whole pada (3d20m) or "the last navamsa"; the verses do not say that.
 *
 * Without a real birth time the Moon, the tithi and above all the Lagna are only the stand-in time's
 * (the Moon moves 0.44 degree in under an hour), so nothing is claimed.
 */

const NAKSHATRA_SPAN = 360 / 27;
const GHATIKAS = 60;

/** Nakshatras (0-based index) that end at a junction, and those that start after one. */
const ENDING = { 8: 'Ashlesha', 17: 'Jyeshtha', 26: 'Revati' } as const;
const STARTING = { 0: 'Ashwini', 9: 'Magha', 18: 'Moola' } as const;
const NAKSHATRA_JUNCTION_PAIR = {
  Ashlesha: 'Magha',
  Jyeshtha: 'Moola',
  Revati: 'Ashwini',
  Magha: 'Ashlesha',
  Moola: 'Jyeshtha',
  Ashwini: 'Revati',
} as const;
const SIGN_NAMES = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];
const ENDING_SIGNS = [3, 7, 11]; // Cancer, Scorpio, Pisces
const STARTING_SIGNS = [4, 8, 0]; // Leo, Sagittarius, Aries

export interface GandantaPoint {
  present: boolean;
  /** Which side of the junction the point is on. */
  part: 'start' | 'end' | null;
}

export interface MoonGandanta extends GandantaPoint {
  nakshatra: string | null;
  /** Degrees from the junction (0 = on it). */
  degreesFromJunction: number | null;
}

export interface TithiGandanta extends GandantaPoint {
  /** Tithi number counted within its half, 1-15. */
  tithi: number;
  kind: 'purna' | 'nanda' | null;
}

export interface LagnaGandanta extends GandantaPoint {
  sign: string | null;
  degreesFromJunction: number | null;
}

export interface GandantaAnalysis {
  /** False when the birth time is a stand-in: no claim is made then. */
  timeKnown: boolean;
  /** Any of the three kinds. */
  present: boolean;
  moon: MoonGandanta | null;
  tithi: TithiGandanta | null;
  lagna: LagnaGandanta | null;
  /** The last 6 ghatikas of Jyeshtha or the first 8 of Moola (BPHS 92.5): the text's gravest case. */
  abhuktaMoola: boolean;
  description: string;
}

const norm = (d: number) => ((d % 360) + 360) % 360;
const round2 = (n: number) => Math.round(n * 100) / 100;

function moonPoint(moonLon: number): MoonGandanta & { abhukta: boolean } {
  const idx = Math.floor(moonLon / NAKSHATRA_SPAN);
  const into = moonLon - idx * NAKSHATRA_SPAN; // degrees into the nakshatra
  const window = (2 / GHATIKAS) * NAKSHATRA_SPAN;
  const left = NAKSHATRA_SPAN - into; // degrees to the end of the nakshatra

  if (idx in ENDING && left <= window) {
    return {
      present: true,
      part: 'end',
      nakshatra: ENDING[idx],
      degreesFromJunction: round2(left),
      abhukta: idx === 17 && left <= (6 / GHATIKAS) * NAKSHATRA_SPAN,
    };
  }
  if (idx in STARTING && into < window) {
    return {
      present: true,
      part: 'start',
      nakshatra: STARTING[idx],
      degreesFromJunction: round2(into),
      abhukta: idx === 18 && into < (8 / GHATIKAS) * NAKSHATRA_SPAN,
    };
  }
  // Abhukta Moola runs longer than the nakshatra Gandanta (6 and 8 ghatikas against 2).
  return {
    present: false,
    part: null,
    nakshatra: null,
    degreesFromJunction: null,
    abhukta:
      (idx === 17 && left <= (6 / GHATIKAS) * NAKSHATRA_SPAN) ||
      (idx === 18 && into < (8 / GHATIKAS) * NAKSHATRA_SPAN),
  };
}

/**
 * Nakshatra Gandanta (and Abhukta Moola) of any single sidereal longitude: a planet, the Lagna or the Moon.
 * The same test detectGandanta applies to the Moon, exported so every natal point is read by one rule.
 */
export function nakshatraGandantaAt(longitude: number): MoonGandanta & { abhuktaMoola: boolean } {
  const { abhukta, ...rest } = moonPoint(norm(longitude));
  return { ...rest, abhuktaMoola: abhukta };
}

function tithiPoint(sunLon: number, moonLon: number): TithiGandanta {
  const elongation = norm(moonLon - sunLon);
  const number = Math.floor(elongation / 12) + 1; // 1-30
  const within = elongation - (number - 1) * 12; // degrees into the tithi
  const window = (2 / GHATIKAS) * 12;
  const half = ((number - 1) % 15) + 1; // 1-15 within its half
  const purna = half % 5 === 0;
  const nanda = half % 5 === 1;
  if (purna && 12 - within <= window) {
    return { present: true, part: 'end', tithi: half, kind: 'purna' };
  }
  if (nanda && within < window) {
    return { present: true, part: 'start', tithi: half, kind: 'nanda' };
  }
  return { present: false, part: null, tithi: half, kind: null };
}

function lagnaPoint(ascLon: number): LagnaGandanta {
  const signIdx = Math.floor(ascLon / 30);
  const into = ascLon - signIdx * 30;
  const window = (0.5 / GHATIKAS) * 30;
  if (ENDING_SIGNS.includes(signIdx) && 30 - into <= window) {
    return {
      present: true,
      part: 'end',
      sign: SIGN_NAMES[signIdx],
      degreesFromJunction: round2(30 - into),
    };
  }
  if (STARTING_SIGNS.includes(signIdx) && into < window) {
    return {
      present: true,
      part: 'start',
      sign: SIGN_NAMES[signIdx],
      degreesFromJunction: round2(into),
    };
  }
  return { present: false, part: null, sign: null, degreesFromJunction: null };
}

function describe(a: Omit<GandantaAnalysis, 'description'>): string {
  const parts: string[] = [];
  if (a.moon?.present) {
    const pair = NAKSHATRA_JUNCTION_PAIR[a.moon.nakshatra];
    parts.push(
      a.moon.part === 'end'
        ? `the Moon is in the last stretch of ${a.moon.nakshatra}, ${a.moon.degreesFromJunction} degrees before ${pair}`
        : `the Moon is in the first stretch of ${a.moon.nakshatra}, ${a.moon.degreesFromJunction} degrees after ${pair}`,
    );
  }
  if (a.tithi?.present) {
    parts.push(
      a.tithi.kind === 'purna'
        ? `the tithi is at its very end (tithi ${a.tithi.tithi} of its half, a Purna tithi)`
        : `the tithi has only just begun (tithi ${a.tithi.tithi} of its half, a Nanda tithi)`,
    );
  }
  if (a.lagna?.present) {
    parts.push(
      `the rising sign ${a.lagna.sign} is within ${a.lagna.degreesFromJunction} degrees of a sign junction`,
    );
  }
  if (parts.length === 0) return '';
  return `Gandanta (a birth at a junction point): ${parts.join('; ')}. The Brihat Parashara Hora Shastra treats such a birth as a sensitive one and prescribes rites for it; it is a point to weigh, not a verdict. The Moon crosses such a stretch in under an hour, so this holds only if the birth time is right to within a few minutes.${
    a.abhuktaMoola
      ? ' This is the Abhukta Moola stretch, which the text calls the most sensitive of them.'
      : ''
  }`;
}

/**
 * Gandanta of a chart. `timeKnown` must be false for a chart cast from a stand-in time (a part of the
 * day, a skipped time): then nothing is claimed. A chart without a Moon or Sun is broken and raises.
 */
export function detectGandanta(
  chartData: ChartData,
  options: { timeKnown: boolean },
): GandantaAnalysis {
  if (!options.timeKnown) {
    return {
      timeKnown: false,
      present: false,
      moon: null,
      tithi: null,
      lagna: null,
      abhuktaMoola: false,
      description: '',
    };
  }
  const moon = chartData.planets?.find((p) => p.planet === 'Moon');
  const sun = chartData.planets?.find((p) => p.planet === 'Sun');
  if (!Number.isFinite(moon?.longitude)) throw new Error('detectGandanta: the chart has no Moon');
  if (!Number.isFinite(sun?.longitude)) throw new Error('detectGandanta: the chart has no Sun');

  const m = moonPoint(norm(moon.longitude));
  const { abhukta, ...moonOut } = m;
  const tithi = tithiPoint(norm(sun.longitude), norm(moon.longitude));
  const asc = chartData.ascendant;
  const lagna =
    asc && Number.isFinite(asc.signIndex) && Number.isFinite(asc.degree)
      ? lagnaPoint(asc.signIndex * 30 + asc.degree)
      : null;

  const base = {
    timeKnown: true,
    present: moonOut.present || tithi.present || Boolean(lagna?.present),
    moon: moonOut,
    tithi,
    lagna,
    abhuktaMoola: abhukta,
  };
  return { ...base, description: describe(base) };
}
