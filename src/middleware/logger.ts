import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';
import { alertThrottled } from '../lib/notifications/alerts.js';

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);

  const start = performance.now();
  const child = logger.child({ requestId, method: c.req.method, path: c.req.path });

  child.debug('request:start');
  try {
    await next();
  } finally {
    const durationMs = Math.round(performance.now() - start);
    const status = c.res.status;
    child.info({ status, durationMs }, 'request:end');

    // Single funnel for every alertable response, whatever produced it: a
    // thrown AppError/ZodError/500 caught by errorHandler, a rejected
    // OpenAPI request-validation hook (returns its own 400 directly,
    // without ever throwing — errorHandler never sees it), or a bare
    // c.json(...) elsewhere. c.res is already finalized here regardless of
    // which path produced it (Hono's compose() resolves onError-produced
    // responses back through this same next(), same as the status logged
    // just above), so this is the one place that sees all of them.
    //
    // 4xx is deliberately NOT alertable. A 4xx means the CLIENT was told "no",
    // and for a documented contract that is normal operation rather than an
    // incident: GET /v1/kundli answers 422 missing_parameters for every user
    // who opens the app before finishing onboarding, and again on every poll
    // from anyone parked in the birth-time rectification funnel. Same for 401
    // on an expired token and 403 on a locked house. They are all still in the
    // request:end log line above; they just don't page anyone.
    //
    // 429 is NOT an exception, despite the intuition that a rate-limit storm is
    // worth paging on. Every 429 this API can raise is a per-user pacing or
    // quota rejection the product treats as ordinary: the vastu and
    // purchase-plan daily caps, the `silent` chat-question limiter, and the
    // chat single-flight lock (astro.routes.ts) — the last two so deliberately
    // invisible that the app rolls the turn back and refills the composer
    // rather than show the user anything (ChatConversation.tsx). Paging from
    // here defeated `silent` outright: that flag only suppresses the limiter's
    // OWN alert and never reached this blanket one, so a user double-tapping
    // send in a second tab woke someone up.
    //
    // A real limiter storm still pages. rateLimiter raises its own
    // `ratelimit:<name>` alert for every non-`silent` limiter, carrying the
    // observed count against the configured ceiling — strictly more actionable
    // than the bare requestId this funnel sends.
    if (status >= 500) {
      // Signature groups by the matched PATTERN (e.g. /v1/forecast/moon-sign/*)
      // so a fan-out of the same failure across many concrete paths collapses
      // into one throttled alert. But that pattern is useless to a human —
      // "401 on GET /v1/*" could be any of thirty endpoints, since a leaked
      // requireUser wildcard (see app.ts's mount-order comment) reports its
      // OWN route pattern, not the request's. The message uses the concrete
      // path instead so the alert is actually actionable.
      const pattern = c.req.routePath || c.req.path;
      void alertThrottled(
        `http-error:${c.req.method}:${pattern}:${status}`,
        `${status} on ${c.req.method} ${c.req.path}`,
        `requestId ${requestId}`,
      );
    }
  }
};
