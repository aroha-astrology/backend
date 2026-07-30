import { type Journey } from '../lib/http.js';

/**
 * Full authenticated app-open fan-out (src/app.ts:45-49): session exchange,
 * profile, kundli, horoscope, panchang, and the 12-sign moon-sign slider.
 * Seeded users already have birth details + a warm kundli/horoscope, so this
 * exercises the cached-read path with real auth + DB round trips, not
 * first-time chart generation.
 */
export async function runTier2Journey(j: Journey): Promise<void> {
  await j.post('/v1/auth/session');
  await j.get('/v1/me');
  await j.get('/v1/kundli');
  await j.get('/v1/horoscope?period=daily');
  await j.get('/v1/panchang?date=2026-07-21&lat=12.9716&lon=77.5946&tz=Asia%2FKolkata');
  for (let sign = 0; sign < 12; sign++) {
    await j.get(`/v1/forecast/moon-sign/${sign}`);
  }
}
