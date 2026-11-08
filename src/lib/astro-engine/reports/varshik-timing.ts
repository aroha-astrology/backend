// =============================================================================
// Varshik Rashifal 2027 — dosha and yoga timing, answer windows, relief timeline
// =============================================================================
// Four pure functions that sit beside the scorer (varshik-2027.ts) and read the same
// VarshikContext:
//
//   doshaActivity(ctx, month)   all 9 doshas: status, and whether each is awake that month
//   yogaDelivery(ctx)           the months each natal and each Tajika yoga delivers
//   answerWindow(scores, key)   the best dated window for an area or decision key
//   reliefTimeline(ctx, asOf)   the recent hard stretch and the dated turning points ahead
//
// WHAT WAKES A DOSHA. A dosha is only "active" in a month when something triggers it on at
// least a third of the month's days (config: dosha.minDaysShare): the natal Maha or Antar lord,
// or the Mudda main lord, is one of the dosha's planets; or a slow planet stands in the sign of
// one of the dosha's natal planets. Sade Sati and Dhaiya are transit states by nature and are
// counted from the natal Moon.
//
// WHAT IS NOT CLAIMED. Tajika yogas are timed by the Mudda periods of their planets, not by
// the classical degree-to-time conversion, because no source for that rule was opened and
// checked. Sade Sati and Dhaiya cancellations are not modelled; they are reported as present
// or not present. A hard-stretch or turning-point label is a count of dated chart events, not
// a prediction.
// =============================================================================

import type { ChartData, Planet } from '@aroha-astrology/shared';
import {
  AREAS,
  TIER_EDGES,
  VARSHIK_WEIGHTS as W,
  type Area,
  type ScorePlanet,
  type Tier,
} from '../../../config/varshik-weights.js';
import { detectGandanta } from '../doshas/gandanta.js';
import { detectGrahanDosha } from '../doshas/grahanDosha.js';
import { detectGuruChandalDosha } from '../doshas/guruChandal.js';
import { detectKaalSarpDosha } from '../doshas/kaalSarp.js';
import { detectKemDrumaDosha } from '../doshas/kemDrumaDosha.js';
import { detectMangalDosha } from '../doshas/mangalDosha.js';
import { detectPitraDosha } from '../doshas/pitraDosha.js';
import { detectAllYogas } from '../yogas/index.js';
import { muddaAt } from '../varshphal/mudda-dasha.js';
import { computeTajikaYogas } from '../varshphal/tajika-yogas.js';
import { natalLordSignals, tierOf, type VarshikScores } from './varshik-2027.js';
import type { VarshikContext } from './varshik-context.js';

const signOf = (lon: number): number => Math.floor((((lon % 360) + 360) % 360) / 30);
const houseFrom = (lagna: number, sign: number): number => (((sign - lagna) % 12) + 12) % 12 + 1;

// -----------------------------------------------------------------------------
// Doshas
// -----------------------------------------------------------------------------

export type DoshaKey =
  | 'mangal'
  | 'kaalSarp'
  | 'pitra'
  | 'guruChandal'
  | 'grahan'
  | 'kemadruma'
  | 'sadeSati'
  | 'dhaiya'
  | 'gandanta';

export const DOSHA_KEYS: DoshaKey[] = [
  'mangal',
  'kaalSarp',
  'pitra',
  'guruChandal',
  'grahan',
  'kemadruma',
  'sadeSati',
  'dhaiya',
  'gandanta',
];

export type DoshaTrigger = 'natal_dasha' | 'mudda_dasha' | 'transit';

export interface DoshaItem {
  key: DoshaKey;
  /** present: in the chart (or running in 2027); cancelled: formed but cancelled; not_present. */
  status: 'present' | 'cancelled' | 'not_present';
  /** Cancellation reasons from the dosha detector, when cancelled. */
  cancellations: string[];
  /** Whether it is awake in this month, and what woke it. */
  active: boolean;
  triggers: DoshaTrigger[];
  /** The planets or phase behind each trigger, e.g. 'Antar Rahu', 'Mudda Mars', 'Saturn over Mars', 'rising'. */
  because: string[];
}

export interface DoshaMonth {
  month: number;
  items: DoshaItem[];
}

interface NatalDoshaState {
  status: DoshaItem['status'];
  cancellations: string[];
}

/** The seven natal doshas (Gandanta is the ninth dosha, added in C1) from the detectors the app already uses, so nothing is judged twice. */
function natalDoshas(chart: ChartData, birthMs: number): Record<string, NatalDoshaState> {
  const mangal = detectMangalDosha(chart, new Date(birthMs).toISOString().slice(0, 10));
  const kaal = detectKaalSarpDosha(chart);
  const pitra = detectPitraDosha(chart);
  const guru = detectGuruChandalDosha(chart);
  const grahan = detectGrahanDosha(chart);
  const kem = detectKemDrumaDosha(chart);
  // A birth time is required for a Varshik report, so the Gandanta rule is applied in full.
  const gandanta = detectGandanta(chart, { timeKnown: true });
  return {
    mangal: {
      status: mangal.type === 'cancelled' ? 'cancelled' : mangal.present ? 'present' : 'not_present',
      cancellations: mangal.cancellations,
    },
    kaalSarp: { status: kaal.present ? 'present' : 'not_present', cancellations: [] },
    pitra: { status: pitra.present ? 'present' : 'not_present', cancellations: [] },
    guruChandal: { status: guru.present ? 'present' : 'not_present', cancellations: [] },
    grahan: { status: grahan.present ? 'present' : 'not_present', cancellations: [] },
    kemadruma: {
      status: kem.present ? 'present' : kem.cancellations.length > 0 ? 'cancelled' : 'not_present',
      cancellations: kem.cancellations,
    },
    gandanta: { status: gandanta.present ? 'present' : 'not_present', cancellations: [] },
  };
}

/** Saturn's house from the natal Moon on each day of the year. */
function saturnFromMoon(ctx: VarshikContext): number[] {
  const moon = ctx.natal.planets.find((p) => p.planet === 'Moon')!.signIndex;
  return ctx.days.map((d) => (d.lon.Saturn === undefined ? 0 : houseFrom(moon, signOf(d.lon.Saturn))));
}

const SADE_PHASE: Record<number, string> = {
  12: 'Saturn in the 12th from your Moon (the rising phase)',
  1: 'Saturn over your Moon sign (the peak phase)',
  2: 'Saturn in the 2nd from your Moon (the setting phase)',
};
const DHAIYA_PHASE: Record<number, string> = { 4: 'Saturn in the 4th from your Moon', 8: 'Saturn in the 8th from your Moon' };

/** All 9 doshas for every month of the year (one pass over the days). */
export function doshaActivityAll(ctx: VarshikContext): DoshaMonth[] {
  const natal = natalDoshas(ctx.natal, ctx.birthMs);
  const satHouse = saturnFromMoon(ctx);
  const natalSign = (p: string): number | undefined => ctx.natal.planets.find((x) => x.planet === p)?.signIndex;
  const slices = ctx.calendar.varshaYears;

  // Per month, per dosha, per trigger: how many days it held, and what it was.
  const days = new Array<number>(12).fill(0);
  type Hold = Record<DoshaTrigger, Map<string, number>>;
  const holds: Array<Record<DoshaKey, Hold>> = Array.from({ length: 12 }, () =>
    Object.fromEntries(
      DOSHA_KEYS.map((k) => [
        k,
        { natal_dasha: new Map(), mudda_dasha: new Map(), transit: new Map() },
      ]),
    ) as Record<DoshaKey, Hold>,
  );
  const bump = (m: number, k: DoshaKey, t: DoshaTrigger, why: string) => {
    holds[m]![k][t].set(why, (holds[m]![k][t].get(why) ?? 0) + 1);
  };

  const natalKeys = ['mangal', 'kaalSarp', 'pitra', 'guruChandal', 'grahan', 'kemadruma', 'gandanta'] as const;
  for (let i = 0; i < ctx.days.length; i++) {
    const m = ctx.monthOfDay[i]!;
    const atMs = ctx.days[i]!.atMs;
    days[m]!++;
    const dasha = ctx.natalDasha.find((d) => atMs >= d.startMs && atMs < d.endMs);
    const slice = slices.find((s) => atMs >= s.startMs && atMs < s.endMs) ?? slices[slices.length - 1]!;
    const muddaMain = muddaAt(slice.mudda, atMs)?.main.lord;

    for (const k of natalKeys) {
      if (natal[k]!.status !== 'present') continue;
      const planets = W.dosha.planetsOf[k]!;
      if (dasha) {
        if (planets.includes(dasha.maha)) bump(m, k, 'natal_dasha', `Maha ${dasha.maha}`);
        if (planets.includes(dasha.antar)) bump(m, k, 'natal_dasha', `Antar ${dasha.antar}`);
      }
      if (muddaMain && planets.includes(muddaMain)) bump(m, k, 'mudda_dasha', `Mudda ${muddaMain}`);
      for (const t of W.dosha.transitTriggers[k]!) {
        const lon = ctx.days[i]!.lon[t];
        if (lon === undefined) continue;
        for (const p of planets) {
          if (natalSign(p) === signOf(lon)) bump(m, k, 'transit', `${t} over natal ${p}`);
        }
      }
    }
    const h = satHouse[i]!;
    if (SADE_PHASE[h]) bump(m, 'sadeSati', 'transit', SADE_PHASE[h]);
    if (DHAIYA_PHASE[h]) bump(m, 'dhaiya', 'transit', DHAIYA_PHASE[h]);
  }

  const yearHas = (k: DoshaKey) => holds.some((mh) => mh[k].transit.size > 0);
  return Array.from({ length: 12 }, (_, m) => ({
    month: m,
    items: DOSHA_KEYS.map((k): DoshaItem => {
      const n = natal[k];
      const status: DoshaItem['status'] =
        k === 'sadeSati' || k === 'dhaiya' ? (yearHas(k) ? 'present' : 'not_present') : n!.status;
      const need = Math.max(1, Math.ceil(days[m]! * W.dosha.minDaysShare));
      const triggers: DoshaTrigger[] = [];
      const because: string[] = [];
      if (status === 'present') {
        for (const t of ['natal_dasha', 'mudda_dasha', 'transit'] as const) {
          const strong = [...holds[m]![k][t].entries()].filter(([, c]) => c >= need);
          if (strong.length > 0) {
            triggers.push(t);
            because.push(...strong.map(([why]) => why));
          }
        }
      }
      return {
        key: k,
        status,
        cancellations: n?.cancellations ?? [],
        active: triggers.length > 0,
        triggers,
        because,
      };
    }),
  }));
}

/** The 9 doshas for one month (0-11). */
export function doshaActivity(ctx: VarshikContext, month: number): DoshaMonth {
  return doshaActivityAll(ctx)[month]!;
}

// -----------------------------------------------------------------------------
// Yogas
// -----------------------------------------------------------------------------

export interface YogaDeliveryRow {
  source: 'natal' | 'tajika';
  name: string;
  /** Natal: the yoga's type. Tajika: 'ithasala', 'kamboola', ... */
  kind: string;
  planets: string[];
  /** Natal strength 0-100; null for Tajika yogas. */
  strength: number | null;
  /** Months (0-11) in which it delivers, and what delivers it there. */
  months: number[];
  because: Record<number, string[]>;
  /** Tajika: the Varsha year (by solar-return year) it belongs to; natal: null. */
  targetYear: number | null;
  /** Tajika Radda: why it is spoiled. */
  reason?: string;
}

/**
 * The months each yoga delivers. A natal yoga delivers while a natal Maha or Antar lord, or the
 * Mudda main lord, is one of its planets (on at least a third of the month's days). A Tajika
 * yoga delivers in the months its planets rule the Mudda dasha of its own Varsha year.
 */
export function yogaDelivery(ctx: VarshikContext): YogaDeliveryRow[] {
  const rows: YogaDeliveryRow[] = [];
  const days = new Array<number>(12).fill(0);
  ctx.monthOfDay.forEach((m) => days[m]!++);
  const need = days.map((d) => Math.max(1, Math.ceil(d * W.dosha.minDaysShare)));
  const slices = ctx.calendar.varshaYears;

  const hold = (planets: string[], sliceFilter: ((i: number) => boolean) | null, natal: boolean) => {
    const counts: Array<Map<string, number>> = Array.from({ length: 12 }, () => new Map());
    for (let i = 0; i < ctx.days.length; i++) {
      const m = ctx.monthOfDay[i]!;
      const atMs = ctx.days[i]!.atMs;
      const bump = (why: string) => counts[m]!.set(why, (counts[m]!.get(why) ?? 0) + 1);
      if (natal) {
        const d = ctx.natalDasha.find((x) => atMs >= x.startMs && atMs < x.endMs);
        if (d && planets.includes(d.maha)) bump(`Maha ${d.maha}`);
        if (d && planets.includes(d.antar)) bump(`Antar ${d.antar}`);
      }
      const slice = slices.find((s) => atMs >= s.startMs && atMs < s.endMs) ?? slices[slices.length - 1]!;
      if (sliceFilter && !sliceFilter(slices.indexOf(slice))) continue;
      const main = muddaAt(slice.mudda, atMs)?.main.lord;
      if (main && planets.includes(main)) bump(`Mudda ${main}`);
    }
    const months: number[] = [];
    const because: Record<number, string[]> = {};
    counts.forEach((c, m) => {
      const strong = [...c.entries()].filter(([, n]) => n >= need[m]!).map(([w]) => w);
      if (strong.length > 0) {
        months.push(m);
        because[m] = strong;
      }
    });
    return { months, because };
  };

  for (const y of detectAllYogas(ctx.natal)) {
    if (!y.present) continue;
    const { months, because } = hold(y.planets, null, true);
    rows.push({
      source: 'natal',
      name: y.name,
      kind: y.type,
      planets: y.planets,
      strength: y.strength,
      months,
      because,
      targetYear: null,
    });
  }

  slices.forEach((s, idx) => {
    for (const y of computeTajikaYogas(s.varshphal.solarReturn.chart)) {
      const { months, because } = hold(y.planets, (i) => i === idx, false);
      rows.push({
        source: 'tajika',
        name: y.kind,
        kind: y.kind,
        planets: y.planets,
        strength: null,
        months,
        because,
        targetYear: s.targetYear,
        ...(y.reason ? { reason: y.reason } : {}),
      });
    }
  });
  return rows;
}

// -----------------------------------------------------------------------------
// Answer windows
// -----------------------------------------------------------------------------

export interface AnswerWindow {
  /** Day indices (0 = 1 January) and instants. */
  fromDay: number;
  toDay: number;
  fromMs: number;
  toMs: number;
  peakDay: number;
  /** Mean smoothed score over the window, and its tier. */
  score: number;
  tier: Tier;
}

export interface AnswerWindows {
  key: string;
  /** The best window at or after `afterMs`; null only when there are no days left. */
  best: AnswerWindow | null;
  /** The next separate window after the best one, if any. */
  then: AnswerWindow | null;
  /**
   * True when no stretch of at least minRunDays reaches Light Green. The text must then say so
   * gently and not promise a window: a better one lies beyond 2027 and this sprint has no
   * 2028 scores to name it.
   */
  weak: boolean;
}

/** Daily smoothed series for an area, or a decision key (the blend of its areas). */
function dailySeriesFor(scores: VarshikScores, key: string): number[] | null {
  if ((AREAS as readonly string[]).includes(key)) return scores.series.areas[key as Area];
  const d = W.decisions.find((x) => x.key === key);
  if (!d) return null;
  const parts = Object.entries(d.areas) as Array<[Area, number]>;
  const total = parts.reduce((s, [, w]) => s + w, 0);
  const n = scores.series.overall.length;
  return Array.from({ length: n }, (_, i) => parts.reduce((s, [a, w]) => s + w * scores.series.areas[a][i]!, 0) / total);
}

/** The best dated window for an area or decision key, never starting before `afterMs`. */
export function answerWindow(
  scores: VarshikScores,
  ctx: VarshikContext,
  key: string,
  afterMs: number = ctx.dayStartMs[0]!,
): AnswerWindows {
  const series = dailySeriesFor(scores, key);
  if (!series) throw new Error(`answerWindow: unknown key "${key}"`);
  const n = series.length;
  const first = Math.max(0, ctx.days.findIndex((d) => d.atMs >= afterMs));
  const startDay = ctx.days.every((d) => d.atMs < afterMs) ? n : first;

  const edge = TIER_EDGES.light_green;
  const runs: Array<[number, number]> = [];
  let open: number | null = null;
  let lastIn = -1;
  for (let i = startDay; i < n; i++) {
    if (series[i]! >= edge) {
      if (open === null) open = i;
      lastIn = i;
    } else if (open !== null && i - lastIn > W.answerWindow.mergeGapDays) {
      runs.push([open, lastIn]);
      open = null;
    }
  }
  if (open !== null) runs.push([open, lastIn]);

  /** The best `maxDays` stretch inside a run longer than the cap (highest mean); shorter runs as they are. */
  const capped = ([a, b]: [number, number]): [number, number] => {
    const cap = W.answerWindow.maxDays;
    if (b - a + 1 <= cap) return [a, b];
    let sum = 0;
    for (let i = a; i < a + cap; i++) sum += series[i]!;
    let bestSum = sum;
    let bestStart = a;
    for (let s = a + 1; s + cap - 1 <= b; s++) {
      sum += series[s + cap - 1]! - series[s - 1]!;
      if (sum > bestSum) {
        bestSum = sum;
        bestStart = s;
      }
    }
    return [bestStart, bestStart + cap - 1];
  };

  const make = ([a, b]: [number, number]): AnswerWindow => {
    let peak = a;
    let sum = 0;
    for (let i = a; i <= b; i++) {
      sum += series[i]!;
      if (series[i]! > series[peak]!) peak = i;
    }
    const mean = sum / (b - a + 1);
    return {
      fromDay: a,
      toDay: b,
      fromMs: ctx.dayStartMs[a]!,
      toMs: ctx.dayStartMs[b + 1]!,
      peakDay: peak,
      score: Math.round(mean),
      tier: tierOf(mean),
    };
  };

  const long = runs
    .filter(([a, b]) => b - a + 1 >= W.answerWindow.minRunDays)
    .map(capped)
    .map(make);
  if (long.length === 0) {
    // Nothing reaches Light Green for a week: report the best seven days and call the year weak.
    let bestStart = startDay;
    let bestMean = -1;
    for (let i = startDay; i + W.answerWindow.minRunDays <= n; i++) {
      let s = 0;
      for (let j = 0; j < W.answerWindow.minRunDays; j++) s += series[i + j]!;
      if (s > bestMean) {
        bestMean = s;
        bestStart = i;
      }
    }
    const best = bestMean < 0 ? null : make([bestStart, bestStart + W.answerWindow.minRunDays - 1]);
    return { key, best, then: null, weak: true };
  }
  const ranked = [...long].sort((a, b) => b.score - a.score || a.fromDay - b.fromDay);
  const best = ranked[0]!;
  const then = ranked.filter((w) => w.fromDay > best.toDay).sort((a, b) => a.fromDay - b.fromDay)[0] ?? null;
  return { key, best, then, weak: false };
}

// -----------------------------------------------------------------------------
// Relief timeline
// -----------------------------------------------------------------------------

export type ReliefKind =
  | 'sade_sati_start'
  | 'sade_sati_end'
  | 'dhaiya_start'
  | 'dhaiya_end'
  | 'slow_planet_house'
  | 'natal_antar'
  | 'natal_maha';

export interface ReliefEvent {
  atMs: number;
  kind: ReliefKind;
  /** 'relief' lightens the chart, 'hard' weighs on it. */
  effect: 'relief' | 'hard';
  /** Plain facts for the text: 'Saturn enters your 8th house', 'Antar Venus begins', ... */
  detail: string;
  planet?: string;
  house?: number;
  /** A retrograde step back into the previous sign by Saturn or Jupiter: real, but it comes back. */
  temporary?: boolean;
}

export interface ReliefTimeline {
  asOfMs: number;
  /** The look-back window and its dated events. */
  lookback: { fromMs: number; toMs: number; events: ReliefEvent[] };
  /** Days in the look-back when Sade Sati or Dhaiya was running (counted from the natal Moon). */
  saturnDamperDays: number;
  /** True when the look-back holds hard events (damper days count as one) at the config minimum or more. */
  wasHard: boolean;
  /** The Varsha year that ruled the start of 2027, as plain facts; null when that year is not in the context. */
  varsha2026: { yearLord: string; munthaHouse: number; munthaAuspicious: boolean; endedAtMs: number } | null;
  /** Dated changes from asOf to the end of the look-ahead year, soonest first. */
  ahead: ReliefEvent[];
  nextRelief: ReliefEvent | null;
  /** True when a relief event falls between asOf and the end of the report year. */
  reliefInYear: boolean;
  /** When no relief arrives in the year, the next one beyond it (up to the look-ahead year). */
  nextReliefBeyondYear: ReliefEvent | null;
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

export function reliefTimeline(ctx: VarshikContext, asOfMs: number = ctx.dayStartMs[0]!): ReliefTimeline {
  const R = W.relief;
  const lookFrom = new Date(asOfMs);
  lookFrom.setUTCMonth(lookFrom.getUTCMonth() - R.lookbackMonths);
  const fromMs = lookFrom.getTime();
  const endMs = Date.UTC(R.aheadUntilYear + 1, 0, 1);
  const lagna = ctx.natal.ascendant.signIndex;
  const moon = ctx.natal.planets.find((p) => p.planet === 'Moon')!.signIndex;

  const all: ReliefEvent[] = [];
  const sky = ctx.slowSky;

  // Slow planets between the natal Lagna's houses, and Saturn against the natal Moon.
  let prev: (typeof sky)[number] | null = null;
  for (const day of sky) {
    if (prev) {
      for (const p of ['Saturn', 'Jupiter', 'Rahu', 'Ketu'] as const) {
        const a = prev.lon[p];
        const b = day.lon[p];
        if (a === undefined || b === undefined || signOf(a) === signOf(b)) continue;
        const hOld = houseFrom(lagna, signOf(a));
        const hNew = houseFrom(lagna, signOf(b));
        const isNode = p === 'Rahu' || p === 'Ketu';
        const table = !isNode && W.transit.beneficPlanets.includes(p) ? W.transit.beneficTable : W.transit.maleficTable;
        const f = isNode ? W.transit.nodeFactor : 1;
        const delta = f * ((table[hNew] ?? 0) - (table[hOld] ?? 0));
        // Rahu and Ketu always run backwards; for the others a step back is a retrograde dip.
        const dip = !isNode && signOf(b) === (signOf(a) + 11) % 12;
        if (Math.abs(delta) >= R.transitDelta) {
          all.push({
            atMs: prev.atMs,
            kind: 'slow_planet_house',
            effect: delta > 0 ? 'relief' : 'hard',
            detail: `${p} ${dip ? 'steps back' : 'moves'} from your ${ORDINAL[hOld]} house to your ${ORDINAL[hNew]} house`,
            planet: p,
            house: hNew,
            ...(dip ? { temporary: true } : {}),
          });
        }
        if (p === 'Saturn') {
          const mOld = houseFrom(moon, signOf(a));
          const mNew = houseFrom(moon, signOf(b));
          const was = [12, 1, 2].includes(mOld);
          const is = [12, 1, 2].includes(mNew);
          const back = signOf(b) === (signOf(a) + 11) % 12;
          const tmp = back ? { temporary: true } : {};
          if (!was && is) all.push({ atMs: prev.atMs, kind: 'sade_sati_start', effect: 'hard', detail: 'Sade Sati begins (from your Moon sign)', planet: 'Saturn', ...tmp });
          if (was && !is) all.push({ atMs: prev.atMs, kind: 'sade_sati_end', effect: 'relief', detail: 'Sade Sati ends (from your Moon sign)', planet: 'Saturn', ...tmp });
          const dWas = [4, 8].includes(mOld);
          const dIs = [4, 8].includes(mNew);
          if (!dWas && dIs) all.push({ atMs: prev.atMs, kind: 'dhaiya_start', effect: 'hard', detail: `Dhaiya begins (Saturn in the ${ORDINAL[mNew]} from your Moon)`, planet: 'Saturn', ...tmp });
          if (dWas && !dIs) all.push({ atMs: prev.atMs, kind: 'dhaiya_end', effect: 'relief', detail: 'Dhaiya ends (from your Moon sign)', planet: 'Saturn', ...tmp });
        }
      }
    }
    prev = day;
  }

  // Natal Maha and Antar changes, helping or weighing by the new lord's natal signal.
  const lordSig = natalLordSignals(ctx);
  let before: (typeof ctx.natalDasha)[number] | null = null;
  for (const seg of ctx.natalDasha) {
    if (before) {
      if (seg.antar !== before.antar || seg.maha !== before.maha) {
        const mahaChanged = seg.maha !== before.maha;
        const oldL = mahaChanged ? before.maha : before.antar;
        const newL = mahaChanged ? seg.maha : seg.antar;
        const delta = (lordSig[newL] ?? 0) - (lordSig[oldL] ?? 0);
        if (Math.abs(delta) >= R.dashaDelta) {
          all.push({
            atMs: seg.startMs,
            kind: mahaChanged ? 'natal_maha' : 'natal_antar',
            effect: delta > 0 ? 'relief' : 'hard',
            detail: mahaChanged ? `Maha ${newL} begins` : `Antar ${newL} begins in Maha ${seg.maha}`,
            planet: newL,
          });
        }
      }
    }
    before = seg;
  }
  all.sort((a, b) => a.atMs - b.atMs);

  const lookEvents = all.filter((e) => e.atMs >= fromMs && e.atMs < asOfMs);
  let damperDays = 0;
  for (const day of sky) {
    if (day.atMs < fromMs || day.atMs >= asOfMs || day.lon.Saturn === undefined) continue;
    const h = houseFrom(moon, signOf(day.lon.Saturn));
    if ([12, 1, 2, 4, 8].includes(h)) damperDays++;
  }
  const hardEvents = lookEvents.filter((e) => e.effect === 'hard').length + (damperDays > 0 ? 1 : 0);

  const ahead = all.filter((e) => e.atMs >= asOfMs && e.atMs < endMs);
  const reportYearEnd = ctx.calendar.windowEndMs;
  // Only lasting relief is named as a turning point; a retrograde dip is kept in `ahead` for the record.
  const reliefs = ahead.filter((e) => e.effect === 'relief' && !e.temporary);
  const inYear = reliefs.find((e) => e.atMs < reportYearEnd) ?? null;
  const slice0 = ctx.calendar.varshaYears[0];
  const first = slice0?.varshphal;
  return {
    asOfMs,
    lookback: { fromMs, toMs: asOfMs, events: lookEvents },
    saturnDamperDays: damperDays,
    wasHard: hardEvents >= R.hardStretchMinEvents,
    varsha2026:
      slice0 && first && slice0.targetYear === ctx.year - 1
        ? {
            yearLord: first.varsheshwara.varsheshwara,
            munthaHouse: first.muntha.houseFromVarshaAsc,
            munthaAuspicious: first.muntha.isAuspicious,
            endedAtMs: slice0.endMs,
          }
        : null,
    ahead,
    nextRelief: reliefs[0] ?? null,
    reliefInYear: inYear !== null,
    nextReliefBeyondYear: inYear ? null : (reliefs.find((e) => e.atMs >= reportYearEnd) ?? null),
  };
}
