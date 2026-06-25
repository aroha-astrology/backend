// =============================================================================
// Personalized daily horoscope generation (LLM).
//
// The real implementation will build a prompt from the full user context and
// call the NVIDIA NIM client (./nim-client.ts). Until that engine lands, this
// returns a fixed stub so the daily-horoscope CRON pipeline can be built and
// tested end-to-end.
// =============================================================================

/** Everything we know about a user, handed to the LLM to personalize from. */
export interface HoroscopeContext {
  userId: string;
  /** The date (YYYY-MM-DD, IST) the horoscope is for. */
  forDate: string;
  profile: Record<string, unknown>;
  preferences: Record<string, unknown>;
  /** The user's natal kundli (chart/dasha/yogas/doshas), if generated. */
  kundli: Record<string, unknown> | null;
}

export interface HoroscopeResult {
  summary: string;
  /** Identifier of the model that produced the summary. */
  model: string;
}

const STUB_SUMMARY =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod ' +
  'tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.';

/**
 * Produce a personalized horoscope summary from the user's full context.
 *
 * STUBBED: returns a fixed value and does NOT call any external API.
 *
 * TODO(llm): build a prompt from `ctx` and call the NVIDIA NIM client
 * (`generate` in ./nim-client.ts) with a horoscope GenerationProfile.
 * TODO(privacy): when the real external API is wired, only send data for users
 * who granted data-processing consent — birth PII leaves our system here.
 */
export async function generateHoroscopeSummary(ctx: HoroscopeContext): Promise<HoroscopeResult> {
  // Reference ctx so the signature/usage is real for when the LLM is wired.
  void ctx;
  await Promise.resolve();
  return { summary: STUB_SUMMARY, model: 'stub' };
}
