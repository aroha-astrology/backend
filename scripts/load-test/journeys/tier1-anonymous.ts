import { Journey } from '../lib/http.js';

const PANCHANG_QS = 'date=2026-07-21&lat=12.9716&lon=77.5946&tz=Asia%2FKolkata';

/**
 * Approximates the unauthenticated slice of a real app-open fan-out
 * (src/app.ts:45-49): panchang + the 12-sign moon-sign slider + a cheap
 * static read. No auth, no writes — pure cached-read path.
 */
export async function runTier1Journey(j: Journey): Promise<void> {
  await j.get('/v1/legal/current');
  await j.get(`/v1/panchang?${PANCHANG_QS}`);
  for (let sign = 0; sign < 12; sign++) {
    await j.get(`/v1/forecast/moon-sign/${sign}`);
  }
}
