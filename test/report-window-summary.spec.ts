import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RankedWindow } from '../src/lib/astro-engine/reports/report-timing.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { summarizeTimingWindows, findRankedWindowsField, spliceWindowSummaries } =
  await import('../src/lib/llm/reports/window-summary.js');

function makeWindow(overrides: Partial<RankedWindow> = {}): RankedWindow {
  return {
    startDate: '2026-10-22T00:00:00.000Z',
    endDate: '2027-01-12T00:00:00.000Z',
    score: 1,
    level: 'LOW',
    dashaLevel: 'pratyantardasha',
    reasoning: [
      'Vimshottari anchor: Mercury pratyantardasha (within Saturn major period).',
      'Yogini alignment: could not determine active Yogini period.',
      'Transit gating: Jupiter position unknown.',
    ],
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('summarizeTimingWindows', () => {
  it('returns an empty array without calling the LLM when there are no windows', async () => {
    const result = await summarizeTimingWindows([]);
    expect(result).toEqual([]);
    expect(state.generate).not.toHaveBeenCalled();
  });

  it('makes exactly one bounded call and returns one summary per window, in order', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({ summaries: ['First window summary.', 'Second window summary.'] }),
    );

    const result = await summarizeTimingWindows([makeWindow(), makeWindow({ level: 'HIGH' })]);

    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['First window summary.', 'Second window summary.']);
  });

  it("embeds each window's dates/level/dashaLevel as facts, never the raw internal reasoning[] jargon", async () => {
    state.generate.mockResolvedValue(JSON.stringify({ summaries: ['A plain summary.'] }));

    await summarizeTimingWindows([makeWindow()]);

    const call = state.generate.mock.calls[0]?.[0];
    const factsMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('<report_facts>'),
    );
    expect(factsMessage.content).toContain('LOW');
    expect(factsMessage.content).toContain('pratyantardasha');
    // The raw reasoning[] strings (internal debug text — see dasha-confidence.ts) must never
    // leak into the facts payload, only the window's own dates/level/dashaLevel.
    expect(factsMessage.content).not.toContain('could not determine');
    expect(factsMessage.content).not.toContain('Transit gating');
    expect(factsMessage.content).not.toContain('Vimshottari anchor');
  });

  it('throws if the LLM returns a summary count that does not match the window count', async () => {
    state.generate.mockResolvedValue(JSON.stringify({ summaries: ['Only one.'] }));

    await expect(summarizeTimingWindows([makeWindow(), makeWindow()])).rejects.toThrow();
  });

  it('throws on unparseable JSON', async () => {
    state.generate.mockResolvedValue('not json');

    await expect(summarizeTimingWindows([makeWindow()])).rejects.toThrow();
  });
});

describe('findRankedWindowsField', () => {
  it('finds a RankedWindow[]-shaped value regardless of its key name', () => {
    const scores = { romanceScore: 60, windows: [makeWindow()], ageBands: [] };
    expect(findRankedWindowsField(scores)).toEqual({ field: 'windows', windows: [makeWindow()] });
  });

  it('returns null when no field matches the RankedWindow shape', () => {
    const scores = {
      romanceScore: 60,
      ageBands: [{ label: 'x', startAge: 0, endAge: 1, confidence: 'LOW' }],
    };
    expect(findRankedWindowsField(scores)).toBeNull();
  });

  it('returns null for an empty windows array (nothing to summarize)', () => {
    expect(findRankedWindowsField({ windows: [] })).toBeNull();
  });
});

describe('spliceWindowSummaries', () => {
  it('sets .summary on each window in the named field, by position', () => {
    const scores = { romanceScore: 60, windows: [makeWindow(), makeWindow({ level: 'HIGH' })] };
    const result = spliceWindowSummaries(scores, {
      field: 'windows',
      summaries: ['First.', 'Second.'],
    });
    expect((result.windows as Array<{ summary?: string }>).map((w) => w.summary)).toEqual([
      'First.',
      'Second.',
    ]);
    // Original object is untouched (pure function, same discipline as spliceScoresProse).
    expect((scores.windows[0] as { summary?: string }).summary).toBeUndefined();
  });

  it('returns scores unchanged when persisted is null (pre-feature report, nothing to splice)', () => {
    const scores = { windows: [makeWindow()] };
    expect(spliceWindowSummaries(scores, null)).toEqual(scores);
  });

  it('returns scores unchanged when the persisted summary count no longer matches the freshly recomputed window count', () => {
    const scores = { windows: [makeWindow(), makeWindow()] };
    const result = spliceWindowSummaries(scores, { field: 'windows', summaries: ['Only one.'] });
    expect(
      (result.windows as Array<{ summary?: string }>).every((w) => w.summary === undefined),
    ).toBe(true);
  });

  it('returns scores unchanged when the persisted field no longer exists on the freshly recomputed scores', () => {
    const scores = { somethingElse: [] };
    const result = spliceWindowSummaries(scores, { field: 'windows', summaries: ['x'] });
    expect(result).toEqual(scores);
  });
});
