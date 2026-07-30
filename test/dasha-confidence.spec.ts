import { describe, expect, it } from 'vitest';
import {
  scoreDomainWindows,
  DOMAIN_CONFIG,
  type Domain,
} from '../src/lib/astro-engine/dasha-confidence.js';
import { findFavorableWindows } from '../src/lib/dasha-window.js';

/** Same synthetic mahadasha builder as dasha-window.spec.ts. */
function makeDasha(now: Date) {
  const planets = ['Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus'];
  const years: Record<string, number> = {
    Sun: 6,
    Moon: 10,
    Mars: 7,
    Rahu: 18,
    Jupiter: 16,
    Saturn: 19,
    Mercury: 17,
    Ketu: 7,
    Venus: 20,
  };
  let cursor = new Date(now.getTime());
  const mahadashas = planets.map((planet) => {
    const startDate = new Date(cursor.getTime());
    const endDate = new Date(cursor.getTime() + years[planet]! * 365.25 * 86_400_000);
    cursor = endDate;
    return {
      planet,
      startDate,
      endDate,
      isActive: false,
      level: 'mahadasha' as const,
      subPeriods: [],
    };
  });
  mahadashas[0]!.isActive = true;
  return { vimshottari: { mahadashas } };
}

const NO_TRANSITS = { saturnSignIndex: null, jupiterSignIndex: null };

describe('DOMAIN_CONFIG', () => {
  const domains: Domain[] = [
    'career',
    'love',
    'health',
    'children',
    'wealth',
    'education',
    'property',
    'vehicle',
    'siblings',
    'parents',
    'legal',
    'foreign',
    'spirituality',
    'business',
  ];

  it('has a complete, well-formed entry for every domain', () => {
    for (const domain of domains) {
      const config = DOMAIN_CONFIG[domain];
      expect(config, `missing config for ${domain}`).toBeDefined();
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.natalHouses.length).toBeGreaterThan(0);
      expect(['Saturn', 'Jupiter']).toContain(config.transitPlanet);
      expect(config.triggerHouses.length).toBeGreaterThan(0);
      expect(config.varga.length).toBeGreaterThan(0);
      for (const house of [...config.natalHouses, ...config.triggerHouses]) {
        expect(house).toBeGreaterThanOrEqual(1);
        expect(house).toBeLessThanOrEqual(12);
      }
    }
  });

  it('includes children as a domain with Jupiter as its karaka (the childbirth-hallucination fix)', () => {
    expect(DOMAIN_CONFIG.children.natalHouses).toContain(5);
    expect(DOMAIN_CONFIG.children.staticKarakas).toContain('Jupiter');
    expect(DOMAIN_CONFIG.children.varga).toBe('D7');
  });

  it('does not include longevity/death as a domain', () => {
    expect(Object.keys(DOMAIN_CONFIG)).not.toContain('longevity');
    expect(Object.keys(DOMAIN_CONFIG)).not.toContain('death');
  });
});

describe('scoreDomainWindows', () => {
  it('returns an empty windows array (not a fabricated guess) when nothing matches', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const result = scoreDomainWindows('children', ['NotAPlanet'], dasha, 0, now, NO_TRANSITS);
    expect(result.windows).toEqual([]);
  });

  it('returns an empty windows array when dasha data is missing entirely', () => {
    const result = scoreDomainWindows('children', ['Jupiter'], null, 0, new Date(), NO_TRANSITS);
    expect(result.windows).toEqual([]);
  });

  it('ranks an antardasha-level match above a chronologically-earlier pratyantardasha match', () => {
    // Same fixture as the dasha-window.spec.ts regression case: Venus is
    // antardasha #9 (last) of Sun's mahadasha AND recurs as a
    // pratyantardasha nested in every one of Sun's 9 antardashas -- the
    // pratyantardasha matches start much sooner chronologically.
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const result = scoreDomainWindows('career', ['Venus'], dasha, null, now, NO_TRANSITS);
    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.windows[0]!.dashaLevel).toBe('antardasha');
  });

  it("caps at the top 3 windows BY DEFAULT (no opts) — chat-grounding.ts's direct calls must keep this exact output size/order", () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    // Venus recurs as a pratyantardasha within every antardasha across 3
    // mahadashas -- comfortably more than 3 raw candidates. Without opting
    // into ensureNearTermAnchor, the near-term-rescue below must NOT engage
    // — chat-grounding.ts scores up to ~14 domains per request and would
    // otherwise see its prompt grow domain-by-domain (see
    // test/verify-chat-fix.spec.ts's prompt-size ceiling).
    const result = scoreDomainWindows('wealth', ['Venus'], dasha, null, now, NO_TRANSITS);
    expect(result.windows.length).toBeLessThanOrEqual(3);
  });

  it('with ensureNearTermAnchor, caps at 3 plus at most one rescued near-term anchor', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const result = scoreDomainWindows(
      'wealth',
      ['Venus'],
      dasha,
      null,
      now,
      NO_TRANSITS,
      undefined,
      { ensureNearTermAnchor: true },
    );
    expect(result.windows.length).toBeLessThanOrEqual(4);
  });

  it('with ensureNearTermAnchor, always includes the window nearest to now, even when tier/score ranking would otherwise exclude it', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    // Independently recompute the true nearest-to-now candidate from the SAME raw
    // pre-truncation search scoreDomainWindows runs internally (findFavorableWindows with the
    // same significators/lookahead), rather than trusting scoreDomainWindows' own output for
    // this -- otherwise this test could pass vacuously.
    const rawCandidates = findFavorableWindows(dasha, ['Venus'], now, 3, 8);
    expect(rawCandidates.length).toBeGreaterThan(3); // sanity: truncation is actually exercised
    const nowMs = now.getTime();
    const nearest = rawCandidates.reduce((best, w) => {
      const d = Math.abs(new Date(w.startDate).getTime() - nowMs);
      const bestD = Math.abs(new Date(best.startDate).getTime() - nowMs);
      return d < bestD ? w : best;
    });

    const result = scoreDomainWindows(
      'wealth',
      ['Venus'],
      dasha,
      null,
      now,
      NO_TRANSITS,
      undefined,
      { ensureNearTermAnchor: true },
    );
    expect(
      result.windows.some(
        (w) => w.startDate === nearest.startDate && w.endDate === nearest.endDate,
      ),
    ).toBe(true);
  });

  it('without ensureNearTermAnchor (default), the near-term anchor is NOT guaranteed — demonstrates the flag actually gates the behavior', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const rawCandidates = findFavorableWindows(dasha, ['Venus'], now, 3, 8);
    const nowMs = now.getTime();
    const nearest = rawCandidates.reduce((best, w) => {
      const d = Math.abs(new Date(w.startDate).getTime() - nowMs);
      const bestD = Math.abs(new Date(best.startDate).getTime() - nowMs);
      return d < bestD ? w : best;
    });

    const result = scoreDomainWindows('wealth', ['Venus'], dasha, null, now, NO_TRANSITS);
    expect(
      result.windows.some(
        (w) => w.startDate === nearest.startDate && w.endDate === nearest.endDate,
      ),
    ).toBe(false);
  });

  it('does not credit transit alignment for a window far beyond the ~13-month relevance horizon', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    // Venus's antardasha-level window here starts ~5 years out -- transit
    // alignment must not be scored against "today's" transit for it, even
    // when a transit IS supplied (as opposed to the NO_TRANSITS cases above,
    // which never exercise this branch at all).
    const transits = { saturnSignIndex: 3, jupiterSignIndex: 5 };
    const result = scoreDomainWindows('career', ['Venus'], dasha, 0, now, transits);
    const farWindow = result.windows.find((w) => w.dashaLevel === 'antardasha');
    expect(farWindow).toBeDefined();
    expect(farWindow!.reasoning.some((r) => r.includes('too far out'))).toBe(true);
  });
});
