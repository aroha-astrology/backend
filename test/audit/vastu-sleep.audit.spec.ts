import { describe, it, expect, vi } from 'vitest';

// =============================================================================
// Audit item VS-SLEEP, register BS-52.122
// =============================================================================
// Brihat Samhita 52.122 (tr. Chidambaram Iyer, v. 124): the householder "shall not
// sleep under a beam, nor with his head towards the north or west, nor naked nor
// with wet feet." The engine had no sleeping-direction rule. It is added as a plain
// traditional note in the context the analysis is written from, not as a score:
// the text names no room and gives no points.
// =============================================================================

const generate = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/llm/gemini-client.js', () => ({ generate }));

import { generateVastuAnalysis } from '../../src/lib/llm/vastu.js';
import { VASTU_TRADITIONAL_NOTES } from '../../src/modules/vastu/vastu.rules.js';

describe('[VS-SLEEP] the sleeping-direction note', () => {
  it('is a plain note that quotes only what the text says', () => {
    const note = VASTU_TRADITIONAL_NOTES.find((n) => n.id === 'sleep-head-direction')!;
    expect(note.text).toMatch(/north or west/);
    expect(note.source).toBe('Brihat Samhita 52.122');
    expect(note.text).not.toMatch(/south|east|health|death|harm/i);
  });

  it('reaches the analysis context', async () => {
    generate.mockResolvedValue('{}');
    await generateVastuAnalysis({
      roomLayout: { master_bed: ['SW'] },
      roomDetails: {},
      roomScores: [],
      overallScore: 80,
      language: 'en',
      chartContext: 'none',
    });
    const user = generate.mock.calls[0]![0].messages.find(
      (m: { role: string }) => m.role === 'user',
    ).content as string;
    expect(user).toContain('traditionalNotes');
    expect(user).toContain('north or west');
  });
});
