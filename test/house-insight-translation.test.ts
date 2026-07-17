import { describe, it, expect } from 'vitest';
import {
  buildHouseInsightTranslationPrompt,
  parseHouseInsightTranslation,
} from '../src/lib/llm/house-insight';

describe('buildHouseInsightTranslationPrompt', () => {
  it('includes the target language and the original content as JSON', () => {
    const prompt = buildHouseInsightTranslationPrompt(
      { text: 'You value stability.', strengths: ['Steady income'], weaknesses: ['Overcautious'] },
      'hi',
    );
    expect(prompt).toContain('"hi"');
    expect(prompt).toContain('You value stability.');
    expect(prompt).toContain('Steady income');
    expect(prompt).toContain('Overcautious');
    expect(prompt).toContain('ONLY translate the text values');
  });
});

describe('parseHouseInsightTranslation', () => {
  it('parses clean JSON with all three fields', () => {
    const result = parseHouseInsightTranslation(
      '{"text":"आप स्थिरता को महत्व देते हैं।","strengths":["स्थिर आय"],"weaknesses":["अति सतर्क"]}',
    );
    expect(result).toEqual({
      text: 'आप स्थिरता को महत्व देते हैं।',
      strengths: ['स्थिर आय'],
      weaknesses: ['अति सतर्क'],
    });
  });

  it('strips markdown code fences before parsing', () => {
    const result = parseHouseInsightTranslation('```json\n{"text":"अनुवादित"}\n```');
    expect(result).toEqual({ text: 'अनुवादित' });
  });

  it('returns null on malformed JSON', () => {
    const result = parseHouseInsightTranslation('not json at all');
    expect(result).toBeNull();
  });

  it('returns null when the object has no usable fields', () => {
    const result = parseHouseInsightTranslation('{"text":"","strengths":[],"weaknesses":[]}');
    expect(result).toBeNull();
  });

  it('drops non-string entries from strengths/weaknesses arrays', () => {
    const result = parseHouseInsightTranslation(
      '{"text":"ok","strengths":["good", 5, null],"weaknesses":[]}',
    );
    expect(result).toEqual({ text: 'ok', strengths: ['good'] });
  });
});
