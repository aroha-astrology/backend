/**
 * Load must go through nginx, not :3000 directly — nginx sets
 * X-Forwarded-For and the rate limiter only trusts that header when
 * TRUST_PROXY=true (a temporary flag flipped on the box for the duration of
 * the run). Hitting :3000 bypasses nginx and every virtual user collapses
 * onto one limiter bucket keyed by the load generator's real IP.
 */
export const BASE_URL = 'https://api.arohaastrology.in';

export const SSH = {
  pem: process.env.LOADTEST_PEM ?? `${process.env.HOME}/.ssh/mumbai-key.pem`,
  host: process.env.LOADTEST_HOST ?? 'ec2-user@13.232.179.137',
  remoteDir: '/home/ec2-user/aroha-backend',
};

export type RampStep = { concurrency: number; durationSec: number };

/** 60s per step — long enough for percentiles to settle, short enough to abort fast. */
export const RAMP_STEPS: RampStep[] = [
  { concurrency: 5, durationSec: 60 },
  { concurrency: 10, durationSec: 60 },
  { concurrency: 25, durationSec: 60 },
  { concurrency: 50, durationSec: 60 },
  { concurrency: 100, durationSec: 60 },
  { concurrency: 200, durationSec: 60 },
];

/** How long to hold the last passing concurrency to burn through t4g.micro CPU credits. */
export const PLATEAU_DURATION_SEC = 15 * 60;

export const ABORT_THRESHOLDS = {
  nonRateLimitErrorRate: 0.05, // >5% non-429 errors
  p95Ms: 3000,
  memAvailableKb: 80 * 1024, // < 80 MB available
  cpuStealPct: 20, // burst credits exhausted
};

/** Same-origin marker so cleanup can find every artifact this run created (see seed-users.ts). */
export const LOADTEST_UID_PREFIX = 'loadtest-';
