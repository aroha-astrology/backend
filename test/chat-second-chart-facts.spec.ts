import { describe, expect, it, vi } from 'vitest';
import type { GroundingSource } from '../src/lib/chat-grounding.js';
import type { BirthProfileRow } from '../src/db/schema.js';

const state = vi.hoisted(() => ({
  getBirthProfile: vi.fn(),
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.service.js', () => ({
  getBirthProfile: state.getBirthProfile,
}));

// buildSecondChartFacts is imported AFTER the mock above so it picks up the
// mocked getBirthProfile — computeMetrology/calculateAshtakoota/
// detectMangalDosha run for real (deterministic astro-engine math, same
// pattern as test/astro-engine.spec.ts), only the DB lookup is mocked.
const { buildSecondChartFacts } = await import('../src/modules/astro/astro.service.js');

function makeProfile(overrides: Partial<BirthProfileRow>): BirthProfileRow {
  const now = new Date();
  return {
    id: 'profile-1',
    ownerUserId: 'user-1',
    relationship: 'partner',
    displayName: 'Test Person',
    gender: null,
    dateOfBirth: '1992-08-15',
    timeOfBirth: '14:20',
    placeOfBirth: { name: 'Delhi, India', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' },
    birthTimeAccuracy: null,
    birthTimeSource: null,
    birthLocationAccuracy: null,
    gotra: null,
    addedWithConsent: true,
    notes: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

// A real chart-shaped Moon placement for "the user's own chart" side, same
// minimal shape chat-grounding.ts's getPlanets() reads.
function userChart(): GroundingSource {
  return {
    chart: {
      planets: [{ planet: 'Moon', sign: 'Cancer', signIndex: 3, house: 4, nakshatraIndex: 6 }],
    },
    dasha: null,
    yogas: null,
    doshas: null,
    ashtakavarga: null,
  };
}

describe('buildSecondChartFacts — partner synastry', () => {
  it('returns a real Ashtakoota reading citing the actual Guna score', async () => {
    state.getBirthProfile.mockResolvedValueOnce(makeProfile({ relationship: 'partner' }));

    const facts = await buildSecondChartFacts('user-1', userChart(), 'profile-1');

    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain('Real Ashtakoota synastry reading');
    expect(facts[0]).toContain('Test Person');
    expect(facts[0]).toMatch(/total Guna score [\d.]+\/36/);
    expect(facts[0]).toMatch(/Nadi Dosha (PRESENT|not present)/);
    expect(facts[0]).toMatch(/Bhakoot Dosha (PRESENT|not present)/);
    expect(facts[0]).toMatch(/Mangal Dosha:/);
  }, 20_000);

  it('treats spouse and prospective_match the same as partner', async () => {
    state.getBirthProfile.mockResolvedValueOnce(makeProfile({ relationship: 'spouse' }));
    const facts = await buildSecondChartFacts('user-1', userChart(), 'profile-1');
    expect(facts[0]).toContain('Real Ashtakoota synastry reading');
  }, 20_000);
});

describe('buildSecondChartFacts — child', () => {
  it("returns the child's own chart snapshot, not synastry", async () => {
    state.getBirthProfile.mockResolvedValueOnce(
      makeProfile({ relationship: 'child', displayName: 'My Kid' }),
    );

    const facts = await buildSecondChartFacts('user-1', userChart(), 'profile-1');

    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain('Chart snapshot for your child');
    expect(facts[0]).toContain('My Kid');
    expect(facts[0]).toMatch(/Ascendant \w+/);
    expect(facts[0]).toMatch(/Moon Sign \w+/);
    expect(facts[0]).not.toContain('Guna score');
  }, 20_000);
});

describe('buildSecondChartFacts — other relationships', () => {
  it('returns a generic chart snapshot for a sibling profile', async () => {
    state.getBirthProfile.mockResolvedValueOnce(
      makeProfile({ relationship: 'sibling', displayName: 'My Sibling' }),
    );

    const facts = await buildSecondChartFacts('user-1', userChart(), 'profile-1');

    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain('Chart snapshot for saved profile');
    expect(facts[0]).toContain('My Sibling');
  }, 20_000);
});

describe('buildSecondChartFacts — missing birth details', () => {
  it('degrades to a plain-text notice instead of throwing', async () => {
    state.getBirthProfile.mockResolvedValueOnce(
      makeProfile({ dateOfBirth: null, timeOfBirth: null, placeOfBirth: null }),
    );

    const facts = await buildSecondChartFacts('user-1', userChart(), 'profile-1');

    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain('no exact birth details on file');
  });
});
