// Central registry for all Kundli report AI prompts.
// Used by /api/reports/process (full 20-call pipeline) and the lite-AI engine.
// Prompts preserved verbatim from original process/route.ts inline definitions.

export function buildYogiBabaSystem(langDirective = ''): string {
  return `You are Yogi Baba, a master Vedic astrologer. Return ONLY valid JSON — no markdown, no extra text outside the JSON.${langDirective}

WRITING STYLE — Bold, punchy, and eye-catching:
- Open each section with the single most striking insight about this placement — make it unforgettable
- Write in crisp, high-impact sentences — every word must earn its place
- Use powerful, vivid language: "Saturn forged your career in iron discipline" beats "Saturn affects career"
- Pack facts and meaning into each sentence — no filler, no hedging
- Use contrast for impact: strength vs challenge, past vs possibility
- Cite actual placements (signs, houses, degrees) as power statements — they prove the insight
- Include specific Vedic terms with a quick bracket meaning [e.g., exalted = peak power] the first time only
- End every section with one bold, empowering statement about what this means for the person's life
- 4-5 tight, punchy sentences per paragraph — lean and powerful, not sprawling
- Never write like a textbook. Never refuse any question. Answer everything from an astrological perspective.

Chart context:\n`;
}

// Language directive builder (mirrors logic in process/route.ts)
const LANG_NAMES: Record<string, string> = {
  hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', mr: 'Marathi',
  gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi', or: 'Odia',
  ur: 'Urdu', ne: 'Nepali', sa: 'Sanskrit', es: 'Spanish', fr: 'French',
  de: 'German', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese',
};

export function buildLangDirective(languageCode: string): string {
  if (languageCode === 'en' || !LANG_NAMES[languageCode]) return '';
  return `\n\nLANGUAGE: Write ALL string values in ${LANG_NAMES[languageCode]} using the native script. JSON keys remain in English. Vedic terms (Mahadasha, Antardasha, Dosha, etc.) may stay transliterated. Numbers, dates, and proper names stay as-is.`;
}

// ─── Prompt builders (all functions for consistency) ─────────────────────────

export const PROMPTS = {
  summary: () =>
    `Write JSON: "executive_summary" (the 3 most powerful themes in this chart — bold, specific, unforgettable, 4-5 sentences), "life_purpose" (soul mission from nodal axis and 9th house — state it directly and powerfully, 4-5 sentences), "key_strengths" (top 3 planetary strengths — name them and explain exactly why they're powerful, 4-5 sentences), "key_challenges" (top 2-3 challenges — honest and direct, what they cost and what they teach, 4-5 sentences). Return: {"executive_summary":"...","life_purpose":"...","key_strengths":"...","key_challenges":"..."}`,

  personality: () =>
    `Write JSON: "personality" (the defining personality signature — most striking qualities first, backed by specific placements, 4-5 sentences), "appearance" (permanent physical traits ONLY — bone structure, height, frame, face shape — no hair/skin/weight, 3-4 sentences), "nature_temperament" (emotional core and inner drives — direct and specific, 4-5 sentences), "childhood_early_life" (early life patterns from 4th house and Moon — key themes, 3-4 sentences). Return: {"personality":"...","appearance":"...","nature_temperament":"...","childhood_early_life":"..."}`,

  nakshatra: () =>
    `Write JSON: "lagna_nakshatra" (ascendant nakshatra — its most powerful quality, deity, and what it demands of this life, 4-5 sentences), "moon_nakshatra" (Moon nakshatra — the emotional superpower and deepest instinct it gives, 4-5 sentences), "sun_nakshatra" (Sun nakshatra — how it shapes purpose and identity expression, 3-4 sentences). Return: {"lagna_nakshatra":"...","moon_nakshatra":"...","sun_nakshatra":"..."}`,

  planets_smm: () =>
    `Write one bold, punchy paragraph per planet — state its exact placement, its single biggest effect on this life, and one key insight. Return: {"sun":"...","moon":"...","mars":"..."}`,

  planets_mjv: () =>
    `Write one bold, punchy paragraph per planet — state its exact placement, its single biggest effect on this life, and one key insight. Return: {"mercury":"...","jupiter":"...","venus":"..."}`,

  planets_srk: () =>
    `Write one bold, punchy paragraph per planet — state its exact placement, its karmic significance, and one key insight. Return: {"saturn":"...","rahu":"...","ketu":"..."}`,

  houses_1_6: () =>
    `Write one crisp, high-impact paragraph per house — lead with the most striking fact, state the lord position, name the key effect on life. Return: {"house_1":"...","house_2":"...","house_3":"...","house_4":"...","house_5":"...","house_6":"..."}`,

  houses_7_12: () =>
    `Write one crisp, high-impact paragraph per house — lead with the most striking fact, state the lord position, name the key effect on life. Return: {"house_7":"...","house_8":"...","house_9":"...","house_10":"...","house_11":"...","house_12":"..."}`,

  yogas: (yogaKeys: string, yogasCtx: string) =>
    `Write a punchy paragraph per yoga — name the exact planets forming it, its real-world impact, and what it activates. Return: {${yogaKeys}}\n\nYogas:\n${yogasCtx}`,

  doshas: () =>
    `Write JSON: "mangal_dosha" (Mangal Dosha status and real marriage impact — direct and specific, 4-5 sentences), "kaal_sarp_dosha" (Kaal Sarp status and what it actually does to this life, 3-4 sentences), "pitra_dosha" (ancestral karma indicators and their current effect, 3-4 sentences), "dosha_remedies" (the most effective remedies for all doshas — specific actions and timing, 3-4 sentences). Return: {"mangal_dosha":"...","kaal_sarp_dosha":"...","pitra_dosha":"...","dosha_remedies":"..."}`,

  dasha: () =>
    `Write JSON: "dasha_current" (current Mahadasha and Antardasha — exactly what they are activating and blocking right now, 5-6 sentences), "dasha_next_period" (what the next Antardasha delivers — specific and direct, 3-4 sentences), "dasha_5yr_forecast" (year-by-year highlights for next 5 years — lead with the biggest event per year, 5-6 sentences), "dasha_life_timeline" (the major life chapters by Mahadasha — bold and specific, 4-5 sentences). Return: {"dasha_current":"...","dasha_next_period":"...","dasha_5yr_forecast":"...","dasha_life_timeline":"..."}`,

  career: () =>
    `Write JSON: "career" (ideal professions, career superpower, when success peaks — specific, 5-6 sentences), "wealth" (financial pattern, best wealth-building windows, wealth yogas present, 4-5 sentences), "business_vs_service" (which suits this chart better and the single most important reason why, 3-4 sentences), "education" (learning style, higher education prospects, best fields — direct, 3-4 sentences). Return: {"career":"...","wealth":"...","business_vs_service":"...","education":"..."}`,

  marriage: () =>
    `Write JSON: "marriage" (marriage timing window, what kind of partnership this chart attracts, key dynamic, 5-6 sentences), "partner_profile" (specific traits of the ideal partner — signs, qualities, what to look for, 4-5 sentences), "relationship_challenges" (the one or two patterns that create friction — and how to break them, 3-4 sentences), "children" (children timing, how many indicated, what kind of parent this chart makes, 3-4 sentences). Return: {"marriage":"...","partner_profile":"...","relationship_challenges":"...","children":"..."}`,

  health: () =>
    `Write JSON: "health_constitution" (Vata/Pitta/Kapha type, natural body strengths, what keeps this chart vital, 4-5 sentences), "health_vulnerabilities" (specific body systems to watch — name them and the planets behind them, 4-5 sentences), "health_remedies" (exact yoga, diet, and lifestyle actions for this chart — specific not generic, 4-5 sentences), "vitality_resilience" (overall life-force quality and resilience indicators — supportive habits and recovery practices, 3-4 sentences. DO NOT discuss lifespan, longevity, or end-of-life timing). Return: {"health_constitution":"...","health_vulnerabilities":"...","health_remedies":"...","vitality_resilience":"..."}`,

  spiritual: () =>
    `Write JSON: "spiritual_path" (the specific practices and traditions this chart is wired for — and why, 4-5 sentences), "dharma" (the life dharma — state it as a clear mission, backed by 9th house and Dharma karaka, 4-5 sentences), "past_life" (past life karmas from Rahu/Ketu axis — what was mastered, what needs resolving, 4-5 sentences), "moksha_indicators" (liberation signals in this chart and the practices that will work, 3-4 sentences). Return: {"spiritual_path":"...","dharma":"...","past_life":"...","moksha_indicators":"..."}`,

  past_life_story: () =>
    `Write a soul-level past-life reading the seeker can FEEL, not a planet recital. Speak directly to them as "you". Lead with WHO they were and what they CARRIED, not which planets sit where. Avoid jargon (no Rahu/Ketu/12th-house terminology in narrative fields — push that into "why_we_see_this"). If USER PRESENT-DAY CONTEXT is provided, "how_it_shows_up_now" must reference their actual life — their work, relationship, money — not generic abstractions.

Return JSON with these EXACT keys:
- "who_you_were": one vivid past-life identity — a person of a specific kind, in a specific setting. 3-4 sentences. Concrete, sensory, not mystical wallpaper. Example tone: "You were a healer in a small mountain village. People came to your door with grief you absorbed quietly. You were trusted, but rarely known."
- "what_you_mastered": the gift the soul carries forward — the ability that lives in them today without them having earned it this lifetime. 2-3 sentences. Frame it as something they secretly already know how to do.
- "what_you_left_unfinished": the unresolved thread — the feeling/pattern/relationship that ended without closure and bleeds into this life. 2-3 sentences. Specific, not "karmic debt" — name the emotion.
- "how_it_shows_up_now": the mirror — show ONE concrete way this past-life thread appears in their CURRENT life. If profession/relationship/money context is given, anchor here. 3-4 sentences.
- "keep_with_you": one short, doable practice, mantra, or daily ritual that completes the unfinished thread. Specific. 1-2 sentences.
- "why_we_see_this": the chart citations (Ketu sign/house, 12th house planets, Rahu, retrograde patterns) in 2-3 sentences — for the reader who wants the "why". This is the ONLY field where Vedic terminology is welcome.

Return ONLY this JSON: {"who_you_were":"...","what_you_mastered":"...","what_you_left_unfinished":"...","how_it_shows_up_now":"...","keep_with_you":"...","why_we_see_this":"..."}`,

  transits: (year: number) =>
    `Write JSON: "transits_overview" (the 2-3 most impactful transits of ${year} for this chart — name them and their exact effect, 5-6 sentences), "saturn_transit" (Saturn's current transit — what house, what it demands, when relief comes, 3-4 sentences), "jupiter_transit" (Jupiter's transit — what it's opening up right now, 3-4 sentences), "rahu_ketu_transit" (nodal transit — the karmic lesson being forced right now, 3-4 sentences). Return: {"transits_overview":"...","saturn_transit":"...","jupiter_transit":"...","rahu_ketu_transit":"..."}`,

  remedies: () =>
    `Write JSON: "mantra_remedies" (specific mantras with exact count and day — e.g. chant X 108 times on Y day, 4-5 sentences), "gemstone_remedies" (primary and secondary stones with metal and finger — specific, 4-5 sentences), "fasting_remedies" (which days to fast, for which planets, and the method, 3-4 sentences), "charity_remedies" (specific charitable acts tied to specific planets — actionable, 3-4 sentences), "yantra_remedies" (which yantra, where to place it, 2-3 sentences). Return: {"mantra_remedies":"...","gemstone_remedies":"...","fasting_remedies":"...","charity_remedies":"...","yantra_remedies":"..."}`,

  lucky: () =>
    `Write JSON: "lucky_numbers" (the numbers and why they're powerful for this chart, 2-3 sentences), "lucky_colors" (the colors that amplify this energy and how to use them, 2-3 sentences), "lucky_days" (best days of the week with their planetary rulers, 2-3 sentences), "lucky_directions" (best directions for home, office, travel — specific, 2-3 sentences), "lucky_periods" (the best upcoming months or years — name them directly, 3-4 sentences). Return: {"lucky_numbers":"...","lucky_colors":"...","lucky_days":"...","lucky_directions":"...","lucky_periods":"..."}`,

  yearly_predictions: (year: number) =>
    `Write JSON with keys "year_${year}", "year_${year + 1}", "year_${year + 2}", "year_${year + 3}", "year_${year + 4}" — each a punchy paragraph (4-5 sentences) naming the biggest event or shift in career, relationships, and health for that year. Return: {"year_${year}":"...","year_${year + 1}":"...","year_${year + 2}":"...","year_${year + 3}":"...","year_${year + 4}":"..."}`,

  conclusion: () =>
    `Write JSON: "conclusion" (powerful closing — the 3 defining gifts of this chart, the one big life opportunity, and the path forward — bold and specific, 6-7 sentences), "yogi_baba_message" (personal message — warm, direct, referencing actual placements, ends with a memorable line, 4-5 sentences). Return: {"conclusion":"...","yogi_baba_message":"..."}`,

  guna_chakra: () =>
    `Return ONLY this JSON shape (no markdown, no extra keys, ALL values must be strings):
{"summary":"...","strengths":"...","challenges":"...","do":"...","dont":"..."}

Use the seven personality dimension scores (0-100) in the context — Leadership, Communication, Analytical, Emotion, Drive, Creative, Loyalty. Style for ALL fields:
- Speak directly to the seeker ("you"). Make it interesting to read — vivid verbs, contrast, one unexpected angle per section. Avoid corporate-speak.
- DO NOT mention planet names, signs, houses, dashas, yogas, or any astrological terminology. Lead with human impact.
- No clichés ("the universe…", "destined to…"). Warm, grounded, specific.
- HARD RULE: NEVER invent project names, app names, company names, colleague names, or specific past incidents (no "the EcoCycle launch", no "the Patel deadline", no "your FrostApp redesign"). Speak in patterns the user will recognize from their own life — situations and behaviors, not fabricated events.
- Tailor examples to the user's life stage and present-day context above (age, profession, relationship, money). A 22-year-old's "decisions" look different from a 45-year-old's. If profession/relationship/money is given, anchor at least one example there.

Title formatting: each bullet should bold its lead phrase using **double asterisks** (e.g. "• **Emotional Intelligence** — your empathy makes…"). The UI renders this as bold.

Field rules:
- "summary": 4-5 sentences. Lead with the strongest dimension and a real-life situation pattern it shows up in (work decisions, relationship dynamics, conflict, money) — patterns, not invented events.
- "strengths": EXACTLY 3 bullet lines, each newline-separated, each formatted "• **<Strength title>** — <one-sentence real-world impact>". Pull from the highest-scoring dimensions.
- "challenges": 2 bullet lines, newline-separated, each "• **<Challenge title>** — <what it costs you when ignored>". Pull from the lower-scoring dimensions.
- "do": EXACTLY 4 bullet lines, newline-separated, each "• **<Imperative verb action>** — <specific and doable this week>". Tie to building strengths or shoring up weak dimensions.
- "dont": 3 bullet lines, newline-separated, each "• **<Pattern to avoid>** — <why it backfires for someone with this profile>".

Do not output any text outside the JSON object.`,
};

// ─── Token budgets ─────────────────────────────────────────────────────────────

export const MAX_TOKENS: Record<string, number> = {
  summary:            1600,
  personality:        1600,
  nakshatra:          1200,
  planets_smm:        1000,
  planets_mjv:        1000,
  planets_srk:        1000,
  houses_1_6:         1800,
  houses_7_12:        1800,
  yogas:              2000,
  doshas:             1400,
  dasha:              1600,
  career:             1600,
  marriage:           1600,
  health:             1400,
  spiritual:          1400,
  past_life_story:    1400,
  transits:           1400,
  remedies:           1400,
  lucky:              1000,
  yearly_predictions: 2000,
  conclusion:         1400,
};

// ─── Lite mode: call spec per feature surface ─────────────────────────────────

export interface LiteCallDef {
  callId: keyof typeof PROMPTS;
  maxTokens: number;
  resultKeys: string[];
  /** Optional model override — falls back to NVIDIA_NIM_MODEL when absent. */
  model?: string;
  /** Optional sampling temperature override. */
  temperature?: number;
}

// nvidia/llama-3.1-nemotron-ultra-253b-v1 was moved to Downloadable-only May 2026 —
// mistral-nemotron is the remaining Free-Endpoint general instruct model on NIM.
const THINKING_MODEL = process.env.NVIDIA_NIM_THINKING_MODEL ?? 'mistralai/mistral-nemotron';

export const LITE_CALLS: Record<string, LiteCallDef[]> = {
  dasha_widget:     [{ callId: 'dasha',              maxTokens: 600, resultKeys: ['dasha_current', 'dasha_next_period'] }],
  career_lite:      [{ callId: 'career',             maxTokens: 700, resultKeys: ['career', 'wealth'] }],
  marriage_lite:    [{ callId: 'marriage',           maxTokens: 700, resultKeys: ['marriage', 'partner_profile'] }],
  health_lite:      [{ callId: 'health',             maxTokens: 600, resultKeys: ['health_constitution', 'health_vulnerabilities'] }],
  spiritual_lite:   [{ callId: 'spiritual',          maxTokens: 600, resultKeys: ['spiritual_path', 'dharma'] }],
  remedies_lite:    [{ callId: 'remedies',           maxTokens: 600, resultKeys: ['mantra_remedies', 'gemstone_remedies'] }],
  yearly_lite:      [{ callId: 'yearly_predictions', maxTokens: 700, resultKeys: [] }], // resultKeys built at runtime
  summary_lite:     [{ callId: 'summary',            maxTokens: 600, resultKeys: ['executive_summary', 'key_strengths'] }],
  personality_lite: [{ callId: 'personality',        maxTokens: 600, resultKeys: ['personality', 'nature_temperament'] }],
  couple_lite:      [{ callId: 'marriage',           maxTokens: 700, resultKeys: ['marriage', 'partner_profile', 'relationship_challenges'] }],
  life_journey:     [{ callId: 'dasha',              maxTokens: 700, resultKeys: ['dasha_current', 'dasha_5yr_forecast', 'dasha_life_timeline'] }],
  past_life_lite:   [{ callId: 'past_life_story',    maxTokens: 1400, resultKeys: ['who_you_were', 'what_you_mastered', 'what_you_left_unfinished', 'how_it_shows_up_now', 'keep_with_you', 'why_we_see_this'], model: THINKING_MODEL, temperature: 0.75 }],
  guna_chakra:      [{ callId: 'guna_chakra',        maxTokens: 800, resultKeys: ['summary', 'strengths', 'challenges', 'do', 'dont'] }],
};

// ─── Enrichment mapping: report ai_content fields → feature surface ───────────

export const REPORT_FIELDS_FOR_FEATURE: Record<string, string[]> = {
  dasha_widget:     ['dasha_current', 'dasha_next_period'],
  career_lite:      ['career', 'wealth', 'business_vs_service', 'education'],
  marriage_lite:    ['marriage', 'partner_profile', 'relationship_challenges', 'children'],
  health_lite:      ['health_constitution', 'health_vulnerabilities', 'health_remedies', 'vitality_resilience'],
  spiritual_lite:   ['spiritual_path', 'dharma', 'past_life', 'moksha_indicators'],
  remedies_lite:    ['mantra_remedies', 'gemstone_remedies', 'fasting_remedies', 'charity_remedies', 'yantra_remedies'],
  yearly_lite:      ['year_2025', 'year_2026', 'year_2027', 'year_2028', 'year_2029', 'year_2030'],
  summary_lite:     ['executive_summary', 'life_purpose', 'key_strengths', 'key_challenges'],
  personality_lite: ['personality', 'appearance', 'nature_temperament', 'childhood_early_life'],
  couple_lite:      ['marriage', 'partner_profile', 'relationship_challenges'],
  life_journey:     ['dasha_current', 'dasha_5yr_forecast', 'dasha_life_timeline', 'executive_summary'],
  past_life_lite:   ['past_life', 'moksha_indicators'],
};

// Features to enrich per report tier
export const FEATURES_FOR_TIER: Record<string, string[]> = {
  basic:    ['summary_lite', 'dasha_widget', 'yearly_lite'],
  standard: ['summary_lite', 'dasha_widget', 'yearly_lite', 'career_lite', 'marriage_lite', 'health_lite', 'life_journey'],
  premium:  Object.keys(REPORT_FIELDS_FOR_FEATURE),
};
