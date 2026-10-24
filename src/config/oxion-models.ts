/**
 * The models served by Oxion (https://oxionai.com/v1, an OpenAI-compatible gateway) that Admin ->
 * Features may pick for palmistry. A pick is stored as "oxion:<model>" so the one dropdown can
 * hold Gemini and Oxion side by side, and so `isOxionModel` never mistakes an Oxion "gemini-3.7-flash"
 * (billed on the Oxion key) for the Gemini one (billed on the Google keys).
 *
 * Kept in config with no imports, like omnirush-models.ts, so features.ts can list them without
 * pulling the HTTP client in. Vision was checked live on 2026-10-24 with a palm photo for every id
 * below.
 */
export const OXION_PREFIX = 'oxion:';

export const OXION_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.1-pro',
  'gpt-5.6-sol',
  'gpt-5.6-luna',
  'gpt-5.6-terra',
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-fable-5.1',
  'kimi-k3',
] as const;

export const SELECTABLE_OXION_MODELS: readonly string[] = OXION_MODELS.map(
  (m) => `${OXION_PREFIX}${m}`,
);

export function isOxionModel(model: string | null | undefined): boolean {
  return Boolean(model && model.startsWith(OXION_PREFIX) && model.length > OXION_PREFIX.length);
}

/** "oxion:claude-sonnet-5" -> "claude-sonnet-5", the id Oxion itself expects. */
export function oxionModelId(model: string): string {
  return model.slice(OXION_PREFIX.length);
}
