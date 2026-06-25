import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { env } from './env.js';

let app: App | undefined;

export function getFirebaseApp(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0]!;
    return app;
  }
  // env validation guarantees the triple is present when the path is not.
  app = initializeApp({
    credential: env.FIREBASE_SERVICE_ACCOUNT_PATH
      ? cert(env.FIREBASE_SERVICE_ACCOUNT_PATH)
      : cert({
          projectId: env.FIREBASE_PROJECT_ID!,
          clientEmail: env.FIREBASE_CLIENT_EMAIL!,
          privateKey: env.FIREBASE_PRIVATE_KEY!,
        }),
  });
  return app;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
