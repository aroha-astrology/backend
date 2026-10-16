import { beforeEach, describe, expect, it, vi } from 'vitest';

// What Chat History says a voice call was about (lib/voice-call-recap.ts).

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));
vi.mock('../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { summarizeCall } from '../src/lib/voice-call-recap.js';

const USER = 'user-1';
const CALL = [
  { role: 'assistant' as const, content: 'Namaste beta, what is on your mind?' },
  { role: 'user' as const, content: 'When will I get a new job?' },
  { role: 'assistant' as const, content: 'March to May 2027 is your window.' },
];

beforeEach(() => {
  state.generate
    .mockReset()
    .mockResolvedValue('You asked about a new job. March to May 2027 was named.');
});

describe('summarizeCall', () => {
  it('hands the model the whole call, each line marked with who spoke', async () => {
    const recap = await summarizeCall(CALL, USER);

    expect(recap).toBe('You asked about a new job. March to May 2027 was named.');
    const [request] = state.generate.mock.calls[0] as [
      { profile: { name: string }; messages: { content: string }[]; userId: string },
    ];
    expect(request.profile.name).toBe('call-recap');
    expect(request.userId).toBe(USER);
    expect(request.messages[0]!.content).toContain('Member: When will I get a new job?');
    expect(request.messages[0]!.content).toContain('Astrologer: March to May 2027 is your window.');
  });

  it('says nothing about a call in which the member never spoke', async () => {
    const recap = await summarizeCall(
      [CALL[0]!, { role: 'assistant', content: 'Are you there?' }],
      USER,
    );

    expect(recap).toBeNull();
    expect(state.generate).not.toHaveBeenCalled();
  });

  it('says nothing when the model finds no real conversation', async () => {
    state.generate.mockResolvedValue(' none ');

    expect(await summarizeCall(CALL, USER)).toBeNull();
  });

  it('returns null, and does not throw, when the model call fails', async () => {
    state.generate.mockRejectedValue(new Error('quota'));

    await expect(summarizeCall(CALL, USER)).resolves.toBeNull();
  });

  it('keeps the end of a very long call and cuts a runaway answer short', async () => {
    const long = Array.from({ length: 400 }, (_, i) => ({
      role: i % 2 ? ('assistant' as const) : ('user' as const),
      content: `turn ${i} ` + 'x'.repeat(400),
    }));
    state.generate.mockResolvedValue('y'.repeat(2000));

    const recap = await summarizeCall(long, USER);

    const [request] = state.generate.mock.calls[0] as [{ messages: { content: string }[] }];
    expect(request.messages[0]!.content).toContain('turn 399 ');
    expect(request.messages[0]!.content).not.toContain('turn 0 ');
    expect(recap).toHaveLength(600);
  });
});
