import pino from 'pino';
import { env, isProduction } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Belt-and-suspenders against a future `logger.x({ user }, ...)` or `logger.x({ err, order })`
  // writing PII/credentials to disk in plaintext (no log rotation on the box) — call-site
  // discipline is currently good but nothing enforces it, and this list is exactly the shape
  // of value that HAS slipped through once already (billing.service.ts logged a raw Google
  // Play purchaseToken). Wildcarded one level deep since these fields show up both top-level
  // and nested under whatever object a call site passes (e.g. `{ user }`, `{ order }`).
  redact: {
    paths: [
      'phoneE164',
      '*.phoneE164',
      'email',
      '*.email',
      'to',
      'dateOfBirth',
      '*.dateOfBirth',
      'timeOfBirth',
      '*.timeOfBirth',
      'placeOfBirth',
      '*.placeOfBirth',
      'displayName',
      '*.displayName',
      'purchaseToken',
      '*.purchaseToken',
      'token',
      '*.token',
      'password',
      'authorization',
      'req.headers.authorization',
    ],
    censor: '[redacted]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }),
});
