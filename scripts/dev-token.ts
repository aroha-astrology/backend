/**
 * Mint a real Firebase ID token for the configured project, for testing
 * protected endpoints locally:
 *
 *   npm run dev:token -- --phone +919999900001 --code 123456
 *       Runs the actual phone-OTP sign-in flow. Only works for numbers
 *       configured as *test phone numbers* in the Firebase console
 *       (Authentication → Sign-in method → Phone → Phone numbers for
 *       testing) — no SMS is sent for those. The number's region must be
 *       allowed under Authentication → Settings → SMS region policy.
 *
 *   npm run dev:token -- --uid dev-user-1 [--phone +919999900002]
 *       Mints a custom token via the Admin SDK and exchanges it for an
 *       ID token. Creates the user (with the optional phone number) if
 *       it does not exist. Works for any uid, no OTP involved.
 *
 * Prints the ID token to stdout. Use it as:
 *   curl -H "Authorization: Bearer $(npm run -s dev:token -- --uid dev-user-1)" ...
 *
 * Requires FIREBASE_WEB_API_KEY in .env (Firebase console → Project
 * settings → General → Your apps → Web app → apiKey).
 *
 * Refuses to run against anything but the dev project — this script
 * creates users and mints valid tokens, which must never hit prod.
 */
import { readFileSync } from 'node:fs';
import { env } from '../src/config/env.js';
import { getFirebaseAuth } from '../src/config/firebase.js';

const DEV_PROJECT_ALLOWLIST = ['aroha-dev-9c4b0'];

type Args = { phone?: string; code?: string; uid?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag !== '--phone' && flag !== '--code' && flag !== '--uid') {
      fail(`unknown argument: ${flag ?? ''}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`missing value for ${flag}`);
    }
    if (flag === '--phone') args.phone = value;
    if (flag === '--code') args.code = value;
    if (flag === '--uid') args.uid = value;
    i++; // skip the consumed value
  }
  return args;
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
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
  fail(
    `refusing to run against project "${projectId}" — this script only targets dev projects: ${DEV_PROJECT_ALLOWLIST.join(', ')}`,
  );
}

const apiKey = env.FIREBASE_WEB_API_KEY;
if (!apiKey) {
  fail(
    'FIREBASE_WEB_API_KEY is not set in .env — copy it from the Firebase console web app config.',
  );
}

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';

async function identityToolkit<T>(endpoint: string, body: unknown): Promise<T> {
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${IDENTITY_TOOLKIT}/${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch (err) {
    fail(`${endpoint} request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  let data: (T & { error?: { message?: string } }) | undefined;
  try {
    data = JSON.parse(text) as T & { error?: { message?: string } };
  } catch {
    // non-JSON body (proxy error page etc.) — fall through to the !res.ok check
  }
  if (!res.ok || data === undefined) {
    fail(`${endpoint} failed: ${data?.error?.message ?? `${res.status} ${res.statusText}`}`);
  }
  return data;
}

/** Full phone-OTP sign-in. Only test phone numbers work headlessly. */
async function signInWithPhoneOtp(phone: string, code: string): Promise<string> {
  const sent = await identityToolkit<{ sessionInfo: string }>('accounts:sendVerificationCode', {
    phoneNumber: phone,
  });
  const signedIn = await identityToolkit<{ idToken: string }>('accounts:signInWithPhoneNumber', {
    sessionInfo: sent.sessionInfo,
    code,
  });
  return signedIn.idToken;
}

function errorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String(err.code);
  }
  return undefined;
}

/** Admin-minted custom token exchanged for an ID token. */
async function signInWithCustomToken(uid: string, phone?: string): Promise<string> {
  const auth = getFirebaseAuth();
  try {
    await auth.getUser(uid);
  } catch (err) {
    if (errorCode(err) !== 'auth/user-not-found') throw err;
    try {
      await auth.createUser({ uid, ...(phone ? { phoneNumber: phone } : {}) });
    } catch (createErr) {
      if (errorCode(createErr) === 'auth/phone-number-already-exists') {
        fail(
          `${phone} already belongs to another user — retry without --phone or use a different number`,
        );
      }
      throw createErr;
    }
    console.error(`created Firebase user ${uid}${phone ? ` (${phone})` : ''}`);
  }
  const customToken = await auth.createCustomToken(uid);
  const signedIn = await identityToolkit<{ idToken: string }>('accounts:signInWithCustomToken', {
    token: customToken,
    returnSecureToken: true,
  });
  return signedIn.idToken;
}

const args = parseArgs(process.argv.slice(2));

let idToken: string;
if (args.phone && args.code) {
  idToken = await signInWithPhoneOtp(args.phone, args.code);
} else if (args.uid) {
  idToken = await signInWithCustomToken(args.uid, args.phone);
} else {
  fail('usage: dev-token --phone <e164> --code <otp>  |  dev-token --uid <uid> [--phone <e164>]');
}

console.log(idToken);
