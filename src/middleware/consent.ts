import type { MiddlewareHandler } from 'hono';
import { Errors } from '../lib/errors.js';

/**
 * Requires that the authenticated user has granted data-processing consent
 * and has not subsequently revoked it. Must run after `requireUser`.
 */
export const requireConsent: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  if (!user.dataProcessingConsentAt || user.dataProcessingConsentRevokedAt) {
    throw Errors.forbidden('Data processing consent required');
  }
  await next();
};
