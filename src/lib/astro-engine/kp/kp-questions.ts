// =============================================================================
// Reader questions for the KP annual report — screening + topic routing
// =============================================================================
// The reader may type up to KP_MAX_QUESTIONS questions while buying the report.
// Two jobs live here:
//   1. screenKpQuestions — refuse death / lifespan / suicide questions BEFORE
//      any money moves, reusing the app-wide content policy (the same patterns
//      chat uses), so a report can never be bought to ask what chat refuses.
//   2. questionTopic — route each allowed question to a KP house group so the
//      answer is judged from the cuspal sub lord and the year's dashas rather
//      than improvised by the model.
// =============================================================================

import { classifyUserMessage, type PolicyTopic } from '../../content-policy.js';
import type { KpAreaKey, KpAreaRule } from './kp-core.js';

export const KP_MAX_QUESTIONS = 3;
export const KP_QUESTION_MAX_CHARS = 240;
/** Keys the questions travel under inside `PurchaseReportBody.answers`. */
export const KP_QUESTION_KEYS = ['question1', 'question2', 'question3'] as const;

export interface QuestionScreenResult {
  index: number;
  allowed: boolean;
  topic: Exclude<PolicyTopic, null> | null;
  /** The reader-facing line: the helpline for self-harm, the gentle refusal for death. */
  message: string;
}

/** Reads the reader's questions back out of a purchase's `answers` map, in order, trimmed. */
export function kpQuestionsFromAnswers(
  answers: Record<string, string> | null | undefined,
): string[] {
  if (!answers) return [];
  return KP_QUESTION_KEYS.map((k) =>
    (answers[k] ?? '').trim().slice(0, KP_QUESTION_MAX_CHARS),
  ).filter((q) => q.length > 0);
}

export function screenKpQuestions(questions: string[], language?: string): QuestionScreenResult[] {
  return questions.map((q, index) => {
    const decision = classifyUserMessage(q, language);
    return {
      index,
      allowed: !decision.blocked,
      topic: decision.topic,
      message: decision.cannedResponse,
    };
  });
}

export type KpQuestionTopic = KpAreaKey | 'general';

const TOPIC_PATTERNS: Array<[KpAreaKey, RegExp]> = [
  [
    'career',
    /\b(job|career|work|office|promotion|appraisal|hike|boss|business|startup|naukri|naukari|interview|resign|switch|profession|government\s+job|sarkari|transfer|posting|client|shop|dukaan|vyapar)\b|नौकरी|व्यापार|करियर|प्रमोशन/i,
  ],
  [
    'money',
    /\b(money|finance|financial|salary|income|loan|debt|emi|invest\w*|savings?|paisa|paise|dhan|wealth|profit|loss|stock|share\s+market|trading|crypto|gold|lottery|funds?|kamai)\b|पैसा|धन|कर्ज|लोन|कमाई/i,
  ],
  [
    'love',
    /\b(marriage|marry|married|wedding|shaadi|shadi|vivah|love|lover|relationship|partner|boyfriend|girlfriend|bf|gf|spouse|husband|wife|pati|patni|engagement|rishta|proposal|breakup|ex|divorce|romance|crush|soulmate)\b|शादी|विवाह|प्रेम|रिश्ता/i,
  ],
  [
    'health',
    /\b(health|healthy|fitness|fit|weight|diet|sleep|stress|anxiety|energy|illness|sick|disease|surgery|operation|recovery|recover|pain|bp|sugar|diabetes|thyroid|swasthya|sehat|bimari|tabiyat)\b|स्वास्थ्य|सेहत|बीमारी/i,
  ],
  [
    'home',
    /\b(house|home|flat|apartment|property|land|plot|real\s+estate|ghar|makaan|makan|vehicle|car|bike|rent|shift\w*|construction|griha\s*pravesh)\b|घर|मकान|प्रॉपर्टी|जमीन|गाड़ी/i,
  ],
  [
    'travel',
    /\b(abroad|foreign|overseas|visa|immigration|green\s+card|travel|trip|relocat\w*|videsh|usa|uk|canada|australia|dubai|germany|settle\s+abroad|onsite)\b|विदेश|यात्रा/i,
  ],
  [
    'learning',
    /\b(exam|exams|study|studies|education|college|university|admission|degree|course|result|marks|neet|jee|upsc|ssc|cat|gate|mba|masters|phd|school|padhai|pariksha)\b|पढ़ाई|परीक्षा|शिक्षा/i,
  ],
  [
    'family',
    /\b(child|children|baby|kids?|pregnan\w*|conceive|santan|family|parents?|mother|father|mom|dad|sibling|brother|sister|in-?laws?|son|daughter|beta|beti|maa|papa)\b|संतान|बच्चा|परिवार/i,
  ],
];

export function questionTopic(question: string): KpQuestionTopic {
  let best: KpQuestionTopic = 'general';
  let bestIndex = Infinity;
  // Earliest mention wins: "will my job change bring more money" is a career question first.
  for (const [topic, re] of TOPIC_PATTERNS) {
    const m = re.exec(question);
    if (m && m.index < bestIndex) {
      best = topic;
      bestIndex = m.index;
    }
  }
  return best;
}

/**
 * The 'general' group for a question that names no single life area ("how will
 * this year go?", "will my wish come true?"): KP reads the fulfilment of a
 * desire from the 11th cusp sub lord with the 1st and 2nd as support.
 */
export const GENERAL_QUESTION_RULE: KpAreaRule = {
  key: 'career', // placeholder key; callers key the result by 'general' themselves
  houses: [1, 2, 11],
  opposing: [5, 8, 12],
  principalCusp: 11,
  source: 'KP_STANDARD',
};
