import * as admin from 'firebase-admin';

function getFirebaseAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!;

  const serviceAccount = JSON.parse(
    process.env.FIREBASE_AUTH_SERVICE_ACCOUNT_JSON!,
  ) as admin.ServiceAccount;

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_AUTH_PROJECT_ID,
  });
}

export function getFirebaseAdminAuth(): admin.auth.Auth {
  return getFirebaseAdminApp().auth();
}
