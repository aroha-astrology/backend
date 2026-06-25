// =============================================================================
// Gateway Agent - Consent check & response compilation
// =============================================================================

import { logger } from '../../logger.js';
import type { SwarmState, Finding } from '../state.js';

/**
 * Gateway node: validates consent and basic preconditions.
 * Returns a partial state with errors if consent is missing.
 */
export async function gatewayNode(
  state: SwarmState,
): Promise<Partial<SwarmState>> {
  logger.debug({ requestId: state.requestId, intent: state.intent }, 'gateway: enter');

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!state.consent) {
    errors.push('User consent is required before processing astrological data.');
    return { errors };
  }

  if (!state.userId) {
    errors.push('Missing userId in request.');
    return { errors };
  }

  // For intents that require a birth record, validate it exists
  const needsBirth: SwarmState['intent'][] = [
    'onboarding',
    'daily_forecast',
    'matchmaking',
  ];
  if (needsBirth.includes(state.intent) && !state.birthRecord) {
    errors.push(`Intent "${state.intent}" requires a birth record.`);
    return { errors };
  }

  // Matchmaking requires a partner record
  if (state.intent === 'matchmaking' && !state.partnerRecord) {
    errors.push('Matchmaking intent requires a partner birth record.');
    return { errors };
  }

  // Set asOf timestamp if not provided
  if (!state.asOf) {
    return { asOf: new Date().toISOString(), errors, warnings };
  }

  return { errors, warnings };
}

/**
 * Compile the final client-facing response from accumulated state.
 */
export function compileResponse(state: SwarmState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    requestId: state.requestId,
    intent: state.intent,
    locale: state.locale,
    region: state.region,
    asOf: state.asOf,
  };

  if (state.metrology) {
    payload.metrology = state.metrology;
  }

  if (state.synthesis) {
    payload.synthesis = state.synthesis;
  }

  if (state.atmosphere) {
    payload.atmosphere = state.atmosphere;
  }

  if (state.compatibility) {
    payload.compatibility = state.compatibility;
  }

  if (state.findings.length > 0) {
    payload.findings = state.findings;
  }

  if (state.errors.length > 0) {
    payload.errors = state.errors;
  }

  if (state.warnings.length > 0) {
    payload.warnings = state.warnings;
  }

  return payload;
}
