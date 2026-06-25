// =============================================================================
// Swarm — Public API Barrel
// =============================================================================
// Everything the service layer needs from the swarm, in one place.
// =============================================================================

// Pipeline runner + response compiler
export { runPipeline, compileResponse } from './pipeline.js';

// State construction
export { newState } from './state.js';
export type { SwarmState, BirthRecord, Finding, Intent, ChatMessage } from './state.js';

// Individual nodes (for direct import by service layer)
export { gatewayNode } from './agents/gateway.js';
export { metrologistNode, computeMetrology } from './agents/metrologist.js';
export { synthesizerNode } from './agents/synthesizer.js';
export { profilerNode } from './agents/profiler.js';
export { aggregatorNode } from './agents/aggregator.js';

// Scholar streaming chat
export { scholarStream, buildChatMessages } from './agents/scholar.js';

// Re-export daily synthesis for the service layer's direct path
export { synthesizeDailyForecast, moonSignPrediction, sunSignPrediction } from '../astro-tools/daily-synthesis.js';
