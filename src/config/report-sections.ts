// =============================================================================
// Fixed narrative section IDs, per report type
// =============================================================================
// Every report type's `generateNarrative` already calls a FIXED sequence of
// bounded LLM prompts, each returning a FIXED number of sections in a FIXED
// order — see e.g. marriage.ts's "4 bounded calls" doc comment, or
// match-report.ts's "Frontend indexes positionally" doc comment on
// `generateMatchReportNarrative`. The only thing that varies per generation is
// the LLM's own wording of each section's `heading` — which means two users
// reading the same report type can see slightly different heading text for
// the exact same conceptual section, and headings are never translated
// through this app's i18n system (they're raw LLM English/target-language
// prose baked in at generation time).
//
// This module names each position in that already-fixed sequence with a
// stable `id`, so the frontend can render a canonical, i18n'd heading
// (`reports.sectionHeading.<reportKey>.<id>`) instead of trusting the model's
// own heading text. It does NOT change what the LLM is asked to write, how
// many calls happen, or the order of those calls — it only documents the
// positional contract that already exists and lets `assignSectionIds` (below)
// zip canonical ids onto it.
//
// match_report is the one report type whose sections already carry a stable
// per-section `key` from the model (see match-report.ts's `KeyedSection`) —
// its id list below reuses those exact key strings so the two schemes agree.
// =============================================================================

import type { ReportKey } from './reports.js';

export const REPORT_SECTION_IDS: Partial<Record<ReportKey, readonly string[]>> = {
  marriage: [
    'at_a_glance',
    'marriage_timing',
    'who_you_will_marry',
    'family_in_laws',
    'money_after_marriage',
    'going_for_you_and_hold_carefully',
    'modern_realities',
  ],
  kundli_milan: [
    'guna_milan_score_meaning',
    'dashakoota_deep_dive',
    'manglik_compatibility',
    'chart_additional_facts',
    'overall_recommendation',
    'health_wealth_career_compatibility',
    'children_family_harmony_timing',
  ],
  true_love: [
    'what_this_means_for_you',
    'family_blessing',
    'timing_windows',
    'romantic_archetype',
    'blessings_cautions',
    'romance_by_decade',
    'naturally_drawn_to',
    'patterns_repeating',
    'blocking_you_recognize_the_one',
  ],
  wealth: [
    'wealth_pattern',
    'practical_guidance',
    'wealth_timing',
    'money_archetype',
    'dosha_yoga_check',
    'spending_vs_saving_tilt',
    'wealth_by_decade',
    'strongest_income_path',
    'guard_against',
  ],
  baby_name: ['suggested_names', 'naming_themes_blessings'],
  health_monthly: ['this_months_outlook', 'health_balance_this_month', 'practical_guidance'],
  career_monthly: [
    'this_months_outlook',
    'your_work_style',
    'support_obstacles_this_month',
    'industries_that_fit',
  ],
  finance_monthly: ['this_months_outlook', 'dosha_yoga_check', 'practical_guidance'],
  relationship_monthly: [
    'this_months_outlook',
    'practical_guidance',
    'blessings_cautions',
    'friction_reconciliation_dating_timing',
  ],
  // Reuses match-risks.ts's own MATCH_RISK_AREA_ORDER + match-report.ts's MATCH_CLOSING_KEYS
  // verbatim (not re-declared here) so the two id schemes can never drift apart — see
  // report-generator.types.ts's assignSectionIds doc comment for how this list is composed.
  match_report: [
    'wealth',
    'health',
    'children',
    'harmony',
    'career',
    'timing',
    'intimacy',
    'inlaws',
    'dos',
    'donts',
    'remedies',
  ],
  numerology: [
    'core_numbers',
    'expression_soul_urge_personality',
    'name_supports_numbers',
    'loshu_grid_name_planes',
    'challenge_numbers_kua_element',
    'this_year_this_month',
    'twelve_month_forecast',
    'luckiest_days_colors_years',
    // Conditional 9th section (call4, llm/reports/numerology.ts) — only generated for a reader
    // with a phone number on file/given (see NumerologyScores.phoneNumber). Must stay LAST:
    // ids zip onto sections by POSITION, and `numerology` is in APPEND_ONLY_SECTION_IDS below
    // specifically so a report generated WITHOUT this 9th section (8 sections) still gets its
    // first 8 ids assigned correctly instead of losing every id to a strict length mismatch.
    'phone_number_alignment',
  ],
  // `suggested_names` is deliberately the same id baby_name uses — the frontend's heading keys are
  // flat (`reports.sectionHeading.<id>`), so both report types share the one already-translated
  // "Suggested Names" string rather than adding a near-duplicate key in all 7 languages.
  name_change: [
    'numerological_signature',
    'name_change_benefits',
    // Spelling adjustments lead — this report is 80% spelling shifts to the reader's own name,
    // with alternative first names as the 20% footnote. Ids zip on POSITION, so this order is
    // what decides which i18n heading key each section gets.
    'suggested_spelling_adjustments',
    'suggested_names',
    'practical_guidance',
  ],
  remedies: ['karmic_debts', 'planet_remedies', 'strengths_cautions', 'how_to_use_remedies'],
  // `life_so_far` is APPENDED, never inserted — see assignSectionIds below for why the
  // position of an existing id can never change once reports have been stored with it.
  past_life: [
    'karmic_pattern',
    'karmic_axis_theme',
    'unfinished_business_soul_lesson',
    'life_so_far',
  ],
};

export interface SectionWithId {
  id?: string;
  heading: string;
  paragraphs: string[];
}

/**
 * Report keys whose id sequence above has been APPENDED to since reports were already being
 * stored, so the ids a shorter (older, or legitimately-shortened) section list should get are
 * exactly the leading prefix.
 *
 * `past_life` is here because a 4th id (`life_so_far`) was added to a 3-id sequence. Two kinds
 * of 3-section past_life report exist and both are correct:
 *   - every report PURCHASED BEFORE that section shipped — stored, never regenerated, so it
 *     keeps the 3 sections it was written with;
 *   - a NEW report on a chart with no derivable dasha tree, where the prompt is instructed to
 *     omit "Your Life So Far" entirely rather than invent a lived past.
 * Under a strict length match both would silently lose every id, and with it their icons and
 * translated headings.
 *
 * This is deliberately an opt-in set rather than a blanket "shorter is fine" rule. For every
 * other report key, a section list shorter than expected means a section was DROPPED — most
 * likely by `parseSections`'s empty-paragraph filter — and a dropped section in the MIDDLE
 * shifts every later section onto the wrong id. Refusing to label at all is the right answer
 * there, which is what the strict path below still does.
 *
 * The invariant a key in this set must hold: its id list is only ever appended to. Inserting
 * an id in the middle would mislabel every stored report from that point on.
 */
const APPEND_ONLY_SECTION_IDS: ReadonlySet<string> = new Set([
  'past_life',
  // numerology's phone-number section (call4, llm/reports/numerology.ts) only generates for a
  // reader with a phone number on file/given — see its own list above for the full rationale.
  'numerology',
]);

/**
 * Zips canonical `id`s onto `sections` by position, for the given report key. Assigns only
 * when the section count EXACTLY matches the expected sequence — or, for an append-only key
 * (see above), when it is shorter and the leading prefix therefore still lines up. Any other
 * mismatch (an unregistered report key, more sections than known ids, a dropped middle
 * section on a strict key) returns `sections` completely unchanged rather than risking a wrong
 * id on a shifted position. The frontend falls back to the section's own stored `heading`
 * whenever `id` is absent — see app/reports/[id]/page.tsx — so this is a pure enhancement,
 * never a hard requirement.
 */
export function assignSectionIds<T extends SectionWithId>(reportKey: string, sections: T[]): T[] {
  const ids = REPORT_SECTION_IDS[reportKey as ReportKey];
  if (!ids) return sections;
  const prefixMatches =
    APPEND_ONLY_SECTION_IDS.has(reportKey) && sections.length < ids.length && sections.length > 0;
  if (ids.length !== sections.length && !prefixMatches) return sections;
  return sections.map((s, i) => ({ ...s, id: ids[i] }));
}
