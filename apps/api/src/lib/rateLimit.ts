// Lightweight rate limiter using Upstash Redis REST API.
//
// When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are not set, this
// helper is a no-op (returns false = "not limited"), so it's safe to deploy
// before provisioning Upstash. Once you create a Redis DB at upstash.com
// (Mumbai region, free tier) and add the env vars, rate limiting activates
// automatically — no code change.
//
// Window strategy: fixed-window via INCR + EXPIRE. Good enough for protecting
// payment + AI endpoints from a single misbehaving client; not a DDoS shield.

interface RateLimitOpts {
  limit: number;       // requests allowed in the window
  windowSec: number;   // window length in seconds
}

export async function rateLimit(key: string, opts: RateLimitOpts): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false; // not configured → don't block

  const bucketKey = `rl:${key}:${Math.floor(Date.now() / 1000 / opts.windowSec)}`;

  try {
    // Pipeline: INCR then EXPIRE in one round-trip via Upstash REST.
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', bucketKey],
        ['EXPIRE', bucketKey, String(opts.windowSec)],
      ]),
      // Don't let a slow Redis stall a request; if it times out, allow.
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as Array<{ result: number | string }>;
    const count = Number(json?.[0]?.result ?? 0);
    return count > opts.limit;
  } catch {
    // Fail-open — Redis hiccup should not break payments.
    return false;
  }
}
