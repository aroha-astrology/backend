import { beforeEach, describe, expect, it, vi } from 'vitest';

const alerts: { signature: string; title: string; message: string }[] = [];
vi.mock('../src/lib/notifications/alerts.js', () => ({
  alertThrottled: (signature: string, title: string, message: string) => {
    alerts.push({ signature, title, message });
    return Promise.resolve();
  },
}));

let globalCount = 0;
let redisDown = false;
vi.mock('../src/middleware/rate-limit.js', () => ({
  consumeRateLimit: () =>
    Promise.resolve(redisDown ? null : { count: ++globalCount, ttlMs: 60_000 }),
  rateLimiter: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

// The router's other routes pull in the ephemeris engine and the database.
vi.mock('../src/modules/public/public.service.js', () => ({}));
vi.mock('../src/modules/auth/auth.service.js', () => ({ signupBonusPaise: () => 0 }));

const { AuthErrorReportSchema, formatAuthErrorAlert, reportAuthError } =
  await import('../src/modules/public/auth-error.service.js');
const { publicRouter } = await import('../src/modules/public/public.routes.js');

const report = AuthErrorReportSchema.parse({
  step: 'otp-send',
  code: 'auth/invalid-app-credential',
  message: 'Firebase: Error (auth/invalid-app-credential).',
  details: '{"name":"FirebaseError"}',
  stack: 'FirebaseError: Firebase: Error\n    at sendOtp (chunk.js:1:2)',
  platform: 'android',
  appVersion: '1.15 (18)',
  page: '/sign-in',
});

beforeEach(() => {
  alerts.length = 0;
  globalCount = 0;
  redisDown = false;
});

describe('public/auth-error: formatAuthErrorAlert', () => {
  it('carries the whole error: step, where, code, message, details, device and stack', () => {
    const { title, message } = formatAuthErrorAlert(report, 'Mozilla/5.0 (Linux; Android 14)');

    expect(title).toBe('Sign-in failed: auth/invalid-app-credential');
    expect(message).toContain('Step: Sending the OTP');
    expect(message).toContain('Where: Android app 1.15 (18)');
    expect(message).toContain('Code: auth/invalid-app-credential');
    expect(message).toContain('Message: Firebase: Error (auth/invalid-app-credential).');
    expect(message).toContain('Details: {"name":"FirebaseError"}');
    expect(message).toContain('Page: /sign-in');
    expect(message).toContain('Device: Mozilla/5.0 (Linux; Android 14)');
    expect(message).toContain('at sendOtp (chunk.js:1:2)');
  });

  it('says so when the error has no code or message, and calls a browser a browser', () => {
    const bare = AuthErrorReportSchema.parse({
      step: 'google',
      code: '',
      message: '',
      platform: 'web',
    });
    const { title, message } = formatAuthErrorAlert(bare, undefined);

    expect(title).toBe('Sign-in failed: no error code');
    expect(message).toContain('Step: Google sign-in');
    expect(message).toContain('Where: Browser');
    expect(message).toContain('Code: (none)');
    expect(message).not.toContain('Device:');
  });

  it('stays inside what Telegram accepts once every character is escaped', () => {
    const huge = AuthErrorReportSchema.parse({
      ...report,
      message: '.'.repeat(1000),
      details: '('.repeat(2000),
      stack: '-'.repeat(2000),
    });
    const { title, message } = formatAuthErrorAlert(huge, '_'.repeat(500));

    // sendAlert() backslash-escapes every one of these characters.
    expect((title.length + message.length) * 2).toBeLessThan(4096);
  });
});

describe('public/auth-error: reportAuthError', () => {
  it('groups repeats by step and error code so one problem is one message', async () => {
    await reportAuthError(report, 'ua');

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.signature).toBe('auth-error:otp-send:auth/invalid-app-credential');
  });

  it('does not let a made-up code open an unbounded number of throttle buckets', async () => {
    const odd = { ...report, code: `x y\n{"a":1}*${'z'.repeat(200)}` };
    await reportAuthError(odd, 'ua');

    expect(alerts[0]?.signature).toMatch(/^auth-error:otp-send:[A-Za-z0-9/_:.-]{1,60}$/);
  });

  it('goes quiet past the global ceiling', async () => {
    for (let i = 0; i < 25; i++) await reportAuthError(report, 'ua');

    expect(alerts).toHaveLength(20);
  });

  it('still reports when Redis is unreachable', async () => {
    redisDown = true;
    await reportAuthError(report, 'ua');

    expect(alerts).toHaveLength(1);
  });
});

describe('POST /public/auth-error', () => {
  const post = (body: unknown) =>
    publicRouter.request('/public/auth-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'TestPhone/1.0' },
      body: JSON.stringify(body),
    });

  it('needs no sign-in, answers 204 and alerts with the caller device', async () => {
    const res = await post(report);

    expect(res.status).toBe(204);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.message).toContain('Device: TestPhone/1.0');
  });

  it('turns away a malformed report without alerting', async () => {
    const res = await post({ step: 'otp-send' });

    expect(res.status).toBe(400);
    expect(alerts).toHaveLength(0);
  });
});

describe('AuthErrorReportSchema validation', () => {
  it('rejects a step the app does not have', () => {
    expect(() => AuthErrorReportSchema.parse({ ...report, step: 'email' })).toThrow();
  });

  it('rejects an oversized message', () => {
    expect(() => AuthErrorReportSchema.parse({ ...report, message: 'x'.repeat(1001) })).toThrow();
  });
});
