import { describe, it, expect } from 'vitest';
import { NAKSHATRAS } from '@aroha-astrology/shared';
import { scoreDay, type DaySky } from '../../src/lib/astro-tools/decision-engine.js';
import { DECISION_SPECS, MUHURTA_SPECS } from '../../src/lib/astro-tools/muhurta-rules.js';

// =============================================================================
// Audit item MU3 (docs/engine-audit/C-critical-corrections.md), register BS-99.8
// =============================================================================
// Brihat Samhita 99.8: for a marriage leave out Vyatipata, Vaidhriti, Vishti and
// the Rikta days. The engine already left out Rikta; this adds the other three.
//
// Worked positions (sidereal longitudes; the day is judged at local noon):
//  * Karana = floor(elongation / 6), elongation = Moon - Sun. Karana 1 is the
//    fixed Kimstughna, 57-59 are fixed, and 1-56 cycle Bava, Balava, Kaulava,
//    Taitila, Gara, Vanija, Vishti, so Vishti is index 7, 14, 21, ... 56.
//    Sun 0, Moon 87: elongation 87, index 14 = Vishti. Sun 0, Moon 93: index 15
//    = Bava. Both are in the 8th tithi (84 to 96 degrees), which is passed in.
//  * Yoga = floor((Sun + Moon) / 13.3333). Vyatipata is the 17th (index 16, sums
//    213.33 to 226.67), Vaidhriti the 27th (index 26, sums 346.67 to 360).
//    Sun 130, Moon 90: sum 220 = Vyatipata. Sun 130, Moon 100: sum 230 = Variyan.
//    Sun 200, Moon 150: sum 350 = Vaidhriti. Sun 200, Moon 120: sum 320 = Brahma.
// =============================================================================

const nak = (name: string) => NAKSHATRAS.indexOf(name as (typeof NAKSHATRAS)[number]);

function sky(sun: number, moon: number, tithi: number): DaySky {
  const sign = (lon: number) => Math.floor(lon / 30);
  return {
    date: '2026-10-01',
    weekday: 4,
    tithi,
    nakshatraIndex: nak('Hasta'),
    moonSignIndex: sign(moon),
    planets: [
      { planet: 'Sun', longitude: sun, signIndex: sign(sun), sign: 'X', isRetrograde: false },
      { planet: 'Moon', longitude: moon, signIndex: sign(moon), sign: 'X', isRetrograde: false },
    ],
  };
}

const marriage = MUHURTA_SPECS.marriage;
const keys = (d: ReturnType<typeof scoreDay>) => d.why.map((w) => w.textKey);

describe('[MU3] Vishti karana is left out for a marriage', () => {
  const vishti = sky(0, 87, 8);
  const bava = sky(0, 93, 8);

  it('costs the day the weight of a bad tithi and says why', () => {
    const bad = scoreDay(vishti, marriage, 'muhurta');
    const ok = scoreDay(bava, marriage, 'muhurta');
    expect(ok.score - bad.score).toBe(12);
    expect(keys(bad)).toContain('decide.why.karanaBad');
    expect(bad.why.find((w) => w.textKey === 'decide.why.karanaBad')?.params).toEqual({
      karana: 'Vishti',
    });
    expect(keys(ok)).not.toContain('decide.why.karanaBad');
  });

  it('is half that weight in a Decisions reading', () => {
    const bad = scoreDay(vishti, DECISION_SPECS.marriage, 'decision');
    const ok = scoreDay(bava, DECISION_SPECS.marriage, 'decision');
    expect(ok.score - bad.score).toBe(6);
  });

  it('does not touch any other occasion', () => {
    for (const cat of ['house', 'vehicle', 'travel', 'puja', 'agreement'] as const) {
      const a = scoreDay(vishti, MUHURTA_SPECS[cat], 'muhurta');
      const b = scoreDay(bava, MUHURTA_SPECS[cat], 'muhurta');
      expect(a.score, cat).toBe(b.score);
      expect(keys(a), cat).not.toContain('decide.why.karanaBad');
    }
  });
});

describe('[MU3] Vyatipata and Vaidhriti yogas are left out for a marriage', () => {
  it('Vyatipata costs a bad-tithi weight and names the yoga', () => {
    const bad = scoreDay(sky(130, 90, 27), marriage, 'muhurta');
    const ok = scoreDay(sky(130, 100, 27), marriage, 'muhurta');
    expect(ok.score - bad.score).toBe(12);
    expect(bad.why.find((w) => w.textKey === 'decide.why.yogaBad')?.params).toEqual({
      yoga: 'Vyatipata',
    });
  });

  it('Vaidhriti costs a bad-tithi weight and names the yoga', () => {
    const bad = scoreDay(sky(200, 150, 26), marriage, 'muhurta');
    const ok = scoreDay(sky(200, 120, 26), marriage, 'muhurta');
    expect(ok.score - bad.score).toBe(12);
    expect(bad.why.find((w) => w.textKey === 'decide.why.yogaBad')?.params).toEqual({
      yoga: 'Vaidhriti',
    });
  });

  it('does not touch other occasions', () => {
    const a = scoreDay(sky(130, 90, 27), MUHURTA_SPECS.travel, 'muhurta');
    const b = scoreDay(sky(130, 100, 27), MUHURTA_SPECS.travel, 'muhurta');
    expect(a.score).toBe(b.score);
  });

  it('a day without the Sun or Moon in its sky is scored as before, without failing', () => {
    const d = { ...sky(0, 87, 8), planets: [] };
    expect(() => scoreDay(d, marriage, 'muhurta')).not.toThrow();
  });
});
