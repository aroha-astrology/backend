import { beforeEach, describe, expect, it, vi } from 'vitest';

// Audit L9 (cost query half): the admin cost view must be able to show cached input tokens and the
// voice minutes, which sit in new ai_usage columns. The write half (voice row, tokens) is covered
// in voice-service.spec.ts and audit-s6-cached-tokens.spec.ts.
const state = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._a: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select, insert: state.insert }, sqlClient };
});

import { aiUsage } from '../src/db/schema.js';
import { costByAgent, insertAiUsage } from '../src/modules/admin/ai-usage.repo.js';

const range = { from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-08T00:00:00Z') };

interface Chain {
  from: () => Chain;
  where: () => Chain;
  groupBy: () => Promise<unknown[]>;
}

function selectReturning(rows: unknown[]) {
  const chain: Chain = {
    from: () => chain,
    where: () => chain,
    groupBy: () => Promise.resolve(rows),
  };
  state.select.mockReturnValue(chain);
}

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
});

describe('ai_usage has columns for cached tokens and audio seconds', () => {
  it('schema exposes cachedTokens and audioSeconds', () => {
    expect(aiUsage.cachedTokens).toBeDefined();
    expect(aiUsage.audioSeconds).toBeDefined();
  });

  it('insertAiUsage passes them through', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    state.insert.mockReturnValue({ values });
    await insertAiUsage({
      userId: 'u',
      agent: 'voice',
      model: 'live',
      tier: 'paid',
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 60_000,
      audioSeconds: 60,
    });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ audioSeconds: 60 }));
  });
});

describe('costByAgent returns cached tokens and voice seconds', () => {
  it('maps the new sums to numbers', async () => {
    selectReturning([
      {
        agent: 'chat',
        tokensIn: 1000,
        tokensOut: 20,
        calls: 4,
        paidTokensIn: 400,
        paidTokensOut: 10,
        paidCalls: 2,
        cachedTokensIn: '600',
        paidCachedTokensIn: '250',
        cacheReportedCalls: '3',
        audioSeconds: '0',
      },
      {
        agent: 'voice',
        tokensIn: 0,
        tokensOut: 0,
        calls: 3,
        paidTokensIn: 0,
        paidTokensOut: 0,
        paidCalls: 3,
        cachedTokensIn: 0,
        paidCachedTokensIn: 0,
        cacheReportedCalls: 0,
        audioSeconds: '180',
        paidAudioSeconds: '120',
      },
    ]);
    const [chat, voice] = await costByAgent(range);
    expect(chat).toMatchObject({
      cachedTokensIn: 600,
      paidCachedTokensIn: 250,
      cacheReportedCalls: 3,
      audioSeconds: 0,
    });
    expect(voice).toMatchObject({ audioSeconds: 180, paidAudioSeconds: 120 });
  });

  it('missing columns become 0, never NaN', async () => {
    selectReturning([{ agent: 'chat', tokensIn: 1, tokensOut: 2, calls: 1 }]);
    const [row] = await costByAgent(range);
    expect(row).toMatchObject({
      cachedTokensIn: 0,
      paidCachedTokensIn: 0,
      cacheReportedCalls: 0,
      audioSeconds: 0,
      paidAudioSeconds: 0,
    });
  });
});
