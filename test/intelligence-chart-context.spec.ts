import { describe, expect, it } from 'vitest';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { calculateVimshottariDasha } from '../src/lib/astro-engine/dashas/vimshottari.js';
import { buildChartContext } from '../src/lib/intelligence/chart-context.js';
import { makeProfileContext } from './helpers/mocks.js';
import type { KundliRow } from '../src/db/schema.js';

/** A real chart, stored the way kundli.service.ts stores it (through JSON). */
async function makeKundli(): Promise<KundliRow> {
  const chart = await calculateChart(1990, 5, 15, 14, 30, 5.5, 28.6139, 77.209, 'lahiri', 'W');
  const moon = chart.planets.find((p) => p.planet === 'Moon')!;
  const vimshottari = calculateVimshottariDasha(
    moon.longitude,
    new Date(Date.UTC(1990, 4, 15, 9, 0)),
  );
  return {
    status: 'ready',
    chartData: JSON.parse(JSON.stringify(chart)) as Record<string, unknown>,
    dashaData: JSON.parse(JSON.stringify({ vimshottari, yogini: {} })) as Record<string, unknown>,
    ayanamsa: 'lahiri',
    houseSystem: 'W',
    nodeType: 'mean',
    calculationVersion: '2026.08.1',
    generatedAt: new Date('2026-09-01T00:00:00Z'),
  } as unknown as KundliRow;
}

describe('buildChartContext', () => {
  it('assembles natal placements, lords, the running dasha and live transits', async () => {
    const kundli = await makeKundli();
    const profile = makeProfileContext({
      placeOfBirth: { name: 'Delhi', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' },
      birthTimeAccuracy: 'exact',
    });
    const asOf = new Date('2026-09-24T06:30:00Z');
    const ctx = await buildChartContext(kundli, profile, asOf);

    expect(ctx).not.toBeNull();
    expect(ctx!.natal).toHaveLength(9);
    expect(Object.keys(ctx!.houseLords)).toHaveLength(12);
    expect(ctx!.transits).toHaveLength(9);
    expect(ctx!.birth).toMatchObject({ placeName: 'Delhi', timezone: 'Asia/Kolkata' });
    expect(ctx!.calculation).toMatchObject({ ayanamsa: 'lahiri', calculationVersion: '2026.08.1' });

    // The dasha chain covers asOf, and each transit's houses are consistent.
    for (const level of ['mahadasha', 'antardasha', 'pratyantardasha'] as const) {
      const period = ctx!.dasha[level]!;
      expect(new Date(period.startDate).getTime()).toBeLessThanOrEqual(asOf.getTime());
      expect(new Date(period.endDate).getTime()).toBeGreaterThan(asOf.getTime());
    }
    for (const t of ctx!.transits) {
      expect(t.houseFromLagna).toBe(((t.signIndex - ctx!.ascendantSignIndex + 12) % 12) + 1);
      expect(t.houseFromMoon).toBe(((t.signIndex - ctx!.moonSignIndex + 12) % 12) + 1);
    }
  }, 60_000);

  it('returns null for a kundli that is not ready', async () => {
    const kundli = { ...(await makeKundli()), status: 'generating' } as KundliRow;
    expect(await buildChartContext(kundli, makeProfileContext())).toBeNull();
  }, 60_000);
});
