// =============================================================================
// Ambient request context (AsyncLocalStorage)
// =============================================================================
// ai_usage has always had a user_id column, but only 4 of ~60 LLM call sites
// ever passed one, so per-user AI cost was effectively empty. Threading a
// userId parameter down through every service, repo and prompt builder to fix
// that would be a large, invasive, permanently-load-bearing diff for one
// telemetry field — and every new call site would silently reintroduce the gap.
//
// AsyncLocalStorage (Node stdlib) carries it out-of-band instead: auth
// middleware sets it once per request, and gemini-client.ts reads it at the
// point of insert. Call sites stay untouched and cannot forget.
//
// Scope discipline: this is for TELEMETRY ONLY. Never read identity from here
// for authorization or data access — an authorization decision must take its
// subject explicitly, so it is impossible to accidentally inherit the wrong
// caller's identity from an ambient store. Background jobs simply have no
// context, and correctly record `null`.

import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  /** Authenticated user for this request, if any. */
  userId?: string;
  /**
   * Finer-grained attribution than the LLM profile name alone. All 10+ report
   * types share one `report` profile, so without this they collapse into a
   * single indistinguishable ai_usage row and per-report cost is unknowable.
   */
  feature?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with `context` visible to everything it awaits, however deep. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The ambient context, or undefined outside a request (e.g. in a cron job). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Attach/overwrite a feature label on the CURRENT context, if there is one.
 *
 * Mutates in place rather than nesting a new scope so a caller can label work
 * it is already inside of. No-ops outside a request context, which is what
 * makes it safe to call from code shared between routes and cron jobs.
 */
export function setRequestFeature(feature: string): void {
  const store = storage.getStore();
  if (store) store.feature = feature;
}
