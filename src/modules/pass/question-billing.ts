import { logger } from '../../lib/logger.js';
import { addWalletBalance, deductWalletBalance } from '../users/users.repo.js';
import {
  addQuestionCredits,
  consumePassQuestion,
  consumeQuestionCredit,
  refundPassQuestion,
} from './pass.repo.js';
import { listGroupIdsForUser } from '../user-groups/user-groups.repo.js';

/** Where a chat question was paid from. */
export type QuestionSource = 'free' | 'pass' | 'credits' | 'wallet';

export const CHAT_REASON = 'chat_message';

/**
 * Pays for one chat question: the Aroha Pass's monthly quota first, then a
 * Question Pack credit, then the wallet at `pricePaise`. Each step is one
 * atomic UPDATE, so two concurrent questions can't spend the same unit.
 * Null when none of them can cover it. With no Pass and no credits — every
 * user until those features are switched on — this is exactly the wallet
 * debit chat always did.
 * Users in test groups are never charged (always free).
 */
export async function chargeQuestion(
  userId: string,
  pricePaise: number,
): Promise<QuestionSource | null> {
  if (pricePaise <= 0) return 'free';
  const inGroup = (await listGroupIdsForUser(userId).catch(() => [])).length > 0;
  if (inGroup) return 'free';
  if (await consumePassQuestion(userId)) return 'pass';
  if (await consumeQuestionCredit(userId)) return 'credits';
  return (await deductWalletBalance(userId, pricePaise, CHAT_REASON)) ? 'wallet' : null;
}

/** Gives a question back to wherever it was paid from (the turn produced no answer). */
export async function refundQuestion(
  userId: string,
  source: QuestionSource,
  pricePaise: number,
): Promise<void> {
  try {
    if (source === 'pass') await refundPassQuestion(userId);
    else if (source === 'credits') await addQuestionCredits(userId, 1);
    else if (source === 'wallet')
      await addWalletBalance(userId, pricePaise, `refund:${CHAT_REASON}`);
  } catch (err) {
    logger.error({ err, userId, source }, 'chat: question refund failed');
  }
}
