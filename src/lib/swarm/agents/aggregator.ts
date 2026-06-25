// =============================================================================
// Aggregator Agent - Deduplicate findings by id
// =============================================================================

import { logger } from '../../logger.js';
import type { SwarmState, Finding } from '../state.js';

/**
 * Aggregator pipeline node: deduplicates findings by their `id` field.
 * When duplicates exist, the last occurrence wins.
 */
export async function aggregatorNode(
  state: SwarmState,
): Promise<Partial<SwarmState>> {
  logger.debug({ requestId: state.requestId }, 'aggregator: enter');

  const seen = new Map<string, Finding>();

  for (const finding of state.findings) {
    // Last-write-wins: later findings overwrite earlier ones with the same id
    seen.set(finding.id, finding);
  }

  const deduplicated = Array.from(seen.values());
  const removedCount = state.findings.length - deduplicated.length;

  if (removedCount > 0) {
    logger.debug(
      { requestId: state.requestId, removed: removedCount },
      'aggregator: deduplicated findings',
    );
  }

  return { findings: deduplicated };
}
