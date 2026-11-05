import { describe, it, expect } from 'vitest';
import { calculateChart, calculateAshtakavarga } from '../src/lib/astro-engine/index.js';
import { analyzeAllDoshas, analyzeAllDoshasAt } from '../src/lib/astro-engine/doshas/index.js';

// Audit Sprint 4 (G6 from the 2026-11-04 spec review, M2/M3, L4): Saturn's own bindus and the
// Sarva total in the signs of the phase, its dignity there and its role for the Lagna come out of
// the ENGINE (Sade Sati and Dhaiya), so chat, reports and the Kundli card read the same numbers.
// Plus the Sade Sati cycle number (1st/2nd/3rd of life).

// Leo Moon, Aquarius rising (Saturn is the Lagna lord), natal Saturn in Sagittarius.
// Ashtama Shani runs 29 Mar 2025 - 23 Feb 2028 (Saturn in Pisces).
const leo = () => calculateChart(1990, 1, 15, 10, 0, 5.5, 28.61, 77.21);

describe('Saturn transit strength in the engine output (G6, M2, M3)', () => {
  it('Dhaiya carries Saturn bindus, Sarva, dignity and the Lagna role', async () => {
    const chart = await leo();
    const av = calculateAshtakavarga(chart);
    const satBav = av.bhinna.find((b) => b.planet === 'Saturn')!.bindus;
    const d = await analyzeAllDoshasAt(chart, new Date('2026-11-04T06:00:00Z'));

    expect(d.dhaiya?.active).toBe(true);
    expect(d.dhaiya?.strength?.lagnaRole).toBe('lagna-lord');
    expect(d.dhaiya?.strength?.signs).toEqual([
      {
        sign: 'Pisces',
        saturnBindus: satBav[11],
        sarvaBindus: av.sarva.bindus[11],
        dignity: 'neutral',
        now: true,
      },
    ]);
  });

  it('Sade Sati lists its three signs (12th, 1st, 2nd from the Moon) in order', async () => {
    const chart = await leo();
    const av = calculateAshtakavarga(chart);
    const satBav = av.bhinna.find((b) => b.planet === 'Saturn')!.bindus;
    const d = await analyzeAllDoshasAt(chart, new Date('2026-11-04T06:00:00Z'));

    const signs = d.sadeSati.strength?.signs ?? [];
    expect(signs.map((s) => s.sign)).toEqual(['Cancer', 'Leo', 'Virgo']);
    expect(signs.map((s) => s.dignity)).toEqual(['enemy', 'enemy', 'friend']);
    expect(signs.map((s) => s.saturnBindus)).toEqual([satBav[3], satBav[4], satBav[5]]);
    expect(signs.map((s) => s.sarvaBindus)).toEqual([
      av.sarva.bindus[3],
      av.sarva.bindus[4],
      av.sarva.bindus[5],
    ]);
    expect(signs.every((s) => s.now === false)).toBe(true); // Saturn is in Pisces today
  });
});

describe('Sade Sati cycle number (G6)', () => {
  it('counts the 2004-2011 Sade Sati as the 1st of life and the next one as the 2nd', async () => {
    const chart = await leo();
    const during = await analyzeAllDoshasAt(chart, new Date('2008-06-01T06:00:00Z'));
    expect(during.sadeSati.active).toBe(true);
    expect(during.sadeSati.cycle).toBe(1);

    const today = await analyzeAllDoshasAt(chart, new Date('2026-11-04T06:00:00Z'));
    expect(today.sadeSati.active).toBe(false);
    expect(today.sadeSati.next?.cycle).toBe(2);
  });

  it('a reader born inside a Sade Sati counts that one as the 1st', async () => {
    // 23 Aug 2006: Moon in Leo, Saturn in Cancer (12th from the Moon), so born in its rising phase.
    const chart = await calculateChart(2006, 8, 23, 12, 0, 5.5, 28.61, 77.21);
    const atBirth = await analyzeAllDoshasAt(chart, new Date('2007-01-01T06:00:00Z'));
    expect(atBirth.sadeSati.active).toBe(true);
    expect(atBirth.sadeSati.cycle).toBe(1);

    const later = await analyzeAllDoshasAt(chart, new Date('2026-11-04T06:00:00Z'));
    expect(later.sadeSati.next?.cycle).toBe(2);
  });
});

describe('no silent defaults for a missing Moon (L4)', () => {
  it('analyzeAllDoshas throws instead of reading the Moon as Aries', async () => {
    const chart = await leo();
    const noMoon = { ...chart, planets: chart.planets.filter((p) => p.planet !== 'Moon') };
    expect(() => analyzeAllDoshas(noMoon, 0)).toThrow(/Moon/);
    await expect(analyzeAllDoshasAt(noMoon)).rejects.toThrow(/Moon/);
  });
});
