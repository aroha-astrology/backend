// =============================================================================
// Shubh-Labh strip and Sankalp Diya window — pure functions over one day's panchang
// =============================================================================
// Input is the day's panchang (hora, choghadiya, Rahu Kaal ...) plus a short track of where the Moon is
// through the day. Output is a fixed JSON payload: the app and the push copy only ever put words
// around these numbers, they never compute their own.
//
// The Hindu day runs sunrise to next sunrise, so the strip does too; a time after midnight is counted
// as minutes past 24:00 (1500 = 01:00 the next morning). Scores come from weights.ts and are an Aroha
// score, not a classical rule.
// =============================================================================

import { calculateChandrabala, calculateTaraBala } from '../tara-bala.js';
import {
  AMBER_MIN,
  CHOGHADIYA_FOR_WEALTH,
  GREEN_MIN,
  HORA_FOR_WEALTH,
  SHUBH_LABH_ADJUST,
  SHUBH_LABH_WEIGHTS,
  TITHI_GROUP_SCORE,
} from './weights.js';

export interface Win {
  start: string;
  end: string;
}
export interface HoraLite {
  planet: string;
  startTime: string;
  endTime: string;
}
export interface ChogLite {
  name: string;
  type: 'good' | 'bad' | 'neutral';
  startTime: string;
  endTime: string;
}

/** The parts of a day's panchang the hooks read. */
export interface DayWindows {
  date: string;
  vara: string;
  sunrise: string;
  sunset: string;
  hora: HoraLite[];
  choghadiya: { day: ChogLite[]; night: ChogLite[] };
  rahuKaal: Win;
  gulikaKaal: Win;
  yamagandaKaal: Win;
  abhijit: Win;
  /** Tithi 1-30 in force at sunrise. */
  tithiNumber: number;
}

/** Where the Moon is at a minute of the day (a short track, one sample every hour or so). */
export interface MoonSample {
  atMin: number;
  signIndex: number;
  nakshatraIndex: number;
}

export interface NatalMoon {
  signIndex: number;
  nakshatraIndex: number;
}

export type Color = 'green' | 'amber' | 'red';

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export const clock = (minutes: number): string => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** A [start, end) pair on the sunrise-to-sunrise axis: a clock before sunrise belongs to the next morning. */
export function span(startHHMM: string, endHHMM: string, sunriseMin: number): [number, number] {
  let a = toMin(startHHMM);
  let b = toMin(endHHMM);
  if (a < sunriseMin) a += 1440;
  if (b <= a) b += 1440;
  return [a, b];
}

const inside = (s: [number, number], m: number): boolean => m >= s[0] && m < s[1];

/** Tithi group of 1-30: 30 (Amavasya) counts as its own, low group. */
export function tithiGroup(n: number): 'nanda' | 'bhadra' | 'jaya' | 'rikta' | 'purna' | 'amavasya' {
  if (n === 30) return 'amavasya';
  const k = ((n - 1) % 15) + 1;
  if ([1, 6, 11].includes(k)) return 'nanda';
  if ([2, 7, 12].includes(k)) return 'bhadra';
  if ([3, 8, 13].includes(k)) return 'jaya';
  if ([4, 9, 14].includes(k)) return 'rikta';
  return 'purna';
}

function moonAt(track: MoonSample[], m: number): MoonSample | null {
  if (track.length === 0) return null;
  let cur = track[0]!;
  for (const s of track) if (s.atMin <= m) cur = s;
  return cur;
}

export interface CellParts {
  hora: { planet: string; value: number } | null;
  choghadiya: { name: string; value: number } | null;
  tara: { name: string | null; value: number };
  chandra: { house: number | null; value: number };
  tithi: { group: string; value: number };
  adjust: { rahuKaal: boolean; gulikaKaal: boolean; yamagandaKaal: boolean; abhijit: boolean };
}

export interface Cell {
  startMin: number;
  endMin: number;
  score: number;
  color: Color;
  parts: CellParts;
}

export const colorOf = (score: number): Color => (score >= GREEN_MIN ? 'green' : score >= AMBER_MIN ? 'amber' : 'red');

/** The score of one stretch, from the ingredients at its midpoint. */
function scoreCell(w: DayWindows, track: MoonSample[], natal: NatalMoon | null, sunriseMin: number, a: number, b: number): Cell {
  const mid = (a + b) / 2;
  const hora = w.hora.find((h) => inside(span(h.startTime, h.endTime, sunriseMin), mid)) ?? null;
  const chogs = [...w.choghadiya.day, ...w.choghadiya.night];
  const chog = chogs.find((c) => inside(span(c.startTime, c.endTime, sunriseMin), mid)) ?? null;
  const moon = moonAt(track, mid);

  let tara: CellParts['tara'] = { name: null, value: 0.5 };
  let chandra: CellParts['chandra'] = { house: null, value: 0.5 };
  if (natal && moon) {
    const t = calculateTaraBala(natal.nakshatraIndex, moon.nakshatraIndex);
    tara = { name: t.taraName, value: t.isAuspicious ? 1 : 0.2 };
    const c = calculateChandrabala(natal.signIndex, moon.signIndex);
    chandra = { house: c.house, value: c.quality === 'good' ? 1 : c.quality === 'neutral' ? 0.5 : 0.1 };
  }
  const group = tithiGroup(w.tithiNumber);
  const tithiValue = group === 'amavasya' ? 0.3 : (TITHI_GROUP_SCORE[group] ?? 0.5);

  const horaValue = hora ? (HORA_FOR_WEALTH[hora.planet] ?? 0.5) : 0.5;
  const chogValue = chog ? (CHOGHADIYA_FOR_WEALTH[chog.name] ?? (chog.type === 'good' ? 0.9 : chog.type === 'bad' ? 0.2 : 0.5)) : 0.5;

  const adjust = {
    rahuKaal: inside(span(w.rahuKaal.start, w.rahuKaal.end, sunriseMin), mid),
    gulikaKaal: inside(span(w.gulikaKaal.start, w.gulikaKaal.end, sunriseMin), mid),
    yamagandaKaal: inside(span(w.yamagandaKaal.start, w.yamagandaKaal.end, sunriseMin), mid),
    abhijit: inside(span(w.abhijit.start, w.abhijit.end, sunriseMin), mid),
  };

  const W = SHUBH_LABH_WEIGHTS;
  let score =
    W.hora * horaValue + W.choghadiya * chogValue + W.tara * tara.value + W.chandra * chandra.value + W.tithi * tithiValue;
  if (adjust.rahuKaal) score += SHUBH_LABH_ADJUST.rahuKaal;
  if (adjust.gulikaKaal) score += SHUBH_LABH_ADJUST.gulikaKaal;
  if (adjust.yamagandaKaal) score += SHUBH_LABH_ADJUST.yamagandaKaal;
  if (adjust.abhijit) score += SHUBH_LABH_ADJUST.abhijit;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    startMin: a,
    endMin: b,
    score,
    color: colorOf(score),
    parts: {
      hora: hora ? { planet: hora.planet, value: horaValue } : null,
      choghadiya: chog ? { name: chog.name, value: chogValue } : null,
      tara,
      chandra,
      tithi: { group, value: tithiValue },
      adjust,
    },
  };
}

export interface StripWindow {
  startMin: number;
  endMin: number;
  start: string;
  end: string;
  color: Color;
  /** Average score over the window. */
  score: number;
  /** Short facts behind the colour, in the order they matter. */
  why: string[];
}

export interface ShubhLabhStrip {
  date: string;
  /** The ingredients used. 'general' when no birth chart was available, so Tara and Moon strength count as neutral. */
  basis: 'personal' | 'general';
  sunriseMin: number;
  windows: StripWindow[];
  /** The best stretch of the day (a green window with the highest score), or null when nothing is green. */
  best: StripWindow | null;
  cells: { startMin: number; score: number; color: Color }[];
}

function whyOf(cells: Cell[]): string[] {
  const out: string[] = [];
  const first = cells[0]!;
  const p = first.parts;
  const any = (f: (c: Cell) => boolean): boolean => cells.some(f);
  if (any((c) => c.parts.adjust.rahuKaal)) out.push('Rahu Kaal');
  if (any((c) => c.parts.adjust.gulikaKaal)) out.push('Gulika Kaal');
  if (any((c) => c.parts.adjust.yamagandaKaal)) out.push('Yamaganda Kaal');
  if (any((c) => c.parts.adjust.abhijit)) out.push('Abhijit Muhurta');
  if (p.hora) out.push(`${p.hora.planet} hora`);
  if (p.choghadiya) out.push(`${p.choghadiya.name} choghadiya`);
  if (p.tara.name) out.push(`${p.tara.name} Tara`);
  return out.slice(0, 5);
}

/** Merges neighbouring cells of one colour into windows. */
function mergeCells(cells: Cell[]): StripWindow[] {
  const out: StripWindow[] = [];
  let run: Cell[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    const a = run[0]!.startMin;
    const b = run[run.length - 1]!.endMin;
    out.push({
      startMin: a,
      endMin: b,
      start: clock(a),
      end: clock(b),
      color: run[0]!.color,
      score: Math.round(run.reduce((s, c) => s + c.score, 0) / run.length),
      why: whyOf(run),
    });
    run = [];
  };
  for (const c of cells) {
    if (run.length && run[0]!.color !== c.color) flush();
    run.push(c);
  }
  flush();
  return out;
}

/**
 * The 24-hour strip for money matters, from sunrise to the next sunrise in `stepMin`-minute cells.
 * `natal` is the reader's birth Moon (sign and nakshatra); without it Tara and Moon strength count as
 * neutral and `basis` says 'general'.
 */
export function buildShubhLabhStrip(
  w: DayWindows,
  track: MoonSample[],
  natal: NatalMoon | null,
  stepMin = 30,
): ShubhLabhStrip {
  const sunriseMin = toMin(w.sunrise);
  const cells: Cell[] = [];
  for (let a = sunriseMin; a < sunriseMin + 1440; a += stepMin) {
    cells.push(scoreCell(w, track, natal, sunriseMin, a, Math.min(a + stepMin, sunriseMin + 1440)));
  }
  const windows = mergeCells(cells);
  const greens = windows.filter((x) => x.color === 'green');
  const best = greens.length ? greens.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  return {
    date: w.date,
    basis: natal ? 'personal' : 'general',
    sunriseMin,
    windows,
    best,
    cells: cells.map((c) => ({ startMin: c.startMin, score: c.score, color: c.color })),
  };
}

/** The next green window that starts after `minute` on the strip's axis, with its score and the wait. */
export function nextGreen(strip: ShubhLabhStrip, minute: number): { window: StripWindow; inMin: number } | null {
  const w = strip.windows.find((x) => x.color === 'green' && x.startMin > minute);
  return w ? { window: w, inMin: w.startMin - minute } : null;
}

/** The window the minute falls in, or null outside the day's axis. */
export function windowAt(strip: ShubhLabhStrip, minute: number): StripWindow | null {
  return strip.windows.find((x) => minute >= x.startMin && minute < x.endMin) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Sankalp Diya                                                                 */
/* -------------------------------------------------------------------------- */

/** Wednesday as the panchang names it (Budhvaar) or in English. */
export const isWednesday = (vara: string): boolean => /^(wed|budh)/i.test(vara.trim());

export interface DiyaWindow {
  startMin: number;
  endMin: number;
  start: string;
  end: string;
  kind: 'abhijit' | 'amrit' | 'shubh';
  /** Why this window, in one line. */
  why: string;
}

/**
 * The day's window to light the diya: Abhijit Muhurta, but on a Wednesday the first Amrit (else Shubh)
 * choghadiya of the daytime, because Abhijit is not used on Wednesdays.
 */
export function diyaWindow(w: DayWindows): DiyaWindow {
  const sunriseMin = toMin(w.sunrise);
  const mk = (a: [number, number], kind: DiyaWindow['kind'], why: string): DiyaWindow => ({
    startMin: a[0], endMin: a[1], start: clock(a[0]), end: clock(a[1]), kind, why,
  });
  if (isWednesday(w.vara)) {
    const day = w.choghadiya.day;
    const pick = day.find((c) => c.name === 'Amrit') ?? day.find((c) => c.name === 'Shubh');
    if (pick) {
      return mk(span(pick.startTime, pick.endTime, sunriseMin), pick.name === 'Amrit' ? 'amrit' : 'shubh',
        `Abhijit Muhurta is not used on Wednesdays, so the ${pick.name} choghadiya is the window today.`);
    }
  }
  return mk(span(w.abhijit.start, w.abhijit.end, sunriseMin), 'abhijit',
    'Abhijit Muhurta, the midday window around local solar noon.');
}

export type DiyaOccasion = 'ekadashi' | 'pradosh' | 'purnima' | 'amavasya';

/**
 * A day that carries the small coin gift. Amavasya, Purnima and Ekadashi go by the tithi at sunrise (the
 * same rule the Panchang uses); Pradosh goes by the tithi at sunset, because the vrat is observed when
 * Trayodashi is running in the evening.
 */
export function diyaOccasion(tithiAtSunrise: number, tithiAtSunset: number): DiyaOccasion | null {
  if (tithiAtSunrise === 30) return 'amavasya';
  if (tithiAtSunrise === 15) return 'purnima';
  if (tithiAtSunrise === 11 || tithiAtSunrise === 26) return 'ekadashi';
  if (tithiAtSunset === 13 || tithiAtSunset === 28) return 'pradosh';
  return null;
}
