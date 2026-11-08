// =============================================================================
// The life Sahams of the Varsha chart (Tajika): fame, friends, brothers, mother, work, gain ...
// =============================================================================
// Formulas: Jagannatha Hora's Sahams list (the 36 values in test/fixtures/jhora/*.partial.json) and
// PyJHora 4.8.7 saham.py, which prints the same formulas; the night swap and the +30 rule are the
// shared ones of sahams.ts (+30 by exact longitude, ends not counted). Every formula here is
// checked against JHora's printed longitude on 10 charts x 2 years in test/varshik-sahams-life.spec.ts.
//
// NEVER OUTPUT: Mrityu (death), Apamrityu (bad death). They are not in this file, not in the
// facts, not in the text (owner rule, 2026-11-07: no death in the report). Kali (great
// misfortune), Santapa (sadness), Jadya (chronic disease), Bandhana (imprisonment) and Paradara
// (adultery) are left out too: they add nothing a gentle report can say. Roga (health) is kept,
// to be written about with care.
// =============================================================================

import type { ChartData } from '@aroha-astrology/shared';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import {
  SAHAM_RULES,
  buildSahamResult,
  sahamLongitude,
  type SahamPoints,
  type SahamResult,
  type SahamRule,
} from './sahams.js';

const norm = (d: number) => ((d % 360) + 360) % 360;
const planet = (c: ChartData, p: string) => c.planets.find((x) => x.planet === p)?.longitude ?? 0;
const asc = (c: ChartData) => c.ascendant.degree + c.ascendant.signIndex * 30;
const lordOfSignAt = (c: ChartData, lon: number) =>
  planet(c, SIGN_LORDS[ZODIAC_SIGNS[Math.floor(norm(lon) / 30)]!]);

type Ref = string | ((c: ChartData, isDay: boolean) => number);
const val = (r: Ref, c: ChartData, isDay: boolean): number => {
  if (typeof r === 'function') return r(c, isDay);
  if (r === 'Lagna') return asc(c);
  return planet(c, r);
};
const punya: Ref = (c, d) => sahamLongitude(SAHAM_RULES.punya, c, d);
/** The 11th house point (Lagna + 300 degrees) and the longitude of its lord. */
const house11: Ref = (c) => norm(asc(c) + 300);
const lord11: Ref = (c) => lordOfSignAt(c, asc(c) + 300);

function rule(name: string, a: Ref, b: Ref, add: Ref, nightSwap = true): SahamRule {
  return {
    name,
    points: (c, isDay): SahamPoints => ({
      plus: val(a, c, isDay),
      minus: val(b, c, isDay),
      add: val(add, c, isDay),
      // JHora tests the Lagna for the +30 step, also when the point added is a planet (Mitra, Shastra,
      // Gaurava: 8 to 11 of 20 chart-years were exactly 30 degrees out when the planet was tested).
      between: asc(c),
    }),
    nightSwap,
    plus30: true,
  };
}

const sastraRule = rule('Shastra (Learning)', 'Jupiter', 'Saturn', 'Mercury');
const sastra: Ref = (c, d) => sahamLongitude(sastraRule, c, d);

export const LIFE_RULES = {
  yasha: rule('Yasha (Fame)', 'Jupiter', punya, 'Lagna'),
  mitra: rule('Mitra (Friends)', 'Jupiter', punya, 'Venus'),
  mahatmya: rule('Mahatmya (Greatness)', punya, 'Mars', 'Lagna'),
  asha: rule('Asha (Desires)', 'Saturn', 'Mars', 'Lagna'),
  // Samartha: Mars - the Lagna lord + the Lagna; when Mars is the Lagna lord, Jupiter - Mars + the Lagna.
  samartha: rule(
    'Samartha (Ability)',
    (c) => (lordOfSignAt(c, asc(c)) === planet(c, 'Mars') ? planet(c, 'Jupiter') : planet(c, 'Mars')),
    (c) => (lordOfSignAt(c, asc(c)) === planet(c, 'Mars') ? planet(c, 'Mars') : lordOfSignAt(c, asc(c))),
    'Lagna',
  ),
  bhratri: rule('Bhratri (Brothers and sisters)', 'Jupiter', 'Saturn', 'Lagna', false),
  gaurava: rule('Gaurava (Respect)', 'Jupiter', 'Moon', 'Sun'),
  pitru: rule('Pitru (Father)', 'Saturn', 'Sun', 'Lagna'),
  matru: rule('Matru (Mother)', 'Moon', 'Venus', 'Lagna'),
  jeeva: rule('Jeeva (Vitality)', 'Saturn', 'Jupiter', 'Lagna'),
  karma: rule('Karma (Work)', 'Mars', 'Mercury', 'Lagna'),
  sastra: sastraRule,
  bandhu: rule('Bandhu (Relatives)', 'Mercury', 'Moon', 'Lagna'),
  vanik: rule('Vanik (Trade)', 'Moon', 'Mercury', 'Lagna'),
  sraddha: rule('Shraddha (Devotion)', 'Venus', 'Mars', 'Lagna'),
  preeti: rule('Preeti (Affection)', sastra, punya, 'Lagna'),
  vyapara: rule('Vyapara (Business)', 'Mars', 'Saturn', 'Lagna', false),
  shatru: rule('Shatru (Rivals)', 'Mars', 'Saturn', 'Lagna'),
  jalapatha: rule('Jalapatha (Crossing water)', () => 105, 'Saturn', 'Lagna'),
  // Labha: JHora gives the same longitude by day and night (the night swap puts it 10 to 170 degrees out).
  labha: rule('Labha (Gain)', house11, lord11, 'Lagna', false),
} satisfies Record<string, SahamRule>;

export type LifeSahamKey = keyof typeof LIFE_RULES;

/** Roga (health): Lagna - Moon + Lagna, the same by day and night, with no +30 step (as JHora has it). */
export function rogaLongitude(chart: ChartData): number {
  return norm(2 * asc(chart) - planet(chart, 'Moon'));
}

export function computeLifeSahams(chart: ChartData, isDay: boolean): SahamResult[] {
  const out = (Object.keys(LIFE_RULES) as LifeSahamKey[]).map((k) =>
    buildSahamResult(LIFE_RULES[k].name, sahamLongitude(LIFE_RULES[k], chart, isDay), chart),
  );
  out.push(buildSahamResult('Roga (Health)', rogaLongitude(chart), chart));
  return out;
}
