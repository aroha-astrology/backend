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
      // Every domain needs a near-term horizon so scoreDomainWindows's
      // nearTerm path (chat/voice) never falls back to an unbounded search —
      // see scoreNearTermWindows's doc comment for why this must never be
      // decades-long (the "when will I get a job" -> 2040 production bug).
      expect(config.horizonYears).toBeGreaterThan(0);
      expect(config.horizonYears).toBeLessThanOrEqual(5);
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

  it('caps at 3 windows — chat-grounding.ts scores ~14 domains into one prompt against a hard size ceiling (test/verify-chat-fix.spec.ts)', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    // Venus recurs as a pratyantardasha within every antardasha across 3 mahadashas --
    // comfortably more than 3 raw candidates, so the truncation is genuinely exercised. The
    // near-term anchor below must SWAP into the last slot, never grow the list to 4.
    const result = scoreDomainWindows('wealth', ['Venus'], dasha, null, now, NO_TRANSITS);
    expect(result.windows.length).toBeLessThanOrEqual(3);
  });

  it('always includes the window nearest to now, even when tier/score ranking would otherwise exclude it', () => {
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

    const result = scoreDomainWindows('wealth', ['Venus'], dasha, null, now, NO_TRANSITS);
    expect(
      result.windows.some(
        (w) => w.startDate === nearest.startDate && w.endDate === nearest.endDate,
      ),
    ).toBe(true);
  });

  it('keeps the tier/score winner in slot 0 while anchoring — only the LAST slot is given up to the near-term window', () => {
    // The regression this guards: an answer to "when will I get married" that quoted only dates
    // 2-3 years out. The anchor must not cost the STRONGEST label its own tier/score winner, and
    // must not re-sort the list either.
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const result = scoreDomainWindows('wealth', ['Venus'], dasha, null, now, NO_TRANSITS);
    expect(result.windows[0]!.dashaLevel).toBe('antardasha');

    const nowMs = now.getTime();
    const soonest = Math.min(
      ...result.windows.map((w) => Math.abs(new Date(w.startDate).getTime() - nowMs)),
    );
    // Something in the list is within ~2 years of today, rather than every window being years out.
    expect(soonest).toBeLessThan(2 * 365.25 * 86_400_000);
  });

  it('does not credit transit alignment for a window far beyond the ~13-month relevance horizon', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    // Venus's antardasha-level window here starts ~5 years out -- transit
    // alignment must not be scored against "today's" transit for it, even
    // when a transit IS supplied (as opposed to the NO_TRANSITS cases above,
    // which never exercise this branch at all).
    const transits = { saturnSignIndex: 3, jupiterSignIndex: 5 };
    const withTransits = scoreDomainWindows('career', ['Venus'], dasha, 0, now, transits);
    const withoutTransits = scoreDomainWindows('career', ['Venus'], dasha, 0, now, NO_TRANSITS);

    const farWindow = withTransits.windows.find((w) => w.dashaLevel === 'antardasha');
    expect(farWindow).toBeDefined();
    // Asserted on the score, not on reasoning text: a far window earns no transit point, so
    // supplying live transits must not change its score at all versus supplying none.
    const sameFarWindow = withoutTransits.windows.find((w) => w.startDate === farWindow!.startDate);
    expect(sameFarWindow).toBeDefined();
    expect(farWindow!.score).toBe(sameFarWindow!.score);
    // And it says nothing about transit gating, which would be dead text in the chat prompt.
    expect(farWindow!.reasoning.some((r) => r.includes('Transit gating'))).toBe(false);
  });
});

describe('scoreDomainWindows({ nearTerm: true })', () => {
  it('excludes a far-future antardasha match and returns only near pratyantardasha matches, soonest first', () => {
    // Real dates from this fixture (verified independently): 'wealth' has a
    // 2-year horizonYears. Venus's antardasha-level match within Sun's
    // mahadasha starts 2031-01-01 -- 5 years out, well beyond the horizon --
    // while it also recurs as a pratyantardasha nested in Sun's own
    // antardashas at 2026-04-02, 2026-09-10, 2027-01-17 and 2027-09-23 (2028
    // and later fall outside a 2-year horizon from 2026-01-01). Unlike the
    // non-nearTerm path (see the "ranks an antardasha-level match above..."
    // test above), the far antardasha must NOT win here -- it's outside the
    // domain's own horizon and is excluded entirely, not merely outranked.
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    expect(DOMAIN_CONFIG.wealth.horizonYears).toBe(2);

    const result = scoreDomainWindows(
      'wealth',
      ['Venus'],
      dasha,
      null,
      now,
      NO_TRANSITS,
      undefined,
      {
        nearTerm: true,
      },
    );

    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.windows.length).toBeLessThanOrEqual(3);
    expect(result.windows.every((w) => w.dashaLevel === 'pratyantardasha')).toBe(true);
    expect(result.windows.map((w) => w.startDate)).toEqual([
      '2026-04-02',
      '2026-09-10',
      '2027-01-17',
    ]);
    // Soonest first -- not tier/score ranked like the non-nearTerm path.
    const starts = result.windows.map((w) => new Date(w.startDate).getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('sorts a currently-running window first, ahead of any upcoming one', () => {
    // Sun's mahadasha opens with Sun's own antardasha (see dasha-window.spec.ts's
    // identical fixture fact), so with significator ['Sun'] the very first
    // result is already running at `now` itself.
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);

    const result = scoreDomainWindows('career', ['Sun'], dasha, null, now, NO_TRANSITS, undefined, {
      nearTerm: true,
    });

    expect(result.windows.length).toBeGreaterThan(0);
    const first = result.windows[0]!;
    expect(new Date(first.startDate).getTime()).toBeLessThanOrEqual(now.getTime());
    expect(new Date(first.endDate).getTime()).toBeGreaterThan(now.getTime());
  });

  it('never returns a window whose start is beyond the domain’s own horizonYears', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const horizonMs = now.getTime() + DOMAIN_CONFIG.career.horizonYears * 365.25 * 86_400_000;

    const result = scoreDomainWindows(
      'career',
      ['Venus'],
      dasha,
      null,
      now,
      NO_TRANSITS,
      undefined,
      {
        nearTerm: true,
      },
    );

    for (const w of result.windows) {
      expect(new Date(w.startDate).getTime()).toBeLessThanOrEqual(horizonMs);
    }
  });

  it('hope fallback: returns the single nearest real window even when nothing falls inside the horizon', () => {
    // Hand-built dasha/sub-period tree (bypassing the 9-planet makeDasha
    // fixture, where a real planet's pratyantardasha recurs too often to
    // ever leave a genuine gap) -- Mars's ONLY match anywhere is a single
    // antardasha-level window starting 14 years out, with no pratyantardasha
    // matches at all. A near search must never answer NONE just because
    // its horizon cut everything -- it falls back to this one real window.
    const now = new Date('2026-01-01T00:00:00Z');
    const farStart = new Date('2040-01-01T00:00:00Z');
    const farEnd = new Date('2041-01-01T00:00:00Z');
    const dasha = {
      vimshottari: {
        mahadashas: [
          {
            planet: 'Mars',
            startDate: now,
            endDate: new Date('2050-01-01T00:00:00Z'),
            isActive: true,
            level: 'mahadasha' as const,
            subPeriods: [],
          },
        ],
      },
    };
    const sharedSubPeriods = new Map([
      [
        'Mars',
        [
          {
            planet: 'Mars',
            startDate: farStart,
            endDate: farEnd,
            isActive: false,
            level: 'antardasha' as const,
            subPeriods: [],
          },
        ],
      ],
    ]) as Map<string, any>;

    expect(DOMAIN_CONFIG.career.horizonYears).toBe(2);
    const result = scoreDomainWindows(
      'career',
      ['Mars'],
      dasha,
      null,
      now,
      NO_TRANSITS,
      sharedSubPeriods,
      { nearTerm: true },
    );

    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]!.startDate).toBe('2040-01-01');
    expect(result.windows[0]!.endDate).toBe('2041-01-01');
    expect(result.windows[0]!.dashaLevel).toBe('antardasha');
  });

  it('still returns an empty windows array (never a fabricated guess) when nothing matches at all', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const result = scoreDomainWindows(
      'career',
      ['NotAPlanet'],
      dasha,
      null,
      now,
      NO_TRANSITS,
      undefined,
      { nearTerm: true },
    );
    expect(result.windows).toEqual([]);
  });

  it('scores near-term windows identically to the non-nearTerm path (nearTerm changes selection, not scoring)', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const transits = { saturnSignIndex: 3, jupiterSignIndex: 5 };

    const nearTerm = scoreDomainWindows('career', ['Venus'], dasha, 0, now, transits, undefined, {
      nearTerm: true,
    });
    const unbounded = scoreDomainWindows('career', ['Venus'], dasha, 0, now, transits);

    // The near-term result's soonest pratyantardasha window must carry
    // exactly the same score/reasoning as the identical window scored by the
    // unbounded path -- nearTerm changes which candidates are considered and
    // how they're ranked, never how any single one is scored.
    const nearFirst = nearTerm.windows[0]!;
    const sameWindowUnbounded = unbounded.windows.find((w) => w.startDate === nearFirst.startDate);
    expect(sameWindowUnbounded).toBeDefined();
    expect(nearFirst.score).toBe(sameWindowUnbounded!.score);
    expect(nearFirst.reasoning).toEqual(sameWindowUnbounded!.reasoning);
  });
});
