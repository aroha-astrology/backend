export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, idx)]!;
}

export type Summary = {
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

export function summarize(latenciesMs: number[], statuses: number[], durationSec: number): Summary {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const rateLimited = statuses.filter((s) => s === 429).length;
  const serverErrors = statuses.filter((s) => s >= 500 || s === 0).length;
  const errors = statuses.filter((s) => s === 0 || s >= 400).length;
  const nonRateLimitErrors = errors - rateLimited;
  return {
    count: statuses.length,
    errors,
    rateLimited,
    serverErrors,
    nonRateLimitErrorRate: statuses.length > 0 ? nonRateLimitErrors / statuses.length : 0,
    throughputRps: durationSec > 0 ? statuses.length / durationSec : 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length ? sorted[sorted.length - 1]! : 0,
  };
}
