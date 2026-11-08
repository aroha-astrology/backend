// =============================================================================
// Varshik C3: what the new inputs change for a profile
// =============================================================================
//   tsx scripts/varshik-c3-compare.ts [--base x --scale x]
//
// Scores the three test personas (the same people as varshik-test-reports.ts) twice on the same sky:
//   BEFORE  the C2 engine with none of the C3 inputs (their weights set to 0, the bala blend off, the natal cap off)
//   AFTER   everything in
// and prints the overall tier, the month tiers and the area tiers side by side. Nothing is written.
// =============================================================================

import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { zoneOffsetMs } from '../src/lib/astro-engine/varshphal/calendar-year.js';
import { buildVarshikContext, type VarshikContext } from '../src/lib/astro-engine/reports/varshik-context.js';
import { computeVarshikScores } from '../src/lib/astro-engine/reports/varshik-2027.js';
import { AREAS, VARSHIK_C3, VARSHIK_WEIGHTS } from '../src/config/varshik-weights.js';
import { MONTH_NAMES } from '../src/lib/astro-engine/reports/varshik-labels.js';

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : undefined);
const W = VARSHIK_WEIGHTS as unknown as { base: number; scale: number };
if (opt('base') !== undefined) W.base = opt('base')!;
if (opt('scale') !== undefined) W.scale = opt('scale')!;

const PERSONAS = [
  { id: 'student (Aarav)', date: '2004-08-19', time: '07:40', lat: 18.52, lng: 73.86, tz: 'Asia/Kolkata', answers: { relationship: 'single', occupation: 'student', children: 'none', mainDecision: 'study' } },
  { id: 'professional (Meera)', date: '1988-03-14', time: '22:10', lat: 12.97, lng: 77.59, tz: 'Asia/Kolkata', answers: { relationship: 'married', occupation: 'working', children: 'have', mainDecision: 'job_change' } },
  { id: 'retired (Harish)', date: '1962-11-02', time: '05:15', lat: 26.85, lng: 80.95, tz: 'Asia/Kolkata', answers: { relationship: 'married', occupation: 'retired', children: 'have', mainDecision: 'move_or_travel' } },
];

async function contextOf(p: (typeof PERSONAS)[number]): Promise<VarshikContext> {
  const [y, mo, d] = p.date.split('-').map(Number) as [number, number, number];
  const [h, mi] = p.time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - zoneOffsetMs(wall, p.tz);
  utc = wall - zoneOffsetMs(utc, p.tz);
  const natal = await calculateChart(y, mo, d, h, mi, (wall - utc) / 3_600_000, p.lat, p.lng, 'lahiri', 'W');
  const sun = natal.planets.find((x) => x.planet === 'Sun')!;
  const moon = natal.planets.find((x) => x.planet === 'Moon')!;
  return buildVarshikContext({
    natal,
    year: 2027,
    inputs: {
      natalSunLongitude: sun.longitude,
      natalAscSignIndex: natal.ascendant.signIndex,
      birthDate: new Date(utc),
      birthNakshatraIndex: moon.nakshatraIndex,
      latitude: p.lat,
      longitude: p.lng,
      timezone: p.tz,
    },
  });
}

const TIER_SHORT: Record<string, string> = { dark_green: 'DG', light_green: 'LG', amber: 'AM', rust: 'RU' };
const mutable = VARSHIK_C3 as unknown as {
  components: Record<string, number>;
  annualBala: { share: number };
  natalCap: { annualRef: number };
};
const saved = {
  components: { ...mutable.components },
  share: mutable.annualBala.share,
  ref: mutable.natalCap.annualRef,
};

function scoreWith(ctx: VarshikContext, on: boolean, answers: Record<string, string>) {
  for (const k of Object.keys(saved.components)) mutable.components[k] = on ? saved.components[k]! : 0;
  mutable.annualBala.share = on ? saved.share : 0;
  mutable.natalCap.annualRef = on ? saved.ref : 1e9;
  // The model cache is keyed by context, so score each setting on its own copy.
  return computeVarshikScores({ ...ctx }, answers);
}

for (const p of PERSONAS) {
  const ctx = await contextOf(p);
  const before = scoreWith(ctx, false, p.answers);
  const after = scoreWith(ctx, true, p.answers);
  console.log(`\n=== ${p.id}  (base ${W.base}, scale ${W.scale})`);
  console.log(`overall   before ${Math.round(before.overall.score)} ${TIER_SHORT[before.overall.tier]}   after ${Math.round(after.overall.score)} ${TIER_SHORT[after.overall.tier]}`);
  console.log('month        before        after       change');
  for (let m = 0; m < 12; m++) {
    const b = before.months[m]!;
    const a = after.months[m]!;
    const d = Math.round(a.score) - Math.round(b.score);
    console.log(`${MONTH_NAMES[m]!.padEnd(10)} ${String(Math.round(b.score)).padStart(3)} ${TIER_SHORT[b.tier]}      ${String(Math.round(a.score)).padStart(3)} ${TIER_SHORT[a.tier]}     ${d >= 0 ? '+' : ''}${d}${a.tier !== b.tier ? '  tier changes' : ''}`);
  }
  console.log('area         before after');
  for (const a of AREAS) {
    const b = before.areaOverall[a];
    const c = after.areaOverall[a];
    console.log(`${a.padEnd(8)}  ${Math.round(b.score)} ${TIER_SHORT[b.tier]}   ${Math.round(c.score)} ${TIER_SHORT[c.tier]}`);
  }
  const tierMoves = after.months.filter((c, i) => c.tier !== before.months[i]!.tier).length;
  const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  console.log(`months whose tier changes: ${tierMoves} of 12;  mean month score ${mean(before.months.map((c) => c.score)).toFixed(1)} -> ${mean(after.months.map((c) => c.score)).toFixed(1)}`);
}
process.exit(0);
