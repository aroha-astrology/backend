/**
 * Broadcast an in-app + web-push + Android (FCM) notification to every user.
 *
 * Usage:
 *   node scripts/broadcast-hello.mjs                  # dry-run (counts only)
 *   node scripts/broadcast-hello.mjs --fire           # actually send
 *   node scripts/broadcast-hello.mjs --fire \
 *     --title "Hello from Jyotish AI 👋" \
 *     --body  "Welcome! Glad to have you here." \
 *     --url   "/"
 *
 * Reads env from apps/web/.env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (optional)
 *   FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_JSON
 */

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', 'apps', 'web', '.env.local') });

// ---- CLI args -----------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const FIRE = flag('fire');
const TITLE = opt('title', 'Hello from Jyotish AI 👋');
const BODY = opt('body', 'Welcome! Glad to have you here.');
const URL_PATH = opt('url', '/');
const TAG = opt('tag', 'broadcast-hello');

// ---- Env ----------------------------------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:subir@saleslife.ai';
const FCM_PROJECT_ID = process.env.FCM_PROJECT_ID;
const FCM_SA_JSON = process.env.FCM_SERVICE_ACCOUNT_JSON;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const webPushReady = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (webPushReady) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}
const fcmReady = Boolean(FCM_PROJECT_ID && FCM_SA_JSON);

// ---- FCM helpers --------------------------------------------------------
let fcmTokenCache = null;

async function getFcmAccessToken() {
  const now = Date.now();
  if (fcmTokenCache && fcmTokenCache.expiresAt > now) return fcmTokenCache.token;

  const sa = JSON.parse(FCM_SA_JSON);
  const header = { alg: 'RS256', typ: 'JWT' };
  const iat = Math.floor(now / 1000);
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  };

  const b64u = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${b64u(header)}.${b64u(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer
    .sign(sa.private_key)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`FCM token fetch failed: ${res.status}`);
  const { access_token } = await res.json();
  fcmTokenCache = { token: access_token, expiresAt: now + 50 * 60 * 1000 };
  return access_token;
}

async function sendOneFcm(fcmToken) {
  const accessToken = await getFcmAccessToken();
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title: TITLE, body: BODY },
          data: { route: URL_PATH, tag: TAG },
          android: {
            priority: 'high',
            notification: {
              icon: 'ic_notification',
              color: '#7A96AB',
              tag: TAG,
            },
          },
        },
      }),
    },
  );
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  const errorCode =
    body?.error?.details?.[0]?.errorCode ?? body?.error?.status ?? '';
  const unregistered = errorCode === 'UNREGISTERED' || res.status === 404;
  return { ok: false, unregistered, error: errorCode || String(res.status) };
}

// ---- Steps --------------------------------------------------------------
async function fetchAllUserIds() {
  const { data, error } = await supabase.from('users').select('id');
  if (error) throw new Error(`Failed to fetch users: ${error.message}`);
  return data.map((u) => u.id);
}

async function fetchSubscriptions() {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, platform, endpoint, p256dh, auth, fcm_token');
  if (error) throw new Error(`Failed to fetch subs: ${error.message}`);
  return data ?? [];
}

async function sendInAppNotifications(userIds) {
  console.log(`Inserting in-app notifications for ${userIds.length} user(s)...`);
  const rows = userIds.map((userId) => ({
    user_id: userId,
    type: 'system',
    title: TITLE,
    body: BODY,
    metadata: {},
  }));
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('notifications').insert(batch);
    if (error)
      console.error(`  In-app batch ${i / BATCH + 1} failed: ${error.message}`);
    else
      console.log(
        `  In-app batch ${i / BATCH + 1}: inserted ${batch.length} rows`,
      );
  }
}

async function sendWebPush(subs) {
  if (!webPushReady) {
    console.log('VAPID keys missing — skipping web push.');
    return;
  }
  console.log(`Sending web push to ${subs.length} subscription(s)...`);
  const payload = JSON.stringify({
    title: TITLE,
    body: BODY,
    url: URL_PATH,
    tag: TAG,
  });
  const staleIds = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (err) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) staleIds.push(s.id);
        else console.error(`  Web push failed (${status}): ${err.message}`);
      }
    }),
  );
  console.log(
    `  Web push done. stale=${staleIds.length} (will be cleaned up)`,
  );
  if (staleIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds);
  }
}

async function sendAndroidPush(subs) {
  if (!fcmReady) {
    console.log('FCM env missing — skipping Android push.');
    return;
  }
  console.log(`Sending FCM to ${subs.length} Android subscription(s)...`);
  const expiredIds = [];
  let okCount = 0;
  await Promise.all(
    subs.map(async (s) => {
      const result = await sendOneFcm(s.fcm_token);
      if (result.ok) okCount++;
      else if (result.unregistered) expiredIds.push(s.id);
      else console.error(`  FCM failed: ${result.error}`);
    }),
  );
  console.log(
    `  FCM done. ok=${okCount} unregistered=${expiredIds.length}`,
  );
  if (expiredIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', expiredIds);
  }
}

// ---- Main ---------------------------------------------------------------
async function main() {
  console.log('=== Broadcast ===');
  console.log(`Mode:   ${FIRE ? 'FIRE (real send)' : 'DRY-RUN (counts only)'}`);
  console.log(`Title:  ${TITLE}`);
  console.log(`Body:   ${BODY}`);
  console.log(`Url:    ${URL_PATH}`);
  console.log(`web-push ready: ${webPushReady}   FCM ready: ${fcmReady}\n`);

  const userIds = await fetchAllUserIds();
  const subs = await fetchSubscriptions();
  const webSubs = subs.filter(
    (s) => s.platform === 'web' && s.endpoint && s.p256dh && s.auth,
  );
  const androidSubs = subs.filter(
    (s) => s.platform === 'android-fcm' && s.fcm_token,
  );
  const otherSubs = subs.length - webSubs.length - androidSubs.length;

  console.log(
    `Audience: ${userIds.length} user(s), ${webSubs.length} web sub(s), ${androidSubs.length} android sub(s)` +
      (otherSubs ? `, ${otherSubs} other/incomplete (skipped)` : ''),
  );

  if (!FIRE) {
    console.log('\nDry-run only. Re-run with --fire to actually send.');
    return;
  }

  if (userIds.length === 0) {
    console.log('No users — nothing to do.');
    return;
  }

  console.log();
  await sendInAppNotifications(userIds);
  console.log();
  await sendWebPush(webSubs);
  console.log();
  await sendAndroidPush(androidSubs);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
