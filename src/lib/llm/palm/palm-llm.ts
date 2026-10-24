// =============================================================================
// Palm reading text calls — Oxion, Omnirush or Gemini, whichever the admin picked
// =============================================================================
// Admin -> Features -> "Palm — interpretation model" offers the OpenAI models
// served through Omnirush alongside the Gemini ones. An Omnirush pick runs
// there; if Omnirush is off on this server, busy, out of its weekly grant or
// times out, the same prompt goes to Gemini instead — a paid reading is never
// failed (and refunded) just because the preferred model was unavailable.
// =============================================================================

import { generate } from '../gemini-client.js';
import { askOmnirush, isOmnirushModel, omnirushConfigured } from '../omnirush-client.js';
import { isOxionModel, oxionChat, oxionConfigured } from '../oxion-client.js';
import { logger } from '../../logger.js';
import { MODEL, type GenerationProfile } from '../../../config/llm.js';

export interface PalmTextCall {
  /** The admin-selected model: an Omnirush id ("gpt-6-astra:low") or a Gemini id. */
  model: string;
  profile: GenerationProfile;
  prompt: string;
  userId: string;
  timeoutMs?: number;
}

/** Runs one text prompt; returns the raw answer and which model actually produced it. */
export async function palmText(call: PalmTextCall): Promise<{ text: string; model: string }> {
  if (isOxionModel(call.model)) {
    if (oxionConfigured()) {
      try {
        return await oxionChat({
          model: call.model,
          messages: [{ role: 'user', content: call.prompt }],
          temperature: call.profile.temperature,
          // Thinking models spend part of the ceiling reasoning before the JSON starts.
          maxTokens: call.profile.maxTokens + 8192,
          json: call.profile.jsonMode,
          agent: call.profile.name,
          userId: call.userId,
          ...(call.timeoutMs ? { timeoutMs: call.timeoutMs } : {}),
        });
      } catch (err) {
        logger.warn(
          { err, model: call.model, profile: call.profile.name },
          'palm: Oxion failed, falling back to Gemini',
        );
      }
    }
    const text = await generate({
      profile: call.profile,
      messages: [{ role: 'user', content: call.prompt }],
      model: MODEL,
      userId: call.userId,
    });
    return { text, model: MODEL };
  }
  if (isOmnirushModel(call.model)) {
    if (omnirushConfigured()) {
      try {
        const { answer } = await askOmnirush<string>({
          prompt: call.prompt,
          model: call.model,
          agent: call.profile.name,
          userId: call.userId,
          ...(call.timeoutMs ? { timeoutMs: call.timeoutMs } : {}),
        });
        return {
          text: typeof answer === 'string' ? answer : JSON.stringify(answer),
          model: `omnirush:${call.model}`,
        };
      } catch (err) {
        logger.warn(
          { err, model: call.model, profile: call.profile.name },
          'palm: Omnirush failed, falling back to Gemini',
        );
      }
    }
    const text = await generate({
      profile: call.profile,
      messages: [{ role: 'user', content: call.prompt }],
      model: MODEL,
      userId: call.userId,
    });
    return { text, model: MODEL };
  }
  const text = await generate({
    profile: call.profile,
    messages: [{ role: 'user', content: call.prompt }],
    model: call.model,
    userId: call.userId,
  });
  return { text, model: call.model };
}
