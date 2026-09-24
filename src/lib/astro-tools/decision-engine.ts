// =============================================================================
// Decision engine — Decision Astrology and Find My Date
// =============================================================================
// Scores each day of a range 0-100 for one kind of beginning, from:
//   personal  tara bala (today's star counted from the birth star),
//             chandra bala (the Moon's house from the natal Moon),
//             and, for decisions, the running dasha's support for the area
//             plus Jupiter's and Saturn's gochara;
//   panchang  the category's nakshatra / tithi / weekday rules
//             (muhurta-rules.ts);
//   avoid     eclipses always; Mercury retrograde for agreements; Kharmas
//             (Sun in Sagittarius or Pisces) for marriage and property;
//             Jupiter or Venus combust for marriage.
// "Decision" mode leans on the person (dasha and transits set the season);
// "muhurta" mode leans on the panchang (it's about the day itself). Pure and
// deterministic: the service feeds it one DaySky per day, no AI call.
// =============================================================================

import { NAKSHATRAS } from '@aroha-astrology/shared';
import type { WhyFactor } from '../intelligence/types.js';
import { houseFrom } from '../intelligence/chart-context.js';
import { isFavourableTransit } from '../intelligence/why.js';
import { AREA_CONFIG } from '../intelligence/areas.js';
import type { CategorySpec } from './muhurta-rules.js';

export type DecisionMode = 'decision' | 'muhurta';
export type DayTone = 'good' | 'neutral' | 'caution';
export type AvoidFlag = 'eclipse' | 'mercuryRetro' | 'kharmas' | 'combust';

export interface SkyPlanet {
  planet: string;
  longitude: number;
  signIndex: number;
  sign: string;
  isRetrograde: boolean;
}

/** The sky at local noon of one day, at the place the choice is for. */
export interface DaySky {
  /** Local 'YYYY-MM-DD'. */
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** 1-30 (1-15 Shukla, 16-30 Krishna). */
  tithi: number;
  /** The Moon's nakshatra, 0-26. */
  nakshatraIndex: number;
  /** The Moon's sign, 0-11. */
  moonSignIndex: number;
  planets: SkyPlanet[];
  eclipse?: 'solar' | 'lunar';
}

export interface PersonalChart {
  moonSignIndex: number;
  moonNakshatraIndex: number;
  ascendantSignIndex: number;
}

/** The running Maha/Antar lords' 0-100 support for the area on a day, with why. */
export interface DashaSupport {
  score: number;
  why: WhyFactor[];
}

export interface ScoredDay {
  date: string;
  score: number;
  tone: DayTone;
  avoid: AvoidFlag[];
  why: WhyFactor[];
}

export interface DecisionWindow {
  start: string;
  end: string;
  tone: 'good' | 'caution';
  score: number;
}

export interface TimeWindow {
  start: string;
  end: string;
  /** 'abhijit' or a lowercased choghadiya name ('amrit', 'labh', …). */
  name: string;
}

interface Weights {
  nakshatra: number;
  tithiGood: number;
  tithiBad: number;
  weekday: number;
  taraGood: number;
  taraBad: number;
  janma: number;
  chandraGood: number;
  chandraBad: number;
  chandrashtama: number;
  jupiter: number;
  saturn: number;
  /** Multiplier on (dasha score - 50). */
  dasha: number;
}

const WEIGHTS: Record<DecisionMode, Weights> = {
  decision: {
    nakshatra: 6,
    tithiGood: 3,
    tithiBad: 6,
    weekday: 3,
    taraGood: 8,
    taraBad: 10,
    janma: 4,
    chandraGood: 6,
    chandraBad: 6,
    chandrashtama: 12,
    jupiter: 6,
    saturn: 5,
    dasha: 0.4,
  },
  muhurta: {
    nakshatra: 14,
    tithiGood: 6,
    tithiBad: 12,
    weekday: 6,
    taraGood: 8,
    taraBad: 10,
    janma: 4,
    chandraGood: 6,
    chandraBad: 6,
    chandrashtama: 12,
    jupiter: 0,
    saturn: 0,
    dasha: 0,
  },
};

export const GOOD_SCORE = 62;
export const CAUTION_SCORE = 38;

const GOOD_TARAS = new Set([2, 4, 6, 8, 9]);
const BAD_TARAS = new Set([3, 5, 7]);
/** Chandra bala: the Moon in the 4th or 12th from the natal Moon strains; the 8th (Chandrashtama) most. */
const CHANDRA_BAD = new Set([4, 12]);
const CHANDRASHTAMA = 8;
/** Sade Sati houses — Saturn here always counts against a new start. */
const SADE_SATI = new Set([12, 1, 2]);
/** Degrees from the Sun inside which a planet is combust (asta). */
const COMBUST_ORB: Record<string, number> = { Jupiter: 11, Venus: 10 };
const SAGITTARIUS = 8;
const PISCES = 11;
const CAPS: Record<AvoidFlag, number> = {
  eclipse: 15,
  kharmas: 30,
  combust: 30,
  mercuryRetro: 100,
};
const MERCURY_RETRO_PENALTY = 12;
const MAX_WHY = 6;

function angularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function toneOf(score: number): DayTone {
  if (score >= GOOD_SCORE) return 'good';
  if (score <= CAUTION_SCORE) return 'caution';
  return 'neutral';
}

/** The tara (1-9) of a day's star counted from the birth star. */
export function taraOf(birthNakshatraIndex: number, dayNakshatraIndex: number): number {
  return (((dayNakshatraIndex - birthNakshatraIndex + 27) % 27) % 9) + 1;
}

/** Which avoid rules the day trips for this category. */
export function avoidFlags(day: DaySky, spec: CategorySpec): AvoidFlag[] {
  const out: AvoidFlag[] = [];
  if (day.eclipse) out.push('eclipse');
  const sun = day.planets.find((p) => p.planet === 'Sun');
  if (spec.avoid.includes('mercuryRetro')) {
    if (day.planets.find((p) => p.planet === 'Mercury')?.isRetrograde) out.push('mercuryRetro');
  }
  if (spec.avoid.includes('kharmas') && sun) {
    if (sun.signIndex === SAGITTARIUS || sun.signIndex === PISCES) out.push('kharmas');
  }
  if (spec.avoid.includes('combust') && sun) {
    const combust = day.planets.some(
      (p) =>
        COMBUST_ORB[p.planet] !== undefined &&
        angularDistance(p.longitude, sun.longitude) < COMBUST_ORB[p.planet]!,
    );
    if (combust) out.push('combust');
  }
  return out;
}

function avoidFactor(flag: AvoidFlag, day: DaySky): WhyFactor {
  switch (flag) {
    case 'eclipse':
      return {
        kind: 'panchang',
        effect: -1,
        textKey: day.eclipse === 'lunar' ? 'decide.why.eclipseLunar' : 'decide.why.eclipseSolar',
      };
    case 'mercuryRetro':
      return { kind: 'transit', planet: 'Mercury', effect: -1, textKey: 'decide.why.mercuryRetro' };
    case 'kharmas':
      return { kind: 'transit', planet: 'Sun', effect: -1, textKey: 'decide.why.kharmas' };
    case 'combust': {
      const sun = day.planets.find((p) => p.planet === 'Sun')!;
      const planet =
        day.planets.find(
          (p) =>
            COMBUST_ORB[p.planet] !== undefined &&
            angularDistance(p.longitude, sun.longitude) < COMBUST_ORB[p.planet]!,
        )?.planet ?? 'Venus';
      return {
        kind: 'transit',
        planet,
        effect: -1,
        textKey: 'decide.why.combust',
        params: { planet },
      };
    }
  }
}

/** One day's 0-100 score for a category, with the factors behind it (most telling first). */
export function scoreDay(
  day: DaySky,
  spec: CategorySpec,
  mode: DecisionMode,
  personal?: PersonalChart,
  dasha?: DashaSupport,
): ScoredDay {
  const w = WEIGHTS[mode];
  const rule = spec.rule;
  let delta = 0;
  const personalWhy: WhyFactor[] = [];
  const dayWhy: WhyFactor[] = [];
  const seasonWhy: WhyFactor[] = [];

  if (personal) {
    const tara = taraOf(personal.moonNakshatraIndex, day.nakshatraIndex);
    const taraEffect = GOOD_TARAS.has(tara) ? 1 : BAD_TARAS.has(tara) ? -1 : tara === 1 ? -1 : 0;
    delta += GOOD_TARAS.has(tara)
      ? w.taraGood
      : BAD_TARAS.has(tara)
        ? -w.taraBad
        : tara === 1
          ? -w.janma
          : 0;
    personalWhy.push({
      kind: 'nakshatra',
      effect: taraEffect,
      textKey: 'why.tara',
      params: { tara },
    });

    const chandra = houseFrom(personal.moonSignIndex, day.moonSignIndex);
    if (chandra === CHANDRASHTAMA) {
      delta -= w.chandrashtama;
      personalWhy.push({
        kind: 'transit',
        planet: 'Moon',
        house: chandra,
        effect: -1,
        textKey: 'decide.why.chandrashtama',
        params: { house: chandra },
      });
    } else if (isFavourableTransit('Moon', chandra) || CHANDRA_BAD.has(chandra)) {
      const good = isFavourableTransit('Moon', chandra);
      delta += good ? w.chandraGood : -w.chandraBad;
      personalWhy.push({
        kind: 'transit',
        planet: 'Moon',
        house: chandra,
        effect: good ? 1 : -1,
        textKey: 'decide.why.chandra',
        params: { house: chandra },
      });
    }

    if (mode === 'decision') {
      const areaHouses = AREA_CONFIG[spec.area].houses;
      for (const planet of ['Jupiter', 'Saturn'] as const) {
        const p = day.planets.find((x) => x.planet === planet);
        if (!p) continue;
        const fromMoon = houseFrom(personal.moonSignIndex, p.signIndex);
        const fromLagna = houseFrom(personal.ascendantSignIndex, p.signIndex);
        const favourable = isFavourableTransit(planet, fromMoon);
        let effect: -1 | 0 | 1 = 0;
        if (planet === 'Jupiter') {
          delta += favourable ? w.jupiter : -w.jupiter / 3;
          effect = favourable ? 1 : -1;
        } else if (favourable) {
          delta += w.saturn / 2;
          effect = 1;
        } else if (
          SADE_SATI.has(fromMoon) ||
          areaHouses.includes(fromMoon) ||
          areaHouses.includes(fromLagna)
        ) {
          delta -= w.saturn;
          effect = -1;
        }
        if (effect !== 0) {
          seasonWhy.push({
            kind: 'transit',
            planet,
            house: fromMoon,
            sign: p.sign,
            effect,
            textKey: p.isRetrograde ? 'why.transitRetro' : 'why.transit',
            params: { planet, house: fromMoon, sign: p.sign },
          });
        }
      }
    }
  }

  if (mode === 'decision' && dasha) {
    delta += (dasha.score - 50) * w.dasha;
    seasonWhy.unshift(...dasha.why.slice(0, 2));
  }

  const nakshatra = NAKSHATRAS[day.nakshatraIndex] ?? '';
  if (
    rule.favorableNakshatras.includes(nakshatra) ||
    rule.unfavorableNakshatras.includes(nakshatra)
  ) {
    const good = rule.favorableNakshatras.includes(nakshatra);
    delta += good ? w.nakshatra : -w.nakshatra;
    dayWhy.push({
      kind: 'panchang',
      effect: good ? 1 : -1,
      textKey: good ? 'decide.why.nakshatraGood' : 'decide.why.nakshatraBad',
      params: { nakshatra },
    });
  }
  if (rule.unfavorableTithis.includes(day.tithi)) {
    delta -= w.tithiBad;
    dayWhy.push({
      kind: 'panchang',
      effect: -1,
      textKey: day.tithi === 30 ? 'decide.why.amavasya' : 'decide.why.tithiBad',
      params: { tithi: day.tithi },
    });
  } else if (rule.favorableTithis.includes(day.tithi)) {
    delta += w.tithiGood;
    dayWhy.push({
      kind: 'panchang',
      effect: 1,
      textKey: 'decide.why.tithiGood',
      params: { tithi: day.tithi },
    });
  }
  if (
    rule.favorableWeekdays.includes(day.weekday) ||
    rule.unfavorableWeekdays.includes(day.weekday)
  ) {
    const good = rule.favorableWeekdays.includes(day.weekday);
    delta += good ? w.weekday : -w.weekday;
    dayWhy.push({
      kind: 'panchang',
      effect: good ? 1 : -1,
      textKey: good ? 'decide.why.weekdayGood' : 'decide.why.weekdayBad',
      params: { weekday: day.weekday },
    });
  }

  const avoid = avoidFlags(day, spec);
  let score = Math.round(Math.max(0, Math.min(100, 50 + delta)));
  for (const flag of avoid) {
    if (flag === 'mercuryRetro') score = Math.max(0, score - MERCURY_RETRO_PENALTY);
    else score = Math.min(score, CAPS[flag]);
  }

  // Decisions: the season (dasha, slow planets) explains a date first;
  // muhurta: the day's own panchang does. Hard "avoid" reasons always lead.
  const ordered =
    mode === 'decision'
      ? [...seasonWhy, ...personalWhy, ...dayWhy]
      : [...dayWhy, ...personalWhy, ...seasonWhy];
  const why = [...avoid.map((f) => avoidFactor(f, day)), ...ordered]
    .filter((f) => f.effect !== 0 || f.kind === 'dasha')
    .slice(0, MAX_WHY);

  return { date: day.date, score, tone: toneOf(score), avoid, why };
}

function movingAverage(values: number[], span: number): number[] {
  if (span <= 1) return values;
  const half = Math.floor(span / 2);
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1));
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/**
 * Stretches worth planning around: runs of at least three days whose
 * (5-day smoothed, for decisions) score stays good or stays low.
 */
export function findWindows(days: readonly ScoredDay[], mode: DecisionMode): DecisionWindow[] {
  const smooth = movingAverage(
    days.map((d) => d.score),
    mode === 'decision' ? 5 : 1,
  );
  const goodAt = mode === 'decision' ? 58 : GOOD_SCORE;
  const cautionAt = mode === 'decision' ? 42 : CAUTION_SCORE;
  const out: DecisionWindow[] = [];
  let run: { tone: 'good' | 'caution'; from: number } | null = null;
  const close = (end: number) => {
    if (run && end - run.from >= 3) {
      const slice = days.slice(run.from, end);
      out.push({
        start: slice[0]!.date,
        end: slice[slice.length - 1]!.date,
        tone: run.tone,
        score: Math.round(slice.reduce((a, d) => a + d.score, 0) / slice.length),
      });
    }
    run = null;
  };
  smooth.forEach((s, i) => {
    const tone = s >= goodAt ? 'good' : s <= cautionAt ? 'caution' : null;
    if (run && run.tone !== tone) close(i);
    if (tone && !run) run = { tone, from: i };
  });
  close(days.length);
  return out;
}

/** The strongest dates (good tone), best first; ties go to the earlier date. */
export function pickBestDays(days: readonly ScoredDay[], n = 5): ScoredDay[] {
  return days
    .filter((d) => d.tone === 'good')
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
    .slice(0, n);
}

/** The dates to steer clear of, in calendar order: avoid-rule days first, then the lowest scores. */
export function pickCautionDays(days: readonly ScoredDay[], n = 5): ScoredDay[] {
  return days
    .filter((d) => d.tone === 'caution')
    .sort((a, b) => b.avoid.length - a.avoid.length || a.score - b.score)
    .slice(0, n)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
}

const CHOGHADIYA_PREFERENCE = ['Amrit', 'Shubh', 'Labh'];

/**
 * The best daytime slot on a chosen date: Abhijit Muhurta (classically not
 * on a Wednesday), else the first Amrit/Shubh/Labh choghadiya — never one
 * that overlaps Rahu Kaal.
 */
export function bestTimeOfDay(p: {
  weekday: number;
  abhijitMuhurta?: { start: string; end: string };
  rahuKaal?: { start: string; end: string };
  choghadiyaDay?: Array<{ name: string; type: string; startTime: string; endTime: string }>;
}): TimeWindow | null {
  const clear = (slot: { start: string; end: string }) =>
    !p.rahuKaal || !overlaps(slot, p.rahuKaal);
  if (p.abhijitMuhurta && p.weekday !== 3 && clear(p.abhijitMuhurta)) {
    return { ...p.abhijitMuhurta, name: 'abhijit' };
  }
  for (const wanted of CHOGHADIYA_PREFERENCE) {
    const slot = (p.choghadiyaDay ?? [])
      .filter((c) => c.name === wanted)
      .map((c) => ({ start: c.startTime, end: c.endTime }))
      .find(clear);
    if (slot) return { ...slot, name: wanted.toLowerCase() };
  }
  return null;
}
