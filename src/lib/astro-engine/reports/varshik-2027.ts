// =============================================================================
// Varshik Rashifal 2027 — scoring
// =============================================================================
// Turns a VarshikContext (the two Varsha years, the daily sky, the natal dasha, Ashtakavarga
// and Saham windows) into a 0-100 score for each of 365 days, for each of 7 areas and overall,
// then into 12 months, the 7x12 Timing Map, the decision table and the planet impact table.
//
// LAGNA FIRST. Every house is counted from the natal Lagna or from the Varsha Lagna. There are
// no Moon-sign templates. The one exception is Sade Sati and Dhaiya, which are counted from the
// natal Moon (the owner's standing rule) and enter as ONE damper.
//
// HOW IT COMBINES. Each day, per area, the signals are added in log-odds (see
// config/varshik-weights.ts for the formula and every constant). Then two kinds of gate:
//   veto       Year Lord weak AND Radda on it; Muntha in the 6th/8th/12th under a malefic
//              Ithasala. Each pulls the log-odds down and caps the score below Dark Green.
//   dominance  a clean Kamboola; a strong, supported Saham window on the days it peaks. Each
//              pushes the log-odds up and floors the score above Rust (or Amber).
// A birthday is not a cliff: for 5 days around the solar return the two Varsha years are
// cross-faded. The daily series is then smoothed (Savitzky-Golay), and a month is the
// day-weighted mean of that smoothed series, so the month grid and the wave cannot disagree.
//
// This module does no I/O and has no clock: the same context gives the same numbers.
// Status: PROVISIONAL, on a Sprint 1 engine not yet checked against JHora.
// =============================================================================

import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import {
  AREAS,
  SCORE_PLANETS,
  TIER_EDGES,
  VARSHIK_C3 as C3,
  VARSHIK_WEIGHTS as W,
  type Area,
  type ScorePlanet,
  type Tier,
} from '../../../config/varshik-weights.js';
import { natureOf } from '../rules/nature.js';
import { SIGN_DIGNITY_SCORE, signDignity } from '../rules/dignity.js';
import { panchavargiBala } from '../varshphal/tajika.js';
import { computeTajikaYogas, type TajikaYoga } from '../varshphal/tajika-yogas.js';
import { muddaAt, type MuddaPeriod } from '../varshphal/mudda-dasha.js';
import type { VarshaYearSlice } from '../varshphal/calendar-year.js';
import type { SahamWindow } from '../varshphal/saham-windows.js';
import { dashaAt, type DashaPeriod } from '../varshphal/annual-dashas.js';
import { BALA_PLANETS, dwadashavargiyaBala, harshaBala } from '../varshphal/annual-balas.js';
import { computeExtraTajikaYogas } from '../varshphal/tajika-yogas-extra.js';
import { computeLifeSahams } from '../varshphal/sahams-life.js';
import { natalPromise, capByPromise } from './natal-promise.js';
import { buildStarSignals, type StarSignals } from './varshik-star-signals.js';
import type { VarshikContext } from './varshik-context.js';
import {
  CLOSED_DECISION_KEYS,
  MIN_OPEN_DAYS,
  ROW_NOTES,
  closuresFor,
  muhurtaClosures,
  openDaysByMonth,
  openSpans,
  type Closure,
} from './varshik-muhurta.js';

const MS_PER_DAY = 86_400_000;
const SEVEN = new Set<string>(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']);

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

const clamp = (x: number, lo = -1, hi = 1): number => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const mod12 = (n: number): number => ((n % 12) + 12) % 12;
const houseFromSign = (lagnaSign: number, sign: number): number => mod12(sign - lagnaSign) + 1;

export function tierOf(score: number): Tier {
  const s = Math.round(score);
  if (s >= TIER_EDGES.dark_green) return 'dark_green';
  if (s >= TIER_EDGES.light_green) return 'light_green';
  if (s >= TIER_EDGES.amber) return 'amber';
  return 'rust';
}

/** Savitzky-Golay smoothing weights for the centre point of a window. */
export function savitzkyGolayWeights(window: number, order: number): number[] {
  if (window % 2 === 0 || window < order + 2) throw new Error('Savitzky-Golay: odd window larger than order + 1');
  const m = (window - 1) / 2;
  const n = order + 1;
  // Normal equations (AtA) c = e0, where A[i][j] = i^j; the smoothing weights are row 0 of (AtA)^-1 At.
  const ata: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = -m; i <= m; i++) {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) ata[r]![c]! += i ** (r + c);
  }
  // Solve ata x = e0 by Gauss-Jordan.
  const aug = ata.map((row, r) => [...row, r === 0 ? 1 : 0]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(aug[r]![col]!) > Math.abs(aug[piv]![col]!)) piv = r;
    [aug[col], aug[piv]] = [aug[piv]!, aug[col]!];
    const d = aug[col]![col]!;
    for (let c = col; c <= n; c++) aug[col]![c]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r]![col]!;
      for (let c = col; c <= n; c++) aug[r]![c]! -= f * aug[col]![c]!;
    }
  }
  const x = aug.map((row) => row[n]!);
  const out: number[] = [];
  for (let i = -m; i <= m; i++) {
    let w = 0;
    for (let j = 0; j < n; j++) w += x[j]! * i ** j;
    out.push(w);
  }
  return out;
}

/** Smooth a series; the edges are mirrored so the ends are not pulled towards zero. */
export function smoothSeries(series: number[], window: number, order: number): number[] {
  const w = savitzkyGolayWeights(window, order);
  const m = (window - 1) / 2;
  const n = series.length;
  const at = (i: number): number => {
    let j = i;
    if (j < 0) j = -j;
    if (j > n - 1) j = 2 * (n - 1) - j;
    return series[Math.min(n - 1, Math.max(0, j))]!;
  };
  return series.map((_, i) => {
    let s = 0;
    for (let k = -m; k <= m; k++) s += w[k + m]! * at(i + k);
    return s;
  });
}

// -----------------------------------------------------------------------------
// Chart models: what the scorer reads from a Varsha chart or the natal chart
// -----------------------------------------------------------------------------

interface ChartModel {
  chart: ChartData;
  lagna: number;
  /** House (1-12) of each planet. */
  house: Partial<Record<ScorePlanet, number>>;
  sign: Partial<Record<ScorePlanet, number>>;
  /** Houses each planet rules. */
  rules: Partial<Record<ScorePlanet, number[]>>;
  /** Strength of a planet in -1..+1. */
  strength: (planet: ScorePlanet) => number;
}

function buildModel(chart: ChartData, strength: (p: ScorePlanet) => number): ChartModel {
  const lagna = chart.ascendant.signIndex;
  const house: ChartModel['house'] = {};
  const sign: ChartModel['sign'] = {};
  for (const p of chart.planets) {
    house[p.planet] = houseFromSign(lagna, p.signIndex);
    sign[p.planet] = p.signIndex;
  }
  const rules: ChartModel['rules'] = {};
  for (let h = 1; h <= 12; h++) {
    const lord = SIGN_LORDS[ZODIAC_SIGNS[mod12(lagna + h - 1)]!];
    (rules[lord] ??= []).push(h);
  }
  return { chart, lagna, house, sign, rules, strength };
}

const vimsopakaNorm = (vim: number): number =>
  clamp((vim - W.houseQuality.vimCenter) / W.houseQuality.vimHalfWidth);

function varshaModel(chart: ChartData): ChartModel {
  return buildModel(chart, (p) => (SEVEN.has(p) ? vimsopakaNorm(panchavargiBala(p, chart).vimsopaka) : 0));
}

function natalModel(chart: ChartData): ChartModel {
  return buildModel(chart, (p) => {
    const sign = chart.planets.find((x) => x.planet === p)?.signIndex;
    if (sign === undefined || !SEVEN.has(p)) return 0;
    return clamp((SIGN_DIGNITY_SCORE[signDignity(p, sign)] - W.natalDasha.dignityCenter) / 2.5);
  });
}

/** A house's quality in a chart, -1..+1: its lord's strength and place, and who sits in it. */
function houseQuality(m: ChartModel, h: number): number {
  const q = W.houseQuality;
  const sign = mod12(m.lagna + h - 1);
  const lord = SIGN_LORDS[ZODIAC_SIGNS[sign]!];
  const lordHouse = m.house[lord] ?? h;
  let occ = 0;
  for (const p of m.chart.planets) {
    if (m.house[p.planet] !== h) continue;
    const benefic = natureOf(p.planet, m.chart) === 'benefic' && p.planet !== 'Rahu' && p.planet !== 'Ketu';
    if (benefic) occ += q.beneficOccupant;
    else occ += (q.maleficWelcomeHouses as readonly number[]).includes(h) ? q.maleficWelcome : q.maleficOccupant;
  }
  return clamp(
    q.lord * m.strength(lord) + q.placement * (W.placement[lordHouse] ?? 0) + q.occupants * clamp(occ),
  );
}

/** Whether a planet rules or sits in any house of the area (counted in this chart). */
function touchesArea(m: ChartModel, planet: ScorePlanet, area: Area): boolean {
  const houses = W.areaHouses[area];
  const h = m.house[planet];
  if (h !== undefined && houses.includes(h)) return true;
  return (m.rules[planet] ?? []).some((r) => houses.includes(r));
}

/** A lord's own signal in a chart, -1..+1, with the three shares of its dasha group. */
function lordSignal(
  m: ChartModel,
  planet: ScorePlanet,
  shares: { strengthShare: number; placementShare: number; natureShare: number },
  nodeNature: number,
): number {
  const isNode = planet === 'Rahu' || planet === 'Ketu';
  const nature = isNode
    ? nodeNature
    : natureOf(planet, m.chart) === 'benefic'
      ? W.mudda.beneficNature
      : W.mudda.maleficNature;
  const place = W.placement[m.house[planet] ?? 1] ?? 0;
  return clamp(shares.strengthShare * m.strength(planet) + shares.placementShare * place + shares.natureShare * nature);
}

/** Areas -> multiplier for a planet's dasha signal (1 + boost when it touches the area). */
function touchMap(m: ChartModel, planet: ScorePlanet, boost: number): Record<Area, number> {
  return Object.fromEntries(AREAS.map((a) => [a, 1 + (touchesArea(m, planet, a) ? boost : 0)])) as Record<Area, number>;
}

// -----------------------------------------------------------------------------
// Per-Varsha-year model, built once
// -----------------------------------------------------------------------------

interface SliceModel {
  slice: VarshaYearSlice;
  varsha: ChartModel;
  yogas: TajikaYoga[];
  yearLord: ScorePlanet;
  munthaLord: ScorePlanet;
  munthaHouse: number;
  /** Static components per area (already weighted, in log-odds before `scale`). */
  chartPart: Record<Area, number>;
  yearLordPart: Record<Area, number>;
  munthaPart: Record<Area, number>;
  /** Mudda lord -> { signal, area multiplier }. */
  muddaLord: Partial<Record<ScorePlanet, { signal: number; touch: Record<Area, number> }>>;
  sahamQuality: Record<string, number>;
  windows: SahamWindow[];
  gates: { vetoYearLord: boolean; vetoMuntha: boolean; kamboola: boolean };
  /** C3: Mudda Yogini and Patyayini run beside Mudda; their lords are read like Mudda's. */
  lagnaLord: ScorePlanet;
  /** C3: flat signal of the 10 extra Tajika yogas, and of each area's life Sahams. */
  extraYogaSignal: number;
  lifeSahamPart: Record<Area, number>;
}

const dashaLordAt = <L extends string>(periods: DashaPeriod<L>[], atMs: number): { main: L; sub: L } | null => {
  if (periods.length === 0) return null;
  const hit = dashaAt(periods, atMs);
  if (hit) return { main: hit.main.lord, sub: hit.sub.lord };
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  const edge = atMs < first.startMs ? first : last;
  return { main: edge.lord, sub: (atMs < first.startMs ? edge.antardashas[0]! : edge.antardashas[edge.antardashas.length - 1]!).lord };
};

function sliceModel(slice: VarshaYearSlice, ctx: VarshikContext): SliceModel {
  const chart = slice.varshphal.solarReturn.chart;
  const varsha = varshaModel(chart);
  const yogas = computeTajikaYogas(chart);
  const yearLord = slice.varshphal.varsheshwara.varsheshwara as ScorePlanet;
  const munthaSign = slice.varshphal.muntha.signIndex;
  const munthaLord = SIGN_LORDS[ZODIAC_SIGNS[munthaSign]!];
  const munthaHouse = slice.varshphal.muntha.houseFromVarshaAsc;

  const quality = Array.from({ length: 13 }, (_, h) => (h === 0 ? 0 : houseQuality(varsha, h)));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const chartPart = {} as Record<Area, number>;
  const yearLordPart = {} as Record<Area, number>;
  const munthaPart = {} as Record<Area, number>;

  const ylCand = slice.varshphal.varsheshwara.candidates.find((c) => c.planet === yearLord);
  // C3: Harsha + Dwadashavargiya bala of each planet in the Varsha chart, folded into the lord signals.
  const harsha = harshaBala(chart, slice.varshphal.solarReturn.isDayReturn);
  const dwad = dwadashavargiyaBala(chart);
  const bala: Partial<Record<ScorePlanet, number>> = {};
  for (const bp of BALA_PLANETS) {
    const h = clamp((harsha[bp].total - C3.annualBala.harshaCenter) / C3.annualBala.harshaHalfWidth);
    if (C3.annualBala.dwadashaVerified.includes(bp)) {
      const d = clamp((dwad[bp].score - C3.annualBala.dwadashaCenter) / C3.annualBala.dwadashaHalfWidth);
      bala[bp] = (h + d) / 2;
    } else {
      bala[bp] = h;
    }
  }
  const withBala = (planet: ScorePlanet, signal: number): number =>
    bala[planet] === undefined ? signal : clamp((1 - C3.annualBala.share) * signal + C3.annualBala.share * bala[planet]);
  const ylSignal = withBala(
    yearLord,
    clamp(
      W.yearLord.strengthShare * vimsopakaNorm(ylCand?.strength ?? W.houseQuality.vimCenter) +
        W.yearLord.aspectShare * ((ylCand?.aspectKala ?? 0) / 60 * 2 - 1),
    ),
  );
  const mhSignal = clamp(
    W.muntha.houseShare * (W.placement[munthaHouse] ?? 0) + W.muntha.lordShare * varsha.strength(munthaLord),
  );

  for (const area of AREAS) {
    const houses = W.areaHouses[area];
    chartPart[area] = W.components.varshaChart * mean(houses.map((h) => quality[h]!));
    yearLordPart[area] =
      W.components.yearLord *
      ylSignal *
      (1 + (touchesArea(varsha, yearLord, area) ? W.yearLord.areaTouchBoost : 0));
    munthaPart[area] =
      W.components.muntha * mhSignal * (1 + (houses.includes(munthaHouse) ? W.muntha.areaTouchBoost : 0));
  }

  const muddaLord: SliceModel['muddaLord'] = {};
  for (const planet of SCORE_PLANETS) {
    muddaLord[planet] = {
      signal: withBala(planet, lordSignal(varsha, planet, W.mudda, W.mudda.nodeNature)),
      touch: touchMap(varsha, planet, W.mudda.areaTouchBoost),
    };
  }

  // Saham quality: how well placed and supported the Saham is in this Varsha chart.
  const sahamQuality: Record<string, number> = {};
  for (const s of slice.varshphal.sahams) {
    const lord = s.lord as ScorePlanet;
    sahamQuality[s.name] = clamp(
      W.saham.lordShare * varsha.strength(lord) +
        W.saham.houseShare * (W.placement[s.houseFromVarshaAsc] ?? 0) +
        W.saham.supportShare * (s.beneficSupported ? W.saham.supportedValue : W.saham.unsupportedValue),
    );
  }

  // C3: the 10 further Tajika yogas (flat, mean over the yogas found) and the life Sahams (steady, per area).
  const extra = computeExtraTajikaYogas(chart);
  const extraVals = extra.map((y) =>
    y.kind === 'iqbal' && y.lagneshStrong === false ? C3.iqbalWeakLagnesh : (C3.extraYogaValue[y.kind] ?? 0),
  );
  const extraYogaSignal = clamp(extraVals.reduce((a, b) => a + b, 0));
  const lifeBy = {} as Record<Area, number[]>;
  for (const a of AREAS) lifeBy[a] = [];
  for (const s of computeLifeSahams(chart, slice.varshphal.solarReturn.isDayReturn)) {
    const area = C3.lifeSahamArea[s.name];
    if (!area) continue;
    const lord = s.lord as ScorePlanet;
    lifeBy[area].push(
      clamp(
        W.saham.lordShare * varsha.strength(lord) +
          W.saham.houseShare * (W.placement[s.houseFromVarshaAsc] ?? 0) +
          W.saham.supportShare * (s.beneficSupported ? W.saham.supportedValue : W.saham.unsupportedValue),
      ),
    );
  }
  const lifeSahamPart = {} as Record<Area, number>;
  for (const a of AREAS) lifeSahamPart[a] = lifeBy[a].length ? lifeBy[a].reduce((x, y) => x + y, 0) / lifeBy[a].length : 0;

  const ylVim = ylCand?.strength ?? 20;
  const vetoYearLord =
    ylVim < W.gates.yearLordWeakBelow && yogas.some((y) => y.kind === 'radda' && y.planets.includes(yearLord as never));
  const maleficOf = (y: TajikaYoga) =>
    y.planets.some((p) => p !== (munthaLord as never) && (W.gates.maleficPlanets as readonly string[]).includes(p));
  const vetoMuntha =
    [6, 8, 12].includes(munthaHouse) &&
    yogas.some((y) => y.kind === 'ithasala' && y.planets.includes(munthaLord as never) && maleficOf(y));
  const kamboola = yogas.some(
    (y) =>
      y.kind === 'kamboola' &&
      !yogas.some(
        (r) => r.kind === 'radda' && r.planets.includes(y.planets[0]!) && r.planets.includes(y.planets[1]!),
      ),
  );

  const windows = ctx.sahamWindows.filter(
    (w) => w.startMs >= slice.clippedStartMs - 1 && w.startMs <= slice.clippedEndMs + 1,
  );

  return {
    slice,
    varsha,
    yogas,
    yearLord,
    munthaLord,
    munthaHouse,
    chartPart,
    yearLordPart,
    munthaPart,
    muddaLord,
    sahamQuality,
    windows,
    gates: { vetoYearLord, vetoMuntha, kamboola },
    lagnaLord: SIGN_LORDS[ZODIAC_SIGNS[varsha.lagna]!],
    extraYogaSignal,
    lifeSahamPart,
  };
}

// -----------------------------------------------------------------------------
// Natal model
// -----------------------------------------------------------------------------

interface NatalModel {
  m: ChartModel;
  lordSignal: Partial<Record<ScorePlanet, { signal: number; touch: Record<Area, number> }>>;
  lagnaPoint: number;
  lagnaLordLon: number;
  moonSign: number;
  /** Average of the on/off-area relevance, so transit relevance has a mean of 1. */
  relAvg: Record<Area, number>;
  /** C3: daily star signals, and the natal promise of each area (-1..+1), for the natal-promise cap. */
  stars: StarSignals;
  promise: Record<Area, number>;
}

function natalModelOf(ctx: VarshikContext): NatalModel {
  const m = natalModel(ctx.natal);
  const lordSig: NatalModel['lordSignal'] = {};
  for (const planet of SCORE_PLANETS) {
    lordSig[planet] = {
      signal: lordSignal(m, planet, W.natalDasha, W.mudda.nodeNature),
      touch: touchMap(m, planet, W.natalDasha.areaTouchBoost),
    };
  }
  const lagnaPoint = ctx.natal.ascendant.signIndex * 30 + ctx.natal.ascendant.degree;
  const lagnaLord = SIGN_LORDS[ZODIAC_SIGNS[ctx.natal.ascendant.signIndex]!];
  const lagnaLordLon = ctx.natal.planets.find((p) => p.planet === lagnaLord)?.longitude ?? lagnaPoint;
  const moonSign = ctx.natal.planets.find((p) => p.planet === 'Moon')!.signIndex;
  const relAvg = {} as Record<Area, number>;
  for (const a of AREAS) {
    const k = W.areaHouses[a].length;
    relAvg[a] = (k * W.relevance.onArea + (12 - k) * W.relevance.offArea) / 12;
  }
  const promise = {} as Record<Area, number>;
  for (const a of AREAS) {
    const hs = W.areaHouses[a];
    promise[a] = hs.reduce((x, h) => x + natalPromise(ctx.natal, h).score, 0) / hs.length;
  }
  return { m, lordSignal: lordSig, lagnaPoint, lagnaLordLon, moonSign, relAvg, stars: buildStarSignals(ctx), promise };
}

/** The natal signal of each planet as a dasha lord (-1..+1): used to tell whether a dasha change helps or weighs. */
export function natalLordSignals(ctx: VarshikContext): Record<string, number> {
  const nat = natalModelOf(ctx);
  return Object.fromEntries(SCORE_PLANETS.map((p) => [p, nat.lordSignal[p]!.signal]));
}

// -----------------------------------------------------------------------------
// One day, one Varsha year
// -----------------------------------------------------------------------------

type Contrib = Record<string, number>;

interface DayResult {
  /** Final log-odds per area, after gates' offsets. */
  logit: Record<Area, number>;
  /** Score per area, 0-100, after ceilings and floors. */
  score: Record<Area, number>;
  /** Contributions to each area's log-odds, by driver key (offsets included). */
  contrib: Record<Area, Contrib>;
}

function angularSep(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

function muddaLordsAt(periods: MuddaPeriod[], atMs: number): { main: ScorePlanet; sub: ScorePlanet } {
  const hit = muddaAt(periods, atMs);
  if (hit) return { main: hit.main.lord, sub: hit.sub.lord };
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  const edge = atMs < first.startMs ? first : last;
  return { main: edge.lord, sub: (atMs < first.startMs ? edge.antardashas[0]! : edge.antardashas[8]!).lord };
}

function sahamActivity(w: SahamWindow, atMs: number): number {
  if (atMs < w.startMs || atMs > w.endMs) return 0;
  const peak = w.exactMs.length > 0 ? w.exactMs.reduce((a, b) => a + b, 0) / w.exactMs.length : (w.startMs + w.endMs) / 2;
  const half = atMs <= peak ? peak - w.startMs : w.endMs - peak;
  const shape = half <= 0 ? 1 : 1 - Math.abs(atMs - peak) / half;
  return Math.max(0, shape) * Math.min(1, w.strength / W.saham.strengthRef);
}

function scoreDay(
  ctx: VarshikContext,
  nat: NatalModel,
  S: SliceModel,
  dayIdx: number,
): DayResult {
  const day = ctx.days[dayIdx]!;
  const atMs = day.atMs;
  const contrib = Object.fromEntries(AREAS.map((a) => [a, {}])) as Record<Area, Contrib>;
  const add = (area: Area, key: string, v: number) => {
    if (v !== 0) contrib[area][key] = (contrib[area][key] ?? 0) + v;
  };

  const { main, sub } = muddaLordsAt(S.slice.mudda, atMs);
  // C3: Mudda Yogini and Patyayini. Patyayini is read by the week (its cut points are only good to a few days).
  const yog = dashaLordAt(S.slice.muddaYogini, atMs);
  const blockStart = ctx.days[Math.floor(dayIdx / C3.patyayiniBlockDays) * C3.patyayiniBlockDays]!.atMs;
  const pat = dashaLordAt(S.slice.patyayini, blockStart);
  const patLord = (l: string): ScorePlanet => (l === 'Lagna' ? S.lagnaLord : (l as ScorePlanet));
  const SS = nat.stars;
  const dasha = ctx.natalDasha.find((d) => atMs >= d.startMs && atMs < d.endMs);

  // Transit signals do not depend on the area, only their relevance does.
  const tw = W.transit;
  const transitSignal: Array<{ planet: ScorePlanet; weight: number; signal: number; hN: number }> = [];
  for (const [planetName, planetWeight] of Object.entries(tw.planetWeight)) {
    const planet = planetName as ScorePlanet;
    const lon = day.lon[planet];
    if (lon === undefined) continue;
    const signIdx = Math.floor((((lon % 360) + 360) % 360) / 30);
    const hN = houseFromSign(nat.m.lagna, signIdx);
    const hV = houseFromSign(S.varsha.lagna, signIdx);
    const isNode = planet === 'Rahu' || planet === 'Ketu';
    const table = !isNode && tw.beneficPlanets.includes(planet) ? tw.beneficTable : tw.maleficTable;
    const nodeF = isNode ? tw.nodeFactor : 1;
    const houseSig = nodeF * (tw.natalLagnaShare * (table[hN] ?? 0) + (1 - tw.natalLagnaShare) * (table[hV] ?? 0));
    const bindusSig = isNode
      ? clamp(((ctx.sav[signIdx] ?? tw.savCenter) - tw.savCenter) / tw.savHalfWidth)
      : clamp(((ctx.bav[planet]?.[signIdx] ?? tw.bavCenter) - tw.bavCenter) / tw.bavHalfWidth);
    // Exact conjunction or opposition to the natal Lagna point or its lord.
    let aspectSig = 0;
    for (const target of [nat.lagnaPoint, nat.lagnaLordLon]) {
      for (const point of [target, target + 180]) {
        const sep = angularSep(lon, point);
        if (sep < tw.aspectOrbDeg) aspectSig += 1 - sep / tw.aspectOrbDeg;
      }
    }
    const benefic = !isNode && tw.beneficPlanets.includes(planet);
    aspectSig = clamp(aspectSig) * (benefic ? 1 : -1);
    const signal = clamp(tw.houseShare * houseSig + tw.bindusShare * bindusSig + tw.aspectShare * aspectSig);
    transitSignal.push({ planet, weight: planetWeight ?? 0, signal, hN });
  }

  // Sade Sati / Dhaiya from the natal Moon: one damper.
  let damper = 0;
  const saturn = day.lon.Saturn;
  if (saturn !== undefined) {
    const h = houseFromSign(nat.moonSign, Math.floor((((saturn % 360) + 360) % 360) / 30));
    const d = W.sadeSati;
    damper = h === 12 ? d.rising : h === 1 ? d.peak : h === 2 ? d.setting : h === 4 ? d.dhaiya4 : h === 8 ? d.dhaiya8 : 0;
  }

  const active = S.windows
    .map((w) => ({ w, a: sahamActivity(w, atMs) }))
    .filter((x) => x.a > 0);

  const logit = {} as Record<Area, number>;
  const score = {} as Record<Area, number>;

  for (const area of AREAS) {
    const c = W.components;
    add(area, 'varshaChart', S.chartPart[area]);
    add(area, `yearLord:${S.yearLord}`, S.yearLordPart[area]);
    add(area, `muntha:${S.munthaLord}`, S.munthaPart[area]);

    const mm = S.muddaLord[main]!;
    const ms = S.muddaLord[sub]!;
    add(area, `mudda:${main}`, c.mudda * W.mudda.mainShare * mm.signal * mm.touch[area]);
    add(area, `mudda:${sub}`, c.mudda * W.mudda.subShare * ms.signal * ms.touch[area]);

    if (dasha) {
      for (const [lord, share] of [
        [dasha.maha, W.natalDasha.mahaShare],
        [dasha.antar, W.natalDasha.antarShare],
        [dasha.praty, W.natalDasha.pratyantarShare],
      ] as Array<[Planet, number]>) {
        const ls = nat.lordSignal[lord]!;
        add(area, `natalDasha:${lord}`, c.natalDasha * share * ls.signal * ls.touch[area]);
      }
    }

    for (const t of transitSignal) {
      const onArea = W.areaHouses[area].includes(t.hN);
      const karaka = W.karakas[area].includes(t.planet) ? W.karakaBoost : 1;
      const rel = ((onArea ? W.relevance.onArea : W.relevance.offArea) / nat.relAvg[area]) * karaka;
      add(area, `transit:${t.planet}`, c.transit * t.weight * t.signal * rel);

      // C3: the same planet read from the natal Moon and through the stars.
      const p = t.planet;
      if (SS.gochar[p]) {
        const k = C3.components;
        add(area, `gochar:${p}`, k.moonGochar * t.weight * SS.gochar[p][dayIdx]! * rel);
        add(area, `moorti:${p}`, k.moorti * t.weight * SS.moorti[p]![dayIdx]! * rel);
        add(area, `tara:${p}`, k.tara * t.weight * SS.tara[p]![dayIdx]! * rel);
        const lord = SS.starLord[p]![dayIdx]! as ScorePlanet;
        add(area, `starLord:${p}`, k.starLord * t.weight * (nat.lordSignal[lord]?.signal ?? 0) * rel);
        if (C3.kakshyaPlanets.includes(p)) add(area, `kakshya:${p}`, k.kakshya * t.weight * SS.kakshya[p]![dayIdx]! * rel);
        const sp = SS.special[p]![dayIdx]!;
        let sens = 0;
        if (sp) {
          const share = (C3.sensitive.areaOf[sp] ?? []).includes(area) ? 1 : C3.sensitive.otherShare;
          const fixed = sp === 22 ? C3.sensitive.vainashika : sp === 28 ? C3.sensitive.abhisheka : null;
          const raw = fixed !== null ? fixed : sp === 25 ? 0 : C3.sensitive.emphasisGain * t.signal;
          sens += share * raw;
        }
        if (SS.natalHit[p]![dayIdx]) sens += C3.sensitive.natalStarGain * t.signal;
        add(area, `sensitive:${p}`, k.sensitive * t.weight * sens * rel);
      }
    }

    // C3: Mudda Yogini and Patyayini beside Mudda; the 10 further Tajika yogas; the life Sahams.
    for (const [key, comp, lords, conv] of [
      ['yogini', C3.components.muddaYogini, yog, (l: string) => l as ScorePlanet],
      ['patyayini', C3.components.patyayini, pat, patLord],
    ] as const) {
      if (!lords) continue;
      const lm = S.muddaLord[conv(lords.main)]!;
      const ls = S.muddaLord[conv(lords.sub)]!;
      add(area, `${key}:${conv(lords.main)}`, comp * W.mudda.mainShare * lm.signal * lm.touch[area]);
      add(area, `${key}:${conv(lords.sub)}`, comp * W.mudda.subShare * ls.signal * ls.touch[area]);
    }
    add(area, 'tajikaExtra', C3.components.extraYogas * S.extraYogaSignal);
    add(area, 'lifeSaham', C3.components.lifeSahams * S.lifeSahamPart[area]);

    // C3: no single star family may swamp the rest (see C3.familyCap).
    for (const fam of C3.familyCap.families) {
      const keys = Object.keys(contrib[area]).filter((k) => k.startsWith(`${fam}:`));
      const sum = keys.reduce((x, k) => x + contrib[area][k]!, 0);
      const cap = C3.familyCap.raw;
      if (Math.abs(sum) > cap) for (const k of keys) contrib[area][k] = contrib[area][k]! * (cap / Math.abs(sum));
    }

    // C3: the natal chart limits the annual part (Mehta): its sum is held under the area's natal-promise ceiling.
    {
      const annual = (k: string) =>
        k === 'varshaChart' || k === 'tajikaExtra' || k === 'lifeSaham' || /^(yearLord|muntha|mudda|yogini|patyayini):/.test(k);
      const keys = Object.keys(contrib[area]).filter(annual);
      const sum = keys.reduce((x, k) => x + contrib[area][k]!, 0);
      if (sum > 0) {
        const ref = C3.natalCap.annualRef;
        const capped = capByPromise(sum / ref, nat.promise[area]) * ref;
        if (capped < sum) for (const k of keys) contrib[area][k] = contrib[area][k]! * (capped / sum);
      }
    }

    if (damper > 0) add(area, 'sadeSati:Saturn', -damper * W.sadeSati.areaSensitivity[area]);

    // Saham windows: signed by the Saham's quality, full strength for its own area.
    let sahamSum = 0;
    const sahamByKey: Contrib = {};
    let strongOwn = false;
    for (const { w, a } of active) {
      const q = S.sahamQuality[w.saham] ?? 0;
      const own = W.saham.areaOf[w.saham] === area;
      const v = a * q * (own ? 1 : W.saham.otherAreaShare);
      sahamSum += v;
      sahamByKey[`saham:${w.planet}`] = (sahamByKey[`saham:${w.planet}`] ?? 0) + v;
      if (own && a >= W.gates.dominanceSaham.activityAtLeast && q >= W.gates.dominanceSaham.qualityAtLeast) {
        strongOwn = true;
      }
    }
    if (sahamSum !== 0) {
      const squash = Math.tanh(sahamSum) / sahamSum;
      for (const [k, v] of Object.entries(sahamByKey)) add(area, k, c.saham * v * squash);
    }

    // Gates: offsets enter the log-odds; ceilings and floors act on the score.
    const g = W.gates;
    if (S.gates.vetoYearLord) add(area, 'gate:vetoYearLord', g.vetoYearLord.offset);
    if (S.gates.vetoMuntha) add(area, 'gate:vetoMuntha', g.vetoMuntha.offset);
    if (S.gates.kamboola) add(area, 'gate:kamboola', g.dominanceKamboola.offset);
    if (strongOwn) add(area, 'gate:strongSaham', g.dominanceSaham.offset);

    let sum = 0;
    let offsets = 0;
    for (const [k, v] of Object.entries(contrib[area])) {
      if (k.startsWith('gate:')) offsets += v;
      else sum += v;
    }
    const lg = W.base + W.scale * sum + offsets;
    logit[area] = lg;
    let sc = 100 * sigmoid(lg);
    if (S.gates.vetoYearLord) sc = Math.min(sc, g.vetoYearLord.ceiling);
    if (S.gates.vetoMuntha) sc = Math.min(sc, g.vetoMuntha.ceiling);
    if (S.gates.kamboola) sc = Math.max(sc, g.dominanceKamboola.floor);
    if (strongOwn) sc = Math.max(sc, g.dominanceSaham.floor);
    score[area] = sc;
    // Contributions are reported in the real log-odds the scale produces.
    for (const k of Object.keys(contrib[area])) {
      if (!k.startsWith('gate:')) contrib[area][k] = contrib[area][k]! * W.scale;
    }
  }

  return { logit, score, contrib };
}

// -----------------------------------------------------------------------------
// The daily series
// -----------------------------------------------------------------------------

export interface MomentumSeries {
  /** 365 smoothed daily scores, 0-100. */
  overall: number[];
  areas: Record<Area, number[]>;
  /** The same before smoothing (after the cross-fade). */
  rawOverall: number[];
  rawAreas: Record<Area, number[]>;
  /** Mean log-odds contribution of each driver, by calendar month (0-11), per area. */
  drivers: Record<Area, Array<Record<string, number>>>;
  /** Index (0-11) of the calendar month of each day. */
  monthOfDay: number[];
  /** Cross-fade weight of the second Varsha year, by day (all 0 when there is only one). */
  fade: number[];
  gates: Array<{ targetYear: number; vetoYearLord: boolean; vetoMuntha: boolean; kamboola: boolean }>;
  /** Natal Moon sign check used for Sade Sati: days in each state. */
  damperDays: number;
}

// The natal and Varsha-year models depend only on the context (not on base or scale), and are the slow part,
// so a calibration run that scores the same contexts many times builds them once.
const modelCache = new WeakMap<VarshikContext, { nat: NatalModel; slices: SliceModel[] }>();

export function momentumSeries(ctx: VarshikContext): MomentumSeries {
  let models = modelCache.get(ctx);
  if (!models) {
    models = { nat: natalModelOf(ctx), slices: ctx.calendar.varshaYears.map((v) => sliceModel(v, ctx)) };
    modelCache.set(ctx, models);
  }
  const { nat, slices } = models;
  const n = ctx.days.length;
  const boundary = slices.length > 1 ? slices[1]!.slice.startMs : null;

  const rawAreas = Object.fromEntries(AREAS.map((a) => [a, new Array<number>(n).fill(0)])) as Record<Area, number[]>;
  const rawOverall = new Array<number>(n).fill(0);
  const fade = new Array<number>(n).fill(0);
  const monthOfDay: number[] = [];
  const drivers = Object.fromEntries(
    AREAS.map((a) => [a, Array.from({ length: 12 }, () => ({}))]),
  ) as Record<Area, Array<Record<string, number>>>;
  const monthDays = new Array<number>(12).fill(0);
  let damperDays = 0;

  const totalW = AREAS.reduce((s, a) => s + W.areaWeights[a], 0);
  for (let i = 0; i < n; i++) {
    const atMs = ctx.days[i]!.atMs;
    const month = ctx.monthOfDay[i]!;
    monthOfDay.push(month);
    monthDays[month]!++;

    let w = 0;
    if (boundary !== null) {
      w = clamp((atMs - boundary) / MS_PER_DAY / W.crossfadeDays + 0.5, 0, 1);
    }
    fade[i] = w;
    const first = slices.length > 1 && w >= 1 ? slices[1]! : slices[0]!;
    const results: Array<{ r: DayResult; weight: number; S: SliceModel }> = [];
    if (slices.length > 1 && w > 0 && w < 1) {
      results.push({ r: scoreDay(ctx, nat, slices[0]!, i), weight: 1 - w, S: slices[0]! });
      results.push({ r: scoreDay(ctx, nat, slices[1]!, i), weight: w, S: slices[1]! });
    } else {
      results.push({ r: scoreDay(ctx, nat, first, i), weight: 1, S: first });
    }

    for (const area of AREAS) {
      let sc = 0;
      for (const { r, weight } of results) {
        sc += weight * r.score[area];
        for (const [k, v] of Object.entries(r.contrib[area])) {
          const m = drivers[area][month]!;
          m[k] = (m[k] ?? 0) + weight * v;
        }
      }
      rawAreas[area][i] = sc;
    }
    // Overall: the weighted mean of the areas' log-odds in each Varsha year, then blended.
    let overallScore = 0;
    for (const { r, weight, S } of results) {
      let lg = 0;
      for (const a of AREAS) lg += W.areaWeights[a] * r.logit[a];
      lg /= totalW;
      let sc = 100 * sigmoid(lg);
      if (S.gates.vetoYearLord) sc = Math.min(sc, W.gates.vetoYearLord.ceiling);
      if (S.gates.vetoMuntha) sc = Math.min(sc, W.gates.vetoMuntha.ceiling);
      if (S.gates.kamboola) sc = Math.max(sc, W.gates.dominanceKamboola.floor);
      overallScore += weight * sc;
    }
    rawOverall[i] = overallScore;

    const sat = ctx.days[i]!.lon.Saturn;
    if (sat !== undefined) {
      const h = houseFromSign(nat.moonSign, Math.floor((((sat % 360) + 360) % 360) / 30));
      if ([12, 1, 2, 4, 8].includes(h)) damperDays++;
    }
  }

  // Monthly mean of each driver.
  for (const area of AREAS) {
    for (let m = 0; m < 12; m++) {
      const row = drivers[area][m]!;
      for (const k of Object.keys(row)) row[k] = row[k]! / (monthDays[m] || 1);
    }
  }

  const { window, order } = W.smoothing;
  const smooth = (s: number[]) => smoothSeries(s, window, order).map((x) => clamp(x, 0, 100));
  const areas = Object.fromEntries(AREAS.map((a) => [a, smooth(rawAreas[a])])) as Record<Area, number[]>;

  return {
    overall: smooth(rawOverall),
    areas,
    rawOverall,
    rawAreas,
    drivers,
    monthOfDay,
    fade,
    gates: slices.map((s) => ({ targetYear: s.slice.targetYear, ...s.gates })),
    damperDays,
  };
}

// -----------------------------------------------------------------------------
// Scores: months, Timing Map, tiers
// -----------------------------------------------------------------------------

export interface VarshikAnswers {
  relationship?: string;
  occupation?: string;
  children?: string;
  mainDecision?: string;
  livingWith?: string;
  home?: string;
  moneyFocus?: string;
  travelPlan?: string;
  studyPlan?: string;
  practice?: string;
}

export interface Cell {
  score: number;
  tier: Tier;
}

export interface Driver {
  /** 'transit:Jupiter', 'mudda:Venus', 'natalDasha:Saturn', 'sadeSati:Saturn', 'varshaChart', ... */
  key: string;
  /** Mean log-odds it added (or took away) that month. */
  effect: number;
}

export interface VarshikScores {
  year: number;
  overall: { score: number; tier: Tier };
  /** 12 months, overall; each the day-weighted mean of the smoothed daily series. */
  months: Cell[];
  /** The 7 x 12 Timing Map. */
  timingMap: Record<Area, Cell[]>;
  areaOverall: Record<Area, Cell>;
  /** Top drivers per month, overall (up to 3 lifting, 2 weighing). */
  why: Array<{ lifting: Driver[]; weighing: Driver[] }>;
  peakMonths: number[];
  restMonth: number;
  series: MomentumSeries;
  decisionTable: DecisionRow[];
  planetImpact: PlanetImpactRow[];
  gates: MomentumSeries['gates'];
  /** C5: the year's no-muhurat periods (Shukra and Guru Asta, Kharmas, Chaturmas). */
  closures: Closure[];
}

function monthlyMeans(series: number[], monthOfDay: number[]): number[] {
  const sum = new Array<number>(12).fill(0);
  const cnt = new Array<number>(12).fill(0);
  series.forEach((v, i) => {
    sum[monthOfDay[i]!]! += v;
    cnt[monthOfDay[i]!]!++;
  });
  return sum.map((s, m) => s / (cnt[m] || 1));
}

const cell = (score: number): Cell => {
  const s = Math.round(score);
  return { score: s, tier: tierOf(s) };
};

function overallDrivers(series: MomentumSeries, month: number): Driver[] {
  const totalW = AREAS.reduce((s, a) => s + W.areaWeights[a], 0);
  const acc: Record<string, number> = {};
  for (const a of AREAS) {
    for (const [k, v] of Object.entries(series.drivers[a][month]!)) acc[k] = (acc[k] ?? 0) + (W.areaWeights[a] * v) / totalW;
  }
  return Object.entries(acc).map(([key, effect]) => ({ key, effect }));
}

export function computeVarshikScores(
  ctx: VarshikContext,
  answers: VarshikAnswers = {},
  precomputed?: MomentumSeries,
): VarshikScores {
  const series = precomputed ?? momentumSeries(ctx);
  const months = monthlyMeans(series.overall, series.monthOfDay).map(cell);
  const timingMap = Object.fromEntries(
    AREAS.map((a) => [a, monthlyMeans(series.areas[a], series.monthOfDay).map(cell)]),
  ) as Record<Area, Cell[]>;
  const areaOverall = Object.fromEntries(
    AREAS.map((a) => [a, cell(series.areas[a].reduce((s, v) => s + v, 0) / series.areas[a].length)]),
  ) as Record<Area, Cell>;

  const why = months.map((_, m) => {
    const d = overallDrivers(series, m).filter((x) => Math.abs(x.effect) >= 0.03);
    return {
      lifting: d.filter((x) => x.effect > 0).sort((a, b) => b.effect - a.effect).slice(0, 3),
      weighing: d.filter((x) => x.effect < 0).sort((a, b) => a.effect - b.effect).slice(0, 2),
    };
  });

  const order = months.map((c, m) => ({ m, s: c.score })).sort((a, b) => b.s - a.s || a.m - b.m);
  const peakMonths = order.slice(0, 3).map((o) => o.m).sort((a, b) => a - b);
  const restMonth = order[order.length - 1]!.m;

  const result: VarshikScores = {
    year: ctx.year,
    overall: cell(series.overall.reduce((s, v) => s + v, 0) / series.overall.length),
    months,
    timingMap,
    areaOverall,
    why,
    peakMonths,
    restMonth,
    series,
    decisionTable: [],
    planetImpact: [],
    gates: series.gates,
    closures: [],
  };
  const dateOfDay = localDayDate(ctx);
  const closures = muhurtaClosures(ctx, dateOfDay);
  result.closures = closures;
  result.decisionTable = decisionTable(result, answers, {
    closures,
    openDaysFor: (key) => openDaysByMonth(ctx, closuresFor(key, closures)),
  });
  for (const row of result.decisionTable) {
    row.openSpans = row.closed ? openSpans(ctx, closuresFor(row.key, closures), row.best.from, row.best.to, dateOfDay) : [];
  }
  result.planetImpact = planetImpact(ctx, result);
  return result;
}

/** The reader's local date (YYYY-MM-DD) of ctx.days[i], taken at the middle of the day. */
export function localDayDate(ctx: VarshikContext): (i: number) => string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (i: number) => fmt.format(new Date(ctx.dayStartMs[i]! + 12 * 3_600_000));
}

// -----------------------------------------------------------------------------
// Decision table
// -----------------------------------------------------------------------------

export interface DecisionRow {
  key: string;
  /** 12 monthly scores for this decision. */
  months: Cell[];
  /** The best run of up to 2 consecutive months, and the 2 weakest months. */
  best: { from: number; to: number; score: number; tier: Tier };
  hold: number[];
  /** True when this is the reader's own main 2027 decision. */
  isMain: boolean;
  relevance: number;
  /** C5: a marriage, commitment or home-move row, whose "go" window keeps out of every closure. */
  closed: boolean;
  /** C5: the open runs of days inside the best window (empty for a row that is not closed). */
  openSpans: Array<{ from: string; to: string }>;
  /** C5: no month had enough open days, so the best window ignores the closures (never in 2027). */
  noOpenWindow: boolean;
  /** A soft custom line for this row (move-in: Kharmas and Chaturmas; engagement: the wedding rules). */
  note: 'move_custom' | 'sagai_custom' | null;
}

function personaAllows(
  d: (typeof W.decisions)[number],
  a: VarshikAnswers,
): boolean {
  const req = d.requires;
  if (req) {
    for (const [field, allowed] of Object.entries(req)) {
      const v = a[field as keyof VarshikAnswers];
      // An unanswered question never unlocks a row that needs it.
      if (v === undefined || !allowed.includes(v)) return false;
    }
  }
  const ex = d.excludes;
  if (ex) {
    for (const [field, banned] of Object.entries(ex)) {
      const v = a[field as keyof VarshikAnswers];
      if (v !== undefined && banned.includes(v)) return false;
    }
  }
  for (const combo of d.excludesWhen ?? []) {
    const hit = Object.entries(combo).every(([field, banned]) => {
      const v = a[field as keyof VarshikAnswers];
      return v !== undefined && banned.includes(v);
    });
    if (hit) return false;
  }
  return true;
}

export function decisionTable(
  scores: VarshikScores,
  answers: VarshikAnswers = {},
  muhurta?: { closures: Closure[]; openDaysFor: (key: string) => number[] },
): DecisionRow[] {
  const mainKeys = new Set(W.mainDecisionKeys[answers.mainDecision ?? ''] ?? []);
  const focusKeys = new Set<string>();
  for (const [field, byValue] of Object.entries(W.focusKeys)) {
    const v = answers[field as keyof VarshikAnswers];
    for (const key of (v && byValue[v]) || []) focusKeys.add(key);
  }
  const rows: DecisionRow[] = [];
  for (const d of W.decisions) {
    if (!personaAllows(d, answers)) continue;
    const parts = Object.entries(d.areas) as Array<[Area, number]>;
    const total = parts.reduce((s, [, w]) => s + w, 0);
    const monthly = Array.from({ length: 12 }, (_, m) => {
      const raw = parts.reduce((s, [a, w]) => s + w * scores.timingMap[a][m]!.score, 0) / total;
      return cell(raw);
    });
    // C5: a marriage, commitment or home-move row may only use months with at least MIN_OPEN_DAYS days
    // outside Shukra/Guru Asta, Kharmas and Chaturmas; a 2-month run needs both months open.
    const closed = CLOSED_DECISION_KEYS.includes(d.key) && !!muhurta;
    const openDays = closed ? muhurta.openDaysFor(d.key) : null;
    const eligible = (m: number) => !openDays || openDays[m]! >= MIN_OPEN_DAYS;
    const pickBest = (useClosures: boolean) => {
      let b = { from: 0, to: 0, score: -1, tier: 'rust' as Tier };
      for (let m = 0; m < 12; m++) {
        if (useClosures && !eligible(m)) continue;
        let to = Math.min(11, m + 1);
        if (useClosures && !eligible(to)) to = m;
        const s = (monthly[m]!.score + monthly[to]!.score) / 2;
        if (s > b.score) b = { from: m, to, score: Math.round(s), tier: tierOf(s) };
      }
      return b;
    };
    let best = pickBest(closed);
    const noOpenWindow = best.score < 0;
    if (noOpenWindow) best = pickBest(false);
    const hold = monthly
      .map((c, m) => ({ m, s: c.score }))
      .sort((a, b) => a.s - b.s || a.m - b.m)
      .slice(0, 2)
      .map((x) => x.m)
      .sort((a, b) => a - b);
    const isMain = mainKeys.has(d.key);
    // A row the reader's other answers point at (a planned purchase, a trip, an exam, a money goal) rises in the
    // list without being marked as the main decision.
    const focused = focusKeys.has(d.key);
    rows.push({
      key: d.key,
      months: monthly,
      best,
      hold,
      isMain,
      relevance: isMain ? W.mainDecisionBoost : focused ? W.focusBoost : 1,
      closed,
      openSpans: [],
      noOpenWindow,
      note: ROW_NOTES[d.key] ?? null,
    });
  }
  return rows.sort((a, b) => b.relevance - a.relevance);
}

// -----------------------------------------------------------------------------
// Planet impact
// -----------------------------------------------------------------------------

export interface PlanetImpactRow {
  planet: ScorePlanet;
  natalHouse: number | null;
  /** House in each Varsha year's chart, in order. */
  varshaHouses: number[];
  /** 'Year Lord', 'Muntha lord', 'Mudda lord (n days)'. */
  roles: string[];
  /** Panchavargi out of 20 in the Varsha chart in force at the start of the year; null for the nodes. */
  strength: number | null;
  /** Houses from the natal Lagna the planet moves through in the year, in order. */
  transitHouses: number[];
  /** Mean log-odds the planet added across the year, overall. */
  net: number;
  effect: 'helping' | 'weighing' | 'neutral';
  /** Months (0-11) where it helps most and weighs most. */
  bestMonth: number;
  hardMonth: number;
  /** The area it moves most (by size of effect), and the sign of that effect. */
  topArea: { area: Area; effect: number };
}

export function planetImpact(ctx: VarshikContext, scores: VarshikScores): PlanetImpactRow[] {
  const series = scores.series;
  const totalW = AREAS.reduce((s, a) => s + W.areaWeights[a], 0);
  const slices = ctx.calendar.varshaYears;
  const natalHouseOf = (p: string): number | null => {
    const sign = ctx.natal.planets.find((x) => x.planet === p)?.signIndex;
    return sign === undefined ? null : houseFromSign(ctx.natal.ascendant.signIndex, sign);
  };

  // planet -> month -> area -> effect (the drivers whose key ends in ':<planet>').
  const byPlanet = (planet: string, month: number, area: Area): number => {
    let s = 0;
    for (const [k, v] of Object.entries(series.drivers[area][month]!)) {
      if (k.endsWith(`:${planet}`)) s += v;
    }
    return s;
  };

  return SCORE_PLANETS.map((planet) => {
    const monthly = Array.from({ length: 12 }, (_, m) =>
      AREAS.reduce((s, a) => s + (W.areaWeights[a] * byPlanet(planet, m, a)) / totalW, 0),
    );
    const net = monthly.reduce((s, v) => s + v, 0) / 12;
    const areaEffect = AREAS.map((a) => ({
      area: a,
      effect: Array.from({ length: 12 }, (_, m) => byPlanet(planet, m, a)).reduce((s, v) => s + v, 0) / 12,
    })).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

    const roles: string[] = [];
    slices.forEach((s) => {
      if (s.varshphal.varsheshwara.varsheshwara === planet) roles.push(`Year Lord ${s.targetYear}`);
      const ml = SIGN_LORDS[ZODIAC_SIGNS[s.varshphal.muntha.signIndex]!];
      if (ml === planet) roles.push(`Muntha lord ${s.targetYear}`);
      let days = 0;
      for (const p of s.mudda) if (p.lord === planet) days += (Math.min(p.endMs, s.clippedEndMs) - Math.max(p.startMs, s.clippedStartMs)) / MS_PER_DAY;
      if (days > 0) roles.push(`Mudda lord ${s.targetYear} (${Math.round(days)} days)`);
    });

    const houses: number[] = [];
    for (const d of planet === 'Moon' ? [] : ctx.days) {
      const lon = d.lon[planet];
      if (lon === undefined) continue;
      const h = houseFromSign(ctx.natal.ascendant.signIndex, Math.floor((((lon % 360) + 360) % 360) / 30));
      if (houses[houses.length - 1] !== h) houses.push(h);
    }

    const first = slices[0]?.varshphal.solarReturn.chart;
    const vim = first && SEVEN.has(planet) ? panchavargiBala(planet, first).vimsopaka : null;
    const best = monthly.indexOf(Math.max(...monthly));
    const hard = monthly.indexOf(Math.min(...monthly));
    return {
      planet,
      natalHouse: natalHouseOf(planet),
      varshaHouses: slices.map((s) => {
        const p = s.varshphal.solarReturn.chart.planets.find((x) => x.planet === planet);
        return p ? houseFromSign(s.varshphal.solarReturn.chart.ascendant.signIndex, p.signIndex) : 0;
      }),
      roles,
      strength: vim,
      transitHouses: houses,
      net,
      effect: net > W.planetImpact.neutralBand ? 'helping' : net < -W.planetImpact.neutralBand ? 'weighing' : 'neutral',
      bestMonth: best,
      hardMonth: hard,
      topArea: areaEffect[0]!,
    };
  });
}
