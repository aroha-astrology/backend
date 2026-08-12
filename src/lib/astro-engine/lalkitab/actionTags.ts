// =============================================================================
// Action tags for Lal Kitab remedies
// =============================================================================
// Extracts a small set of slugs (e.g. "feed_dog", "copper_vessel") from a
// remedy's free-text prose so the frontend can look up an illustrative image
// per slug instead of needing one bespoke illustration per remedy. See
// frontend lib/remedy-assets.ts for the slug -> image registry.
//
// Tagging happens here, at the source, rather than client-side: the /v1/remedies
// text is untranslated English today, but remedy translation is a known future
// gap (see memory aroha-remaining-i18n-gaps) — a client-side English keyword
// matcher would silently stop working the day that ships. Tagging before any
// translation step survives it.
//
// Vocabulary is deliberately scoped to concepts that actually appear in
// REMEDY_DATABASE (remedies.ts), PLANET_REMEDIES and GENERAL_REMEDIES
// (astro.service.ts) — verified by grep, not guessed. A concept with no
// matching text never fires; that's fine, the frontend falls back to a
// planet image, then an emoji (see remedy-assets.ts / app/remedies/page.tsx).

/** [pattern, slug] — checked in order; more specific patterns first so e.g.
 * "black dog" tags both `black_dog` and `dog` rather than only the generic one. */
const KEYWORD_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Animals
  [/\bblack dogs?\b/i, 'black_dog'],
  [/\bdogs?\b/i, 'dog'],
  [/\bcalf\b|\bcalves\b/i, 'cow_calf'],
  [/\bcows?\b/i, 'cow'],
  [/\bcrows?\b/i, 'crow'],
  [/\bpigeons?\b/i, 'pigeon'],
  [/\bmonkeys?\b/i, 'monkey'],
  [/\bfish\b/i, 'fish'],

  // Offerings / items
  [/\bsweet (chapatis?|breads?)\b|\bdough balls?\b|\bchapatis?\b/i, 'sweet_chapati'],
  [/\bgreen grass\b/i, 'green_grass'],
  [/\bmilk\b/i, 'milk'],
  [/\bhoney\b/i, 'honey'],
  [/\bjaggery\b/i, 'jaggery'],
  [/\brice\b/i, 'rice'],
  [/\b(black )?urad dal\b|\bblack lentils\b/i, 'black_urad_dal'],
  [/\bwheat\b/i, 'wheat'],
  [/\bsalt\b/i, 'salt'],
  [/\bturmeric\b/i, 'turmeric'],
  [/\bkumkum\b/i, 'kumkum'],
  [/\bmustard oil\b/i, 'mustard_oil'],
  [/\bghee\b/i, 'ghee'],
  // "or"-compressed shared-noun phrasing is common in the source data (e.g.
  // "brass or copper vessel", "keep honey in a brass or copper vessel") — the
  // optional `(?:\s+or\s+\w+)?` tolerates one substituted metal in between.
  [
    /\bcopper\b(?:\s+or\s+\w+)?\s+(vessels?|containers?|pots?|plates?|utensils?)\b/i,
    'copper_vessel',
  ],
  [/\bbrass\b(?:\s+or\s+\w+)?\s+(vessels?|containers?|pots?|utensils?)\b/i, 'brass_vessel'],
  [/\bgangajal\b|\bganga water\b/i, 'gangajal'],
  [/\btulsi leaves?\b/i, 'tulsi_leaf'],
  [/\bpeepal leaf\b|\bpeepal leaves\b/i, 'peepal_leaf'],
  [/\bbel patra\b|\bbilva\b/i, 'bel_patra'],

  // Places
  [/\btemples?\b/i, 'temple'],
  [/\bshiv[ae]?\s*ling(am|a)?\b/i, 'shivling'],
  [/\bpeepal trees?\b/i, 'peepal_tree'],
  [/\bbanyan trees?\b/i, 'banyan_tree'],
  [/\btulsi plants?\b/i, 'tulsi_plant'],
  [/\bflowing water\b|\brivers?\b/i, 'river'],

  // Ritual actions (mostly from PLANET_REMEDIES / GENERAL_REMEDIES prose)
  [/\bchant(ing)?\b|\brecite\b/i, 'chant_mala'],
  [/\bghee lamp\b|\blight a lamp\b/i, 'light_lamp'],
  [/\bdonate\b/i, 'donate'],
  [/\bfast(ing)?\b/i, 'fast'],
];

/**
 * Extract action slugs from a remedy's prose, in KEYWORD_RULES priority
 * order, deduplicated. Returns [] for text with no recognized concept —
 * callers must treat that as "no thumbnail", not an error.
 */
export function extractActions(text: string): string[] {
  const found = new Set<string>();
  for (const [pattern, slug] of KEYWORD_RULES) {
    if (pattern.test(text)) found.add(slug);
  }
  return [...found];
}
