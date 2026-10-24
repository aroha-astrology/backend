import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runWithRequestContext, getRequestContext } from '../src/lib/request-context.js';

const oxionChatMock = vi.fn();
const modelOfMock = vi.fn(async () => 'oxion:gemini-3.7-flash');
const modelForUserMock = vi.fn((_: string, __: string, fallback: string) => fallback);

vi.mock('../src/lib/llm/oxion-client.js', () => ({
  oxionChat: (...args: unknown[]) => oxionChatMock(...args),
  oxionConfigured: () => true,
  isOxionModel: (s: string) => s.startsWith('oxion:'),
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  modelOf: (...args: unknown[]) => modelOfMock(...args),
  modelForUser: (...args: unknown[]) => modelForUserMock(...args),
}));

const { generate } = await import('../src/lib/llm/gemini-client.js');

const profile = { name: 'report', temperature: 0.5, jsonMode: true, stream: false, maxTokens: 100 } as const;

describe('gemini-client generate() Oxion-first', () => {
  beforeEach(() => {
    oxionChatMock.mockReset();
    modelOfMock.mockReset().mockResolvedValue('oxion:gemini-3.7-flash');
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('inside { llmOrder: oxion-first } with jsonMode, oxionChat returns fenced json -> generate returns stripped json and fetch never called, context oxionModel set', async () => {
    oxionChatMock.mockResolvedValue({ text: '```json\n{"a":1}\n```' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await runWithRequestContext({ userId: 'u1', llmOrder: 'oxion-first' }, async () => {
      const text = await generate({
        profile: profile as unknown as { name: string; temperature: number; jsonMode: boolean; stream: boolean; maxTokens: number },
        messages: [{ role: 'user', content: 'hello' }],
        responseSchema: { type: 'object' } as unknown as never,
      });
      return { text, oxionModel: getRequestContext()?.oxionModel };
    });

    expect(result.text).toBe('{"a":1}');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.oxionModel).toBe('oxion:gemini-3.7-flash');
  });

  it('oxionChat rejects -> falls through to Gemini', async () => {
    oxionChatMock.mockRejectedValue(new Error('oxion down'));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{"b":2}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      text: async () => JSON.stringify({ choices: [{ message: { content: '{"b":2}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      headers: { get: () => null },
    } as unknown as Response));
    vi.stubGlobal('fetch', fetchMock);

    let result: string | null = null;
    let fetchCalled = false;
    try {
      result = await runWithRequestContext({ userId: 'u1', llmOrder: 'oxion-first' }, async () => {
        return generate({
          profile: profile as unknown as { name: string; temperature: number; jsonMode: boolean; stream: boolean; maxTokens: number },
          messages: [{ role: 'user', content: 'hello' }],
          responseSchema: { type: 'object' } as unknown as never,
        });
      });
      fetchCalled = fetchMock.mock.calls.length > 0;
    } catch {
      fetchCalled = fetchMock.mock.calls.length > 0;
    }

    expect(oxionChatMock).toHaveBeenCalled();
    expect(fetchCalled).toBe(true);
    expect(result).toBe('{"b":2}');
  });

  it('without llmOrder, oxionChat is never called', async () => {
    oxionChatMock.mockResolvedValue({ text: '{"c":3}' });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{"c":3}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      text: async () => JSON.stringify({ choices: [{ message: { content: '{"c":3}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      headers: { get: () => null },
    } as unknown as Response));
    vi.stubGlobal('fetch', fetchMock);

    await runWithRequestContext({ userId: 'u1' }, async () => {
      try {
        await generate({
          profile: profile as unknown as { name: string; temperature: number; jsonMode: boolean; stream: boolean; maxTokens: number },
          messages: [{ role: 'user', content: 'hello' }],
          responseSchema: { type: 'object' } as unknown as never,
        });
      } catch {}
    });

    expect(oxionChatMock).not.toHaveBeenCalled();
  });
});
