import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({ findKundliByUserId: vi.fn() }));
vi.mock('../src/modules/insights/insights.service.js', () => ({ loadChartContext: vi.fn() }));
vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: vi.fn(),
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({ findActivePass: vi.fn() }));
vi.mock('../src/modules/decisions/decisions.repo.js', () => ({
  insertDecisionQuery: vi.fn(),
  findDecisionQuery: vi.fn(),
  listDecisionQueries: vi.fn(),
}));

import { daySkies } from '../src/modules/decisions/decisions.service.js';

// =============================================================================
// Decide avoids only an eclipse that is a Grahan where the user lives (owner, 2026-11-09)
// =============================================================================
// Decide used to mark every eclipse day as one to avoid, wherever on Earth it happened and even when it
// was only penumbral. Penumbral eclipses (Upachchaya) are not observed and carry no Sutak, and an eclipse
// below the horizon is not seen at all. 2027 from Delhi: 21 Feb and 18 Jul are penumbral, 6 Feb and 17 Aug
// are not visible, and 2 Aug is the only Grahan.
// =============================================================================

const DELHI = { lat: 28.6139, lon: 77.209 };
const SYDNEY = { lat: -33.87, lon: 151.21 };
const eclipseOn = async (date: string, tz: number, place: { lat: number; lon: number }) =>
  (await daySkies(date, 1, tz, null, place))[0]!.eclipse;

describe('Decide: which eclipse days to avoid', () => {
  it('Delhi, 21 Feb 2027: a penumbral lunar eclipse is not an avoid day', async () => {
    expect(await eclipseOn('2027-02-21', 5.5, DELHI)).toBeUndefined();
  }, 120_000);

  it('Delhi, 6 Feb 2027: an annular solar eclipse that India never sees is not an avoid day', async () => {
    expect(await eclipseOn('2027-02-06', 5.5, DELHI)).toBeUndefined();
  }, 120_000);

  it('Delhi, 17 Aug 2027: a penumbral eclipse with the Moon below the horizon is not an avoid day', async () => {
    expect(await eclipseOn('2027-08-17', 5.5, DELHI)).toBeUndefined();
  }, 120_000);

  it('Delhi, 2 Aug 2027: the solar eclipse seen as a Grahan stays an avoid day', async () => {
    expect(await eclipseOn('2027-08-02', 5.5, DELHI)).toBe('solar');
  }, 120_000);

  it('Sydney, 2 Aug 2027: the same eclipse is not seen there, so it is not an avoid day', async () => {
    expect(await eclipseOn('2027-08-02', 10, SYDNEY)).toBeUndefined();
  }, 120_000);
});
