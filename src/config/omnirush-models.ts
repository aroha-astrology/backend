/**
 * The OpenAI models Omnirush serves through the HomeSpace ask endpoint (its PRIVATE_MODELS,
 * minus Meta's), and the reasoning-effort suffixes it accepts ("gpt-6-astra:low"). Kept in
 * config with no imports, so features.ts can offer them in Admin -> Features without pulling the
 * HTTP client (and the DB it logs usage to) into the feature registry.
 */
export const OMNIRUSH_OPENAI_MODELS = ['gpt-6-astra', 'gpt-6-sol', 'gpt-5.6-sol'] as const;
export const OMNIRUSH_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

/** Every pickable id: each model at its default effort, then at each explicit effort. */
export const SELECTABLE_OMNIRUSH_MODELS: readonly string[] = OMNIRUSH_OPENAI_MODELS.flatMap((m) => [
  m,
  ...OMNIRUSH_EFFORTS.map((e) => `${m}:${e}`),
]);

/** True for "gpt-6-astra", "gpt-6-sol:high" and so on — any id the Omnirush client must serve. */
export function isOmnirushModel(model: string | null | undefined): boolean {
  if (!model) return false;
  const [base, effort, extra] = model.split(':');
  if (extra !== undefined) return false;
  if (!(OMNIRUSH_OPENAI_MODELS as readonly string[]).includes(base ?? '')) return false;
  return effort === undefined || (OMNIRUSH_EFFORTS as readonly string[]).includes(effort);
}
