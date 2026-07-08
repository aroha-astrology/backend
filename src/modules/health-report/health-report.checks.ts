import fs from 'node:fs';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../../config/env.js';
import { getRedis } from '../../config/redis.js';

const execAsync = promisify(exec);

export type CheckResult = {
  status: 'ok' | 'fail';
  latencyMs: number;
  message?: string;
};

async function measure<T>(
  fn: () => Promise<T>,
  evaluate: (result: T) => { status: 'ok' | 'fail'; message?: string },
): Promise<CheckResult> {
  const start = performance.now();
  try {
    const res = await fn();
    const evalRes = evaluate(res);
    return {
      status: evalRes.status,
      message: evalRes.message,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    return {
      status: 'fail',
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Math.round(performance.now() - start),
    };
  }
}

export async function checkRedis(): Promise<CheckResult> {
  return measure(
    async () => {
      const client = getRedis();
      return client.ping();
    },
    (res) =>
      res === 'PONG'
        ? { status: 'ok' }
        : { status: 'fail', message: `Unexpected response: ${String(res)}` },
  );
}

export async function checkNim(): Promise<CheckResult> {
  return measure(
    async () => {
      let apiKey = env.NVIDIA_NIM_API_KEY;
      if (!apiKey) {
        for (let i = 2; i <= 20; i++) {
          const keyName = `NVIDIA_NIM_API_KEY_${i}` as keyof typeof env;
          const key = env[keyName] as string | undefined;
          if (key) {
            apiKey = key;
            break;
          }
        }
      }
      if (!apiKey) {
        throw new Error('No NIM API key configured');
      }

      const res = await fetch(`${env.NVIDIA_NIM_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json();
    },
    () => ({ status: 'ok' }),
  );
}

export async function checkMemoryUsage(): Promise<CheckResult> {
  return measure(
    () => {
      let totalMem = os.totalmem();
      let availMem = os.freemem();

      try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const memTotalMatch = meminfo.match(/MemTotal:\s+(\d+)\s+kB/);
        const memAvailableMatch = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);

        if (memTotalMatch && memAvailableMatch) {
          totalMem = parseInt(memTotalMatch[1], 10) * 1024;
          availMem = parseInt(memAvailableMatch[1], 10) * 1024;
        }
      } catch {
        // Fallback to os.freemem
      }

      const usagePercent = ((totalMem - availMem) / totalMem) * 100;
      return Promise.resolve(usagePercent);
    },
    (usage) => ({
      status: usage > 90 ? 'fail' : 'ok',
      message: `${usage.toFixed(1)}% used`,
    }),
  );
}

export async function checkDiskUsage(): Promise<CheckResult> {
  return measure(
    async () => {
      const { stdout } = await execAsync('df -h /');
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) throw new Error('Unrecognized df output');
      const parts = lines[1].trim().split(/\s+/);
      const usePercentStr = parts[4];
      if (!usePercentStr || !usePercentStr.endsWith('%')) {
        throw new Error('Cannot parse use percent');
      }
      return parseInt(usePercentStr.slice(0, -1), 10);
    },
    (usage) => ({
      status: usage > 90 ? 'fail' : 'ok',
      message: `${usage}% used`,
    }),
  );
}

export async function checkPm2Process(processName: string): Promise<CheckResult> {
  return measure(
    async () => {
      const { stdout } = await execAsync('pm2 jlist');
      const list = JSON.parse(stdout) as Array<{ name: string; pm2_env?: { status: string } }>;
      const proc = list.find((p) => p.name === processName);
      if (!proc) throw new Error(`Process ${processName} not found`);
      return proc.pm2_env?.status;
    },
    (status) => ({
      status: status === 'online' ? 'ok' : 'fail',
      message: `Status: ${status}`,
    }),
  );
}
