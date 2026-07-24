import { describe, it, expect } from 'vitest';
import { buildMatchRecommendation } from '../src/modules/astro/astro.service.js';
import type { MangalDosha } from '@aroha-astrology/shared';

// buildMatchRecommendation must treat a dosha that is raw-present but
// classically cancelled (own sign, Jupiter aspect, a documented house+sign
// exception, etc.) as NOT actively Manglik when deciding whether two charts
// mismatch — the bug this covers: the live matchmaking screen used to flag a
// classically-cancelled Mangal Dosha as an active mismatch against a clean
// partner (exactly the scenario from the reference screenshot: a boy whose
// Mars-in-Aries-1st-house dosha is cancelled should read as "compatible",
// not as an asymmetric red flag).

function mangal(overrides: Partial<MangalDosha>): MangalDosha {
  return {
    present: false,
    severity: 'none',
    percentage: 0,
    fromLagna: false,
    fromMoon: false,
    fromVenus: false,
    marsHouseFromLagna: 0,
    marsHouseFromMoon: 0,
    marsHouseFromVenus: 0,
    cancellations: [],
    type: 'none',
    description: '',
    ...overrides,
  };
}

const clean = mangal({});
const active = mangal({
  present: true,
  severity: 'mild',
  type: 'partial',
  fromLagna: true,
  marsHouseFromLagna: 8,
  description:
    'Mars in house 8 afflicts your Lagna, forming a partial Mangal Dosha (1 of 3 reference points affected).',
});
const cancelled = mangal({
  present: true,
  severity: 'none',
  type: 'cancelled',
  fromLagna: true,
  marsHouseFromLagna: 8,
  cancellations: ['Mars in own sign Scorpio - cancellation applies'],
  description:
    'Mars sits in house 8 from your Lagna, which would normally form Mangal Dosha, but Mars in own sign Scorpio — a classical cancellation that substantially neutralizes its effect.',
});

const flagsClear = { nadiDosha: false, bhakootDosha: false };
const flagsNadi = { nadiDosha: true, bhakootDosha: false };

describe('buildMatchRecommendation — Mangal Dosha cancellation awareness', () => {
  it('reads a classically-cancelled dosha vs. a clean partner as compatible, not a mismatch', () => {
    const rec = buildMatchRecommendation(20, 36, flagsClear, cancelled, clean);
    expect(rec.toLowerCase()).not.toContain('asymmetry');
    expect(rec.toLowerCase()).not.toContain('mismatch');
  });

  it('flags a real mismatch when one partner is actively Manglik and the other is clean', () => {
    const rec = buildMatchRecommendation(20, 36, flagsClear, active, clean);
    expect(rec.toLowerCase()).toContain('only one');
  });

  it('flags a real mismatch when one is actively Manglik and the other is cancelled (not just present-vs-absent)', () => {
    const rec = buildMatchRecommendation(20, 36, flagsClear, active, cancelled);
    expect(rec.toLowerCase()).toContain('only one');
  });

  it('reads both actively Manglik as mutually self-cancelling', () => {
    const rec = buildMatchRecommendation(20, 36, flagsClear, active, active);
    expect(rec.toLowerCase()).toContain('self-cancelling');
  });

  it('does not describe both-cancelled charts as a mutual-cancellation mismatch case', () => {
    const rec = buildMatchRecommendation(20, 36, flagsClear, cancelled, cancelled);
    expect(rec.toLowerCase()).not.toContain('only one');
  });

  it('still surfaces Nadi Dosha regardless of Mangal status', () => {
    const rec = buildMatchRecommendation(20, 36, flagsNadi, clean, clean);
    expect(rec).toContain('Nadi Dosha is present');
  });

  it('falls back to a score-based verdict when nothing is flagged and no Mangal Dosha exists at all', () => {
    const rec = buildMatchRecommendation(30, 36, flagsClear, clean, clean);
    expect(rec.toLowerCase()).toContain('guna score is strong');
  });
});
