import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ bar: false, widget: false, panchangCalls: 0 }));

vi.mock('../src/middleware/rate-limit', () => ({
  rateLimiter: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../src/modules/features/features.service', () => ({
  isFeatureOnGlobally: async (key: string) => (key === 'live.nowBar' ? state.bar : key === 'live.widget' ? state.widget : false),
}));

vi.mock('../src/modules/astro/astro.service', async () => {
  const { buildHoraSchedule } = await import('../src/lib/astro-engine/panchang/hora');
  const { calculateChoghadiya } = await import('../src/lib/astro-engine/panchang/choghadiya');
  const chog = calculateChoghadiya('06:30', '18:30', 3);
  return {
    isValidTimeZone: (tz: string) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    getPanchang: async () => {
      state.panchangCalls++;
      return {
        tithi: { number: 8, name: 'Ashtami', paksha: 'Krishna', deity: 'Rudra', isAuspicious: false },
        nakshatra: { index: 5, name: 'Ardra', lord: 'Rahu', pada: 3, deity: 'Rudra' },
        vara: 'Budhvaar',
        rahuKaal: { start: '12:00', end: '13:30' },
        abhijitMuhurta: { start: '12:06', end: '12:54' },
        sunriseTime: '06:30',
        sunsetTime: '18:30',
        choghadiya: { day: chog.slice(0, 8), night: chog.slice(8, 16) },
        hora: buildHoraSchedule('06:30', '18:30', 3),
      };
    },
  };
});

import { widgetsRouter } from '../src/modules/widgets/widgets.routes';

widgetsRouter.onError((err, c) => c.json({ code: (err as { code?: string }).code ?? 'ERR' }, 404));

const url = '/widgets/live-now?lat=28.6139&lon=77.209&tz=Asia/Kolkata';

beforeEach(() => {
  state.bar = false;
  state.widget = false;
  state.panchangCalls = 0;
});

describe('GET /widgets/live-now', () => {
  it('is not found while both the Now Bar and the widget feed are off', async () => {
    const res = await widgetsRouter.request(url);
    expect(res.status).toBe(404);
  });

  it('answers with the Now Bar switch alone, under 2 KB, cached for 15 minutes', async () => {
    state.bar = true;
    const res = await widgetsRouter.request(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=900');
    const text = await res.text();
    expect(Buffer.byteLength(text)).toBeLessThan(2048);
    const body = JSON.parse(text);
    expect(body).toMatchObject({ v: 1, tz: 'Asia/Kolkata', vara: 'Budhvaar' });
    expect(body.tithi.name).toBe('Ashtami');
  });

  it('answers with the widget switch alone', async () => {
    state.widget = true;
    expect((await widgetsRouter.request(url)).status).toBe(200);
  });

  it('builds the panchang once for the same place within a slot', async () => {
    state.bar = true;
    await widgetsRouter.request('/widgets/live-now?lat=19.0760&lon=72.8777&tz=Asia/Kolkata');
    await widgetsRouter.request('/widgets/live-now?lat=19.0761&lon=72.8778&tz=Asia/Kolkata');
    expect(state.panchangCalls).toBe(1);
  });

  it('rejects a bad zone or coordinates', async () => {
    state.bar = true;
    expect((await widgetsRouter.request('/widgets/live-now?lat=28&lon=77&tz=Mars/Base')).status).not.toBe(200);
    expect((await widgetsRouter.request('/widgets/live-now?lat=999&lon=77&tz=Asia/Kolkata')).status).not.toBe(200);
  });
});
