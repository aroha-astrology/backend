import { google, type androidpublisher_v3 } from 'googleapis';
import { Errors } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from './env.js';

export const GOOGLE_PLAY_PACKAGE_NAME = env.GOOGLE_PLAY_PACKAGE_NAME;

let client: androidpublisher_v3.Androidpublisher | undefined;

export function isGooglePlayConfigured(): boolean {
  return Boolean(
    env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH ||
    (env.GOOGLE_PLAY_PROJECT_ID && env.GOOGLE_PLAY_CLIENT_EMAIL && env.GOOGLE_PLAY_PRIVATE_KEY),
  );
}

function buildAuth() {
  const scopes = ['https://www.googleapis.com/auth/androidpublisher'];
  if (env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH) {
    return new google.auth.JWT({ keyFile: env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH, scopes });
  }
  // env validation guarantees the triple is present when the path is not.
  return new google.auth.JWT({
    email: env.GOOGLE_PLAY_CLIENT_EMAIL!,
    key: env.GOOGLE_PLAY_PRIVATE_KEY!,
    scopes,
  });
}

export function getAndroidPublisher(): androidpublisher_v3.Androidpublisher {
  if (client) return client;
  if (!isGooglePlayConfigured()) {
    // Missing server config, not a client fault — 403 (same shape Razorpay's
    // unconfigured path uses) instead of a 500 that leaks env var names.
    logger.error(
      'Google Play is not configured — set GOOGLE_PLAY_SERVICE_ACCOUNT_PATH or ' +
        'GOOGLE_PLAY_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY',
    );
    throw Errors.forbidden('Google Play billing is not available on this server');
  }
  client = google.androidpublisher({ version: 'v3', auth: buildAuth() });
  return client;
}
