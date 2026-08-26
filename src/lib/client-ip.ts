import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { env } from '../config/env.js';

/**
 * Best-effort client IP, same trust rules as rate-limit.ts's `identify()`:
 * `x-forwarded-for` is only honored when TRUST_PROXY confirms something
 * upstream actually sets it (otherwise it's spoofable client input), and the
 * left-most entry of the chain is the originating client. Falls back to the
 * raw TCP peer, then null if neither is available.
 */
export function getClientIp(c: Context): string | null {
  if (env.TRUST_PROXY) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }

  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}
