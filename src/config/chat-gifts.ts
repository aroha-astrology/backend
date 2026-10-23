// =============================================================================
// Gift questions — free chat questions handed to users for an occasion
// =============================================================================
// Granted once to every existing user with scripts/send-chat-gift-push.ts
// (--grant), which also sends the announcement. Spent before the Pass, Question
// Pack credits and the wallet (modules/pass/question-billing.ts), and only
// until `validUntil`.
// =============================================================================

export interface ChatGiftCampaign {
  /** Stored on every grant row; one grant per user per key. */
  key: string;
  /** Free questions each user gets. */
  questions: number;
  validUntil: Date;
}

/** Dussehra 2026 (owner, 2026-10-20): 2 questions on us, until 21 Oct 11:59 PM IST. */
export const DUSSEHRA_2026_GIFT: ChatGiftCampaign = {
  key: 'dussehra_2026',
  questions: 2,
  validUntil: new Date('2026-10-21T23:59:59+05:30'),
};
