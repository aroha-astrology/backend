import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { SSH, ABORT_THRESHOLDS } from './config.js';

const execFileAsync = promisify(execFile);

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  return v;
}

const durationSec = Number(arg('duration-sec'));
const intervalSec = Number(arg('interval-sec', '5'));
const outFile = arg('out');
const abortFile = arg('abort-file');

// Overridable for smoke-testing the abort path without touching real thresholds.
const thresholds = {
  memAvailableKb: Number(arg('abort-mem-available-kb', String(ABORT_THRESHOLDS.memAvailableKb))),
  cpuStealPct: Number(arg('abort-cpu-steal-pct', String(ABORT_THRESHOLDS.cpuStealPct))),
};

type Sample = {
  ts: number;
  loadavg: [number, number, number];
  memAvailableKb: number | null;
  swapFreeKb: number | null;
  cpuStat: number[];
  pm2: { restartTime: number; unstableRestarts: number; memRss: number; cpu: number }[];
  pgConn: number | null;
};

async function sampleOnce(): Promise<Sample> {
  const { stdout } = await execFileAsync(
    'ssh',
    [
      '-i',
      SSH.pem,
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'ConnectTimeout=10',
      SSH.host,
      `node ${SSH.remoteDir}/scripts/load-test/remote-sample.mjs`,
    ],
    { timeout: 15_000, maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout.trim()) as Sample;
}

function cpuStealPct(prev: number[], cur: number[]): number | null {
  if (!prev || !cur || prev.length < 8 || cur.length < 8) return null;
  const prevTotal = prev.reduce((a, b) => a + b, 0);
  const curTotal = cur.reduce((a, b) => a + b, 0);
  const totalDelta = curTotal - prevTotal;
  const stealDelta = cur[7]! - prev[7]!; // index 7 = steal
  if (totalDelta <= 0) return null;
  return (stealDelta / totalDelta) * 100;
}

function checkAbort(
  sample: Sample,
  stealPct: number | null,
  initialRestarts: Map<string, number>,
): string | null {
  if (sample.memAvailableKb !== null && sample.memAvailableKb < thresholds.memAvailableKb) {
    return `MemAvailable ${sample.memAvailableKb}KB < threshold ${thresholds.memAvailableKb}KB`;
  }
  if (stealPct !== null && stealPct > thresholds.cpuStealPct) {
    return `CPU steal ${stealPct.toFixed(1)}% > threshold ${thresholds.cpuStealPct}%`;
  }
  for (const p of sample.pm2) {
    const key = `pm2-${p.restartTime}`;
    const baseline = initialRestarts.get(String(p.restartTime)) ?? p.unstableRestarts;
    if (p.unstableRestarts > baseline) {
      return `pm2 unstable_restarts increased (${baseline} -> ${p.unstableRestarts})`;
    }
    void key;
  }
  return null;
}

async function main() {
  if (existsSync(abortFile)) unlinkSync(abortFile);

  let prevCpuStat: number[] | null = null;
  const initialUnstable = new Map<string, number>();
  const deadline = Date.now() + durationSec * 1000;
  let firstIteration = true;

  while (Date.now() < deadline) {
    const tickStart = Date.now();
    let sample: Sample;
    try {
      sample = await sampleOnce();
    } catch (err) {
      console.error(`[monitor] sample failed: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((r) => setTimeout(r, intervalSec * 1000));
      continue;
    }

    if (firstIteration) {
      for (const p of sample.pm2) initialUnstable.set(String(p.restartTime), p.unstableRestarts);
      firstIteration = false;
    }

    const stealPct = prevCpuStat ? cpuStealPct(prevCpuStat, sample.cpuStat) : null;
    prevCpuStat = sample.cpuStat;

    const line = JSON.stringify({ ...sample, cpuStealPct: stealPct });
    appendFileSync(outFile, line + '\n');
    console.log(
      `[monitor] load=${sample.loadavg.join(',')} memAvail=${Math.round((sample.memAvailableKb ?? 0) / 1024)}MB ` +
        `steal=${stealPct !== null ? stealPct.toFixed(1) + '%' : 'n/a'} pgConn=${sample.pgConn} ` +
        `pm2=${sample.pm2.map((p) => `${p.memRss ? Math.round(p.memRss / 1024 / 1024) : '?'}MB/${p.cpu}%`).join(',')}`,
    );

    const abortReason = checkAbort(sample, stealPct, initialUnstable);
    if (abortReason) {
      console.error(`[monitor] ABORT: ${abortReason}`);
      writeFileSync(abortFile, abortReason);
      process.exit(1);
    }

    const elapsed = Date.now() - tickStart;
    const wait = Math.max(0, intervalSec * 1000 - elapsed);
    await new Promise((r) => setTimeout(r, wait));
  }

  console.log('[monitor] duration complete, no abort triggered');
}

main().catch((err) => {
  console.error('[monitor] fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
