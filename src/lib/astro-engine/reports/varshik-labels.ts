// Names the Varshik Rashifal 2027 facts, prompts and text checks all share. No imports from the
// engine, so the text checks (verify-claims.ts) can use them without loading the ephemeris.

import type { Planet } from '@aroha-astrology/shared';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const NINE_PLANETS: Planet[] = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
];

export const SIGN_NAMES = [
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
] as const;

export type DoshaKeyName =
  | 'mangal'
  | 'kaalSarp'
  | 'pitra'
  | 'guruChandal'
  | 'grahan'
  | 'kemadruma'
  | 'sadeSati'
  | 'dhaiya'
  | 'gandanta';

export const DOSHA_LABEL: Record<DoshaKeyName, string> = {
  mangal: 'Mangal Dosha',
  kaalSarp: 'Kaal Sarp',
  pitra: 'Pitra Dosha',
  guruChandal: 'Guru Chandal',
  grahan: 'Grahan Dosha',
  kemadruma: 'Kemadruma',
  sadeSati: 'Sade Sati',
  dhaiya: 'Dhaiya',
  gandanta: 'Gandanta',
};

export const TAJIKA_LABEL: Record<string, string> = {
  ithasala: 'Ithasala',
  ishrafa: 'Ishrafa',
  nakta: 'Nakta',
  yamaya: 'Yamaya',
  kamboola: 'Kamboola',
  radda: 'Radda',
  // C2: the ten further yogas (varshphal/tajika-yogas-extra.ts)
  iqbal: 'Iqbal',
  induvara: 'Induvara',
  manau: 'Manau',
  'gairi-kamboola': 'Gairi-Kamboola',
  khallasara: 'Khallasara',
  'duhphali-kuttha': 'Duhphali-kuttha',
  'dutthottha-davira': 'Dutthottha-davira',
  tambira: 'Tambira',
  kuttha: 'Kuttha',
  durupha: 'Durupha',
};

/** One plain, gentle line for each further Tajika yoga (ours; the classical name stays in TAJIKA_LABEL). */
export const EXTRA_YOGA_PLAIN: Record<string, string> = {
  iqbal: 'the planets stand in the strong houses, a year of standing and steady progress',
  induvara: 'the planets stand in the soft, hidden houses, a year for patience and quiet work',
  manau: 'a promise is being made but a hard planet presses on it, so results come slower',
  'gairi-kamboola': 'a goal is reached with the help of a third person',
  khallasara: 'a hope that drifts and is hard to hold, so keep plans simple',
  'duhphali-kuttha': 'a result that arrives with some strain attached',
  'dutthottha-davira': 'two weaker sides carried by a stronger helper',
  tambira: 'a promise that is about to change sign, so it matures just after a turn',
  kuttha: 'a strong planet looks at the Lagna and lifts it',
  durupha: 'two tired sides meeting in a hard house, so go slowly and ask for help',
};

export const AREA_LABEL: Record<string, string> = {
  love: 'Love',
  career: 'Career',
  money: 'Money',
  health: 'Health',
  family: 'Family',
  growth: 'Growth',
  travel: 'Travel',
};

/** The tier words a prompt uses (config/varshik-weights.ts TIER_TOKENS) and the plain meaning. */
export const TIER_MEANING = {
  dark_green: 'a strong, open month: a good time to act',
  light_green: 'a steady, supportive month: move ahead with care',
  amber: 'a mixed month: weigh each step and keep options open',
  rust: 'a quiet month: rest, patience and preparation, not a time to start big things',
} as const;
