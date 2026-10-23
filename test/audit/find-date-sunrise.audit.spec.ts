import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/modules/kundli/kundli.repo.js', () => ({ findKundliByUserId: vi.fn() }));
vi.mock('../../src/modules/insights/insights.service.js', () => ({ loadChartContext: vi.fn() }));
vi.mock('../../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: vi.fn(),
}));
vi.mock('../../src/modules/pass/pass.repo.js', () => ({ findActivePass: vi.fn() }));
vi.mock('../../src/modules/decisions/decisions.repo.js', () => ({
  insertDecisionQuery: vi.fn(),
  findDecisionQuery: vi.fn(),
  listDecisionQueries: vi.fn(),
}));

import {
  buildResult,
  daySkies,
  sunTimesFor,
} from '../../src/modules/decisions/decisions.service.js';
import { MUHURTA_SPECS } from '../../src/lib/astro-tools/muhurta-rules.js';
import { calculateFullPanchangAsync } from '../../src/lib/astro-engine/panchang/index.js';

// =============================================================================
// Audit item PN1, remainder (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// Find My Date took the Rahu Kaal, Abhijit and Choghadiya of its best days
// from the rough sunrise formula, while the Panchang screen now uses the real
// sunrise (pinned to almanac times in panchang.audit.spec.ts). The two must
// give the same Rahu Kaal for the same day and place.
// =============================================================================

describe('[PN1] Find My Date uses the same sunrise as the Panchang', () => {
  it('Delhi, week of 27 July 2026: each best day carries the Panchang’s Rahu Kaal', async () => {
    const place = { lat: 28.6139, lon: 77.209 };
    const skies = await daySkies('2026-07-27', 7, 5.5, null, place);
    const sunTimes = await sunTimesFor(
      skies.map((s) => s.date),
      place,
      5.5,
    );
    const result = buildResult({
      mode: 'muhurta',
      spec: Object.values(MUHURTA_SPECS)[0]!,
      skies,
      place,
      tzHours: 5.5,
      approximateBirthTime: false,
      sunTimes,
    });

    expect(result.best.length).toBeGreaterThan(0);
    for (const day of result.best) {
      const sky = skies.find((s) => s.date === day.date)!;
      const [y, m, d] = day.date.split('-').map(Number);
      const panchang = await calculateFullPanchangAsync(
        new Date(y!, m! - 1, d, 12),
        place.lat,
        place.lon,
        sky.planets.find((p) => p.planet === 'Sun')!.longitude,
        sky.planets.find((p) => p.planet === 'Moon')!.longitude,
        5.5,
      );
      expect(day.rahuKaal, day.date).toEqual(panchang.rahuKaal);
    }
  }, 120_000);
});
