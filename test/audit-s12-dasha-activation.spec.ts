import { describe, it, expect } from 'vitest';
import {
  activeDashaLords,
  activeNowOf,
  activeNowNote,
  activeNowLine,
  doshaPlanets,
  ACTIVE_NOW_LABEL,
  ACTIVE_NOW_CHAT_LABEL,
} from '../src/lib/astro-tools/dasha-activation.js';
import { computeDoshaYogaSummary } from '../src/lib/astro-engine/reports/report-dosha-yoga-summary.js';

const dasha = {
  vimshottari: {
    mahadashas: [
      {
        planet: 'Venus',
        startDate: '2010-01-01T00:00:00Z',
        endDate: '2030-01-01T00:00:00Z',
        subPeriods: [
          { planet: 'Venus', startDate: '2010-01-01T00:00:00Z', endDate: '2024-01-01T00:00:00Z' },
          { planet: 'Sun', startDate: '2024-01-01T00:00:00Z', endDate: '2027-01-01T00:00:00Z' },
        ],
      },
    ],
  },
};
const asOf = new Date('2026-11-06T00:00:00Z');

describe('dasha activation (audit G7)', () => {
  it('finds the lords running on the day, not the frozen ones', () => {
    expect(activeDashaLords(dasha, asOf)).toEqual({ mahadasha: 'Venus', antardasha: 'Sun' });
    expect(activeDashaLords(dasha, new Date('2020-01-01T00:00:00Z'))).toEqual({
      mahadasha: 'Venus',
      antardasha: 'Venus',
    });
  });

  it('a stand-in birth time keeps the Mahadasha only (the Antardasha swings with the minute)', () => {
    expect(activeDashaLords(dasha, asOf, { mahadashaOnly: true })).toEqual({ mahadasha: 'Venus' });
  });

  it('a yoga is active now when a running lord takes part, and says which', () => {
    const lords = activeDashaLords(dasha, asOf);
    expect(activeNowOf(['Venus', 'Jupiter'], lords)).toEqual({
      activeNow: true,
      by: ['Venus Mahadasha'],
    });
    expect(activeNowOf(['Sun'], lords).by).toEqual(['Sun Antardasha']);
    expect(activeNowOf(['Mars', 'Saturn'], lords)).toEqual({ activeNow: false, by: [] });
    expect(activeNowOf([], lords).activeNow).toBe(false);
  });

  it('the note carries the label and is empty when nothing is active', () => {
    const lords = activeDashaLords(dasha, asOf);
    expect(activeNowNote(['Venus'], lords)).toContain(ACTIVE_NOW_LABEL);
    expect(activeNowNote(['Venus'], lords)).toContain('Venus Mahadasha');
    expect(activeNowNote(['Mars'], lords)).toBe('');
    expect(ACTIVE_NOW_LABEL).toMatch(/Aroha/);
  });

  it('doshas map to their planets; Grahan by type', () => {
    expect(doshaPlanets('mangal', {})).toEqual(['Mars']);
    expect(doshaPlanets('guruChandal', {})).toEqual(['Jupiter', 'Rahu']);
    expect(doshaPlanets('grahan', { type: 'surya_grahan' })).toEqual(['Sun', 'Rahu', 'Ketu']);
    expect(doshaPlanets('sadeSati', {})).toEqual([]);
  });

  it('chat gets one line naming what is running, nothing when nothing is', () => {
    const lords = { mahadasha: 'Mars', antardasha: 'Venus' };
    const line = activeNowLine(
      [
        { name: 'Ruchaka Yoga', planets: ['Mars'] },
        { name: 'Hamsa Yoga', planets: ['Jupiter'] },
        { name: 'Mangal Dosha', planets: ['Mars'] },
        { name: 'Malavya Yoga', planets: ['Venus'] },
      ],
      lords,
    );
    expect(line).toBe(
      `${ACTIVE_NOW_CHAT_LABEL}: Ruchaka Yoga (Mars Mahadasha); Mangal Dosha (Mars Mahadasha); Malavya Yoga (Venus Antardasha).`,
    );
    expect(activeNowLine([{ name: 'Hamsa Yoga', planets: ['Jupiter'] }], lords)).toBe('');
  });

  it('report summary adds the note to a present yoga and a present dosha, only when given the dasha', () => {
    const yogaData = {
      yogas: [
        {
          name: 'Ruchaka Yoga',
          type: 'mahapurusha',
          present: true,
          description: 'Mars strong.',
          planets: ['Mars'],
        },
        {
          name: 'Hamsa Yoga',
          type: 'mahapurusha',
          present: true,
          description: 'Jupiter strong.',
          planets: ['Jupiter'],
        },
      ],
    };
    const doshaData = { mangal: { present: true, type: 'in force', severity: 'mild' } };
    const lords = { mahadasha: 'Mars' };
    const withD = computeDoshaYogaSummary(doshaData, yogaData, ['mangal'], ['mahapurusha'], lords);
    expect(withD.positives.find((p) => p.label === 'Ruchaka Yoga')!.detail).toContain(
      ACTIVE_NOW_LABEL,
    );
    expect(withD.positives.find((p) => p.label === 'Hamsa Yoga')!.detail).not.toContain(
      ACTIVE_NOW_LABEL,
    );
    expect(withD.cautions[0]!.detail).toContain(ACTIVE_NOW_LABEL);
    const without = computeDoshaYogaSummary(doshaData, yogaData, ['mangal'], ['mahapurusha']);
    expect(JSON.stringify(without)).not.toContain(ACTIVE_NOW_LABEL);
  });
});

import { readFileSync, readdirSync } from 'node:fs';

describe('every report that shows the dosha/yoga panel passes the running lords (fix once)', () => {
  const reports =
    'baby-name career-monthly finance-monthly health-monthly kundli-milan marriage past-life progeny relationship-monthly true-love wealth'.split(
      ' ',
    );
  it.each(reports)('%s', (name) => {
    const src = readFileSync(`src/lib/astro-engine/reports/${name}.ts`, 'utf8');
    const call = src.match(/computeDoshaYogaSummary\([\s\S]*?\);/)![0];
    expect(call).toContain('reportActiveLords(ctx)');
  });
  it('and no report calls it without (a new report would be caught here)', () => {
    const all = readdirSync('src/lib/astro-engine/reports').filter((f: string) =>
      f.endsWith('.ts'),
    );
    for (const f of all) {
      if (f === 'report-dosha-yoga-summary.ts') continue;
      const src = readFileSync(`src/lib/astro-engine/reports/${f}`, 'utf8');
      for (const m of src.matchAll(/computeDoshaYogaSummary\([\s\S]*?\);/g)) {
        expect(m[0], f).toContain('reportActiveLords(');
      }
    }
  });
});
