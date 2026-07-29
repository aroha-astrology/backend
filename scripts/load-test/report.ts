import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ABORT_THRESHOLDS } from './config.js';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  return v;
}

const runDir = arg('run-dir');

type StepSummary = {
  tier: number;
  concurrency: number;
  durationSec: number;
  aborted: boolean;
  count: number;
  errors: number;
  rateLimited: number;
  serverErrors: number;
  nonRateLimitErrorRate: number;
  throughputRps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
};

const summaryFiles = readdirSync(runDir).filter((f) => f.endsWith('.summary.json'));
const steps: { file: string; summary: StepSummary }[] = summaryFiles
  .map((f) => ({ file: f, summary: JSON.parse(readFileSync(join(runDir, f), 'utf8')) as StepSummary }))
  .sort((a, b) => a.summary.concurrency - b.summary.concurrency);

type MetricsSample = {
  ts: number;
  loadavg: number[];
  memAvailableKb: number | null;
  swapFreeKb: number | null;
  cpuStealPct: number | null;
  pgConn: number | null;
};

function loadMetrics(fileName: string): MetricsSample[] {
  const p = join(runDir, fileName);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as MetricsSample);
}

function fmtStep(s: StepSummary): string {
  return (
    `| ${s.concurrency} | ${s.durationSec.toFixed(0)}s | ${s.count} | ${s.throughputRps.toFixed(1)} | ${s.p50.toFixed(0)} | ` +
    `${s.p95.toFixed(0)} | ${s.p99.toFixed(0)} | ${s.rateLimited} | ${s.serverErrors} | ` +
    `${(s.nonRateLimitErrorRate * 100).toFixed(1)}% | ${s.aborted ? 'YES' : 'no'} |`
  );
}
const TABLE_HEADER =
  `| Concurrency | Duration | Requests | RPS | p50 (ms) | p95 (ms) | p99 (ms) | 429s | 5xx | Error rate | Aborted |\n` +
  `|---|---|---|---|---|---|---|---|---|---|---|\n`;

function breachedThresholds(s: StepSummary): string[] {
  const reasons: string[] = [];
  if (s.nonRateLimitErrorRate > ABORT_THRESHOLDS.nonRateLimitErrorRate) reasons.push('error rate');
  if (s.p95 > ABORT_THRESHOLDS.p95Ms) reasons.push('p95 latency');
  return reasons;
}

function metricsVerdict(samples: MetricsSample[]): string {
  if (samples.length === 0) return 'no server-side samples recorded';
  const minMemAvail = Math.min(...samples.map((s) => s.memAvailableKb ?? Infinity));
  const maxSteal = Math.max(...samples.map((s) => s.cpuStealPct ?? 0));
  const maxLoad1 = Math.max(...samples.map((s) => s.loadavg[0] ?? 0));
  const parts = [
    `min MemAvailable ${Math.round(minMemAvail / 1024)}MB`,
    `max CPU steal ${maxSteal.toFixed(1)}%`,
    `max load(1m) ${maxLoad1.toFixed(2)}`,
  ];
  return parts.join(', ');
}

// The plateau shares tier=1 and often the same concurrency as the last ramp
// step — split by duration so the ramp table and plateau section don't mix
// a 60s burst measurement with a 900s sustained one under the same row.
const ramp = steps.filter((s) => s.summary.tier === 1 && s.summary.durationSec <= 120);
const firstBreach = ramp.find((s) => s.summary.aborted || breachedThresholds(s.summary).length > 0);
const lastClean = [...ramp].reverse().find((s) => !s.summary.aborted && breachedThresholds(s.summary).length === 0);

const plateauMetrics = loadMetrics('plateau-metrics.jsonl');
const rampMetrics = loadMetrics('ramp-metrics.jsonl');

let md = `# Load Test Report — ${runDir}\n\n`;
md += `Generated ${new Date().toISOString()}\n\n`;

md += `## Tier 1 — Anonymous cached-read ramp\n\n`;
md += TABLE_HEADER;
for (const s of ramp) md += fmtStep(s.summary) + '\n';
md += `\nServer-side during ramp: ${metricsVerdict(rampMetrics)}\n\n`;

if (lastClean) {
  md += `**Last clean step:** ${lastClean.summary.concurrency} concurrent VUs — ` +
    `${lastClean.summary.throughputRps.toFixed(1)} RPS, p95 ${lastClean.summary.p95.toFixed(0)}ms.\n\n`;
}
if (firstBreach) {
  const reasons = breachedThresholds(firstBreach.summary);
  md += `**First breach:** ${firstBreach.summary.concurrency} concurrent VUs` +
    (firstBreach.summary.aborted ? ' — monitor aborted the run' : ` — ${reasons.join(', ')} exceeded threshold`) +
    `.\n\n`;
} else {
  md += `**No threshold breach across the tested concurrency range** — true ceiling is above the highest step tested.\n\n`;
}

const plateau = steps.find((s) => s.summary.tier === 1 && s.summary.durationSec > 300);
if (plateau) {
  md += `## Sustained plateau (${plateau.summary.durationSec.toFixed(0)}s at ${plateau.summary.concurrency} concurrent VUs)\n\n`;
  md += TABLE_HEADER;
  md += fmtStep(plateau.summary) + '\n\n';
  md += `Server-side during plateau: ${metricsVerdict(plateauMetrics)}\n\n`;
  if (plateauMetrics.length > 0) {
    const early = plateauMetrics.slice(0, Math.ceil(plateauMetrics.length / 3));
    const late = plateauMetrics.slice(-Math.ceil(plateauMetrics.length / 3));
    const avgSteal = (arr: MetricsSample[]) =>
      arr.reduce((a, s) => a + (s.cpuStealPct ?? 0), 0) / Math.max(1, arr.length);
    md += `CPU steal — first third avg ${avgSteal(early).toFixed(1)}%, last third avg ${avgSteal(late).toFixed(1)}%` +
      (avgSteal(late) > avgSteal(early) * 1.5
        ? ' — **rising**, consistent with burst-credit exhaustion.\n\n'
        : ' — flat, this looks like the true sustained ceiling, not a burst artifact.\n\n');
  }
}

const tier2 = steps.filter((s) => s.summary.tier === 2);
if (tier2.length > 0) {
  md += `## Tier 2 — Authenticated + chart compute\n\n`;
  md += TABLE_HEADER;
  for (const s of tier2) md += fmtStep(s.summary) + '\n';
  md += '\n';
}

const tier3 = steps.filter((s) => s.summary.tier === 3);
if (tier3.length > 0) {
  md += `## Tier 3 — AI chat\n\n`;
  md += TABLE_HEADER;
  for (const s of tier3) md += fmtStep(s.summary) + '\n';
  md += '\n';
}

// Prefer the plateau's proven-sustained RPS over a 60s ramp step's, which
// may still include some burst-credit headroom.
const capacitySource = plateau ?? lastClean;
if (capacitySource) {
  const rps = capacitySource.summary.throughputRps;
  const callsPerOpen = 14; // legal/current + panchang + 12x moon-sign (tier1 journey)
  const sessionsPerSec = rps / callsPerOpen;
  md += `## Capacity translation\n\n`;
  md += `Sustained ${rps.toFixed(1)} RPS ÷ ${callsPerOpen} calls/app-open ≈ **${sessionsPerSec.toFixed(1)} concurrent app-opens/sec** ` +
    `the box can sustain on the cached-read path (before accounting for the client-side localStorage IST-period cache, ` +
    `which means most real opens skip most of this fan-out — the real ceiling in terms of DAU is higher than this raw figure).\n\n`;
}

md += `## Notes\n\n`;
md += `- Abort thresholds used: error rate > ${(ABORT_THRESHOLDS.nonRateLimitErrorRate * 100).toFixed(0)}%, ` +
  `p95 > ${ABORT_THRESHOLDS.p95Ms}ms, MemAvailable < ${ABORT_THRESHOLDS.memAvailableKb / 1024}MB, ` +
  `CPU steal > ${ABORT_THRESHOLDS.cpuStealPct}%.\n`;
md += `- 429s are counted separately from 5xx/timeout errors — they represent the rate limiter working as designed, not a capacity failure.\n`;

writeFileSync(join(runDir, 'report.md'), md);
console.log(`Wrote ${join(runDir, 'report.md')}`);
