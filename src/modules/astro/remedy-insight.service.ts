// =============================================================================
// Remedy insight — orchestration
// =============================================================================
// Mirrors gemstone.service.ts exactly: claim → generate → mark ready, with a
// translate-on-read layer over the cached English text. See that file for the
// reasoning behind the single-flight claim token and the translation cache.
//
// The one deliberate difference: a failure here refunds nothing, because the
// remedies page is free. A failed row simply means the page renders its
// deterministic half (remedy actions + technical astrology), which is already
// complete and useful on its own — the prose is an enhancement layered on top,
// never a prerequisite.
// =============================================================================

import { logger } from '../../lib/logger.js';
import {
  generateRemedyInsight,
  translateRemedyInsight,
  type RemedyInsightFacts,
  type RemedyInsightNarrative,
} from '../../lib/llm/remedy-insight.js';
import {
  claimRemedyInsightGeneration,
  findRemedyInsight,
  markRemedyInsightFailed,
  markRemedyInsightReady,
  saveRemedyInsightTranslation,
  REMEDY_INSIGHT_STALE_GENERATING_MS,
} from './remedy-insight.repo.js';
import type { RemedyInsightRow } from '../../db/schema.js';

export { findRemedyInsight };

export function isRemedyInsightStale(row: RemedyInsightRow): boolean {
  return (
    row.status === 'generating' &&
    row.startedAt !== null &&
    Date.now() - row.startedAt.getTime() > REMEDY_INSIGHT_STALE_GENERATING_MS
  );
}

async function runGeneration(
  userId: string,
  birthProfileId: string | null,
  facts: RemedyInsightFacts,
  claimedAt: Date,
): Promise<void> {
  try {
    const { narrative, model } = await generateRemedyInsight(facts);
    await markRemedyInsightReady(userId, birthProfileId, claimedAt, {
      analysis: narrative as unknown as Record<string, unknown>,
      model,
    });
  } catch (err) {
    logger.error({ err, userId, birthProfileId }, 'remedy insight generation failed');
    await markRemedyInsightFailed(
      userId,
      birthProfileId,
      claimedAt,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Fire-and-forget entry point for the GET route on a cache miss. One bounded
 * attempt; no-op ('skipped') when another run already owns the claim or a
 * ready row exists.
 */
export async function requestRemedyInsightGeneration(
  userId: string,
  birthProfileId: string | null,
  facts: RemedyInsightFacts,
  opts: { force?: boolean } = {},
): Promise<'generated' | 'skipped'> {
  const claimed = await claimRemedyInsightGeneration(
    userId,
    birthProfileId,
    opts.force ? { force: true } : {},
  );
  if (!claimed?.startedAt) return 'skipped';
  await runGeneration(userId, birthProfileId, facts, claimed.startedAt);
  return 'generated';
}

/**
 * The cached explanations in the requested language, or null when nothing is
 * ready yet. English serves the canonical row; other languages check the
 * cached translations map first and translate-then-persist on a miss, falling
 * back to the English text if that call fails — a reader seeing English prose
 * beside translated UI chrome is a far better outcome than an empty card.
 */
export async function remedyInsightForLanguage(
  row: RemedyInsightRow,
  language: string,
): Promise<RemedyInsightNarrative | null> {
  if (row.status !== 'ready' || !row.analysis) return null;
  const base = row.analysis as unknown as RemedyInsightNarrative;

  if (!language || language === 'en') return base;

  const cached = row.translations?.[language] as unknown as RemedyInsightNarrative | undefined;
  if (cached?.intro) return cached;

  try {
    const translated = await translateRemedyInsight(base, language);
    await saveRemedyInsightTranslation(
      row.userId,
      row.birthProfileId,
      language,
      translated as unknown as Record<string, unknown>,
    );
    return translated;
  } catch (err) {
    logger.warn({ err, userId: row.userId, language }, 'failed to translate remedy insight');
    return base;
  }
}
