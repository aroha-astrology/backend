// =============================================================================
// Scholar Agent - Streaming chat agent using NIM
// =============================================================================

import { stream as nimStream } from '../../llm/nim-client.js';
import { CHAT_PROFILE } from '../../../config/llm.js';
import { logger } from '../../logger.js';
import type { SwarmState, ChatMessage } from '../state.js';

// =============================================================================
// System Prompt
// =============================================================================

const SCHOLAR_SYSTEM = `You are Aroha, a warm, wise, and approachable Vedic astrology guide.

Your role:
- Interpret Vedic astrological charts with empathy and insight.
- Explain planets, signs, houses, nakshatras, dashas, yogas, and doshas in clear, accessible language.
- Offer practical life guidance grounded in Jyotish principles.
- Always be respectful of the user's free will; astrology illuminates tendencies, not fixed fates.

Style guidelines:
- Use a conversational, supportive tone.
- Avoid excessive jargon; when you use Sanskrit terms, briefly explain them.
- When relevant, mention which planetary period (dasha/antardasha) is active and how it colours the current phase.
- If the user's chart data is available in context, reference specific placements to personalise your response.
- Keep responses focused and concise (2-4 paragraphs) unless the user asks for detail.
- Never claim to predict specific events with certainty.
- If you don't have enough information, ask the user for clarification rather than guessing.`;

// =============================================================================
// Message Builder
// =============================================================================

/**
 * Build the message list for a scholar chat turn.
 * Includes system prompt, optional chart context, conversation history,
 * and the current user message.
 */
export function buildChatMessages(
  state: SwarmState,
  userMessage: string,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  // System prompt
  messages.push({ role: 'system', content: SCHOLAR_SYSTEM });

  // Inject chart context if available
  const contextParts: string[] = [];

  if (state.synthesis) {
    contextParts.push(`Chart synthesis: ${JSON.stringify(state.synthesis)}`);
  }

  if (state.findings.length > 0) {
    const findingSummary = state.findings
      .filter((f) => f.kind !== 'error')
      .map((f) => `- [${f.kind}] ${f.claim}`)
      .join('\n');
    if (findingSummary) {
      contextParts.push(`Key findings:\n${findingSummary}`);
    }
  }

  if (state.metrology) {
    const metrology = state.metrology;
    if (metrology.dasha) {
      contextParts.push(`Dasha data: ${JSON.stringify(metrology.dasha)}`);
    }
  }

  if (contextParts.length > 0) {
    messages.push({
      role: 'system',
      content: `User's astrological context:\n${contextParts.join('\n\n')}`,
    });
  }

  // Conversation history (if available)
  if (state.chatContext?.history) {
    for (const msg of state.chatContext.history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Conversation summary (if available, inject as system context)
  if (state.chatContext?.summary) {
    messages.push({
      role: 'system',
      content: `Conversation summary so far: ${state.chatContext.summary}`,
    });
  }

  // Current user message
  messages.push({ role: 'user', content: userMessage });

  return messages;
}

// =============================================================================
// Streaming Chat
// =============================================================================

/**
 * Async generator that streams scholar chat tokens.
 */
export async function* scholarStream(
  state: SwarmState,
  userMessage: string,
): AsyncGenerator<string, void, unknown> {
  logger.debug({ requestId: state.requestId }, 'scholar: starting stream');

  const messages = buildChatMessages(state, userMessage);

  yield* nimStream({
    profile: CHAT_PROFILE,
    messages,
  });
}
