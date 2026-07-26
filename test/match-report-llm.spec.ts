import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchReportScores } from '../src/lib/astro-engine/reports/match-report.js';
import type { MatchRiskFactor } from '../src/lib/astro-engine/matching/match-risks.js';
import type { ReportSection } from '../src/modules/reports/report-generator.types.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateMatchReportNarrative, translateMatchReportNarrative } =
  await import('../src/lib/llm/reports/match-report.js');

function makeRiskFactors(
  overrides: Partial<Record<string, Partial<MatchRiskFactor>>> = {},
): MatchRiskFactor[] {
  const keys: MatchRiskFactor['key'][] = [
    'wealth',
    'health',
    'children',
    'harmony',
    'career',
    'timing',
    'intimacy',
    'inlaws',
  ];
  return keys.map((key) => ({
    key,
    severity: 'neutral',
    score: 60,
    evidence: [`${key} evidence line.`],
    ...(overrides[key] ?? {}),
  }));
}

function makeScores(overrides: Partial<MatchReportScores> = {}): MatchReportScores {
  return {
    gunaMilanScore: 28,
    gunaMaxScore: 36,
    gunaBreakdown: [{ name: 'Nadi', score: 8, maxScore: 8, description: 'Different nadis' }],
    dashakootaScore: 8,
    dashakootaMaxScore: 10,
    dashakootaBreakdown: [{ name: 'Dina', score: 1, maxScore: 1, description: 'Favorable' }],
    manglikStatus: { person1: false, person2: false, cancelled: false },
    compatibilityBand: 'good',
    // KundliMilanScores (which MatchReportScores extends) gained a required primaryDoshaYoga
    // field — see kundli-milan.ts's own doc comment for why it's scoped to the primary person
    // only. computeMatchReportScores already spreads this through unchanged from
    // computeKundliMilanScores at runtime; this fixture just needs the field to satisfy the type.
    primaryDoshaYoga: { positives: [], cautions: [] },
    riskFactors: makeRiskFactors(),
    ...overrides,
  };
}

const eightCardsResponse = JSON.stringify({
  sections: [
    { heading: 'Wealth hook', paragraphs: ['Wealth body text.'] },
    { heading: 'Health hook', paragraphs: ['Health body text.'] },
    { heading: 'Children hook', paragraphs: ['Children body text.'] },
    { heading: 'Harmony hook', paragraphs: ['Harmony body text.'] },
    { heading: 'Career hook', paragraphs: ['Career body text.'] },
    { heading: 'Timing hook', paragraphs: ['Timing body text.'] },
    { heading: 'Intimacy hook', paragraphs: ['Intimacy body text.'] },
    { heading: 'In-laws hook', paragraphs: ['In-laws body text.'] },
  ],
});

const closingResponse = JSON.stringify({
  sections: [
    { heading: "Do's", paragraphs: ['Do one.', 'Do two.'] },
    { heading: "Don'ts", paragraphs: ['Avoid one.', 'Avoid two.'] },
    { heading: 'Classical Remedies', paragraphs: ['Chant a mantra.'] },
  ],
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateMatchReportNarrative', () => {
  it("returns 8 cards followed by Do's/Don'ts/Remedies, in order", async () => {
    state.generate.mockResolvedValueOnce(eightCardsResponse).mockResolvedValueOnce(closingResponse);

    const sections = await generateMatchReportNarrative(makeScores());
    expect(sections).toHaveLength(11);
    expect(sections[0]?.heading).toBe('Wealth hook');
    expect(sections[7]?.heading).toBe('In-laws hook');
    expect(sections[8]?.heading).toBe("Do's");
    expect(sections[10]?.heading).toBe('Classical Remedies');
  });

  it("embeds each area's severity and evidence as GIVEN FACTS in both calls", async () => {
    state.generate.mockResolvedValueOnce(eightCardsResponse).mockResolvedValueOnce(closingResponse);

    await generateMatchReportNarrative(
      makeScores({
        riskFactors: makeRiskFactors({
          health: { severity: 'serious', evidence: ['Mars in 8th house for both charts.'] },
        }),
      }),
    );

    for (const call of state.generate.mock.calls) {
      const allContent = call[0].messages.map((m: { content: string }) => m.content).join('\n');
      expect(allContent).toContain('GIVEN FACTS');
      expect(allContent).toContain('Mars in 8th house for both charts.');
      expect(allContent).toContain('serious');
    }
  });

  it('throws when either call returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json').mockResolvedValueOnce(closingResponse);
    await expect(generateMatchReportNarrative(makeScores())).rejects.toThrow();
  });

  it('throws when a response has no usable sections', async () => {
    state.generate
      .mockResolvedValueOnce(JSON.stringify({ sections: [] }))
      .mockResolvedValueOnce(closingResponse);
    await expect(generateMatchReportNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateMatchReportNarrative', () => {
  const sections: ReportSection[] = [
    ...JSON.parse(eightCardsResponse).sections,
    ...JSON.parse(closingResponse).sections,
  ];

  it('translates both groups and preserves the 11-section order', async () => {
    const translatedCards = JSON.stringify({
      sections: sections
        .slice(0, 8)
        .map((s: { heading: string }) => ({ heading: `HI ${s.heading}`, paragraphs: ['हिंदी।'] })),
    });
    const translatedClosing = JSON.stringify({
      sections: sections
        .slice(8)
        .map((s: { heading: string }) => ({ heading: `HI ${s.heading}`, paragraphs: ['हिंदी।'] })),
    });
    state.generate.mockResolvedValueOnce(translatedCards).mockResolvedValueOnce(translatedClosing);

    const translated = await translateMatchReportNarrative(sections, 'hi');
    expect(translated).toHaveLength(11);
    expect(translated[0]?.heading).toBe('HI Wealth hook');
    expect(translated[10]?.heading).toBe('HI Classical Remedies');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage').mockResolvedValueOnce(closingResponse);
    await expect(translateMatchReportNarrative(sections, 'hi')).rejects.toThrow();
  });
});
