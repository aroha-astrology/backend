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

import { daySkies } from '../../src/modules/decisions/decisions.service.js';

// =============================================================================
// Decide and Find My Date read a day's tithi at sunrise, like the Panchang
// =============================================================================
// The Panchang screen moved to the sunrise tithi on 2026-10-16. Decide still read
// the sky at local noon, so on a day whose tithi changes in the morning the two
// screens named different tithis for the same date. 8 Nov 2026 at Delhi: the
// sunrise tithi is Chaturdashi (29); Amavasya (30) begins before noon.
// =============================================================================

describe('Decide reads the day at sunrise', () => {
  it('Delhi, 8 Nov 2026: Chaturdashi, not the Amavasya that starts before noon', async () => {
    const [day] = await daySkies('2026-11-08', 1, 5.5, null, { lat: 28.6139, lon: 77.209 });
    expect(day!.tithi).toBe(29);
  }, 60_000);
});
