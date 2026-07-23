import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generatePalmReport, translatePalmContent } = await import('../src/lib/llm/palm-report.js');

const VALID_JSON = JSON.stringify({
  intro: 'Your palm shows a strong, clearly defined set of major lines.',
  lifeLine: 'Your life line curves deep into the palm, traditionally read as steady vitality.',
  heartLine: 'A long, gently curved heart line suggests warmth in how you connect with others.',
  headLine: 'Your head line runs fairly straight, traditionally linked to practical thinking.',
  fateLine: 'A clear fate line is visible, often read as a strong sense of direction.',
  overallGuidance: 'Trust the steady, practical instincts these lines point toward.',
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generatePalmReport', () => {
  it('returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    const result = await generatePalmReport({
      imageBase64: 'ZmFrZS1pbWFnZS1kYXRh',
      mimeType: 'image/jpeg',
    });

    expect(result.intro).toContain('lines');
    expect(result.lifeLine).toBeTruthy();
    expect(result.heartLine).toBeTruthy();
    expect(result.headLine).toBeTruthy();
    expect(result.fateLine).toBeTruthy();
    expect(result.overallGuidance).toBeTruthy();
    expect(result.model).toBeTruthy();
  });

  it('sends the photo as an image_url content part alongside the text instruction', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    await generatePalmReport({ imageBase64: 'ZmFrZS1pbWFnZS1kYXRh', mimeType: 'image/jpeg' });

    const call = state.generate.mock.calls[0]![0];
    const userMessage = call.messages.find((m: { role: string }) => m.role === 'user');
    expect(Array.isArray(userMessage.content)).toBe(true);
    const imagePart = userMessage.content.find((p: { type: string }) => p.type === 'image_url');
    expect(imagePart.image_url.url).toBe('data:image/jpeg;base64,ZmFrZS1pbWFnZS1kYXRh');
    const textPart = userMessage.content.find((p: { type: string }) => p.type === 'text');
    expect(textPart.text).toBeTruthy();
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(
      generatePalmReport({ imageBase64: 'abc', mimeType: 'image/jpeg' }),
    ).rejects.toThrow('palm LLM returned unparseable JSON');
  });

  it('throws when a required narrative field is missing', async () => {
    state.generate.mockResolvedValueOnce(JSON.stringify({ intro: 'only an intro' }));

    await expect(
      generatePalmReport({ imageBase64: 'abc', mimeType: 'image/jpeg' }),
    ).rejects.toThrow('palm LLM returned unparseable JSON');
  });
});

describe('translatePalmContent', () => {
  const original = {
    intro: 'Your palm shows a strong, clearly defined set of major lines.',
    lifeLine: 'Your life line curves deep into the palm.',
    heartLine: 'A long, gently curved heart line.',
    headLine: 'Your head line runs fairly straight.',
    fateLine: 'A clear fate line is visible.',
    overallGuidance: 'Trust the steady, practical instincts these lines point toward.',
  };

  it('returns the translated narrative on a valid response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'नमस्ते',
        lifeLine: 'जीवन रेखा',
        heartLine: 'हृदय रेखा',
        headLine: 'मस्तिष्क रेखा',
        fateLine: 'भाग्य रेखा',
        overallGuidance: 'मार्गदर्शन',
      }),
    );

    const result = await translatePalmContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते');
    expect(result.overallGuidance).toBe('मार्गदर्शन');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translatePalmContent(original, 'hi')).rejects.toThrow(
      'palm translation returned unparseable JSON (target=hi)',
    );
  });
});
