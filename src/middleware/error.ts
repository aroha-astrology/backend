import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { alertThrottled } from '../lib/notifications/alerts.js';

type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

function build(c: Context, code: string, message: string, details?: unknown): ErrorBody {
  const body: ErrorBody = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  const requestId = c.get('requestId');
  if (requestId) body.error.requestId = requestId;
  return body;
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(build(c, err.code, err.message, err.details), err.status as 400);
  }

  if (err instanceof HTTPException) {
    const res = err.getResponse();
    if (res.status === 404) {
      return c.json(build(c, 'NOT_FOUND', err.message || 'Not found'), 404);
    }
    return c.json(build(c, 'HTTP_ERROR', err.message || 'Error'), err.status as 400);
  }

  if (err instanceof ZodError) {
    return c.json(build(c, 'UNPROCESSABLE', 'Validation failed', err.flatten()), 422);
  }

  logger.error(
    { err, requestId: c.get('requestId'), path: c.req.path, method: c.req.method },
    'unhandled error',
  );

  // Signature keys off the ROUTE pattern, not the concrete path, so that
  // e.g. /v1/forecast/moon-sign/0..11 failing collapses into one alert
  // instead of twelve. Fire-and-forget: the client's 500 must not wait on
  // Telegram, and an alerting failure must not mask the original error.
  const route = c.req.routePath || c.req.path;
  void alertThrottled(
    `api-500:${c.req.method}:${route}`,
    `500 on ${c.req.method} ${route}`,
    err instanceof Error ? err.message : String(err),
  );

  return c.json(build(c, 'INTERNAL', 'Internal server error'), 500);
};

export const notFoundHandler: NotFoundHandler = (c) => {
  return c.json(build(c, 'NOT_FOUND', `Route not found: ${c.req.method} ${c.req.path}`), 404);
};
