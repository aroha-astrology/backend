import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfileContext } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  generateNumerologyReport: vi.fn(),
  translateNumerologyContent: vi.fn(),
}));

vi.mock('../src/lib/llm/numerology-report.js', () => ({
  generateNumerologyReport: state.generateNumerologyReport,
  translateNumerologyContent: state.translateNumerologyContent,
}));

const { getPrimeReportDefinition, listPrimeReportDefinitions } =
  await import('../src/modules/prime-reports/prime-reports.registry.js');

beforeEach(() => {
  state.generateNumerologyReport.mockReset();
  state.translateNumerologyContent.mockReset();
});

describe('prime report registry', () => {
  it('lists the numerology report at the ₹25 (2500 paise) price point', () => {
    const def = getPrimeReportDefinition('numerology');
    expect(def).toBeDefined();
    expect(def!.pricePaise).toBe(2500);
    expect(listPrimeReportDefinitions()).toContainEqual(def);
  });

  it('returns undefined for an unknown report type', () => {
    expect(getPrimeReportDefinition('does-not-exist')).toBeUndefined();
  });

  it("generate() calls the numerology generator with the profile's dateOfBirth and displayName", async () => {
    state.generateNumerologyReport.mockResolvedValueOnce({
      intro: 'hi',
      lifePathStory: 'a',
      expressionStory: 'b',
      soulUrgeStory: 'c',
      personalityStory: 'd',
      model: 'gemini-3.1-flash-lite',
    });

    const def = getPrimeReportDefinition('numerology')!;
    const result = await def.generate(
      makeProfileContext({ dateOfBirth: '1993-04-17', displayName: 'Subir Dutta' }),
    );

    expect(state.generateNumerologyReport).toHaveBeenCalledWith({
      dateOfBirth: '1993-04-17',
      fullName: 'Subir Dutta',
    });
    expect(result.model).toBe('gemini-3.1-flash-lite');
    expect(result.content).toEqual({
      intro: 'hi',
      lifePathStory: 'a',
      expressionStory: 'b',
      soulUrgeStory: 'c',
      personalityStory: 'd',
    });
  });

  it('generate() throws when the profile has no date of birth or name yet', async () => {
    const def = getPrimeReportDefinition('numerology')!;
    await expect(def.generate(makeProfileContext())).rejects.toThrow(
      'Numerology report requires a date of birth and a name',
    );
    expect(state.generateNumerologyReport).not.toHaveBeenCalled();
  });

  it('translate() delegates to translateNumerologyContent', async () => {
    state.translateNumerologyContent.mockResolvedValueOnce({
      intro: 'नमस्ते',
      lifePathStory: 'अ',
      expressionStory: 'ब',
      soulUrgeStory: 'स',
      personalityStory: 'द',
    });

    const def = getPrimeReportDefinition('numerology')!;
    const translated = await def.translate(
      {
        intro: 'hi',
        lifePathStory: 'a',
        expressionStory: 'b',
        soulUrgeStory: 'c',
        personalityStory: 'd',
      },
      'hi',
    );

    expect(translated.intro).toBe('नमस्ते');
  });
});
