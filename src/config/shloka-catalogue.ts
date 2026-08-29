// =============================================================================
// Mirror of the frontend's `public/shlokas/shlokas.json` — slug, English title
// and tags only (no Sanskrit, no IAST, no 7-language fields).
//
// Duplicated across repos deliberately. The Shlokas & Japs library is a static
// asset in the FRONTEND repo with no backend module behind it at all — no
// table, no route, no service (see that repo's lib/shlokas.ts header for why).
// So this table is the only way the horoscope prompt can name a real mantra
// instead of inventing one.
//
// `slug` is the contract between the two repos, and the only field the API
// actually returns. Drift fails soft on purpose: a slug the frontend can't
// resolve makes the remedy card silently not render, rather than erroring or
// showing a broken row. Titles/tags here are prompt context only — if one goes
// stale the model just reads a slightly dated label.
//
// Regenerate from the frontend checkout by reading slug/title.en/tags out of
// public/shlokas/shlokas.json; horoscope-remedy.spec.ts asserts the count and
// slug-uniqueness so a botched edit here fails the suite rather than prod.
// =============================================================================

export interface ShlokaCatalogueEntry {
  slug: string;
  title: string;
  /** Comma-separated theme tags, as the prompt renders them. */
  tags: string;
}

export const SHLOKA_CATALOGUE: readonly ShlokaCatalogueEntry[] = [
  { slug: 'gayatri-mantra', title: 'Gayatri Mantra', tags: 'wisdom, daily-chant' },
  { slug: 'mahamrityunjaya-mantra', title: 'Mahamrityunjaya Mantra', tags: 'protection, health' },
  { slug: 'ganesh-vandana', title: 'Ganesha Vandana', tags: 'new-beginnings, success' },
  { slug: 'guru-mantra', title: 'Guru Mantra', tags: 'knowledge, wisdom' },
  { slug: 'saraswati-vandana', title: 'Saraswati Vandana', tags: 'knowledge, wisdom' },
  { slug: 'shanti-mantra', title: 'Shanti Mantra (Om Saha Navavatu)', tags: 'peace, daily-chant' },
  { slug: 'asato-ma-sadgamaya', title: 'Asato Ma Sadgamaya', tags: 'peace, wisdom' },
  { slug: 'purnamadah-purnamidam', title: 'Purnamadah Purnamidam', tags: 'peace, wisdom' },
  {
    slug: 'karagre-vasate-lakshmi',
    title: 'Karagre Vasate Lakshmi',
    tags: 'prosperity, daily-chant',
  },
  {
    slug: 'shubham-karoti-kalyanam',
    title: 'Shubham Karoti Kalyanam',
    tags: 'prosperity, daily-chant',
  },
  { slug: 'tvameva-mata', title: 'Tvameva Mata Cha Pita Tvameva', tags: 'peace, love' },
  { slug: 'shri-rama-stuti', title: 'Shri Rama Stuti', tags: 'protection, strength' },
  { slug: 'hanuman-dhyana', title: 'Hanuman Dhyana Shloka', tags: 'strength, protection' },
  { slug: 'vishnu-shantakaram', title: 'Vishnu Shantakaram', tags: 'peace, protection' },
  { slug: 'lakshmi-mantra', title: 'Lakshmi Mantra', tags: 'prosperity, abundance' },
  { slug: 'durga-mantra', title: 'Durga Mantra', tags: 'strength, protection' },
  { slug: 'navagraha-mantra', title: 'Navagraha Mantra', tags: 'protection, energy' },
  { slug: 'aditya-hrudayam', title: 'Aditya Hrudayam (selected verses)', tags: 'strength, energy' },
  { slug: 'gita-2-47', title: 'Bhagavad Gita 2.47', tags: 'wisdom, knowledge' },
  { slug: 'gita-4-7', title: 'Bhagavad Gita 4.7', tags: 'protection, wisdom' },
  { slug: 'gita-4-8', title: 'Bhagavad Gita 4.8', tags: 'protection, strength' },
  { slug: 'gita-18-66', title: 'Bhagavad Gita 18.66', tags: 'peace, protection' },
  { slug: 'gita-12-15', title: 'Bhagavad Gita 12.15', tags: 'peace, wisdom' },
  { slug: 'gita-6-5', title: 'Bhagavad Gita 6.5', tags: 'strength, wisdom' },
  { slug: 'gita-2-20', title: 'Bhagavad Gita 2.20', tags: 'wisdom, peace' },
  { slug: 'narayana-mantra', title: 'Narayana Mantra (Ashtakshari)', tags: 'peace, daily-chant' },
  { slug: 'krishna-mantra', title: 'Krishna Mantra', tags: 'love, daily-chant' },
  { slug: 'shiva-panchakshari', title: 'Shiva Panchakshari', tags: 'peace, daily-chant' },
  {
    slug: 'vishnu-dwadashakshari',
    title: 'Vishnu Dwadashakshari',
    tags: 'protection, prosperity',
  },
  { slug: 'hare-krishna-mahamantra', title: 'Hare Krishna Mahamantra', tags: 'love, daily-chant' },
  { slug: 'rama-taraka-mantra', title: 'Rama Taraka Mantra', tags: 'protection, peace' },
  { slug: 'shri-sukta', title: 'Shri Sukta (opening verse)', tags: 'prosperity, abundance' },
  { slug: 'purusha-sukta', title: 'Purusha Sukta (opening verse)', tags: 'wisdom, knowledge' },
  { slug: 'narayanopanishad-mantra', title: 'Narayanopanishad Mantra', tags: 'peace, wisdom' },
  { slug: 'narasimha-mantra', title: 'Narasimha Mantra', tags: 'protection, strength' },
  { slug: 'dattatreya-mantra', title: 'Dattatreya Mantra', tags: 'wisdom, healing' },
  { slug: 'kalabhairava-mantra', title: 'Kalabhairava Mantra', tags: 'protection, strength' },
  { slug: 'annapurna-stotram', title: 'Annapurna Stotram (key verse)', tags: 'prosperity, health' },
  {
    slug: 'shiva-dhyana',
    title: 'Shiva Dhyana Shloka (Karpura Gauram)',
    tags: 'peace, protection',
  },
  { slug: 'ganga-stotram', title: 'Ganga Stotram (opening verse)', tags: 'healing, peace' },
  { slug: 'tulsi-prarthana', title: 'Tulsi Prarthana', tags: 'health, daily-chant' },
  { slug: 'surya-namaskar-mantra', title: 'Surya Namaskar Mantras', tags: 'energy, health' },
  {
    slug: 'shiva-tandava-stotram',
    title: 'Shiva Tandava Stotram (opening verse)',
    tags: 'strength, energy',
  },
  { slug: 'lingashtakam', title: 'Lingashtakam (opening verse)', tags: 'peace, protection' },
  { slug: 'madhurashtakam', title: 'Madhurashtakam (opening verse)', tags: 'love, daily-chant' },
  { slug: 'govindashtakam', title: 'Govindashtakam (opening verse)', tags: 'love, wisdom' },
  {
    slug: 'rama-raksha-stotram',
    title: 'Rama Raksha Stotram (opening verses)',
    tags: 'protection, strength',
  },
  {
    slug: 'devi-kavacham',
    title: 'Devi Kavacham (Navadurga verses)',
    tags: 'protection, strength',
  },
  { slug: 'hanuman-gayatri', title: 'Hanuman Gayatri', tags: 'strength, energy' },
  { slug: 'narayana-gayatri', title: 'Narayana Gayatri', tags: 'peace, wisdom' },
];

/** The response-schema enum AND the parser's allowlist — the model cannot return anything else. */
export const SHLOKA_SLUGS: string[] = SHLOKA_CATALOGUE.map((s) => s.slug);

/** One `slug — title (tags)` line per mantra, for the daily prompt's picker block. */
export const SHLOKA_CATALOGUE_BLOCK: string = SHLOKA_CATALOGUE.map(
  (s) => `- ${s.slug} — ${s.title} (${s.tags})`,
).join('\n');
