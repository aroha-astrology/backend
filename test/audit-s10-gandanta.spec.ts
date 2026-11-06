import { describe, it, expect } from 'vitest';
import { detectGandanta } from '../src/lib/astro-engine/doshas/gandanta.js';
import type { ChartData } from '../src/lib/shared/types/astrology.js';

/**
 * Gandanta, after BPHS chapter 92 (Santhanam numbering; register BPHS-92):
 *  - Tithi: last 2 ghatikas of a Purna tithi (5, 10, 15) + first 2 of a Nanda tithi (1, 6, 11).
 *  - Nakshatra: last 2 ghatikas of Revati / Ashlesha / Jyeshtha + first 2 of Ashwini / Magha / Moola.
 *  - Lagna: last half ghatika of Pisces / Cancer / Scorpio + first half ghatika of Aries / Leo / Sagittarius.
 *  - Abhukta Moola: last 6 ghatikas of Jyeshtha + first 8 of Moola.
 * A ghatika is 1/60 of the unit (nakshatra 13d20m, tithi 12d, sign 30d).
 */

const NAK = 360 / 27;

function chart(opts: { sun?: number; moon: number; asc?: number }): ChartData {
  const mk = (planet: string, longitude: number) => ({
    planet,
    longitude,
    signIndex: Math.floor(longitude / 30),
  });
  const asc = opts.asc ?? 100; // mid-Cancer: not a junction
  return {
    planets: [mk('Sun', opts.sun ?? 10), mk('Moon', opts.moon)],
    ascendant: { signIndex: Math.floor(asc / 30), degree: asc % 30 },
  } as unknown as ChartData;
}

describe('Gandanta (BPHS 92)', () => {
  it('Moon in the last 2 ghatikas of Ashlesha is Nakshatra Gandanta', () => {
    const g = detectGandanta(chart({ moon: 9 * NAK - 0.2 }), { timeKnown: true });
    expect(g.moon?.present).toBe(true);
    expect(g.moon?.nakshatra).toBe('Ashlesha');
    expect(g.moon?.part).toBe('end');
    expect(g.present).toBe(true);
  });

  it('Moon in the first 2 ghatikas of Magha is Nakshatra Gandanta; just outside is not', () => {
    expect(detectGandanta(chart({ moon: 9 * NAK + 0.3 }), { timeKnown: true }).moon?.present).toBe(
      true,
    );
    // 2 of 60 ghatikas of 13d20m = 0.4444 deg
    expect(detectGandanta(chart({ moon: 9 * NAK + 0.5 }), { timeKnown: true }).moon?.present).toBe(
      false,
    );
  });

  it('covers all six junction nakshatras and no others', () => {
    const hits: string[] = [];
    for (let i = 0; i < 27; i++) {
      const start = detectGandanta(chart({ moon: i * NAK + 0.1 }), { timeKnown: true });
      const end = detectGandanta(chart({ moon: (i + 1) * NAK - 0.1 }), { timeKnown: true });
      if (start.moon?.present) hits.push(`start${i}`);
      if (end.moon?.present) hits.push(`end${i}`);
    }
    // starts: Ashwini 0, Magha 9, Moola 18; ends: Ashlesha 8, Jyeshtha 17, Revati 26
    expect(hits.sort()).toEqual(['end17', 'end26', 'end8', 'start0', 'start18', 'start9'].sort());
  });

  it('Abhukta Moola: last 6 ghatikas of Jyeshtha and first 8 of Moola, not the rest of Jyeshtha', () => {
    expect(detectGandanta(chart({ moon: 18 * NAK - 1 }), { timeKnown: true }).abhuktaMoola).toBe(
      true,
    );
    expect(detectGandanta(chart({ moon: 18 * NAK + 1.5 }), { timeKnown: true }).abhuktaMoola).toBe(
      true,
    );
    expect(detectGandanta(chart({ moon: 18 * NAK - 2 }), { timeKnown: true }).abhuktaMoola).toBe(
      false,
    );
    // 8/60 of 13d20m = 1.78 deg: 1.9 deg into Moola is outside
    expect(detectGandanta(chart({ moon: 18 * NAK + 1.9 }), { timeKnown: true }).abhuktaMoola).toBe(
      false,
    );
  });

  it('Tithi Gandanta: end of Purna (5/10/15) and start of Nanda (1/6/11), in both halves', () => {
    // Moon - Sun = 60 deg is the end of tithi 5 (Purna); +0.2 deg into tithi 6 (Nanda)
    const sun = 10;
    expect(
      detectGandanta(chart({ sun, moon: sun + 60 - 0.2 }), { timeKnown: true }).tithi?.present,
    ).toBe(true);
    expect(
      detectGandanta(chart({ sun, moon: sun + 60 + 0.2 }), { timeKnown: true }).tithi?.present,
    ).toBe(true);
    // tithi 4 end (Bhadra) is not a Gandanta
    expect(
      detectGandanta(chart({ sun, moon: sun + 48 - 0.2 }), { timeKnown: true }).tithi?.present,
    ).toBe(false);
    // dark half: 15 -> 16 (full moon to new tithi 16) and 30 -> 1
    expect(
      detectGandanta(chart({ sun, moon: sun + 180 - 0.2 }), { timeKnown: true }).tithi?.present,
    ).toBe(true);
    expect(
      detectGandanta(chart({ sun, moon: sun + 360 - 0.2 }), { timeKnown: true }).tithi?.present,
    ).toBe(true);
    // middle of a tithi
    expect(detectGandanta(chart({ sun, moon: sun + 66 }), { timeKnown: true }).tithi?.present).toBe(
      false,
    );
  });

  it('Lagna Gandanta: half a ghatika (0.25 deg) either side of Pisces/Aries, Cancer/Leo, Scorpio/Sagittarius', () => {
    const at = (asc: number) =>
      detectGandanta(chart({ moon: 100, asc }), { timeKnown: true }).lagna?.present;
    expect(at(360 - 0.1)).toBe(true); // end of Pisces
    expect(at(0.1)).toBe(true); // start of Aries
    expect(at(120 - 0.1)).toBe(true); // end of Cancer
    expect(at(120 + 0.1)).toBe(true); // start of Leo
    expect(at(240 - 0.1)).toBe(true); // end of Scorpio
    expect(at(240 + 0.1)).toBe(true); // start of Sagittarius
    expect(at(0.4)).toBe(false);
    expect(at(60 - 0.1)).toBe(false); // end of Taurus: not a junction
    expect(at(150)).toBe(false);
  });

  it('says nothing without a real birth time: the Moon and Lagna of a stand-in time prove nothing', () => {
    const g = detectGandanta(chart({ moon: 9 * NAK - 0.2, asc: 359.9 }), { timeKnown: false });
    expect(g.timeKnown).toBe(false);
    expect(g.present).toBe(false);
    expect(g.moon).toBeNull();
    expect(g.tithi).toBeNull();
    expect(g.lagna).toBeNull();
    expect(g.abhuktaMoola).toBe(false);
    expect(g.description).toBe('');
  });

  it('a chart with no Moon or Sun raises instead of defaulting', () => {
    expect(() =>
      detectGandanta(
        { planets: [], ascendant: { signIndex: 0, degree: 1 } } as unknown as ChartData,
        {
          timeKnown: true,
        },
      ),
    ).toThrow(/Moon/);
  });
});

import { doshaFacts } from '../src/lib/chat-grounding.js';
import { withLiveSaturnTransits } from '../src/modules/kundli/kundli.service.js';

describe('Gandanta reaches chat and the read-time path', () => {
  const g = detectGandanta(chart({ moon: 9 * NAK - 0.2 }), { timeKnown: true });

  it('chat names it when present and says "not present" for a clean real time', () => {
    const present = doshaFacts({ gandanta: g }, 'Asia/Kolkata');
    expect(present.find((f) => f.startsWith('Gandanta:'))).toMatch(/present.*Ashlesha/);
    const clean = detectGandanta(chart({ moon: 5 * NAK + 5 }), { timeKnown: true });
    expect(doshaFacts({ gandanta: clean }, 'Asia/Kolkata')).toContain('Gandanta: not present');
  });

  it('chat writes no Gandanta line at all for a stand-in time', () => {
    const none = detectGandanta(chart({ moon: 9 * NAK - 0.2 }), { timeKnown: false });
    expect(
      doshaFacts({ gandanta: none }, 'Asia/Kolkata').some((f) => f.startsWith('Gandanta')),
    ).toBe(false);
  });

  it('withLiveSaturnTransits adds gandanta only when the kundli says the time is known', async () => {
    const saved = { sadeSati: { moonSign: 'Cancer' } } as Record<string, unknown>;
    const c = chart({ moon: 9 * NAK - 0.2 });
    // a real chart carries Mars etc.; the dosha detectors there need them, so cast a full chart shell
    const known = await withLiveSaturnTransits(saved, undefined, { chart: c, timeKnown: true });
    const nullTime = await withLiveSaturnTransits(saved, undefined, { chart: c, timeKnown: null });
    expect((known?.gandanta as { present: boolean }).present).toBe(true);
    expect((nullTime?.gandanta as { timeKnown: boolean }).timeKnown).toBe(false);
    expect((nullTime?.gandanta as { present: boolean }).present).toBe(false);
  });
});
