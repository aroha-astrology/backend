import type { MiddlewareHandler } from 'hono';
import { Errors } from '../lib/errors.js';
import { resolveFeatures } from '../modules/features/features.service.js';

/**
 * Server-side enforcement gate: refuses the request if the given feature key
 * is explicitly disabled, so a client that ignores its own (hidden) UI toggle
 * can never reach the route by calling the API directly.
 *
 * A key with no entry in the resolved map at all (typo, or registry drift —
 * see FEATURE_REGISTRY in src/config/features.ts) fails OPEN: the registry is
 * the source of truth for what keys exist, so an unknown key is a bug
 * elsewhere, not a reason to 403 a legitimate user. Only an explicit
 * `enabled: false` blocks the request.
 *
 * Not wired to any route yet — that happens when the routes needing it are
 * built (gemstone/vastu/chat/house-insight, reports) in later tasks.
 */
export function requireFeature(key: string): MiddlewareHandler {
  return async (c, next) => {
    const features = await resolveFeatures();
    if (features[key]?.enabled === false) {
      throw Errors.forbidden('FEATURE_DISABLED');
    }
    await next();
  };
}
