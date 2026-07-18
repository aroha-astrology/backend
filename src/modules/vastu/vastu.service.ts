import { logger } from '../../lib/logger.js';
import { Errors } from '../../lib/errors.js';
import {
  generateVastuAnalysis,
  generateVastuAnswer,
  translateVastuContent,
} from '../../lib/llm/vastu.js';
import { deductWalletBalance, addWalletBalance } from '../users/users.repo.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
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
  saveFollowUp,
  saveVastuTranslation,
} from './vastu.repo.js';
import type { VastuPlanRow } from '../../db/schema.js';
import type { AnalyzeVastuBody, VastuPlanDto } from './vastu.schemas.js';

const DAILY_LIMIT = 20;
export const VASTU_COST_PAISE = 5000;

/** Best-effort birth-chart summary for personalising the analysis. */
function buildChartContext(kundli: Awaited<ReturnType<typeof findKundliByUserId>>): string {
  if (!kundli || kundli.status !== 'ready') {
    return 'No birth chart is available for this resident yet — give full Vastu advice and keep chart alignment general.';
  }
  const dasha = kundli.dashaData as {
    currentMahadasha?: { lord?: string };
    currentAntardasha?: { lord?: string };
  } | null;
  const chart = kundli.chartData as {
    ascendant?: { sign?: string };
    planets?: Array<{ planet: string; sign: string; house?: number }>;
  } | null;

  const lines: string[] = [];
  if (chart?.ascendant?.sign) lines.push(`Ascendant: ${chart.ascendant.sign}`);
  if (dasha?.currentMahadasha?.lord)
    lines.push(`Current Mahadasha: ${dasha.currentMahadasha.lord}`);
  if (dasha?.currentAntardasha?.lord)
    lines.push(`Current Antardasha: ${dasha.currentAntardasha.lord}`);
  if (chart?.planets?.length) {
    lines.push(
      'Planet placements: ' +
        chart.planets
          .map((p) => `${p.planet} in ${p.sign}${p.house ? ` (house ${p.house})` : ''}`)
          .join(', '),
    );
  }
  return lines.length > 0
    ? lines.join('\n')
    : 'No birth chart is available for this resident yet — keep chart alignment general.';
}

export async function requestVastuAnalysis(
  userId: string,
  body: AnalyzeVastuBody,
): Promise<{ planId: string }> {
  const recentCount = await countRecentPlansForUser(userId, 24);
  if (recentCount >= DAILY_LIMIT) {
    throw Errors.tooManyRequests(
      `You've reached today's limit of ${DAILY_LIMIT} Vastu reports. Try again tomorrow.`,
    );
  }

  // Charge up-front; refunded below if we can't even queue the job, or later if
  // the async generation fails.
  const charged = await deductWalletBalance(userId, VASTU_COST_PAISE);
  if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');

  try {
    const { roomScores, overallScore } = evaluateRoomPlacement(body.roomLayout);
    const kundli = await findKundliByUserId(userId);
    const chartContext = buildChartContext(kundli);
    const houseShape = body.houseShape ?? 'rectangle';
    const roomDetails = { ...body.roomDetails, houseShape };

    const row = await insertPendingPlan({
      userId,
      layout: body.layout ?? null,
      roomLayout: body.roomLayout,
      roomDetails,
      overallScore,
      language: body.language,
      status: 'pending',
    });

    void processAnalysis(row.id, userId, {
      roomLayout: body.roomLayout,
      roomDetails,
      roomScores,
      overallScore,
      language: body.language,
      chartContext,
      houseShape,
    }).catch((err) => {
      logger.error({ err, planId: row.id }, 'vastu background processing failed');
    });

    return { planId: row.id };
  } catch (err) {
    await addWalletBalance(userId, VASTU_COST_PAISE).catch(() => {});
    throw err;
  }
}

async function processAnalysis(
  planId: string,
  userId: string,
  input: {
    roomLayout: Record<string, string[]>;
    roomDetails: Record<string, unknown>;
    roomScores: ReturnType<typeof evaluateRoomPlacement>['roomScores'];
    overallScore: number;
    language: string;
    chartContext: string;
    houseShape?: string;
  },
): Promise<void> {
  await markProcessing(planId);
  try {
    const { analysis } = await generateVastuAnalysis(input);
    await markDone(planId, {
      ...analysis,
      vastuScores: input.roomScores,
      overallVastuScore: input.overallScore,
    });
  } catch (err) {
    logger.error({ err, planId }, 'vastu LLM analysis failed');
    await markError(planId, err instanceof Error ? err.message : 'Unknown error');
    // Don't charge for a report we couldn't produce.
    await addWalletBalance(userId, VASTU_COST_PAISE).catch(() => {});
  }
}

export async function askVastuQuestion(
  planId: string,
  userId: string,
  question: string,
): Promise<VastuPlanDto> {
  const row = await findPlanForUser(planId, userId);
  if (!row) throw Errors.notFound('Vastu plan not found');
  if (row.status !== 'done' || !row.analysis) {
    throw Errors.conflict('Report is not ready yet');
  }
  if ((row.analysis as { followUp?: unknown }).followUp) {
    throw Errors.conflict('ALREADY_ASKED');
  }

  const kundli = await findKundliByUserId(userId);
  const answer = await generateVastuAnswer({
    analysis: row.analysis,
    question,
    chartContext: buildChartContext(kundli),
    language: row.language,
  });
  await saveFollowUp(planId, { question, answer });

  const updated = await findPlanForUser(planId, userId);
  return toVastuPlanDto(updated ?? row);
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
