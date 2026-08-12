import { beforeEach, describe, expect, it, vi } from 'vitest';

// The plain-language layer is an ENHANCEMENT over an already-complete page, so
// the behaviour worth pinning is what happens when the model misbehaves: a bad
// response must never be cached as a row full of blank explanations, and a
// translation failure must fall back to English rather than emptying the cards.

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateRemedyInsight, translateRemedyInsight } =
  await import('../src/lib/llm/remedy-insight.js');

const FACTS = {
  planets: [
    { planet: 'Mars', natalHouse: 9, remedies: ['Feed sweet chapatis to dogs'] },
    { planet: 'Saturn', natalHouse: 8, remedies: ['Feed crows on Saturdays'], isInPakkaGhar: true },
  ],
  debts: [{ type: 'Pitra Rin', indicators: ['Sun afflicted in the 9th'] }],
};

const GOOD = JSON.stringify({
  intro: 'Your chart asks for small, steady habits.',
  planets: { Mars: 'Mars in your 9th leans hot.', Saturn: 'Saturn is strong where it sits.' },
  debts: { 'Pitra Rin': 'An ancestral pattern around duty.' },
});

beforeEach(() => state.generate.mockReset());

describe('generateRemedyInsight', () => {
  it('parses a well-formed response into per-planet and per-debt prose', async () => {
    state.generate.mockResolvedValue(GOOD);
    const { narrative } = await generateRemedyInsight(FACTS);

    expect(narrative.intro).toBe('Your chart asks for small, steady habits.');
    expect(narrative.planets.Mars).toContain('9th');
    expect(narrative.debts['Pitra Rin']).toContain('ancestral');
  });

  it('sends every given planet and debt to the model as facts', async () => {
    state.generate.mockResolvedValue(GOOD);
    await generateRemedyInsight(FACTS);

    const messages = state.generate.mock.calls[0]?.[0].messages as { content: string }[];
    const factsMessage = messages.map((m) => m.content).join('\n');
    expect(factsMessage).toContain('Mars');
    expect(factsMessage).toContain('Saturn');
    expect(factsMessage).toContain('Pitra Rin');
    expect(factsMessage).toContain('Feed sweet chapatis to dogs');
  });

  it('throws rather than caching a row with no usable planet explanations', async () => {
    state.generate.mockResolvedValue(JSON.stringify({ intro: 'Hello', planets: {} }));
    await expect(generateRemedyInsight(FACTS)).rejects.toThrow(/unparseable/i);
  });

  it('throws on an empty intro, non-JSON, and non-string values', async () => {
    state.generate.mockResolvedValue(JSON.stringify({ intro: '', planets: { Mars: 'x' } }));
    await expect(generateRemedyInsight(FACTS)).rejects.toThrow();

    state.generate.mockResolvedValue('not json at all');
    await expect(generateRemedyInsight(FACTS)).rejects.toThrow();

    // Non-string values are dropped; dropping them all leaves nothing usable.
    state.generate.mockResolvedValue(JSON.stringify({ intro: 'Hi', planets: { Mars: 42 } }));
    await expect(generateRemedyInsight(FACTS)).rejects.toThrow();
  });

  it('tolerates a missing debts object (a chart with no debts flagged)', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({ intro: 'All clear.', planets: { Mars: 'Steady.' } }),
    );
    const { narrative } = await generateRemedyInsight(FACTS);
    expect(narrative.debts).toEqual({});
  });
});

describe('translateRemedyInsight', () => {
  it('keeps the English planet/debt keys as lookup identifiers', async () => {
    // Keys must survive translation — the UI looks up simple.planets[item.planet],
    // and item.planet is always the English name.
    state.generate.mockResolvedValue(
      JSON.stringify({
        intro: 'आपकी कुंडली छोटी आदतें माँगती है।',
        planets: { Mars: 'मंगल नवम भाव में।' },
        debts: { 'Pitra Rin': 'पैतृक ऋण।' },
      }),
    );

    const out = await translateRemedyInsight(
      { intro: 'x', planets: { Mars: 'y' }, debts: { 'Pitra Rin': 'z' } },
      'hi',
    );

    expect(Object.keys(out.planets)).toEqual(['Mars']);
    expect(Object.keys(out.debts)).toEqual(['Pitra Rin']);
    expect(out.planets.Mars).not.toBe('y');
  });

  it('throws on an unusable translation so the caller can fall back to English', async () => {
    state.generate.mockResolvedValue('{ broken');
    await expect(
      translateRemedyInsight({ intro: 'x', planets: { Mars: 'y' }, debts: {} }, 'hi'),
    ).rejects.toThrow(/target=hi/);
  });
});
