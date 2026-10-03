// =============================================================================
// Human voice rule
// =============================================================================
// One short writing rule shared by the report narrative prompts
// (lib/llm/reports/*.ts) so paid reports stop reading as machine-written: fake
// "not X, it's Y" contrasts, dramatic one-line closers, groups of three, dashes
// between every clause, and the stock vocabulary ("journey", "profound",
// "tapestry").
//
// Deliberately NOT in the chat prompt (lib/swarm/agents/scholar.ts). Measured on
// 2026-10-03 over three questions, four runs each on gemini-3.1-flash-lite: with
// the rule in SHARED_PROMPT_RULES the replies were the same length and carried
// the same number of filler contrasts as without it, so it would only add input
// tokens to the highest-volume path. Appended at the very end of the prompt
// instead, it made the model drop the "Ask next:" prefix from the {{income}}
// line in 4 runs of 4. On the report calls the same rule cut the written text
// by 10-20% and the filler contrasts by about half.
//
// Condensed from blader/humanizer's pattern list (MIT,
// https://github.com/blader/humanizer), itself built on Wikipedia's "Signs of AI
// writing". Only the patterns that actually show up in this app's output are
// kept: the full list is ~8,000 tokens and would be re-billed as input on every
// call, where this is ~180. It is a prompt rule on the existing call, never a
// second "rewrite" pass, so it adds no LLM call and cannot alter a computed
// fact after the fact.
//
// Not added to translation prompts: those must re-emit the English faithfully,
// and the English they translate has already been written under this rule.
// =============================================================================

export const HUMAN_VOICE_RULE =
  'Write the way a thoughtful person talks to one specific reader. State each point directly: no "it\'s not X, it\'s Y" or "X rather than Y" contrast unless both halves are facts, no dramatic one-line closer that repeats the paragraph, no wise-sounding sayings, no run-up before the point ("Here\'s the thing", "Let\'s dive in"). Do not group things in threes by habit; use as many items as the facts give. Join clauses with commas and periods, not dashes. Use plain words: "is" and "has", not "serves as" or "boasts"; avoid delve, tapestry, journey, testament, landscape, vibrant, profound, pivotal, navigate, embrace, unlock. Do not inflate: no "pivotal moment", no "the future looks bright", no sales adjectives. Vary sentence length. End on the last concrete fact or piece of advice, not a summary or a blessing. These rules apply in whatever language you write.';
