import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';

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
    child.info({ status: c.res.status, durationMs }, 'request:end');
  }
};
