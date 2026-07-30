import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Agent, setGlobalDispatcher } from 'undici';
import { Journey, type RequestEvent } from './lib/http.js';
import { summarize } from './lib/stats.js';
import { runTier1Journey } from './journeys/tier1-anonymous.js';
import { runTier2Journey } from './journeys/tier2-authenticated.js';
import { runTier3Journey } from './journeys/tier3-ai.js';

// undici's default global Agent caps concurrent connections per origin well
// below what a 200-VU step needs — without this, high concurrency measures
// the load generator's own connection pool, not the server.
setGlobalDispatcher(new Agent({ connections: 1000 }));

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  return v;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const tier = Number(arg('tier')) as 1 | 2 | 3;
const concurrency = Number(arg('concurrency'));
const durationSec = hasFlag('duration-sec') ? Number(arg('duration-sec')) : undefined;
const count = hasFlag('count') ? Number(arg('count')) : undefined;
const outFile = arg('out');
const abortFile = hasFlag('abort-file') ? arg('abort-file') : undefined;
const tokensFile = hasFlag('tokens') ? arg('tokens') : undefined;

if (!durationSec && !count) throw new Error('need --duration-sec or --count');

type Token = { uid: string; phone: string; userId: string; idToken: string };
const tokens: Token[] = tokensFile
  ? readFileSync(tokensFile, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Token)
  : [];
if (tier !== 1 && tokens.length === 0) throw new Error(`--tokens required for tier ${tier}`);

mkdirSync(dirname(outFile), { recursive: true });

const events: RequestEvent[] = [];
function onEvent(e: RequestEvent) {
  events.push(e);
}

async function runOneIteration(j: Journey, vu: number): Promise<void> {
  if (tier === 1) await runTier1Journey(j);
  else if (tier === 2) await runTier2Journey(j);
  else await runTier3Journey(j, vu);
}

function abortTriggered(): boolean {
  return abortFile !== undefined && existsSync(abortFile);
}

// Anonymous routes (tier 1) bucket the baseline limiter by IP, not by any
// app-level identity. Reusing one synthetic IP for a VU's whole lifetime
// would model one real person reopening the app dozens of times a minute —
// which trips their own 300/min abuse-guard bucket almost immediately and
// measures the limiter, not the server. Each tier-1 iteration therefore gets
// a brand-new synthetic IP, modeling a fresh distinct user's single app-open.
let nextIdentity = 0;

async function worker(vu: number, perWorkerCount?: number): Promise<void> {
  const bearer = tier === 1 ? undefined : tokens[vu % tokens.length]!.idToken;
  const persistentJourney = tier === 1 ? undefined : new Journey(vu, onEvent, bearer);

  async function runNext(): Promise<void> {
    const j = persistentJourney ?? new Journey(nextIdentity++, onEvent, bearer);
    await runOneIteration(j, vu);
  }

  if (durationSec) {
    const deadline = Date.now() + durationSec * 1000;
    while (Date.now() < deadline) {
      if (abortTriggered()) return;
      await runNext();
    }
  } else {
    for (let n = 0; n < (perWorkerCount ?? 1); n++) {
      if (abortTriggered()) return;
      await runNext();
    }
  }
}

async function main() {
  console.log(
    `[run] tier=${tier} concurrency=${concurrency} ` +
      (durationSec ? `duration=${durationSec}s` : `count=${count}`) +
      (tokens.length ? ` tokens=${tokens.length}` : ''),
  );

  const startedAt = Date.now();
  const progressTimer = setInterval(() => {
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const statuses = events.map((e) => e.status);
    const s = summarize(
      events.map((e) => e.latencyMs),
      statuses,
      elapsedSec,
    );
    console.log(
      `[run] t=${elapsedSec.toFixed(0)}s n=${s.count} rps=${s.throughputRps.toFixed(1)} ` +
        `p50=${s.p50.toFixed(0)}ms p95=${s.p95.toFixed(0)}ms 429s=${s.rateLimited} 5xx=${s.serverErrors} errRate=${(s.nonRateLimitErrorRate * 100).toFixed(1)}%`,
    );
  }, 5000);

  const perWorkerCount = count ? Math.max(1, Math.ceil(count / concurrency)) : undefined;
  const workers = Array.from({ length: concurrency }, (_, vu) => worker(vu, perWorkerCount));
  await Promise.all(workers);

  clearInterval(progressTimer);

  const durationActualSec = (Date.now() - startedAt) / 1000;
  const statuses = events.map((e) => e.status);
  const summary = summarize(
    events.map((e) => e.latencyMs),
    statuses,
    durationActualSec,
  );

  writeFileSync(outFile, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const summaryFile = outFile.replace(/\.jsonl$/, '.summary.json');
  writeFileSync(
    summaryFile,
    JSON.stringify(
      { tier, concurrency, durationSec: durationActualSec, aborted: abortTriggered(), ...summary },
      null,
      2,
    ),
  );

  console.log(
    `[run] DONE n=${summary.count} rps=${summary.throughputRps.toFixed(1)} p50=${summary.p50.toFixed(0)}ms ` +
      `p95=${summary.p95.toFixed(0)}ms p99=${summary.p99.toFixed(0)}ms 429s=${summary.rateLimited} ` +
      `5xx=${summary.serverErrors} errRate=${(summary.nonRateLimitErrorRate * 100).toFixed(1)}% aborted=${abortTriggered()}`,
  );
}

main().catch((err) => {
  console.error('[run] fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
