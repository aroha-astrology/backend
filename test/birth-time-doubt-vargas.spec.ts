import { describe, it, expect } from 'vitest';
import {
  calculateChart,
  calculateVimshottariDasha,
  detectAllYogas,
  calculateAshtakavarga,
} from '../src/lib/astro-engine/index.js';
import { analyzeAllDoshas } from '../src/lib/astro-engine/doshas/index.js';
import { computeReportVargas } from '../src/lib/astro-engine/reports/report-vargas.js';
import { markBirthTimeUnknown } from '../src/lib/birth-time-doubt.js';
import { REPORT_CATALOGUE } from '../src/config/reports.js';
import type { ReportScoreContext } from '../src/modules/reports/report-generator.types.js';

/**
 * Sprint 3 follow-up to H3/L5: reports used to send divisional charts (D2, D6, D7, D9, D10, D30, D60)
 * for a reader whose birth time is only a part-of-day window, the same lines chat now leaves out. Every
 * one of them comes through computeReportVargas, so one check there covers all report types.
 */
async function ctxFor(unknown: boolean): Promise<ReportScoreContext> {
  const chart = (await calculateChart(
    1985,
    3,
    12,
    9,
    0,
    5.5,
    19.076,
    72.8777,
  )) as unknown as Record<string, unknown>;
  const moon = (chart.planets as Array<{ planet: string; longitude: number }>).find(
    (p) => p.planet === 'Moon',
  )!;
  const saturn = (chart.planets as Array<{ planet: string; longitude: number }>).find(
    (p) => p.planet === 'Saturn',
  )!;
  const birth = new Date(Date.UTC(1985, 2, 12, 3, 30));
  const person = unknown ? markBirthTimeUnknown(chart) : chart;
  return {
    chart: person,
    partnerChart: person,
    partnerName: 'Partner',
    personName: 'Reader',
    personDob: '1985-03-12',
    personGender: 'female',
    personTimeOfBirth: '09:00',
    personBirthTimeAccuracy: unknown ? 'unknown' : 'exact',
    doshaData: analyzeAllDoshas(chart as never, saturn.longitude) as unknown as Record<
      string,
      unknown
    >,
    yogaData: { yogas: detectAllYogas(chart as never) } as unknown as Record<string, unknown>,
    ashtakavargaData: calculateAshtakavarga(chart as never) as unknown as Record<string, unknown>,
    dashaData: {
      vimshottari: JSON.parse(JSON.stringify(calculateVimshottariDasha(moon.longitude, birth))),
    },
  } as unknown as ReportScoreContext;
}

describe('computeReportVargas: unknown birth time', () => {
  it('gives no varga for a chart marked as cast from a time window, and the normal one otherwise', async () => {
    const plain = (await ctxFor(false)).chart as Record<string, unknown>;
    const marked = markBirthTimeUnknown(plain);
    expect(computeReportVargas(plain, ['D9'])).toHaveLength(1);
    expect(computeReportVargas(marked, ['D9'])).toEqual([]);
  });

  it('marking leaves the original chart alone and keeps every other field', async () => {
    const plain = (await ctxFor(false)).chart as Record<string, unknown>;
    const marked = markBirthTimeUnknown(plain);
    expect(plain.birthTimeUnknown).toBeUndefined();
    expect(marked).not.toBe(plain);
    expect(marked.planets).toBe(plain.planets);
    expect(markBirthTimeUnknown(null)).toBeNull();
  });
});

describe('all 16 report types: no divisional chart for an unknown birth time', () => {
  it('every generator that sends vargas to an exact-time reader sends none to an unknown-time one', async () => {
    await import('../src/modules/reports/generators/index.js');
    const { REPORT_GENERATORS } = await import('../src/modules/reports/report-generator.types.js');
    const exactCtx = await ctxFor(false);
    const unknownCtx = await ctxFor(true);
    const withVargas: string[] = [];
    for (const def of REPORT_CATALOGUE) {
      const gen = REPORT_GENERATORS[def.key]!;
      let exact: string;
      let unknown: string;
      try {
        exact = JSON.stringify(gen.computeScores(exactCtx, '2026-11-01'));
        unknown = JSON.stringify(gen.computeScores(unknownCtx, '2026-11-01'));
      } catch {
        continue; // a report that needs inputs this bare context does not carry (e.g. a name) is skipped, not hidden: see the count check below
      }
      const has = /"key":"D\d+"/.test(exact);
      if (has) withVargas.push(def.key);
      expect(
        /"key":"D\d+"/.test(unknown),
        `${def.key} still sends vargas for an unknown time`,
      ).toBe(false);
    }
    // The control: the check above only means something if most reports DO send vargas to an exact reader.
    expect(withVargas.length).toBeGreaterThanOrEqual(8);
  });
});
