import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeMoonSign } from '../src/modules/public/public.service.js';
import { MoonSignRequestSchema } from '../src/modules/public/public.schemas.js';

/* -------------------------------------------------------------------------- */
/* Service-level: real swisseph-wasm engine, no mocking (astro-engine.spec.ts  */
/* style) — the computation itself is what's under test here.                */
/* -------------------------------------------------------------------------- */

describe('public/moon-sign: computeMoonSign (real ephemeris engine)', () => {
  it('computes a sane Moon sign/nakshatra for a known IST birth (1990-04-17 14:30, tzOffsetMinutes 330)', async () => {
    const input = MoonSignRequestSchema.parse({
      date: '1990-04-17',
      time: '14:30',
      tzOffsetMinutes: 330,
    });
    const result = await computeMoonSign(input);

    expect(typeof result.sign).toBe('string');
    expect(result.sign.length).toBeGreaterThan(0);
    expect(result.signIndex).toBeGreaterThanOrEqual(0);
    expect(result.signIndex).toBeLessThanOrEqual(11);

    expect(typeof result.nakshatra).toBe('string');
    expect(result.nakshatra.length).toBeGreaterThan(0);
    expect(result.nakshatraIndex).toBeGreaterThanOrEqual(0);
    expect(result.nakshatraIndex).toBeLessThanOrEqual(26);

    expect(result.pada).toBeGreaterThanOrEqual(1);
    expect(result.pada).toBeLessThanOrEqual(4);

    expect(result.degree).toBeGreaterThanOrEqual(0);
    expect(result.degree).toBeLessThan(30);

    expect(typeof result.nakshatraLord).toBe('string');
    expect(result.nakshatraLord.length).toBeGreaterThan(0);
  }, 20_000);

  it('computes without error for a negative tzOffsetMinutes (US Eastern winter, -300)', async () => {
    const input = MoonSignRequestSchema.parse({
      date: '1990-04-17',
      time: '14:30',
      tzOffsetMinutes: -300,
    });
    const result = await computeMoonSign(input);

    expect(typeof result.sign).toBe('string');
    expect(result.sign.length).toBeGreaterThan(0);
    expect(result.signIndex).toBeGreaterThanOrEqual(0);
    expect(result.signIndex).toBeLessThanOrEqual(11);
    expect(result.degree).toBeGreaterThanOrEqual(0);
    expect(result.degree).toBeLessThan(30);
  }, 20_000);
});

/* -------------------------------------------------------------------------- */
/* Schema-level validation — same convention as astro-chat-schema.test.ts     */
/* (direct .parse()/.toThrow() against the zod schema, no HTTP layer).        */
/* -------------------------------------------------------------------------- */

describe('MoonSignRequestSchema validation', () => {
  it('rejects a malformed calendar date (2024-02-30) instead of letting it reach the ephemeris engine', () => {
    expect(() =>
      MoonSignRequestSchema.parse({ date: '2024-02-30', time: '12:00', tzOffsetMinutes: 330 }),
    ).toThrow();
  });

  it('rejects a malformed time (25:99)', () => {
    expect(() =>
      MoonSignRequestSchema.parse({ date: '1990-04-17', time: '25:99', tzOffsetMinutes: 330 }),
    ).toThrow();
  });

  it('rejects an out-of-range tzOffsetMinutes (9999)', () => {
    expect(() =>
      MoonSignRequestSchema.parse({ date: '1990-04-17', time: '14:30', tzOffsetMinutes: 9999 }),
    ).toThrow();
  });

  it('accepts a valid request unchanged', () => {
    const parsed = MoonSignRequestSchema.parse({
      date: '1990-04-17',
      time: '14:30',
      tzOffsetMinutes: 330,
    });
    expect(parsed).toEqual({ date: '1990-04-17', time: '14:30', tzOffsetMinutes: 330 });
  });
});

/* -------------------------------------------------------------------------- */
/* Route-level: confirms the endpoint is actually mounted, public (no auth    */
/* required), and that validation failures surface as a real 422 through the  */
/* app's global error handler — same firebase-admin/db mock boilerplate every */
/* other full-app route test in this repo uses (see health.spec.ts,           */
/* remedies-route.spec.ts); only app wiring is stubbed, not the astro engine. */
/* -------------------------------------------------------------------------- */

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: vi.fn() })),
}));

const { createApp } = await import('../src/app.js');

async function postMoonSign(body: unknown) {
  const app = createApp();
  return app.request('/v1/public/moon-sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /v1/public/moon-sign (route)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with the documented shape for a valid request — no Authorization header needed', async () => {
    const res = await postMoonSign({ date: '1990-04-17', time: '14:30', tzOffsetMinutes: 330 });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.sign).toBe('string');
    expect(typeof body.signIndex).toBe('number');
    expect(typeof body.degree).toBe('number');
    expect(typeof body.nakshatra).toBe('string');
    expect(typeof body.nakshatraIndex).toBe('number');
    expect(typeof body.pada).toBe('number');
    expect(typeof body.nakshatraLord).toBe('string');
  }, 20_000);

  it('returns 422 for a malformed date', async () => {
    const res = await postMoonSign({ date: '2024-02-30', time: '12:00', tzOffsetMinutes: 330 });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error).toBeDefined();
  }, 10_000);

  it('returns 422 for an out-of-range tzOffsetMinutes', async () => {
    const res = await postMoonSign({ date: '1990-04-17', time: '14:30', tzOffsetMinutes: 9999 });
    expect(res.status).toBe(422);
  }, 10_000);
});
