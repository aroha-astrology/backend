import { describe, it, expect } from 'vitest';
import { buildKarmicProfile } from '../src/lib/astro-engine/lalkitab/karmicProfile.js';
import { karmicProfileFacts } from '../src/lib/chat-grounding.js';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';

describe('buildKarmicProfile (real chart, end-to-end wiring)', () => {
  it('assembles debts + Pakka Ghar placements + blind planets from a real chart', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const profile = buildKarmicProfile(chart);

    expect(Array.isArray(profile.presentDebts)).toBe(true);
    expect(Array.isArray(profile.pakkaGharPlacements)).toBe(true);
    expect(Array.isArray(profile.blindPlanets)).toBe(true);
    // Pakka Ghar is evaluated for all 9 classical+node planets.
    expect(profile.pakkaGharPlacements.length).toBeGreaterThan(0);
  });

  it('only returns debts that are actually PRESENT (present:true), never the full always-checked list', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const profile = buildKarmicProfile(chart);
    expect(profile.presentDebts.every((d) => d.present)).toBe(true);
  });

  it('only returns planets that are actually blind or half-blind', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const profile = buildKarmicProfile(chart);
    expect(profile.blindPlanets.every((p) => p.isBlind || p.isHalfBlind)).toBe(true);
  });
});

describe('karmicProfileFacts (chat-grounding wiring)', () => {
  it('returns facts for a real, well-formed chart', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const facts = karmicProfileFacts(chart as unknown as Record<string, unknown>);
    expect(Array.isArray(facts)).toBe(true);
    // At minimum, Pakka Ghar placements are near-universally non-empty for a
    // real chart (9 planets across 12 houses usually lands at least one).
  });

  it('returns an empty array (never throws) for null chart', () => {
    expect(karmicProfileFacts(null)).toEqual([]);
  });

  it('returns an empty array (never throws) for a malformed chart missing houses/planets', () => {
    expect(karmicProfileFacts({})).toEqual([]);
    expect(karmicProfileFacts({ planets: [] })).toEqual([]);
  });

  it('every debt fact names the debt type and includes a remedy', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const facts = karmicProfileFacts(chart as unknown as Record<string, unknown>);
    const debtFacts = facts.filter((f) => f.startsWith('Karmic debt present'));
    for (const f of debtFacts) {
      expect(f).toContain('Remedy:');
    }
  });
});
