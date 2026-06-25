// FCM HTTP v1 dispatcher — sends push notifications to Android devices.
// Credentials: FCM_SERVICE_ACCOUNT_JSON (full JSON string) + FCM_PROJECT_ID.
// Uses a cached OAuth2 access token (50-min TTL vs FCM's 60-min TTL).

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getFcmAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.token;

  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT_JSON is not set');

  const sa: ServiceAccount = JSON.parse(raw);

  // Build JWT for Google OAuth2
  const header = { alg: 'RS256', typ: 'JWT' };
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
  };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Sign with private key via Web Crypto (works in Next.js Edge + Node runtimes)
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyBuffer = Buffer.from(pemBody, 'base64');

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    Buffer.from(signingInput),
  );
  const signature = Buffer.from(signatureBuffer).toString('base64url');
  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) throw new Error(`FCM token fetch failed: ${tokenRes.status}`);
  const { access_token } = await tokenRes.json();

  // Cache for 50 min (FCM token TTL is 60 min; buffer for clock skew)
  tokenCache = { token: access_token, expiresAt: now + 50 * 60 * 1000 };
  return access_token;
}

export interface FcmPayload {
  fcm_token: string;
  title: string;
  body: string;
  route?: string;
  icon?: string;
  tag?: string;
}

export async function sendFcm(payload: FcmPayload): Promise<{ ok: true } | { ok: false; unregistered: boolean; error: string }> {
  const projectId = process.env.FCM_PROJECT_ID;
  if (!projectId) {
    console.warn('[fcm] FCM_PROJECT_ID not set — skipping');
    return { ok: false, unregistered: false, error: 'FCM_PROJECT_ID not set' };
  }

  let accessToken: string;
  try {
    accessToken = await getFcmAccessToken();
  } catch (err) {
    console.error('[fcm] token error:', err);
    return { ok: false, unregistered: false, error: String(err) };
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: payload.fcm_token,
          notification: { title: payload.title, body: payload.body },
          data: {
            ...(payload.route ? { route: payload.route } : {}),
            ...(payload.tag ? { tag: payload.tag } : {}),
          },
          android: {
            priority: 'high',
            notification: {
              icon: 'ic_notification',
              color: '#7A96AB',
              ...(payload.tag ? { tag: payload.tag } : {}),
            },
          },
        },
      }),
    },
  );

  if (res.ok) return { ok: true };

  const body = await res.json().catch(() => ({}));
  const errorCode = body?.error?.details?.[0]?.errorCode ?? body?.error?.status ?? '';
  const unregistered = errorCode === 'UNREGISTERED' || res.status === 404;

  console.error('[fcm] send failed:', res.status, errorCode);
  return { ok: false, unregistered, error: errorCode || String(res.status) };
}
