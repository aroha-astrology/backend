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

    // Single funnel for every non-2xx response, whatever produced it: a
    // thrown AppError/ZodError/500 caught by errorHandler, a rejected
    // OpenAPI request-validation hook (returns its own 400 directly,
    // without ever throwing — errorHandler never sees it), or a bare
    // c.json(...) elsewhere. c.res is already finalized here regardless of
    // which path produced it (Hono's compose() resolves onError-produced
    // responses back through this same next(), same as the status logged
    // just above), so this is the one place that sees all of them.
    if (status >= 400) {
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
