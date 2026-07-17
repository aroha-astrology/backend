// =============================================================================
// Shared helper for the "translate an already-generated free-form JSON blob"
// pattern (vastu, purchase-plan — large, deeply-nested, mostly-optional
// objects with no responseSchema on the translation call, unlike
// horoscope/house-insight/gemstone which use strict json_schema mode). A
// single free-form LLM call over an object this large routinely translates
// only some of the leaves, or drops a key outright — returning the
// translated object wholesale means a dropped key just vanishes from the
// report and a skipped-but-present string silently stays in English, both
// of which read as "some text not changing" to a user comparing sections
// within the same report.
// =============================================================================

/**
 * Recursively merges a translation attempt onto the original English value,
 * preferring the translated leaf whenever present and non-empty, and
 * falling back to the original leaf otherwise. Always returns a value with
 * exactly the original's shape — nothing the model dropped can vanish.
 */
export function mergeTranslatedContent(original: unknown, translated: unknown): unknown {
  if (typeof original === 'string') {
    return typeof translated === 'string' && translated.trim() ? translated : original;
  }
  if (Array.isArray(original)) {
    if (Array.isArray(translated) && translated.length === original.length) {
      return original.map((item, i) => mergeTranslatedContent(item, translated[i]));
    }
    return original;
  }
  if (original && typeof original === 'object') {
    if (!translated || typeof translated !== 'object') return original;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(original as Record<string, unknown>)) {
      result[key] = mergeTranslatedContent(val, (translated as Record<string, unknown>)[key]);
    }
    return result;
  }
  // numbers/booleans/null are never translated — keep the original as-is.
  return original;
}
