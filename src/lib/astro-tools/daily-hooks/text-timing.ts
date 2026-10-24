// =============================================================================
// "Text them now?" — a timing suggestion for getting in touch with one saved profile (pure)
// =============================================================================
// Reads only the two charts and the Moon's path through the day. The score blends how the transiting
// Moon sits to the other person's natal Moon, Venus and Mercury (40/25/20) and how comfortable the Moon
// is for the reader (15, their own Chandrabala). Green / amber / red come from the score bands in
// weights.ts. The wording is a "timing suggestion": it never says what the other person feels or will do.
//
// With no exact birth time for the other person their Moon could be in either of two signs on their
// birth date. Then two candidates are scored and the caller shows both, with a precision badge.
// =============================================================================

import { calculateChandrabala } from '../tara-bala.js';
import { contact, degText, signOf, type Contact } from './aspects.js';
import { clock } from './windows.js';
import { TEXT_AMBER_MIN, TEXT_GREEN_MIN, TEXT_TIMING_WEIGHTS } from './weights.js';

export interface OtherPerson {
  /** Their natal Moon longitude (one candidate), Venus and Mercury. */
  moon: number;
  venus: number;
  mercury: number;
}

export interface MoonSample {
  atMin: number;
  longitude: number;
}

export type TextColor = 'green' | 'amber' | 'red';
export const textColor = (score: number): TextColor => (score >= TEXT_GREEN_MIN ? 'green' : score >= TEXT_AMBER_MIN ? 'amber' : 'red');

export interface TextCell {
  atMin: number;
  score: number;
  color: TextColor;
}

export interface TextRun {
  startMin: number;
  endMin: number;
  start: string;
  end: string;
  color: TextColor;
  score: number;
}

export interface TextTiming {
  cells: TextCell[];
  runs: TextRun[];
  /** Best stretch left today at or after `fromMin`: the highest-scoring run that is green, else the highest run. */
  best: TextRun | null;
  /** The run the clock is in now. */
  current: TextRun | null;
  /** When the current green run ends ("best until"), or null when not in a green run. */
  bestUntil: string | null;
  /** When the next green run starts, if the clock is not in one. */
  nextGreen: string | null;
}

/** One cell's score, 0 to 100. */
export function scoreAt(moonLon: number, ownMoonSign: number, other: OtherPerson): { score: number; moon: Contact; venus: Contact; mercury: Contact; ownHouse: number } {
  const W = TEXT_TIMING_WEIGHTS;
  const moon = contact(moonLon, other.moon);
  const venus = contact(moonLon, other.venus);
  const mercury = contact(moonLon, other.mercury);
  const own = calculateChandrabala(ownMoonSign, signOf(moonLon));
  const ownValue = own.quality === 'good' ? 1 : own.quality === 'neutral' ? 0.5 : 0.1;
  const score = Math.round(W.moonToMoon * moon.value + W.moonToVenus * venus.value + W.moonToMercury * mercury.value + W.ownMoon * ownValue);
  return { score: Math.max(0, Math.min(100, score)), moon, venus, mercury, ownHouse: own.house };
}

export function buildTextTiming(track: MoonSample[], ownMoonSign: number, other: OtherPerson, nowMin: number, stepMin = 30): TextTiming {
  const cells: TextCell[] = track.map((s) => {
    const { score } = scoreAt(s.longitude, ownMoonSign, other);
    return { atMin: s.atMin, score, color: textColor(score) };
  });
  const runs: TextRun[] = [];
  let run: TextCell[] = [];
  const flush = (): void => {
    if (!run.length) return;
    const a = run[0]!.atMin;
    const b = run[run.length - 1]!.atMin + stepMin;
    runs.push({
      startMin: a, endMin: b, start: clock(a), end: b >= 1440 ? '24:00' : clock(b), color: run[0]!.color,
      score: Math.round(run.reduce((s, c) => s + c.score, 0) / run.length),
    });
    run = [];
  };
  for (const c of cells) {
    if (run.length && run[0]!.color !== c.color) flush();
    run.push(c);
  }
  flush();

  const ahead = runs.filter((r) => r.endMin > nowMin);
  const greens = ahead.filter((r) => r.color === 'green');
  const pool = greens.length ? greens : ahead;
  const best = pool.length ? pool.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const current = runs.find((r) => nowMin >= r.startMin && nowMin < r.endMin) ?? null;
  const nextG = runs.find((r) => r.color === 'green' && r.startMin > nowMin) ?? null;
  return {
    cells, runs, best, current,
    bestUntil: current && current.color === 'green' ? current.end : null,
    nextGreen: current?.color === 'green' ? null : (nextG?.start ?? null),
  };
}

export interface DecoderCard {
  id: 'now' | 'window' | 'moon' | 'tone';
  title: string;
  text: string;
  proof: string;
}

const NOW_WORDS: Record<TextColor, string> = {
  green: 'Green: a smooth stretch for getting in touch.',
  amber: 'Amber: fine to reach out; keep it light and unhurried.',
  red: 'Red: the sky is a little jumpy for this; a short, easy message works better than a big one, or wait for the next green stretch.',
};

/** Four plain cards that explain the suggestion; each has the degrees or times behind it. */
export function decode(t: TextTiming, moonLonNow: number, ownMoonSign: number, other: OtherPerson): DecoderCard[] {
  const now = scoreAt(moonLonNow, ownMoonSign, other);
  const tone = now.mercury;
  const toneText =
    tone.aspect === null
      ? 'The Moon has no close aspect to their Mercury right now, so there is no special pull on how it lands. Say it simply.'
      : tone.value >= 0.8
        ? `The Moon ${tone.aspect === 'conjunction' ? 'sits on' : `is in ${tone.aspect} to`} their Mercury: clear, easy talk is favoured. A direct, friendly message suits.`
        : 'The Moon is at a hard angle to their Mercury: keep it short and clear, and leave room for them to answer in their own time.';
  const moonText =
    now.moon.aspect === null
      ? 'The Moon makes no close aspect to their natal Moon right now.'
      : `The Moon is in ${now.moon.aspect} to their natal Moon, which ${now.moon.value >= 0.8 ? 'tends to feel familiar and easy' : 'tends to feel a little edgy'}.`;
  return [
    { id: 'now', title: 'Right now', text: NOW_WORDS[textColor(now.score)], proof: `Score ${now.score} (Aroha timing score)` },
    {
      id: 'window',
      title: 'Best stretch today',
      text: t.best ? `${t.best.start} to ${t.best.end} looks the smoothest left today.` : 'No smoother stretch is left today.',
      proof: t.best ? `Average score ${t.best.score}` : 'Day is over',
    },
    {
      id: 'moon',
      title: 'Their Moon and yours',
      text: moonText,
      proof: `Moon ${degText(moonLonNow)} to their Moon ${degText(other.moon)}${now.moon.orbDeg !== null ? `, orb ${now.moon.orbDeg}°` : ''}`,
    },
    { id: 'tone', title: 'How to say it', text: toneText, proof: `Moon ${degText(moonLonNow)} to their Mercury ${degText(other.mercury)}${tone.orbDeg !== null ? `, orb ${tone.orbDeg}°` : ''}` },
  ];
}
