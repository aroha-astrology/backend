// =============================================================================
// Income-bracket collection (chat)
// =============================================================================
// A money question is only as precise as the scale it is read against: the
// chart gives the pattern, the user's own numbers give the size. Asking for a
// figure outright reads like a qualification check, so the astrologer asks
// once, framed as what makes the answer accurate, and the reply comes back as
// ONE TAP on a fixed range.
//
// Fixed is the whole point. The ranges live here, not in the model's head, so
// a tapped reply is an exact string match against this table and lands in a
// real column (users.income_bracket / family_income_bracket) that the admin
// console can count. A model-invented range would be unaggregatable prose.
// The model only decides WHEN to ask: it writes the marker below on its
// "Ask next:" line and scholar.ts expands it into these exact options.
// =============================================================================

import { normalizeFollowUp } from './chat-follow-up.js';

export const INCOME_MARKER = '{{income}}';
export const FAMILY_INCOME_MARKER = '{{family_income}}';

type LangCode = 'en' | 'hi' | 'bn' | 'mr' | 'te' | 'ta' | 'gu';

/** What gets STORED. Underscore-cased because the admin card renders codes through its
 *  existing `formatDemographicsLabel` splitter. The label arrays below are parallel to
 *  these — one label per code, per language (asserted in chat-income.spec.ts). */
const PERSONAL_CODES = ['under_25k', '25k_75k', '75k_2l', 'above_2l', 'undisclosed'] as const;
const FAMILY_CODES = ['under_50k', '50k_1_5l', '1_5l_4l', 'above_4l', 'undisclosed'] as const;

/**
 * The tappable chip text, in the language the chat is being held in — these are
 * UI strings the user reads and sends back verbatim, so an English-only table
 * would put English chips under a Bengali reply. Matching scans EVERY language
 * (see matchIncomeReply), so a tap still resolves even if the user switched app
 * language between the question and the answer.
 */
const PERSONAL_LABELS: Record<LangCode, readonly string[]> = {
  en: [
    'Under ₹25,000 a month',
    '₹25,000 – 75,000',
    '₹75,000 – 2 lakh',
    'Above ₹2 lakh',
    'Prefer not to say',
  ],
  hi: [
    'हर महीने ₹25,000 से कम',
    '₹25,000 – 75,000',
    '₹75,000 – 2 लाख',
    '₹2 लाख से ऊपर',
    'नहीं बताना चाहूँगा',
  ],
  bn: ['মাসে ₹25,000-এর কম', '₹25,000 – 75,000', '₹75,000 – 2 লাখ', '₹2 লাখের বেশি', 'বলতে চাই না'],
  mr: [
    'दरमहा ₹25,000 पेक्षा कमी',
    '₹25,000 – 75,000',
    '₹75,000 – 2 लाख',
    '₹2 लाखांपेक्षा जास्त',
    'सांगू इच्छित नाही',
  ],
  te: [
    'నెలకు ₹25,000 కంటే తక్కువ',
    '₹25,000 – 75,000',
    '₹75,000 – 2 లక్షలు',
    '₹2 లక్షలకు పైగా',
    'చెప్పదలచుకోలేదు',
  ],
  ta: [
    'மாதம் ₹25,000-க்கும் குறைவு',
    '₹25,000 – 75,000',
    '₹75,000 – 2 லட்சம்',
    '₹2 லட்சத்திற்கு மேல்',
    'சொல்ல விரும்பவில்லை',
  ],
  gu: [
    'મહિને ₹25,000થી ઓછું',
    '₹25,000 – 75,000',
    '₹75,000 – 2 લાખ',
    '₹2 લાખથી વધુ',
    'કહેવા માંગતો નથી',
  ],
};

/** Every household label names the household, in every language — the reply arrives as a
 *  bare chip tap with no other context, so the label itself has to say which column it
 *  belongs in. The amounts differ from PERSONAL's too, so the two sets can never collide. */
const FAMILY_LABELS: Record<LangCode, readonly string[]> = {
  en: [
    'Household under ₹50,000 a month',
    'Household ₹50,000 – 1.5 lakh',
    'Household ₹1.5 – 4 lakh',
    'Household above ₹4 lakh',
    'Household — prefer not to say',
  ],
  hi: [
    'परिवार की आय हर महीने ₹50,000 से कम',
    'परिवार की आय ₹50,000 – 1.5 लाख',
    'परिवार की आय ₹1.5 – 4 लाख',
    'परिवार की आय ₹4 लाख से ऊपर',
    'परिवार की आय नहीं बताना चाहूँगा',
  ],
  bn: [
    'পরিবারের আয় মাসে ₹50,000-এর কম',
    'পরিবারের আয় ₹50,000 – 1.5 লাখ',
    'পরিবারের আয় ₹1.5 – 4 লাখ',
    'পরিবারের আয় ₹4 লাখের বেশি',
    'পরিবারের আয় বলতে চাই না',
  ],
  mr: [
    'कुटुंबाचे उत्पन्न दरमहा ₹50,000 पेक्षा कमी',
    'कुटुंबाचे उत्पन्न ₹50,000 – 1.5 लाख',
    'कुटुंबाचे उत्पन्न ₹1.5 – 4 लाख',
    'कुटुंबाचे उत्पन्न ₹4 लाखांपेक्षा जास्त',
    'कुटुंबाचे उत्पन्न सांगू इच्छित नाही',
  ],
  te: [
    'కుటుంబ ఆదాయం నెలకు ₹50,000 కంటే తక్కువ',
    'కుటుంబ ఆదాయం ₹50,000 – 1.5 లక్షలు',
    'కుటుంబ ఆదాయం ₹1.5 – 4 లక్షలు',
    'కుటుంబ ఆదాయం ₹4 లక్షలకు పైగా',
    'కుటుంబ ఆదాయం చెప్పదలచుకోలేదు',
  ],
  ta: [
    'குடும்ப வருமானம் மாதம் ₹50,000-க்கும் குறைவு',
    'குடும்ப வருமானம் ₹50,000 – 1.5 லட்சம்',
    'குடும்ப வருமானம் ₹1.5 – 4 லட்சம்',
    'குடும்ப வருமானம் ₹4 லட்சத்திற்கு மேல்',
    'குடும்ப வருமானம் சொல்ல விரும்பவில்லை',
  ],
  gu: [
    'કુટુંબની આવક મહિને ₹50,000થી ઓછી',
    'કુટુંબની આવક ₹50,000 – 1.5 લાખ',
    'કુટુંબની આવક ₹1.5 – 4 લાખ',
    'કુટુંબની આવક ₹4 લાખથી વધુ',
    'કુટુંબની આવક કહેવા માંગતો નથી',
  ],
};

function langOf(locale: string | undefined): LangCode {
  const code = (locale ?? 'en').slice(0, 2).toLowerCase();
  return code in PERSONAL_LABELS ? (code as LangCode) : 'en';
}

/** Codes in display order — the admin card shows every bracket, including ones nobody picked. */
export const INCOME_BRACKET_CODES: readonly string[] = PERSONAL_CODES;
export const FAMILY_BRACKET_CODES: readonly string[] = FAMILY_CODES;

/** code -> English label, for the chat fact block (the prompt is reasoned over in English
 *  whatever language the reply comes out in) and for any admin-side display. */
export const INCOME_BRACKET_LABELS: Record<string, string> = Object.fromEntries(
  PERSONAL_CODES.map((code, i) => [code, PERSONAL_LABELS.en[i]!]),
);
export const FAMILY_BRACKET_LABELS: Record<string, string> = Object.fromEntries(
  FAMILY_CODES.map((code, i) => [code, FAMILY_LABELS.en[i]!]),
);

/**
 * Injected into the chat fact block ONLY when the `chat.incomeAsk` feature is on
 * (see astro.service.ts). The prompt refuses to raise income at all without this
 * line, which is what lets the whole flow ship dark and be switched on from
 * Admin -> Features — no prompt edit, no deploy.
 */
export const INCOME_ASK_FACT =
  "INCOME ASK: allowed. When a money question needs the user's scale and no income bracket is stated above, you may use the {{income}} / {{family_income}} tokens exactly as the money rules describe.";

/** Replaces the model's income markers with the real tappable options, in the chat's own
 *  language. Any other text on the line is left alone. */
export function expandIncomeMarkers(line: string, locale?: string): string {
  const lang = langOf(locale);
  return line
    .split(INCOME_MARKER)
    .join(PERSONAL_LABELS[lang].join(' | '))
    .split(FAMILY_INCOME_MARKER)
    .join(FAMILY_LABELS[lang].join(' | '));
}

export interface IncomeReply {
  field: 'incomeBracket' | 'familyIncomeBracket';
  bracket: string;
}

/**
 * The user's message, if it is a tap on one of the options above. Prose that
 * merely mentions money returns null — only an exact (whitespace- and
 * case-normalized) option match writes the column, so nothing the user freely
 * typed is quietly classified into a demographic bucket. Every language is
 * scanned, not just the current one: the app language can change between the
 * question and the tap, and a tap that silently stopped counting would be
 * invisible.
 */
export function matchIncomeReply(message: string): IncomeReply | null {
  const key = normalizeFollowUp(message);
  for (const labels of Object.values(PERSONAL_LABELS)) {
    const i = labels.findIndex((label) => normalizeFollowUp(label) === key);
    if (i >= 0) return { field: 'incomeBracket', bracket: PERSONAL_CODES[i]! };
  }
  for (const labels of Object.values(FAMILY_LABELS)) {
    const i = labels.findIndex((label) => normalizeFollowUp(label) === key);
    if (i >= 0) return { field: 'familyIncomeBracket', bracket: FAMILY_CODES[i]! };
  }
  return null;
}

/** Exported only so the spec can assert the label arrays stay parallel to the code arrays —
 *  a missing entry in one language would otherwise map a tap to the wrong bracket. */
export const INCOME_LABEL_TABLES = {
  PERSONAL_LABELS,
  FAMILY_LABELS,
  PERSONAL_CODES,
  FAMILY_CODES,
} as const;
