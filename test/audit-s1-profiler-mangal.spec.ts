import { describe, expect, it, vi } from 'vitest';

// Audit H2: the matchmaking profiler wrote "Mangal Dosha detected (severity: none)" for a
// cancelled Mangal Dosha, which is not Manglik at all.

const state = vi.hoisted(() => ({ analyzeAllDoshasAt: vi.fn() }));
vi.mock('../src/lib/astro-engine/doshas/index.js', () => ({
  analyzeAllDoshasAt: state.analyzeAllDoshasAt,
}));

const { profilerNode } = await import('../src/lib/swarm/agents/profiler.js');
const { calculateChart } = await import('../src/lib/astro-engine/index.js');

async function doshaFindingIds(mangal: Record<string, unknown>): Promise<string[]> {
  state.analyzeAllDoshasAt.mockResolvedValue({ mangal });
  const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
  const out = await profilerNode({ requestId: 'r1', metrology: { chart } } as never);
  return (out.findings ?? []).map((f) => f.id).filter((id) => id.startsWith('dosha-'));
}

describe('profiler: Mangal Dosha findings', () => {
  it('leaves a cancelled Mangal Dosha out', async () => {
    expect(
      await doshaFindingIds({
        present: true,
        type: 'cancelled',
        severity: 'none',
        cancellations: ['x'],
      }),
    ).toEqual([]);
  });

  it('keeps a Mangal Dosha in force', async () => {
    expect(await doshaFindingIds({ present: true, type: 'partial', severity: 'mild' })).toEqual([
      'dosha-mangal',
    ]);
  });
});
