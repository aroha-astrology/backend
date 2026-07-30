// =============================================================================
// Palm reading Stage C — both-hands synthesis
// =============================================================================
// Only runs when the secondary hand was captured. Compares the LEFT (janma
// hast — inherited blueprint, sanchita karma) and RIGHT (karma hast — current,
// lived path, vartamana karma) — for a right-primary reading the roles swap.
// Text-only, no image, same discipline as interpret.ts.
// =============================================================================

import { cleanJsonString } from '../horoscope.js';

export interface SynthesizePromptInput {
  primaryHandLabel: string;
  secondaryHandLabel: string;
  primaryFactsSummary: string;
  secondaryFactsSummary: string;
}

export function buildSynthesizePrompt(input: SynthesizePromptInput): string {
  return [
    `Compare two palm readings for the same person: the ${input.secondaryHandLabel} against the ${input.primaryHandLabel}. Find where they DIVERGE — that divergence is where the soul's free will is actively at work, bending what was inherited.`,
    `Secondary hand (${input.secondaryHandLabel}) facts:\n${input.secondaryFactsSummary}`,
    `Primary hand (${input.primaryHandLabel}) facts:\n${input.primaryFactsSummary}`,
    `Return ONLY a JSON object of this exact shape:\n{"karmicShift": string, "freeWillExpression": string, "growthAreas": string[], "alignmentScore": number, "panditMessage": string}`,
    `"alignmentScore" is an integer from 0 to 100: 100 means the two hands closely agree (little transformation since birth); a lower score means active, deliberate change. Choose it based on how many of the given facts actually diverge.`,
    `No markdown fences, no text outside the JSON.`,
  ].join('\n\n');
}

export interface PalmSynthesis {
  karmicShift: string;
  freeWillExpression: string;
  growthAreas: string[];
  alignmentScore: number;
  panditMessage: string;
}

export function parseSynthesizeResponse(raw: string): PalmSynthesis | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as {
      karmicShift?: unknown;
      freeWillExpression?: unknown;
      growthAreas?: unknown;
      alignmentScore?: unknown;
      panditMessage?: unknown;
    };
    if (typeof data.karmicShift !== 'string' || !data.karmicShift.trim()) return null;
    if (typeof data.freeWillExpression !== 'string' || !data.freeWillExpression.trim()) return null;
    if (typeof data.panditMessage !== 'string' || !data.panditMessage.trim()) return null;
    if (!Array.isArray(data.growthAreas)) return null;
    const growthAreas = data.growthAreas.filter(
      (g): g is string => typeof g === 'string' && g.trim().length > 0,
    );
    if (typeof data.alignmentScore !== 'number' || Number.isNaN(data.alignmentScore)) return null;
    const alignmentScore = Math.max(0, Math.min(100, Math.round(data.alignmentScore)));

    return {
      karmicShift: data.karmicShift.trim(),
      freeWillExpression: data.freeWillExpression.trim(),
      growthAreas,
      alignmentScore,
      panditMessage: data.panditMessage.trim(),
    };
  } catch {
    return null;
  }
}
