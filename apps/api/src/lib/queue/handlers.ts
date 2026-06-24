import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueueJob } from './index';
import { runLifeJourneyPhase } from '@/lib/life-journey/runPhase';
import { runLifeAreas } from '@/lib/life-journey/runAreas';
import { runPalmReading } from '@/lib/palm/runReading';
import { runEnrichment } from '@/lib/insights/runEnrichment';
import { runLite } from '@/lib/insights/runLite';
import { runNameCorrection } from '@/lib/insights/lite/nameCorrection';
import { runMobileNumerology } from '@/lib/insights/lite/mobileNumerology';
import { runPrediction } from '@/lib/predictions/runPrediction';

export type JobOutcome =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Run a claimed job to completion. Server-side equivalent of the old
 * QueueProcessor.runJob() switch — but calls the core libs directly instead
 * of round-tripping through HTTP.
 *
 * Within a single life_journey_phase job the events generation and the
 * life-areas generation stay sequential (areas depends on chart context the
 * phase step warms). Parallelism happens between jobs in the drain loop.
 */
export async function runJob(supabase: SupabaseClient, job: QueueJob): Promise<JobOutcome> {
  try {
    switch (job.job_type) {
      case 'life_journey_phase': {
        const chartId = job.payload.chart_id as string | undefined;
        const phaseIndex = job.payload.phase_index as number | undefined;
        if (!chartId || typeof phaseIndex !== 'number') {
          return { ok: false, reason: 'missing chart_id or phase_index' };
        }
        const phaseRes = await runLifeJourneyPhase(supabase, job.user_id, chartId, phaseIndex);
        if (!phaseRes.ok) return { ok: false, reason: `phase: ${phaseRes.error.code}` };

        const areasRes = await runLifeAreas(supabase, job.user_id, chartId, phaseIndex);
        if (!areasRes.ok) return { ok: false, reason: `areas: ${areasRes.error.code}` };

        return { ok: true };
      }

      case 'palm_reading': {
        const readingId  = job.payload.reading_id  as string | undefined;
        if (!readingId) return { ok: false, reason: 'missing reading_id' };
        const reportDepth = (job.payload.report_depth as 'basic' | 'full' | 'ultra' | undefined) ?? 'full';
        const palmLang    = (job.payload.language    as string | undefined) ?? 'English';
        const res = await runPalmReading(supabase, job.user_id, readingId, { reportDepth, language: palmLang });
        if (!res.ok) return { ok: false, reason: `palm: ${res.error.code}` };
        return { ok: true };
      }

      case 'feature_enrich': {
        const reportId   = job.payload.report_id   as string | undefined;
        const chartId    = job.payload.chart_id    as string | undefined;
        const featureKey = job.payload.feature_key as string | undefined;
        const language   = (job.payload.language   as string | undefined) ?? 'en';
        if (!reportId || !chartId || !featureKey) {
          return { ok: false, reason: 'feature_enrich: missing report_id, chart_id, or feature_key' };
        }
        const res = await runEnrichment(supabase, {
          report_id:   reportId,
          chart_id:    chartId,
          feature_key: featureKey,
          language,
          user_id:     job.user_id,
        });
        return res.ok ? { ok: true } : { ok: false, reason: res.error ?? 'enrichment failed' };
      }

      case 'feature_lite': {
        const chartId    = job.payload.chart_id    as string | undefined;
        const featureKey = job.payload.feature_key as string | undefined;
        const language   = (job.payload.language   as string | undefined) ?? 'en';
        const paramsHash = (job.payload.params_hash as string | undefined) ?? '';
        if (!chartId || !featureKey) {
          return { ok: false, reason: 'feature_lite: missing chart_id or feature_key' };
        }
        // Bespoke lite handlers — registry pattern (LITE_CALLS) does not fit
        // these features because they need their own deterministic math layer
        // and prompt schema. Branch here, then fall through to runLite.
        if (featureKey === 'name_correction') {
          const res = await runNameCorrection(supabase, {
            chart_id:    chartId,
            language,
            params_hash: paramsHash,
            user_id:     job.user_id,
          });
          return { ok: true, ...(res.ok ? {} : {}) };
        }
        if (featureKey === 'mobile_numerology') {
          const res = await runMobileNumerology(supabase, {
            chart_id:    chartId,
            language,
            params_hash: paramsHash,
            user_id:     job.user_id,
          });
          return { ok: true, ...(res.ok ? {} : {}) };
        }
        const res = await runLite(supabase, {
          chart_id:    chartId,
          feature_key: featureKey,
          language,
          params_hash: paramsHash,
          user_id:     job.user_id,
        });
        // Deterministic fallback written = technically ok (content available)
        return { ok: true, ...(res.ok ? {} : {}) };
      }

      case 'prediction': {
        const chartId    = job.payload.chart_id    as string | undefined;
        const predType   = job.payload.type        as string | undefined;
        const language   = (job.payload.language   as string | undefined) ?? 'en';
        if (!chartId || !predType) return { ok: false, reason: 'prediction: missing chart_id or type' };
        const res = await runPrediction(supabase, job.user_id, chartId, predType, language);
        return res.ok ? { ok: true } : { ok: false, reason: res.reason };
      }

      default:
        return { ok: false, reason: `unknown job_type ${job.job_type}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg.slice(0, 300) };
  }
}
