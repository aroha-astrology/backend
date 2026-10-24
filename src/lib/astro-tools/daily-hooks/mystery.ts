// =============================================================================
// Mystery Synastry — the strongest evening link in the reader's circle (pure)
// =============================================================================
// Each evening one person in the circle is chosen. The score is 60% the Bonds compatibility the circle
// already uses and 40% how kindly the evening Moon (at 20:00 local) sits to both people's natal Moons.
// The Why names the two things behind it, with degrees. With nobody in the circle yet the card shows a
// public figure whose birth moment is recorded in a published birth record, never another user's chart.
// =============================================================================

import { contact, degText, type Contact } from './aspects.js';

export interface MysteryPerson {
  id: string;
  name: string;
  /** The Bonds compatibility, 0 to 100. */
  compatibility: number;
  /** Their natal Moon longitude. */
  moon: number;
}

export interface MysteryPick {
  id: string;
  name: string;
  score: number;
  why: string[];
  eveningMoon: number;
}

const COMPAT_WEIGHT = 0.6;
const EVENING_WEIGHT = 0.4;

function eveningValue(eveningMoon: number, readerMoon: number, otherMoon: number): { value: number; a: Contact; b: Contact } {
  const a = contact(eveningMoon, readerMoon);
  const b = contact(eveningMoon, otherMoon);
  return { value: (a.value + b.value) / 2, a, b };
}

/** Ranks the circle, best first. Ties go to the higher compatibility, then to the name. */
export function rankMystery(people: MysteryPerson[], readerMoon: number, eveningMoon: number): MysteryPick[] {
  return people
    .map((p) => {
      const ev = eveningValue(eveningMoon, readerMoon, p.moon);
      const score = Math.round(COMPAT_WEIGHT * p.compatibility + EVENING_WEIGHT * ev.value * 100);
      const why = [
        `Your charts score ${Math.round(p.compatibility)} on the Bonds compatibility`,
        `The evening Moon at ${degText(eveningMoon)} is ${ev.a.aspect ? `in ${ev.a.aspect} to your Moon` : 'not in a close aspect to your Moon'} and ${ev.b.aspect ? `in ${ev.b.aspect} to theirs` : 'not in a close aspect to theirs'}`,
      ];
      return { id: p.id, name: p.name, score, why, eveningMoon, compat: p.compatibility };
    })
    .sort((x, y) => y.score - x.score || y.compat - x.compat || x.name.localeCompare(y.name))
    .map(({ compat: _c, ...rest }) => rest);
}

/**
 * Public figures with a recorded birth moment, for readers with nobody in their circle yet. The UTC
 * instants are the recorded local time converted by the offset noted beside each. Check each against
 * its source before the switch is turned on; they are used as examples, not as claims about the person.
 */
export const PUBLIC_CHARTS = [
  { id: 'einstein', name: 'Albert Einstein', instant: '1879-03-14T10:50:04Z', note: 'Ulm, 11:30 local mean time (UTC+0:39:56), birth record, Rodden AA' },
  { id: 'jobs', name: 'Steve Jobs', instant: '1955-02-25T03:15:00Z', note: 'San Francisco, 19:15 PST (UTC-8), birth certificate, Rodden AA' },
  { id: 'diana', name: 'Diana, Princess of Wales', instant: '1961-07-01T18:45:00Z', note: 'Sandringham, 19:45 BST (UTC+1), birth record, Rodden AA' },
] as const;

/** For the empty circle: the public chart whose Moon sits most kindly to the reader's Moon today. */
export function pickPublicChart(readerMoon: number, eveningMoon: number, moons: Record<string, number>): MysteryPick {
  const rows = PUBLIC_CHARTS.map((c) => {
    const moon = moons[c.id]!;
    const ev = eveningValue(eveningMoon, readerMoon, moon);
    const base = contact(readerMoon, moon);
    const score = Math.round(COMPAT_WEIGHT * base.value * 100 + EVENING_WEIGHT * ev.value * 100);
    return {
      id: c.id,
      name: c.name,
      score,
      why: [
        `Your Moon and theirs (${degText(moon)}) ${base.aspect ? `are in ${base.aspect}` : 'make no close aspect'}`,
        `The evening Moon at ${degText(eveningMoon)} sits ${ev.value >= 0.7 ? 'kindly' : 'neutrally'} to both`,
      ],
      eveningMoon,
    };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return rows[0]!;
}
