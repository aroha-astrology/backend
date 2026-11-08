// =============================================================================
// Varshik 2027 calibration: score 100 synthetic charts and compare with the population targets
// =============================================================================
//   tsx scripts/varshik-calibrate.ts [--n 100] [--cache <file>] [--base x] [--scale x] [--fit]
//
// The 100 births are made up (seeded), stratified over birth month, birth hour (so every Lagna
// turns up) and place. Building a context takes the ephemeris, so the contexts are cached to
// `--cache`; scoring is pure and takes a moment, so base and scale can be re-fitted freely.
//
// The targets are for the POPULATION, not for each profile (see CALIBRATION_TARGETS):
//   cell mix       15% Dark Green / 40% Light Green / 30% Amber / 15% Rust, each within 5 points
//   all-one-tier   under 5% of profiles have all 12 months in one tier
//   month range    median (best month - worst month) is at least 22
// A profile under 10 points of range is listed, not forced.
// =============================================================================

import fs from 'node:fs';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { zoneOffsetMs } from '../src/lib/astro-engine/varshphal/calendar-year.js';
import { buildVarshikContext, type VarshikContext } from '../src/lib/astro-engine/reports/varshik-context.js';
import { computeVarshikScores, tierOf } from '../src/lib/astro-engine/reports/varshik-2027.js';
import {
  AREAS,
  CALIBRATION_TARGETS,
  VARSHIK_WEIGHTS,
  type Tier,
} from '../src/config/varshik-weights.js';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const N = Number(opt('n') ?? 100);
const cachePath = opt('cache');
const fit = args.includes('--fit');
const W = VARSHIK_WEIGHTS as unknown as { base: number; scale: number };
if (opt('base')) W.base = Number(opt('base'));
if (opt('scale')) W.scale = Number(opt('scale'));

// A small seeded PRNG so the 100 charts are the same on every run.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLACES = [
  { place: 'New Delhi', lat: 28.61, lng: 77.21, tz: 'Asia/Kolkata' },
  { place: 'Mumbai', lat: 19.08, lng: 72.88, tz: 'Asia/Kolkata' },
  { place: 'Kolkata', lat: 22.57, lng: 88.36, tz: 'Asia/Kolkata' },
  { place: 'Chennai', lat: 13.08, lng: 80.27, tz: 'Asia/Kolkata' },
  { place: 'Bengaluru', lat: 12.97, lng: 77.59, tz: 'Asia/Kolkata' },
  { place: 'Hyderabad', lat: 17.39, lng: 78.49, tz: 'Asia/Kolkata' },
  { place: 'Pune', lat: 18.52, lng: 73.86, tz: 'Asia/Kolkata' },
  { place: 'Lucknow', lat: 26.85, lng: 80.95, tz: 'Asia/Kolkata' },
  { place: 'London', lat: 51.51, lng: -0.13, tz: 'Europe/London' },
  { place: 'New York', lat: 40.71, lng: -74.01, tz: 'America/New_York' },
  { place: 'Sydney', lat: -33.87, lng: 151.21, tz: 'Australia/Sydney' },
  { place: 'Dubai', lat: 25.2, lng: 55.27, tz: 'Asia/Dubai' },
];

interface Synthetic {
  id: string;
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  place: (typeof PLACES)[number];
}

function makeBirths(n: number, seed: number): Synthetic[] {
  const r = rng(seed);
  const out: Synthetic[] = [];
  // A shuffled hour list and a shuffled month list, each cycled, so both are evenly covered.
  const shuffle = <T,>(xs: T[]) => xs.map((x) => [r(), x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const hours = shuffle(Array.from({ length: n }, (_, i) => (i * 24) / n));
  const months = shuffle(Array.from({ length: n }, (_, i) => (i % 12) + 1));
  for (let i = 0; i < n; i++) {
    const mo = months[i]!;
    const y = 1955 + Math.floor(r() * 54);
    const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const d = 1 + Math.floor(r() * dim);
    const hf = hours[i]!;
    out.push({
      id: `s${seed}-c${String(i + 1).padStart(3, '0')}`,
      y,
      mo,
      d,
      h: Math.floor(hf),
      mi: Math.floor(r() * 60),
      place: PLACES[Math.floor(r() * PLACES.length)]!,
    });
  }
  return out;
}

async function buildContext(b: Synthetic): Promise<VarshikContext> {
  const wall = Date.UTC(b.y, b.mo - 1, b.d, b.h, b.mi);
  let utc = wall - zoneOffsetMs(wall, b.place.tz);
  utc = wall - zoneOffsetMs(utc, b.place.tz);
  const offsetHours = (wall - utc) / 3_600_000;
  const natal = await calculateChart(b.y, b.mo, b.d, b.h, b.mi, offsetHours, b.place.lat, b.place.lng, 'lahiri', 'W');
  const sun = natal.planets.find((p) => p.planet === 'Sun')!;
  const moon = natal.planets.find((p) => p.planet === 'Moon')!;
  return buildVarshikContext({
    natal,
    year: 2027,
    inputs: {
      natalSunLongitude: sun.longitude,
      natalAscSignIndex: natal.ascendant.signIndex,
      birthDate: new Date(utc),
      birthNakshatraIndex: moon.nakshatraIndex,
      latitude: b.place.lat,
      longitude: b.place.lng,
      timezone: b.place.tz,
    },
  });
}

async function loadContexts(births: Synthetic[], cachePath: string | undefined): Promise<VarshikContext[]> {
  if (cachePath && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as VarshikContext[];
    if (cached.length === births.length) return cached;
  }
  const out: VarshikContext[] = [];
  const t0 = Date.now();
  for (const b of births) {
    out.push(await buildContext(b));
    if (out.length % 10 === 0) console.error(`  built ${out.length}/${births.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  if (cachePath) fs.writeFileSync(cachePath, JSON.stringify(out));
  return out;
}

const TIERS: Tier[] = ['dark_green', 'light_green', 'amber', 'rust'];
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;

interface Stats {
  mix: Record<Tier, number>;
  overallMix: Record<Tier, number>;
  allOneTier: number;
  allOneTierAreas: number;
  medianRange: number;
  rangeP10: number;
  smallRange: string[];
  cellMean: number;
  cellSd: number;
  quant: Record<string, number>;
  withinSd: number;
  betweenSd: number;
}

function evaluate(ctxs: VarshikContext[], ids: string[]): Stats {
  const mix = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;
  const overallMix = { ...mix };
  let cells = 0;
  let months = 0;
  let allOne = 0;
  let allOneAreas = 0;
  let areaRows = 0;
  const ranges: number[] = [];
  const small: string[] = [];
  const allCells: number[] = [];
  const profileMeans: number[] = [];
  const within: number[] = [];

  ctxs.forEach((ctx, i) => {
    const s = computeVarshikScores(ctx, {});
    const ov = s.months.map((m) => m.score);
    for (const m of s.months) {
      overallMix[m.tier]++;
      months++;
    }
    if (new Set(s.months.map((m) => m.tier)).size === 1) allOne++;
    const range = Math.max(...ov) - Math.min(...ov);
    ranges.push(range);
    if (range < CALIBRATION_TARGETS.inspectBelowRange) small.push(`${ids[i]} (${range})`);
    for (const a of AREAS) {
      const row = s.timingMap[a];
      for (const c of row) {
        mix[c.tier]++;
        cells++;
        allCells.push(c.score);
      }
      if (new Set(row.map((c) => c.tier)).size === 1) allOneAreas++;
      areaRows++;
      const mean = row.reduce((x, c) => x + c.score, 0) / 12;
      within.push(Math.sqrt(row.reduce((x, c) => x + (c.score - mean) ** 2, 0) / 12));
    }
    profileMeans.push(ov.reduce((x, v) => x + v, 0) / 12);
  });

  for (const t of TIERS) {
    mix[t] /= cells;
    overallMix[t] /= months;
  }
  const mean = allCells.reduce((a, b) => a + b, 0) / allCells.length;
  const sd = Math.sqrt(allCells.reduce((a, b) => a + (b - mean) ** 2, 0) / allCells.length);
  const pm = profileMeans.reduce((a, b) => a + b, 0) / profileMeans.length;
  return {
    mix,
    overallMix,
    allOneTier: allOne / ctxs.length,
    allOneTierAreas: allOneAreas / areaRows,
    medianRange: median(ranges),
    rangeP10: quantile(ranges, 0.1),
    smallRange: small,
    cellMean: mean,
    cellSd: sd,
    quant: { p5: quantile(allCells, 0.05), p15: quantile(allCells, 0.15), p50: quantile(allCells, 0.5), p85: quantile(allCells, 0.85), p95: quantile(allCells, 0.95) },
    withinSd: within.reduce((a, b) => a + b, 0) / within.length,
    betweenSd: Math.sqrt(profileMeans.reduce((a, b) => a + (b - pm) ** 2, 0) / profileMeans.length),
  };
}

function mixError(st: Stats): number {
  const t = CALIBRATION_TARGETS.mix;
  return TIERS.reduce((e, k) => e + (st.mix[k] - t[k]) ** 2, 0);
}

function report(st: Stats, label: string) {
  const t = CALIBRATION_TARGETS;
  console.log(`\n=== ${label}  (base ${W.base.toFixed(3)}, scale ${W.scale.toFixed(3)}) ===`);
  console.log('Cell mix (7 areas x 12 months x profiles)   target        got');
  for (const k of TIERS) {
    const ok = Math.abs(st.mix[k] - t.mix[k]) <= t.mixTolerance ? 'ok ' : 'OUT';
    console.log(`  ${k.padEnd(12)} ${pct(t.mix[k]).padStart(6)} +-5   ${pct(st.mix[k]).padStart(6)}  ${ok}`);
  }
  console.log(`Overall-month mix: ${TIERS.map((k) => `${k} ${pct(st.overallMix[k])}`).join(' | ')}`);
  console.log(`Profiles with all 12 months in one tier (overall): ${pct(st.allOneTier)}  (must be < ${pct(t.maxAllOneTierShare)})  ${st.allOneTier < t.maxAllOneTierShare ? 'ok' : 'OUT'}`);
  console.log(`  same, area by area: ${pct(st.allOneTierAreas)}`);
  console.log(`Median month range (overall): ${st.medianRange.toFixed(1)}  (must be >= ${t.minMedianMonthRange})  ${st.medianRange >= t.minMedianMonthRange ? 'ok' : 'OUT'};  10th percentile ${st.rangeP10.toFixed(1)}`);
  console.log(`Profiles under ${t.inspectBelowRange} points of range: ${st.smallRange.length}${st.smallRange.length ? '  ' + st.smallRange.join(', ') : ''}`);
  console.log(`Cell scores: mean ${st.cellMean.toFixed(1)}, sd ${st.cellSd.toFixed(1)}; p5 ${st.quant.p5} p15 ${st.quant.p15} p50 ${st.quant.p50} p85 ${st.quant.p85} p95 ${st.quant.p95}`);
  console.log(`Spread: between-profile sd of year mean ${st.betweenSd.toFixed(1)}; mean within-row sd (month to month) ${st.withinSd.toFixed(1)}`);
}

async function main() {
  // --seeds 20270101,777,4242 scores several independent sets of N charts together; each set has its own cache file.
  const seeds = (opt('seeds') ?? opt('seed') ?? '20270101').split(',').map(Number);
  const ids: string[] = [];
  const ctxs: VarshikContext[] = [];
  for (const seed of seeds) {
    const births = makeBirths(N, seed);
    ids.push(...births.map((b) => b.id));
    ctxs.push(...(await loadContexts(births, cachePath ? `${cachePath}-${seed}.json` : undefined)));
  }
  console.log(`${ctxs.length} synthetic charts, year 2027.`);

  if (fit) {
    let best = { base: W.base, scale: W.scale, err: Infinity };
    for (let scale = 0.3; scale <= 0.551; scale += 0.05) {
      for (let base = -0.1; base <= 0.401; base += 0.1) {
        W.base = base;
        W.scale = scale;
        const err = mixError(evaluate(ctxs, ids));
        if (err < best.err) best = { base, scale, err };
      }
    }
    W.base = best.base;
    W.scale = best.scale;
    console.log(`Best fit of the tier mix: base ${best.base.toFixed(2)}, scale ${best.scale.toFixed(2)}`);
  }

  const st = evaluate(ctxs, ids);
  report(st, fit ? 'fitted' : 'as configured');

  // The fixed edges, as a reminder of what the numbers above mean.
  console.log(`\nTiers: >=75 Dark Green, 60-74 Light Green, 45-59 Amber, <45 Rust. (tierOf(74.6) = ${tierOf(74.6)} because scores are rounded first.)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
