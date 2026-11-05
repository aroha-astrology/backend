// =============================================================================
// Fact-extraction gate (audit S6, O4)
// =============================================================================
// After every chat turn, chat-fact-extraction.ts makes one model call to note durable facts. It does
// two jobs, and the gate must keep both:
//   1. store personal details the READER states (a job, a marriage, a loss, a plan);
//   2. record a dated timing the REPLY committed to ("PREVIOUSLY TOLD THEM: ... October 2026"), so a
//      later conversation does not contradict it.
// So the gate reads the reply as well as the message, and a turn is skipped only when neither holds
// anything. A plain chart question with a plain answer ("what does my Moon in Leo mean?") is skipped.
//
// An English word list cannot judge other languages, so only English-locale exchanges are ever
// skipped; any other locale, or text that is not in Latin letters, always goes through. A skipped
// turn can lose a fact a later message would have stated again; it never changes the reply.
// The switch is chat.factGate (ships off).
// =============================================================================

const LONG_MESSAGE_CHARS = 220;
/** Share of letters outside Latin script at which we stop trying to judge the text. */
const NON_LATIN_SHARE = 0.3;

// First-person statements and life events, in English plus roman Hindi / Bengali first-person words.
const DISCLOSURE =
  /\b(i\s*am|i['’]m|im|i\s+have|i['’]ve|i\s+had|i\s+was|i\s+got|i\s+work\w*|i\s+live\w*|i\s+lost|i\s+want|i\s+need|i\s+plan\w*|i\s+recently|i\s+just|we\s+are|we['’]re|we\s+have|we\s+got|my\s+(husband|wife|spouse|partner|boyfriend|girlfriend|fianc\w*|mother|mom|mum|father|dad|son|daughter|child|children|kids?|baby|brother|sister|boss|job|business|company|salary|health|surgery|exam\w*|interview|wedding|marriage|divorce|pregnan\w*|house|flat|loan)|married|divorced|engaged|pregnant|expecting|unemployed|jobless|resigned|fired|laid\s+off|promoted|diagnosed|widow\w*|separated|breakup|broke\s+up|mera|meri|mere|mujhe|mujhko|hum|humari|hamara|hamari|main|amar|ami|amake|amader)\b/i;

const MONTHS =
  /\b(january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/i;
// "May" is also a verb, so it counts only where it is plainly a month.
const MAY_AS_MONTH = /\b(in|by|from|during|until|till|around|early|late|mid|of|to|through)\s+May\b/;
const SEASONS =
  /\b(this|next|coming|by|in|during|early|late|mid)\s+(spring|summer|autumn|fall|winter|monsoon)\b/i;

// Unicode decimal-digit blocks used by the app's languages, so "२०२७" reads as 2027.
const DIGIT_ZEROS = [
  0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66,
];

function asciiDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (c) => {
    const cp = c.codePointAt(0) ?? 0;
    const zero = DIGIT_ZEROS.find((z) => cp >= z && cp < z + 10);
    return zero === undefined ? c : String(cp - zero);
  });
}

/** A year (2020s-2090s) or a named month or season: the shape of a dated timing. */
function carriesDatedTiming(reply: string): boolean {
  const text = asciiDigits(reply);
  return (
    /(?<!\d)20[2-9]\d(?!\d)/.test(text) ||
    MONTHS.test(text) ||
    MAY_AS_MONTH.test(text) ||
    SEASONS.test(text)
  );
}

function mostlyNotLatin(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  const latin = letters.filter((c) => /\p{Script=Latin}/u.test(c)).length;
  return (letters.length - latin) / letters.length >= NON_LATIN_SHARE;
}

/**
 * True when this chat exchange is worth the fact-extraction call. When in doubt, true.
 * `locale` is the language of the chat session (the reader's app language).
 */
export function shouldExtractFacts(
  userMessage: string,
  assistantReply: string,
  locale: string,
): boolean {
  if ((locale || 'en').toLowerCase().split(/[-_]/)[0] !== 'en') return true;
  const message = userMessage.trim();
  if (message.length === 0) return false;
  if (message.length > LONG_MESSAGE_CHARS) return true;
  if (mostlyNotLatin(message)) return true;
  if (DISCLOSURE.test(message)) return true;
  return carriesDatedTiming(assistantReply);
}
