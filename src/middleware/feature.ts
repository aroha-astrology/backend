import type { MiddlewareHandler } from 'hono';
import { Errors } from '../lib/errors.js';
import { resolveFeaturesForUser } from '../modules/features/features.service.js';

/**
 * Server-side enforcement gate: refuses the request if the given feature key
 * is explicitly disabled FOR THE CALLING USER, so a client that ignores its
 * own (hidden) UI toggle can never reach the route by calling the API
 * directly.
 *
 * User-aware: resolves via `resolveFeaturesForUser(c.var.user.id)`, which
 * layers any group the user belongs to (disabled wins on conflict) on top of
 * the global `feature_flags` default — see features.service.ts. This means
 * `requireFeature` MUST run after `requireUser` on every route it gates
 * (same "one middleware assumes another already ran" contract as
 * `requireConsent`) — there are no call sites wiring it up yet, so this
 * contract is defined here for whoever adds the first one.
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
    const user = c.get('user');
    const features = await resolveFeaturesForUser(user.id);
    if (features[key]?.enabled === false) {
      throw Errors.forbidden('FEATURE_DISABLED');
    }
    await next();
  };
}

/**
 * Like `requireFeature`, but passes when ANY of the keys is on — for one
 * endpoint that feeds several independently switchable cards (e.g. Astro
 * Weather and Your Day both read GET /v1/astro-weather). Unlike
 * `requireFeature`, a key missing from the resolved map counts as OFF: these
 * are new, ship-dark keys.
 */
export function requireAnyFeature(keys: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user');
    const features = await resolveFeaturesForUser(user.id);
    if (!keys.some((key) => features[key]?.enabled === true)) {
      throw Errors.forbidden('FEATURE_DISABLED');
    }
    await next();
  };
}
