import { describe, expect, it } from 'vitest';
import {
  detectCurrentSadeSati,
  getCurrentSaturnLongitude,
} from '../src/lib/astro-engine/doshas/sadeSati.js';

// Regression coverage for a reported bug: a user's dashboard showed Sade Sati
// "peak (2nd) phase" with Saturn in Aquarius, but Saturn (sidereal) actually
// left Aquarius for Pisces on 2025-03-29 and doesn't return until the
// 2027-06-03 Aries ingress. The stored value was frozen at kundli-generation
// time using the natal chart's own Saturn longitude instead of a live
// transit lookup, so it never reflected Saturn's real, current position.

describe('live Saturn transit lookup for Sade Sati', () => {
  it('reflects Saturn actually transiting Pisces on 2026-07-18, not a stale Aquarius snapshot', async () => {
    const longitude = await getCurrentSaturnLongitude(new Date('2026-07-18T00:00:00Z'));
    const signIndex = Math.floor(longitude / 30) % 12;
    expect(signIndex).toBe(11); // Pisces
  });

  it('derives the setting (3rd) phase for an Aquarius Moon while Saturn transits Pisces', async () => {
    const result = await detectCurrentSadeSati('Aquarius', new Date('2026-07-18T00:00:00Z'));
    expect(result.saturnSign).toBe('Pisces');
    expect(result.phase).toBe('setting');
    expect(result.phase).not.toBe('peak');
  });
});
