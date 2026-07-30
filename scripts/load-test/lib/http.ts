import { BASE_URL } from '../config.js';

export type RequestEvent = {
  ts: number;
  vu: number;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  rateLimited: boolean; // 429
  serverError: boolean; // 5xx
  error?: string;
};

/**
 * Deterministic synthetic IP so the rate limiter buckets each identity
 * independently. Uses non-overlapping byte ranges of `n` (not `n % 256` per
 * octet, which would alias every 256^3 ≈ 16.7M — plenty of headroom, but
 * more importantly each octet must depend on a *different* slice of `n` or
 * low-order correlation between octets collapses the space far below that)
 * so distinct identities never collide within a rate-limit window even when
 * tier 1 mints a fresh identity per iteration (tens of thousands per step).
 */
export function vuIp(n: number): string {
  const o2 = Math.floor(n / 65536) % 256;
  const o3 = Math.floor(n / 256) % 256;
  const o4 = n % 256;
  return `10.${o2}.${o3}.${o4}`;
}

export class Journey {
  constructor(
    private vu: number,
    private onEvent: (e: RequestEvent) => void,
    private bearer?: string,
  ) {}

  async call(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; json: unknown }> {
    const start = performance.now();
    const headers: Record<string, string> = {
      'X-Forwarded-For': vuIp(this.vu),
      ...opts.headers,
    };
    if (this.bearer) headers.Authorization = `Bearer ${this.bearer}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let status = 0;
    let json: unknown;
    let error: string | undefined;
    try {
      const init: RequestInit = { method, headers };
      if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
      const res = await fetch(`${BASE_URL}${path}`, init);
      status = res.status;
      const text = await res.text();
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = text;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const latencyMs = performance.now() - start;

    const event: RequestEvent = {
      ts: Date.now(),
      vu: this.vu,
      method,
      path,
      status,
      latencyMs,
      rateLimited: status === 429,
      serverError: status >= 500 || status === 0,
    };
    if (error !== undefined) event.error = error;
    this.onEvent(event);

    return { status, json };
  }

  get(path: string) {
    return this.call('GET', path);
  }
  post(path: string, body?: unknown) {
    return this.call('POST', path, { body });
  }
  patch(path: string, body?: unknown) {
    return this.call('PATCH', path, { body });
  }
}
