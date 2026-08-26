import { logger } from './logger.js';

/**
 * Resolves an IP to country/city via ip-api.com's free tier (no key, ~45
 * req/min — fine at our scale since callers only hit this on a per-user IP
 * change, not per-request). Best-effort: any failure just means the geo
 * columns stay stale, never an error surfaced to the caller.
 */
export async function resolveGeoForIp(
  ip: string,
): Promise<{ country: string; city: string } | null> {
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string; country?: string; city?: string };
    if (data.status !== 'success' || !data.country) return null;
    return { country: data.country, city: data.city ?? '' };
  } catch (err) {
    logger.warn({ err, ip }, 'geo-lookup: ip-api.com lookup failed');
    return null;
  }
}
