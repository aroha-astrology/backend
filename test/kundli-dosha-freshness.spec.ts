import { describe, it, expect } from 'vitest';
import { withLiveSadeSati } from '../src/modules/kundli/kundli.service.js';

// A kundli's doshaData is written once, at generation time, and served
// straight from the DB on every read after that. Sade Sati is a TRANSIT
// dosha (Saturn keeps moving after generation) so a frozen snapshot goes
// stale and never self-corrects. This mirrors the 2026-07-17 gemstone fix:
// recompute the transit-dependent piece fresh on every read; leave the
// natal (unchanging) doshas as-is.

describe('withLiveSadeSati (read-time self-heal)', () => {
  it('overrides a stale cached phase with the live transit-derived phase', async () => {
    // Real transit fact: Saturn left Aquarius for Pisces on 2025-03-29 and
    // stays there until 2027-06-03. A kundli generated before that date (or
    // fed the natal Saturn longitude, per the reported bug) would have
    // cached "peak" (Saturn == Moon sign, Aquarius). By 2026-07-18 the real
    // phase for an Aquarius Moon is "setting" (Saturn one sign ahead).
    const staleCached = {
      mangal: { present: false },
      sadeSati: {
        active: true,
        phase: 'peak',
        saturnSign: 'Aquarius',
        moonSign: 'Aquarius',
        severity: 'severe',
      },
    };

    const fresh = await withLiveSadeSati(staleCached, new Date('2026-07-18T00:00:00Z'));

    expect(fresh?.sadeSati).toMatchObject({ saturnSign: 'Pisces', phase: 'setting' });
    expect(fresh?.mangal).toEqual({ present: false }); // untouched, natal doshas aren't refreshed
  });

  it('returns doshaData unchanged when there is nothing cached to refresh', async () => {
    const result = await withLiveSadeSati(null, new Date('2026-07-18T00:00:00Z'));
    expect(result).toBeNull();
  });
});
