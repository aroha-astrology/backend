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
import { avoidFlags } from '../src/lib/astro-tools/decision-engine.js';
import { DECISION_SPECS } from '../src/lib/astro-tools/muhurta-rules.js';

// =============================================================================
// Decide reads drikpanchang's published Shukra/Guru Asta dates for marriage (owner, 2026-11-09)
// =============================================================================
// Muhurat blocking follows drikpanchang's Tara Asta dates (config/asta-dates.ts), not the fixed Surya
// Siddhanta orb. 2027: the orb has Venus combust from 6 Jul, drikpanchang's Venus Tara Asta starts on 21 Jul
// at 05:08 IST. So 10 Jul is open for a wedding, 1 Aug is not. A year the table does not cover keeps the orb.
// =============================================================================

const DELHI = { lat: 28.6139, lon: 77.209 };
const marriageFlags = async (date: string) => {
  const [day] = await daySkies(date, 1, 5.5, null, DELHI);
  return avoidFlags(day!, DECISION_SPECS.marriage);
};

describe('Decide: Venus and Jupiter Asta for a wedding', () => {
  it('10 Jul 2027 is not an Asta day (inside the orb, before drikpanchang\'s Venus Asta)', async () => {
    expect(await marriageFlags('2027-07-10')).not.toContain('combust');
  }, 120_000);

  it('21 Jul 2027 is an Asta day (drikpanchang: Venus Tara Asta from 05:08 IST)', async () => {
    expect(await marriageFlags('2027-07-21')).toContain('combust');
  }, 120_000);

  it('15 Sep 2027 is open again (Venus rose 9 Sep, Jupiter 13 Sep), though the orb still has Venus combust', async () => {
    expect(await marriageFlags('2027-09-15')).not.toContain('combust');
  }, 120_000);

  it('a year the table does not cover falls back to the orb: Venus is within 10 degrees on 2 Jun 2028', async () => {
    expect(await marriageFlags('2028-06-02')).toContain('combust');
  }, 120_000);
});
