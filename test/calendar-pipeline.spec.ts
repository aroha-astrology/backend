import { describe, expect, it, vi } from 'vitest';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { calculateVimshottariDasha } from '../src/lib/astro-engine/dashas/vimshottari.js';
import { buildChartContext } from '../src/lib/intelligence/chart-context.js';
import { makeProfileContext, makeUserRow } from './helpers/mocks.js';
import type { KundliRow } from '../src/db/schema.js';

const state = vi.hoisted((): { kundli: unknown } => ({ kundli: null }));

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: () => Promise.resolve(state.kundli),
}));
vi.mock('../src/modules/insights/insights.service.js', async () => {
  const { buildChartContext: build } = await import('../src/lib/intelligence/chart-context.js');
  const { makeProfileContext: profile } = await import('./helpers/mocks.js');
  return {
    loadChartContext: async (_user: unknown, asOf: Date) => {
      const p = profile({
        placeOfBirth: { name: 'Delhi', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' },
      });
      const ctx = await build(state.kundli as KundliRow, p, asOf);
      return ctx ? { profile: p, ctx } : null;
    },
  };
});

import { getCalendar } from '../src/modules/insights/calendar.service.js';

describe('getCalendar on a real chart', () => {
  it('merges every source into one date-ordered list for the range', async () => {
    const chart = await calculateChart(1990, 5, 15, 14, 30, 5.5, 28.6139, 77.209, 'lahiri', 'W');
    const moon = chart.planets.find((p) => p.planet === 'Moon')!;
    const vimshottari = calculateVimshottariDasha(
      moon.longitude,
      new Date(Date.UTC(1990, 4, 15, 9, 0)),
    );
    state.kundli = {
      status: 'ready',
      chartData: JSON.parse(JSON.stringify(chart)),
      dashaData: JSON.parse(JSON.stringify({ vimshottari, yogini: {} })),
      ayanamsa: 'lahiri',
      houseSystem: 'W',
      nodeType: 'mean',
      calculationVersion: '2026.08.1',
      generatedAt: new Date(),
    };
    expect(await buildChartContext(state.kundli as KundliRow, makeProfileContext())).not.toBeNull();

    const cal = await getCalendar(makeUserRow(), '2026-08-01', 60);

    expect(cal.from).toBe('2026-08-01');
    expect(cal.to).toBe('2026-09-29');
    const kinds = new Set(cal.events.map((e) => e.kind));
    for (const kind of ['ingress', 'eclipse', 'festival', 'moonSign'] as const)
      expect(kinds.has(kind)).toBe(true);
    for (let i = 1; i < cal.events.length; i++) {
      expect(cal.events[i]!.date >= cal.events[i - 1]!.date).toBe(true);
    }
    expect(cal.events.every((e) => e.date >= '2026-08-01' && e.date <= '2026-09-29')).toBe(true);
    expect(new Set(cal.events.map((e) => e.id)).size).toBe(cal.events.length);
  }, 180_000);
});
