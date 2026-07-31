import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeKundliChart } from '../src/modules/public/public.service.js';
import { KundliChartRequestSchema } from '../src/modules/public/public.schemas.js';

/* -------------------------------------------------------------------------- */
/* Service-level: real swisseph-wasm engine, no mocking (public-moon-sign.spec */
/* style) — the computation itself is what's under test here.                */
/* -------------------------------------------------------------------------- */

describe('public/kundli-chart: computeKundliChart (real ephemeris engine)', () => {
  it('computes a full D1 chart for a known IST birth (1990-04-17 14:30, Delhi)', async () => {
    const input = KundliChartRequestSchema.parse({
      date: '1990-04-17',
      time: '14:30',
      tzOffsetMinutes: 330,
      lat: 28.6139,
      lng: 77.209,
    });
    const result = await computeKundliChart(input);

    expect(result.planets).toHaveLength(9);
    for (const planet of result.planets) {
      expect(planet.signIndex).toBeGreaterThanOrEqual(0);
      expect(planet.signIndex).toBeLessThanOrEqual(11);
      expect(planet.house).toBeGreaterThanOrEqual(1);
      expect(planet.house).toBeLessThanOrEqual(12);
    }

    expect(result.houses).toHaveLength(12);
    expect(result.ascendant.signIndex).toBeGreaterThanOrEqual(0);
    expect(result.ascendant.signIndex).toBeLessThanOrEqual(11);
    expect(result.ayanamsa).toBe('lahiri');
  }, 20_000);

  it('computes without error for a negative tzOffsetMinutes (US Eastern winter, -300)', async () => {
    const input = KundliChartRequestSchema.parse({
      date: '1990-04-17',
      time: '14:30',
      tzOffsetMinutes: -300,
      lat: 40.7128,
      lng: -74.006,
    });
    const result = await computeKundliChart(input);

    expect(result.planets).toHaveLength(9);
    expect(result.ascendant.signIndex).toBeGreaterThanOrEqual(0);
    expect(result.ascendant.signIndex).toBeLessThanOrEqual(11);
  }, 20_000);
});

/* -------------------------------------------------------------------------- */
/* Schema-level validation — same convention as public-moon-sign.spec.ts      */
/* -------------------------------------------------------------------------- */

describe('KundliChartRequestSchema validation', () => {
  it('rejects a malformed calendar date (2024-02-30) instead of letting it reach the ephemeris engine', () => {
    expect(() =>
      KundliChartRequestSchema.parse({
        date: '2024-02-30',
        time: '12:00',
        tzOffsetMinutes: 330,
        lat: 28.6139,
        lng: 77.209,
      }),
    ).toThrow();
  });

  it('rejects an out-of-range latitude (999)', () => {
    expect(() =>
      KundliChartRequestSchema.parse({
        date: '1990-04-17',
        time: '14:30',
        tzOffsetMinutes: 330,
        lat: 999,
        lng: 77.209,
      }),
    ).toThrow();
  });

  it('rejects an out-of-range longitude (-999)', () => {
    expect(() =>
      KundliChartRequestSchema.parse({
        date: '1990-04-17',
        time: '14:30',
        tzOffsetMinutes: 330,
        lat: 28.6139,
        lng: -999,
      }),
    ).toThrow();
  });

  it('accepts a valid request unchanged', () => {
    const parsed = KundliChartRequestSchema.parse({
      date: '1990-04-17',
      time: '14:30',
      tzOffsetMinutes: 330,
      lat: 28.6139,
      lng: 77.209,
    });
    expect(parsed).toEqual({
      date: '1990-04-17',
      time: '14:30',
      tzOffsetMinutes: 330,
      lat: 28.6139,
      lng: 77.209,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Route-level: confirms the endpoint is mounted, public (no auth required),  */
/* and that validation failures surface as a real 422 — same firebase-admin/db*/
/* mock boilerplate every other full-app route test in this repo uses.       */
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

async function postKundliChart(body: unknown) {
  const app = createApp();
  return app.request('/v1/public/kundli-chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /v1/public/kundli-chart (route)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with the documented shape for a valid request — no Authorization header needed', async () => {
    const res = await postKundliChart({
      date: '1990-04-17',
      time: '14:30',
      tzOffsetMinutes: 330,
      lat: 28.6139,
      lng: 77.209,
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.planets)).toBe(true);
    expect(Array.isArray(body.houses)).toBe(true);
    expect(typeof body.ascendant).toBe('object');
  }, 20_000);

  it('returns 422 for a malformed date', async () => {
    const res = await postKundliChart({
      date: '2024-02-30',
      time: '12:00',
      tzOffsetMinutes: 330,
      lat: 28.6139,
      lng: 77.209,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error).toBeDefined();
  }, 10_000);

  it('returns 422 for an out-of-range latitude', async () => {
    const res = await postKundliChart({
      date: '1990-04-17',
      time: '14:30',
      tzOffsetMinutes: 330,
      lat: 999,
      lng: 77.209,
    });
    expect(res.status).toBe(422);
  }, 10_000);
});
