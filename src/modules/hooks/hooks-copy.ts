// =============================================================================
// Daily-return hooks — push copy
// =============================================================================
// Short, fear-free, no promises. The text only restates numbers and names the payload carries.
// English is complete; a language not listed here falls back to English (the app screens are
// translated separately). Add a language by adding its entry to COPY.
// =============================================================================

import type { PushLang } from '../../lib/push-lang.js';

type Vars = Record<string, string | number>;
type Entry = (v: Vars) => { title: string; body: string };

const EN: Record<string, Entry> = {
  rahasya: (v) => ({
    title: 'A new scroll of your chart is open',
    body: `Scroll ${v.n} of 17 is ready: ${v.title}.`,
  }),
  shubhLabhAlarm: (v) => ({
    title: `${v.label} opens in 5 minutes`,
    body: `${v.start} to ${v.end}, score ${v.score}. A good stretch for money matters today.`,
  }),
  kavach: (v) => ({
    title: `${v.name} could use some care today`,
    body: `Chant ${v.beads} beads for ${v.planet}. It takes a few minutes.`,
  }),
  diya: (v) => ({
    title: 'Your diya window is open',
    body: `${v.start} to ${v.end}. ${v.why}`,
  }),
  receipts: () => ({
    title: 'How did today land?',
    body: 'Mark your three cards: Nailed, Partly or Missed. It takes ten seconds.',
  }),
  textPeak: (v) => ({
    title: `${v.name}: a good stretch is starting`,
    body: `Timing suggestion: ${v.start} to ${v.end} looks smooth for getting in touch.`,
  }),
  sleep: () => ({
    title: 'How did you sleep?',
    body: 'Rate last night from 1 to 5 and see it beside the Moon.',
  }),
  mystery: () => ({
    title: 'Your mystery card is ready',
    body: 'Scratch it to see whose chart lines up with yours this evening.',
  }),
};

/** Per-language overrides, keyed like EN. Empty for now: English is used. */
const COPY: Partial<Record<PushLang, Partial<Record<string, Entry>>>> = {};

export function hookPushCopy(lang: PushLang, key: keyof typeof EN | string, vars: Vars = {}): { title: string; body: string } {
  const entry = COPY[lang]?.[key] ?? EN[key];
  if (!entry) throw new Error(`unknown hook push copy: ${key}`);
  return entry(vars);
}
