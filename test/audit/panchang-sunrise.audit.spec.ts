import { describe, it, expect } from 'vitest';
import { calculateDayPanchang } from '../../src/lib/astro-engine/panchang/index.js';

// =============================================================================
// The day's tithi, nakshatra, yoga and karana are the ones current at sunrise
// (udaya), as drikpanchang and printed panchangs show them. Until 2026-10 the
// engine read them at local noon (audit PN4 "Aroha's convention"), so on a day
// whose tithi changed between sunrise and noon the screen showed the next
// tithi: 8 Nov 2026 read "Amavasya, ends 12:33" when the sunrise tithi is
// Chaturdashi (ends 11:28), and 9 Nov read the same Amavasya again.
//
// Reference values: Moon-Sun elongation crossings from Swiss Ephemeris
// (Moshier), IST, Delhi: 336 deg at 7 Nov 10:48, 348 deg at 8 Nov 11:28,
// new moon at 9 Nov 12:32. Tithi depends only on the elongation, so the
// ayanamsa doesn't enter.
// =============================================================================

const DELHI = { lat: 28.6139, lon: 77.209 };
const IST = 5.5;

/** A limb as calculateDayPanchang returns it (the shared types don't list the end fields). */
interface Limb {
  number?: number;
  name: string;
  endsAt: string;
  endsOn: string;
  nextName: string;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

async function day(iso: string): Promise<{ tithi: Limb; nakshatra: Limb; sunriseTime: string }> {
  const [y, m, d] = iso.split('-').map(Number);
  const p = await calculateDayPanchang(new Date(y!, m! - 1, d, 12), DELHI.lat, DELHI.lon, IST);
  return {
    tithi: p.tithi as unknown as Limb,
    nakshatra: p.nakshatra as unknown as Limb,
    sunriseTime: p.sunriseTime,
  };
}

describe('[PN4] the Panchang reads the day at sunrise', () => {
  it('7 Nov 2026: Krishna Trayodashi until 10:48, then Chaturdashi', async () => {
    const p = await day('2026-11-07');
    expect(p.tithi.number).toBe(28);
    expect(p.tithi.name).toBe('Trayodashi');
    expect(Math.abs(minutes(p.tithi.endsAt) - (10 * 60 + 48))).toBeLessThanOrEqual(2);
    expect(p.tithi.endsOn).toBe('2026-11-07');
    expect(p.tithi.nextName).toBe('Chaturdashi');
  }, 60_000);

  it('8 Nov 2026 (Diwali): Chaturdashi at sunrise until 11:28, then Amavasya', async () => {
    const p = await day('2026-11-08');
    expect(p.tithi.number).toBe(29);
    expect(p.tithi.name).toBe('Chaturdashi');
    expect(Math.abs(minutes(p.tithi.endsAt) - (11 * 60 + 28))).toBeLessThanOrEqual(2);
    expect(p.tithi.endsOn).toBe('2026-11-08');
    expect(p.tithi.nextName).toBe('Amavasya');
  }, 60_000);

  it('9 Nov 2026: Amavasya at sunrise until 12:32, then Shukla Pratipada', async () => {
    const p = await day('2026-11-09');
    expect(p.tithi.number).toBe(30);
    expect(Math.abs(minutes(p.tithi.endsAt) - (12 * 60 + 32))).toBeLessThanOrEqual(2);
    expect(p.tithi.endsOn).toBe('2026-11-09');
  }, 60_000);

  it('every day of Nov 2026: the tithi and nakshatra shown are still running at sunrise', async () => {
    let previousTithi = -1;
    for (let d = 1; d <= 30; d++) {
      const iso = `2026-11-${String(d).padStart(2, '0')}`;
      const p = await day(iso);
      const sunrise = minutes(p.sunriseTime);
      for (const limb of [p.tithi, p.nakshatra]) {
        // ends after this day's sunrise (same day later, or a later day)
        const endsLater =
          limb.endsOn > iso || (limb.endsOn === iso && minutes(limb.endsAt) > sunrise);
        expect(
          endsLater,
          `${iso}: ${limb.name} ends ${limb.endsOn} ${limb.endsAt}, sunrise ${p.sunriseTime}`,
        ).toBe(true);
        // and not more than about a day and a half away
        const [ey, em, ed] = limb.endsOn.split('-').map(Number);
        const daysAhead = (Date.UTC(ey!, em! - 1, ed) - Date.UTC(2026, 10, d)) / 86_400_000;
        expect(daysAhead).toBeLessThanOrEqual(1);
      }
      // two days in a row can only share a tithi when it spans both sunrises
      // (a vriddhi tithi); then the first day's tithi must end after the next sunrise
      if (p.tithi.number === previousTithi) {
        const prev = await day(`2026-11-${String(d - 1).padStart(2, '0')}`);
        expect(prev.tithi.endsOn, `${iso}: repeated tithi must really span two sunrises`).toBe(iso);
      }
      previousTithi = p.tithi.number ?? -1;
    }
  }, 240_000);
});
