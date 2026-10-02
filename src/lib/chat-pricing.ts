// =============================================================================
// Chat pricing fact
// =============================================================================
// The astrologer was never told what a question costs, so asked "isse paise
// lagenge kya?" it answered that the conversation was completely free — to a
// user whose wallet had just been debited for asking. The prompt (scholar.ts,
// "What talking to you costs") now answers from this one line and refuses to
// call the chat free without it.
//
// Built from what the chat route ACTUALLY charged for this turn — the resolved
// price and where the question was paid from — so the answer can't drift from
// the bill.
// =============================================================================

import type { QuestionSource } from '../modules/pass/question-billing.js';

function rupees(paise: number): string {
  const amount = paise / 100;
  return `₹${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

/**
 * `source` is how this turn was paid; null when nothing was charged for it (a
 * free follow-up tap), which says nothing about the next question — so that
 * case reads as the normal price.
 */
export function chatPricingFact(pricePaise: number, source: QuestionSource | null): string {
  if (pricePaise <= 0 || source === 'free') {
    return 'CHAT PRICING: questions are free for this user.';
  }
  const price = rupees(pricePaise);
  const counted =
    'It is charged per question asked, never per minute the way most astrology apps charge — ' +
    'so they can take their time.';
  if (source === 'pass') {
    return `CHAT PRICING: this user has an Aroha Pass, and their questions come out of its monthly allowance; once that is used up, each question costs ${price}. ${counted}`;
  }
  if (source === 'credits') {
    return `CHAT PRICING: this user's questions come out of their prepaid question pack, one per question; once that is used up, each question costs ${price}. ${counted}`;
  }
  return `CHAT PRICING: yes, it is paid — each question the user sends costs ${price}, taken from their wallet. ${counted}`;
}
