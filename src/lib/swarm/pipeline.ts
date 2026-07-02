// =============================================================================
// Swarm Pipeline
// =============================================================================
// Orchestrates the multi-agent sequence:
//   gateway → metrologist → synthesizer + profiler (sequential) → aggregator
//
// TypeScript port of the Python LangGraph graph (graph.py).
// We run synthesizer and profiler sequentially (not true parallel), merging
// their findings arrays before passing to the aggregator.
// =============================================================================

import { logger } from '../logger.js';
import { gatewayNode, compileResponse } from './agents/gateway.js';
import { metrologistNode } from './agents/metrologist.js';
import { synthesizerNode } from './agents/synthesizer.js';
import { profilerNode } from './agents/profiler.js';
import { aggregatorNode } from './agents/aggregator.js';
import type { SwarmState, Finding } from './state.js';

// =============================================================================
// Merge helper
// =============================================================================

/**
 * Merge a partial state update into the current state.
 * Arrays (findings, errors, warnings) are concatenated.
 * All other keys are overwritten.
 */
function mergeState(current: SwarmState, patch: Partial<SwarmState>): SwarmState {
  const merged: SwarmState = { ...current };

  if (patch.findings) {
    merged.findings = [...(current.findings ?? []), ...patch.findings];
  }
  if (patch.errors) {
    merged.errors = [...(current.errors ?? []), ...patch.errors];
  }
  if (patch.warnings) {
    merged.warnings = [...(current.warnings ?? []), ...patch.warnings];
  }

  // Merge non-array keys
  for (const key of Object.keys(patch) as Array<keyof SwarmState>) {
    if (key === 'findings' || key === 'errors' || key === 'warnings') continue;

    (merged as any)[key] = (patch as any)[key];
  }

  return merged;
}

// =============================================================================
// Pipeline runner
// =============================================================================

/**
 * Run the full swarm pipeline for a given initial state.
 * Returns the final accumulated SwarmState.
 */
export async function runPipeline(initialState: SwarmState): Promise<SwarmState> {
  let state = initialState;

  // ── Gateway ───────────────────────────────────────────────────────────────
  logger.info({ requestId: state.requestId, intent: state.intent }, 'pipeline: gateway');
  const gatewayPatch = await gatewayNode(state);
  state = mergeState(state, gatewayPatch);

  // Short-circuit on gateway errors (consent / missing fields)
  if (state.errors.length > 0) {
    logger.warn(
      { requestId: state.requestId, errors: state.errors },
      'pipeline: gateway failed, aborting',
    );
    return state;
  }

  // Intents that need metrology
  const needsMetrology: SwarmState['intent'][] = ['onboarding', 'daily_forecast', 'matchmaking'];

  if (needsMetrology.includes(state.intent)) {
    // ── Metrologist ─────────────────────────────────────────────────────────
    logger.info({ requestId: state.requestId }, 'pipeline: metrologist');
    const metrologistPatch = await metrologistNode(state);
    state = mergeState(state, metrologistPatch);

    if (state.errors.length > 0) {
      logger.warn({ requestId: state.requestId }, 'pipeline: metrologist failed');
      // Don't abort — synthesizer/profiler will gracefully degrade
    }

    // ── Synthesizer ──────────────────────────────────────────────────────────
    logger.info({ requestId: state.requestId }, 'pipeline: synthesizer');
    const synthesizerPatch = await synthesizerNode(state);
    state = mergeState(state, synthesizerPatch);

    // ── Profiler ──────────────────────────────────────────────────────────────
    logger.info({ requestId: state.requestId }, 'pipeline: profiler');
    const profilerPatch = await profilerNode(state);
    state = mergeState(state, profilerPatch);
  }

  // ── Aggregator ──────────────────────────────────────────────────────────
  logger.info({ requestId: state.requestId }, 'pipeline: aggregator');
  const aggregatorPatch = await aggregatorNode(state);
  state = mergeState(state, aggregatorPatch);

  logger.info(
    {
      requestId: state.requestId,
      findingCount: state.findings.length,
      errors: state.errors.length,
    },
    'pipeline: complete',
  );

  return state;
}

// Re-export compileResponse for convenience
export { compileResponse };
