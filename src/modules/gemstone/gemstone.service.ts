import { logger } from '../../lib/logger.js';
import {
  analyzePlanetStrengths,
  GEMSTONE_DATA,
  GEMSTONE_PLANET_ORDER,
  type PlanetAnalysis,
} from '../../lib/astro-engine/gemstones.js';
import {
  generateGemstoneReport,
  translateGemstoneContent,
  type GemstoneNarrative,
} from '../../lib/llm/gemstone.js';
import {
  claimGemstoneGeneration,
  findGemstoneRecommendation,
  markGemstoneFailed,
  markGemstoneReady,
  saveGemstoneTranslation,
  GEMSTONE_STALE_GENERATING_MS,
} from './gemstone.repo.js';
import type { GemstoneItemDto, GemstoneReportDto } from './gemstone.schemas.js';
import type { GemstoneRecommendationRow } from '../../db/schema.js';

/** Minimal shape needed off the kundli row — decoupled from the full KundliRow type. */
interface KundliLike {
  chartData: Record<string, unknown> | null;
}

/** Deterministic gem facts + dignity strength, before the AI note is merged in. */
type DeterministicGem = Omit<GemstoneItemDto, 'note'>;

function buildDeterministicGems(analyses: PlanetAnalysis[]): DeterministicGem[] {
  return GEMSTONE_PLANET_ORDER.map((planet): DeterministicGem => {
    const gem = GEMSTONE_DATA[planet]!;
    const a = analyses.find((x) => x.planet === planet);
    return {
      planet: gem.planet,
      planetHindi: gem.planetHindi,
      gemstone: gem.gemstone,
      gemstoneHindi: gem.gemstoneHindi,
      alternativeStones: gem.alternativeStones,
      finger: gem.finger,
      metal: gem.metal,
      dayToWear: gem.dayToWear,
      mantra: gem.mantra,
      mantraCount: gem.mantraCount,
      weightCarats: gem.weightCarats,
      color: gem.color,
      dos: gem.dos,
      donts: gem.donts,
      strength: a?.strength ?? 'average',
      recommended: a?.needsGemstone ?? false,
      reason: a?.reason ?? 'Neutral placement',
    };
  });
}

/** The jsonb we persist in gemstone_recommendations.analysis. */
interface StoredAnalysis {
  intro: string;
  notes: Record<string, string>;
  gems: DeterministicGem[];
}

async function runGemstoneGeneration(
  userId: string,
  kundli: KundliLike,
  claimedAt: Date,
): Promise<void> {
  try {
    const analyses = analyzePlanetStrengths(kundli.chartData);
    const result = await generateGemstoneReport({ chart: kundli.chartData, analyses });
    const analysis: StoredAnalysis = {
      intro: result.intro,
      notes: result.notes,
      gems: buildDeterministicGems(analyses),
    };
    await markGemstoneReady(userId, claimedAt, {
      analysis: analysis as unknown as Record<string, unknown>,
      model: result.model,
    });
  } catch (err) {
    logger.error({ err, userId }, 'gemstone report generation failed');
    await markGemstoneFailed(userId, claimedAt, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Fire-and-forget entry point used by the GET route (cache miss/retry) — one
 * bounded attempt, same as house insight. No-op ('skipped') if another run
 * already owns the claim or a ready row exists.
 */
export async function requestGemstoneGeneration(
  userId: string,
  kundli: KundliLike,
): Promise<'generated' | 'skipped'> {
  const claimed = await claimGemstoneGeneration(userId);
  if (!claimed?.startedAt) return 'skipped';
  await runGemstoneGeneration(userId, kundli, claimed.startedAt);
  return 'generated';
}

export function isGemstoneStale(row: GemstoneRecommendationRow): boolean {
  return (
    row.status === 'generating' &&
    row.startedAt !== null &&
    Date.now() - row.startedAt.getTime() > GEMSTONE_STALE_GENERATING_MS
  );
}

export { findGemstoneRecommendation };

function mergeGems(gems: DeterministicGem[], notes: Record<string, string>): GemstoneItemDto[] {
  return gems.map((g) => ({ ...g, note: notes[g.planet] ?? '' }));
}

/**
 * The gemstone report dto in the requested language. English (or no language)
 * returns the canonical row as-is. Otherwise checks the cached `translations`
 * map first; on a miss, translates the AI fields via a second LLM call and
 * persists them — same translate-on-read pattern as house insight. A
 * translation failure logs and falls back to the untranslated dto.
 */
export async function toGemstoneReportDtoForLanguage(
  row: GemstoneRecommendationRow,
  language: string,
): Promise<GemstoneReportDto> {
  const analysis = (row.analysis ?? {}) as unknown as StoredAnalysis;
  const gems = analysis.gems ?? [];
  const base: GemstoneNarrative = { intro: analysis.intro ?? '', notes: analysis.notes ?? {} };

  if (language === 'en') {
    return { status: 'ready', intro: base.intro, gems: mergeGems(gems, base.notes) };
  }

  const cached = row.translations?.[language] as unknown as GemstoneNarrative | undefined;
  if (cached?.intro) {
    return {
      status: 'ready',
      intro: cached.intro,
      gems: mergeGems(gems, cached.notes ?? base.notes),
    };
  }

  try {
    const translated = await translateGemstoneContent(base, language);
    await saveGemstoneTranslation(
      row.userId,
      language,
      translated as unknown as Record<string, unknown>,
    );
    return { status: 'ready', intro: translated.intro, gems: mergeGems(gems, translated.notes) };
  } catch (err) {
    logger.warn({ err, userId: row.userId, language }, 'failed to translate gemstone report');
    return { status: 'ready', intro: base.intro, gems: mergeGems(gems, base.notes) };
  }
}
