import { logger } from '../../lib/logger.js';
import { Errors } from '../../lib/errors.js';
import { generateVastuAnalysis, translateVastuContent } from '../../lib/llm/vastu.js';
import { evaluateRoomPlacement } from './vastu.rules.js';
import {
  insertPendingPlan,
  listPlansForUser,
  findPlanForUser,
  countRecentPlansForUser,
  markProcessing,
  markDone,
  markError,
  deletePlanForUser,
  saveVastuTranslation,
} from './vastu.repo.js';
import type { VastuPlanRow } from '../../db/schema.js';
import type { AnalyzeVastuBody, VastuPlanDto } from './vastu.schemas.js';

const DAILY_LIMIT = 10;

export async function requestVastuAnalysis(
  userId: string,
  body: AnalyzeVastuBody,
): Promise<{ planId: string }> {
  const recentCount = await countRecentPlansForUser(userId, 24);
  if (recentCount >= DAILY_LIMIT) {
    throw Errors.tooManyRequests(
      `You've reached today's limit of ${DAILY_LIMIT} Vastu analyses. Try again tomorrow.`,
    );
  }

  const { roomScores, overallScore } = evaluateRoomPlacement(body.roomLayout);

  const row = await insertPendingPlan({
    userId,
    layout: body.layout ?? null,
    roomLayout: body.roomLayout,
    roomDetails: body.roomDetails,
    overallScore,
    language: body.language,
    status: 'pending',
  });

  // Fire-and-forget: single-instance pm2 (-i 1) keeps the background task alive
  // until it finishes — same pattern as purchase-plan.
  void processAnalysis(row.id, {
    roomLayout: body.roomLayout,
    roomDetails: body.roomDetails,
    roomScores,
    overallScore,
    language: body.language,
  }).catch((err) => {
    logger.error({ err, planId: row.id }, 'vastu background processing failed');
  });

  return { planId: row.id };
}

async function processAnalysis(
  planId: string,
  input: {
    roomLayout: Record<string, string[]>;
    roomDetails: Record<string, unknown>;
    roomScores: ReturnType<typeof evaluateRoomPlacement>['roomScores'];
    overallScore: number;
    language: string;
  },
): Promise<void> {
  await markProcessing(planId);
  try {
    const { analysis } = await generateVastuAnalysis(input);
    // Fold the deterministic scores back in so the client always has them.
    await markDone(planId, {
      ...analysis,
      vastuScores: input.roomScores,
      overallVastuScore: input.overallScore,
    });
  } catch (err) {
    logger.error({ err, planId }, 'vastu LLM analysis failed');
    await markError(planId, err instanceof Error ? err.message : 'Unknown error');
  }
}

export function toVastuPlanDto(row: VastuPlanRow): VastuPlanDto {
  return {
    id: row.id,
    status: row.status,
    overallScore: row.overallScore,
    roomLayout: row.roomLayout,
    analysis: row.analysis,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function toVastuPlanDtoForLanguage(
  row: VastuPlanRow,
  language = 'en',
): Promise<VastuPlanDto> {
  const baseDto = toVastuPlanDto(row);
  if (language === 'en' || !baseDto.analysis || baseDto.status !== 'done') {
    return baseDto;
  }
  if (row.translations && row.translations[language]) {
    return { ...baseDto, analysis: row.translations[language] };
  }
  try {
    const translated = await translateVastuContent(baseDto.analysis, language);
    await saveVastuTranslation(row.id, language, translated);
    return { ...baseDto, analysis: translated };
  } catch (err) {
    logger.warn({ err, planId: row.id, language }, 'failed to translate vastu analysis');
    return baseDto;
  }
}

export async function getPlansForUser(userId: string, language = 'en'): Promise<VastuPlanDto[]> {
  const rows = await listPlansForUser(userId);
  return Promise.all(rows.map((r) => toVastuPlanDtoForLanguage(r, language)));
}

export async function getPlanForUser(
  id: string,
  userId: string,
  language = 'en',
): Promise<VastuPlanDto> {
  const row = await findPlanForUser(id, userId);
  if (!row) throw Errors.notFound('Vastu plan not found');
  return toVastuPlanDtoForLanguage(row, language);
}

export async function removePlanForUser(id: string, userId: string): Promise<void> {
  const row = await findPlanForUser(id, userId);
  if (!row) throw Errors.notFound('Vastu plan not found');
  await deletePlanForUser(id, userId);
}
