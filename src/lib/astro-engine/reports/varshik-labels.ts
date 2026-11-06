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
  | 'dhaiya';

export const DOSHA_LABEL: Record<DoshaKeyName, string> = {
  mangal: 'Mangal Dosha',
  kaalSarp: 'Kaal Sarp',
  pitra: 'Pitra Dosha',
  guruChandal: 'Guru Chandal',
  grahan: 'Grahan Dosha',
  kemadruma: 'Kemadruma',
  sadeSati: 'Sade Sati',
  dhaiya: 'Dhaiya',
};

export const TAJIKA_LABEL: Record<string, string> = {
  ithasala: 'Ithasala',
  ishrafa: 'Ishrafa',
  nakta: 'Nakta',
  yamaya: 'Yamaya',
  kamboola: 'Kamboola',
  radda: 'Radda',
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
