import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { calculateVimshottariDasha } from '../src/lib/astro-engine/dashas/vimshottari.js';
import type { KundliRow } from '../src/db/schema.js';
import { makeUserRow } from './helpers/mocks.js';

const chart = vi.hoisted((): { kundli: unknown } => ({ kundli: null }));
const state = vi.hoisted(() => ({
  chartReady: true,
  pass: true,
  insertDecisionQuery: vi.fn(),
  findDecisionQuery: vi.fn(),
  listDecisionQueries: vi.fn(),
}));

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: () => Promise.resolve(chart.kundli),
}));
vi.mock('../src/modules/insights/insights.service.js', async () => {
  const { buildChartContext: build } = await import('../src/lib/intelligence/chart-context.js');
  const { makeProfileContext: profile } = await import('./helpers/mocks.js');
  return {
    loadChartContext: async (_user: unknown, asOf: Date = new Date()) => {
      if (!state.chartReady) return null;
      const p = profile({
        birthTimeAccuracy: 'exact',
        placeOfBirth: { name: 'Delhi', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' },
      });
      const ctx = await build(chart.kundli as KundliRow, p, asOf);
      return ctx ? { profile: p, ctx } : null;
    },
  };
});
vi.mock('../src/modules/birth-profiles/profile-context.js', async () => {
  const { makeProfileContext: profile } = await import('./helpers/mocks.js');
  return { resolveActiveProfileContext: () => Promise.resolve(profile()) };
});
vi.mock('../src/modules/pass/pass.repo.js', () => ({
  findActivePass: () => Promise.resolve(state.pass ? { id: 'pass-1' } : null),
}));
vi.mock('../src/modules/decisions/decisions.repo.js', () => ({
  insertDecisionQuery: state.insertDecisionQuery,
  findDecisionQuery: state.findDecisionQuery,
  listDecisionQueries: state.listDecisionQueries,
}));

import {
  daySkies,
  getDecision,
  listDecisions,
  runDecision,
  runFindDate,
} from '../src/modules/decisions/decisions.service.js';

const PUNE = { name: 'Pune', lat: 18.5204, lon: 73.8567, tz: 'Asia/Kolkata' };

beforeEach(async () => {
  state.chartReady = true;
  state.pass = true;
  state.findDecisionQuery.mockReset().mockResolvedValue(undefined);
  state.listDecisionQueries.mockReset().mockResolvedValue([]);
  state.insertDecisionQuery
    .mockReset()
    .mockImplementation((v: Record<string, unknown>) =>
      Promise.resolve({ ...v, id: 'q-1', createdAt: new Date('2026-09-24T00:00:00Z') }),
    );
  if (!chart.kundli) {
    const natal = await calculateChart(1990, 5, 15, 14, 30, 5.5, 28.6139, 77.209, 'lahiri', 'W');
    const moon = natal.planets.find((p) => p.planet === 'Moon')!;
    const vimshottari = calculateVimshottariDasha(
      moon.longitude,
      new Date(Date.UTC(1990, 4, 15, 9, 0)),
    );
    chart.kundli = {
      status: 'ready',
      chartData: JSON.parse(JSON.stringify(natal)),
      dashaData: JSON.parse(JSON.stringify({ vimshottari, yogini: {} })),
      ayanamsa: 'lahiri',
      houseSystem: 'W',
      nodeType: 'mean',
      calculationVersion: '2026.08.1',
      generatedAt: new Date(),
    };
  }
});

describe('daySkies', () => {
  it("reads each day's weekday, tithi and nakshatra at local noon and marks eclipse days", async () => {
    const skies = await daySkies('2026-08-10', 20, 5.5, 'lahiri');
    expect(skies).toHaveLength(20);
    expect(skies[0]).toMatchObject({ date: '2026-08-10', weekday: 1 });
    const byDate = new Map(skies.map((s) => [s.date, s]));
    // 12 Aug 2026 total solar eclipse (new moon); 28 Aug partial lunar eclipse.
    expect(byDate.get('2026-08-12')).toMatchObject({ eclipse: 'solar', tithi: 30 });
    expect(byDate.get('2026-08-28')?.eclipse).toBe('lunar');
    expect(skies.filter((s) => s.eclipse)).toHaveLength(2);
    for (const s of skies) {
      expect(s.tithi).toBeGreaterThanOrEqual(1);
      expect(s.tithi).toBeLessThanOrEqual(30);
      expect(s.nakshatraIndex).toBeGreaterThanOrEqual(0);
      expect(s.nakshatraIndex).toBeLessThanOrEqual(26);
    }
  }, 60_000);
});

describe('runFindDate', () => {
  const input = { category: 'vehicle' as const, place: PUNE, from: '2026-10-01', days: 30 };

  it('stores the scored result', async () => {
    const res = await runFindDate(makeUserRow({ walletBalancePaise: 0 }), input);

    expect(state.insertDecisionQuery).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'muhurta', category: 'vehicle', pricePaidPaise: 0 }),
    );
    expect(res.days).toHaveLength(30);
    expect(res.from).toBe('2026-10-01');
    expect(res.to).toBe('2026-10-30');
    expect(res.personal).toBe(true);
    expect(res.place).toEqual(PUNE);
    expect(res.best.length).toBeGreaterThan(0);
    for (const b of res.best) {
      expect(b.score).toBeGreaterThanOrEqual(62);
      expect(b.why.length).toBeGreaterThan(0);
    }
    expect(res.best.some((b) => b.time !== null)).toBe(true);
  }, 60_000);

  it('works from the panchang alone while the chart is not ready', async () => {
    state.chartReady = false;
    const res = await runFindDate(makeUserRow({ walletBalancePaise: 50_000 }), input);
    expect(res.personal).toBe(false);
    expect(res.days).toHaveLength(30);
  }, 60_000);

  it('is Aroha Pass only, and never touches the wallet', async () => {
    state.pass = false;
    await expect(runFindDate(makeUserRow({ walletBalancePaise: 50_000 }), input)).rejects.toThrow(
      'PASS_REQUIRED',
    );
    expect(state.insertDecisionQuery).not.toHaveBeenCalled();
  });
});

describe('saved results', () => {
  it('are Aroha Pass only', async () => {
    state.pass = false;
    await expect(listDecisions(makeUserRow(), undefined)).rejects.toThrow('PASS_REQUIRED');
    await expect(
      getDecision(makeUserRow(), '11111111-1111-4111-8111-111111111111'),
    ).rejects.toThrow('PASS_REQUIRED');
  });

  it('list with the Pass', async () => {
    await expect(listDecisions(makeUserRow(), 'muhurta')).resolves.toEqual({ items: [] });
  });
});

describe('runDecision', () => {
  it('needs the chart', async () => {
    state.chartReady = false;
    await expect(
      runDecision(makeUserRow({ walletBalancePaise: 50_000 }), {
        category: 'careerChange',
        from: '2026-10-01',
        days: 30,
      }),
    ).rejects.toThrow('CHART_NOT_READY');
    expect(state.insertDecisionQuery).not.toHaveBeenCalled();
  });

  it('is Aroha Pass only', async () => {
    state.pass = false;
    await expect(
      runDecision(makeUserRow({ walletBalancePaise: 50_000 }), {
        category: 'careerChange',
        from: '2026-10-01',
        days: 30,
      }),
    ).rejects.toThrow('PASS_REQUIRED');
  });

  it('scores the range with the dasha behind it and stores it', async () => {
    const res = await runDecision(makeUserRow(), {
      category: 'careerChange',
      question: '  Should I switch jobs?  ',
      from: '2026-10-01',
      days: 60,
    });
    expect(state.insertDecisionQuery).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'decision', pricePaidPaise: 0 }),
    );
    expect(res.question).toBe('Should I switch jobs?');
    expect(res.days).toHaveLength(60);
    expect(res.personal).toBe(true);
    expect(res.approximateBirthTime).toBe(false);
    const whyKinds = new Set(res.best.flatMap((b) => b.why.map((f) => f.kind)));
    expect(whyKinds.has('dasha') || whyKinds.has('lordship') || whyKinds.has('house')).toBe(true);
    for (const w of res.windows) expect(w.start <= w.end).toBe(true);
  }, 60_000);
});
