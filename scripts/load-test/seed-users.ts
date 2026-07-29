/**
 * Seeds N loadtest users directly against the local API (http://127.0.0.1:3000)
 * so the seeding itself doesn't compete with the public rate limiter.
 *
 * MUST run on the EC2 box — needs the Firebase Admin service account and a
 * local DATABASE_URL to grant wallet balance (no public top-up endpoint).
 *
 * Mirrors scripts/dev-token.ts's custom-token mint, inlined here to avoid N
 * child-process spawns. Keeps the same dev-project allowlist as dev-token.ts:
 * this only ever runs against a project matching that allowlist, which today
 * is also what production's FIREBASE_SERVICE_ACCOUNT_PATH points at.
 *
 * Usage (on the box):
 *   npx tsx scripts/load-test/seed-users.ts --start 1 --count 20 --credits-paise 10000
 *
 * Prints one JSON line per seeded user to stdout:
 *   {"uid":"loadtest-1","phone":"+91900000001","userId":"<uuid>","idToken":"..."}
 */
import { readFileSync } from 'node:fs';
import { env } from '../../src/config/env.js';
import { getFirebaseAuth } from '../../src/config/firebase.js';
import { addWalletBalance } from '../../src/modules/users/users.repo.js';
import { sqlClient } from '../../src/config/db.js';

const DEV_PROJECT_ALLOWLIST = ['aroha-dev-9c4b0'];
const LOCAL_API = 'http://127.0.0.1:3000';
const UID_PREFIX = 'loadtest-';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  return v;
}

/** Indian E.164 mobile numbers are +91 followed by exactly 10 digits. */
function phoneFor(i: number): string {
  return `+919000000${String(i).padStart(3, '0')}`;
}

function configuredProjectId(): string {
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const parsed = JSON.parse(readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8')) as {
      project_id?: string;
    };
    return parsed.project_id ?? '(unknown)';
  }
  return env.FIREBASE_PROJECT_ID ?? '(unknown)';
}

const projectId = configuredProjectId();
if (!DEV_PROJECT_ALLOWLIST.includes(projectId)) {
  console.error(`refusing to run against project "${projectId}"`);
  process.exit(1);
}

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';

async function mintIdToken(uid: string, phone: string): Promise<string> {
  const auth = getFirebaseAuth();
  try {
    await auth.getUser(uid);
  } catch {
    await auth.createUser({ uid, phoneNumber: phone });
  }
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(
    `${IDENTITY_TOOLKIT}/accounts:signInWithCustomToken?key=${env.FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const data = (await res.json()) as { idToken?: string; error?: { message?: string } };
  if (!res.ok || !data.idToken) {
    throw new Error(`signInWithCustomToken failed for ${uid}: ${data.error?.message ?? res.status}`);
  }
  return data.idToken;
}

async function establishSession(idToken: string): Promise<string> {
  const res = await fetch(`${LOCAL_API}/v1/auth/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const text = await res.text();
  let data: { user?: { id: string } };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`POST /v1/session non-JSON response (${res.status}): ${text.slice(0, 500)}`);
  }
  if (!res.ok || !data.user) throw new Error(`POST /v1/session failed (${res.status}): ${text.slice(0, 500)}`);
  return data.user.id;
}

async function setBirthDetailsAndConsent(idToken: string, i: number): Promise<void> {
  const res = await fetch(`${LOCAL_API}/v1/me`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: `Load Test ${i}`,
      gender: 'other',
      dateOfBirth: '1990-01-01',
      timeOfBirth: '10:30',
      placeOfBirth: {
        name: 'Bengaluru, Karnataka, India',
        lat: 12.9716,
        lon: 77.5946,
        tz: 'Asia/Kolkata',
        countryCode: 'IN',
        source: 'manual',
      },
      consent: {
        dataProcessing: true,
        terms: { version: '1.0.0' },
        privacy: { version: '1.0.0' },
      },
    }),
  });
  if (!res.ok) throw new Error(`PATCH /v1/me failed for uid ${i}: ${res.status}`);
}

async function warmUp(idToken: string, path: string, maxWaitMs: number): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${LOCAL_API}${path}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.status === 200) return;
    if (res.status !== 202) {
      console.error(`  warm-up ${path} unexpected status ${res.status}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.error(`  warm-up ${path} did not complete within ${maxWaitMs}ms`);
}

async function main() {
  const start = Number(arg('start', '1'));
  const count = Number(arg('count', '20'));
  const creditsPaise = Number(arg('credits-paise', '0'));

  for (let i = start; i < start + count; i++) {
    const uid = `${UID_PREFIX}${i}`;
    const phone = phoneFor(i);
    console.error(`[${i}] minting token for ${uid} (${phone})`);
    const idToken = await mintIdToken(uid, phone);

    console.error(`[${i}] establishing session`);
    const userId = await establishSession(idToken);

    console.error(`[${i}] setting birth details + consent`);
    await setBirthDetailsAndConsent(idToken, i);

    console.error(`[${i}] warming up kundli`);
    await warmUp(idToken, '/v1/kundli', 60_000);

    console.error(`[${i}] warming up horoscope`);
    await warmUp(idToken, '/v1/horoscope?period=daily', 60_000);

    if (creditsPaise > 0) {
      console.error(`[${i}] granting ${creditsPaise} paise wallet balance`);
      await addWalletBalance(userId, creditsPaise, 'load-test seed');
    }

    console.log(JSON.stringify({ uid, phone, userId, idToken }));
  }

  await sqlClient.end();
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
