import { logger } from '../../lib/logger.js';
import { addWalletBalance, deductWalletBalance } from '../users/users.repo.js';
import {
  addQuestionCredits,
  consumeGroupQuestion,
  consumePassQuestion,
  consumeQuestionCredit,
  findActivePass,
  refundGroupQuestion,
  refundPassQuestion,
} from './pass.repo.js';
import { listGroupIdsForUser } from '../user-groups/user-groups.repo.js';
import { consumeChatGift, refundChatGift } from './chat-gifts.repo.js';
import { refreshLapsedPlayPass } from './pass-play.service.js';

/**
 * Where a chat question was paid from. 'group' = an admin-group member's free
 * allowance; 'gift' = an occasion's free questions (config/chat-gifts.ts).
 */
export type QuestionSource = 'free' | 'gift' | 'group' | 'pass' | 'credits' | 'wallet';

export const CHAT_REASON = 'chat_message';

/**
 * Pays for one chat question: a running gift question first (it is free and
 * expires, so it goes before anything the user paid for), then the Aroha
 * Pass's monthly quota, then a
 * Question Pack credit, then the wallet at `pricePaise`. Each step is one
 * atomic UPDATE, so two concurrent questions can't spend the same unit.
 * Null when none of them can cover it. With no Pass and no credits — every
 * user until those features are switched on — this is exactly the wallet
 * debit chat always did.
 * Users in test groups are never charged, but their questions still count down:
 * from their own Pass if they hold one, else from the group allowance
 * (consumeGroupQuestion). Once that is used up the question is simply free.
 */
export async function chargeQuestion(
  userId: string,
  pricePaise: number,
): Promise<QuestionSource | null> {
  if (pricePaise <= 0) return 'free';
  // Before the test-group branch too, so a group member's gift counts down
  // exactly like everyone else's.
  if (await consumeChatGift(userId)) return 'gift';
  const inGroup = (await listGroupIdsForUser(userId).catch(() => [])).length > 0;
  if (inGroup) {
    if (await findActivePass(userId)) return (await consumePassQuestion(userId)) ? 'pass' : 'free';
    return (await consumeGroupQuestion(userId)) ? 'group' : 'free';
  }
  if (await consumePassQuestion(userId)) return 'pass';
  // A Play Pass at its end whose renewal Google hasn't told us about yet: ask, then try again.
  if ((await refreshLapsedPlayPass(userId)) && (await consumePassQuestion(userId))) return 'pass';
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
    if (source === 'gift') await refundChatGift(userId);
    else if (source === 'pass') await refundPassQuestion(userId);
    else if (source === 'group') await refundGroupQuestion(userId);
    else if (source === 'credits') await addQuestionCredits(userId, 1);
    else if (source === 'wallet')
      await addWalletBalance(userId, pricePaise, `refund:${CHAT_REASON}`);
  } catch (err) {
    logger.error({ err, userId, source }, 'chat: question refund failed');
  }
}
