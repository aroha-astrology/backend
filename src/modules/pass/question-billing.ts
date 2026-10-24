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
import { consumeBabaFreeReply, refundBabaFreeReply } from '../memory/memory.repo.js';
import { FREE_REPLY_HOURS } from '../memory/memory-rules.js';
import { refreshLapsedPlayPass } from './pass-play.service.js';
import { keyed, refundOf } from '../billing/refund-keys.js';

/**
 * Where a chat question was paid from. 'group' = an admin-group member's free
 * allowance; 'gift' = an occasion's free questions (config/chat-gifts.ts).
 */
export type QuestionSource = 'free' | 'memory' | 'gift' | 'group' | 'pass' | 'credits' | 'wallet';

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
 *
 * `chargeKey` (money.refundKeys, see billing/refund-keys.ts) goes on a wallet debit only, so the
 * refund of that debit can be paid once.
 */
export async function chargeQuestion(
  userId: string,
  pricePaise: number,
  chargeKey?: string,
): Promise<QuestionSource | null> {
  if (pricePaise <= 0) return 'free';
  // The free first reply to a Baba Ji check-in (memory.babaMemory sets the token). It expires on its own and
  // costs nothing, so it goes before anything the reader paid for. No token, no effect.
  if (await consumeBabaFreeReply(userId).catch(() => false)) return 'memory';
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
  return (await deductWalletBalance(userId, pricePaise, CHAT_REASON, ...keyed(chargeKey)))
    ? 'wallet'
    : null;
}

/** Gives a question back to wherever it was paid from (the turn produced no answer). */
export async function refundQuestion(
  userId: string,
  source: QuestionSource,
  pricePaise: number,
  chargeKey?: string,
): Promise<void> {
  try {
    if (source === 'memory')
      await refundBabaFreeReply(userId, new Date(Date.now() + FREE_REPLY_HOURS * 3_600_000));
    else if (source === 'gift') await refundChatGift(userId);
    else if (source === 'pass') await refundPassQuestion(userId);
    else if (source === 'group') await refundGroupQuestion(userId);
    else if (source === 'credits') await addQuestionCredits(userId, 1);
    else if (source === 'wallet')
      await addWalletBalance(userId, pricePaise, `refund:${CHAT_REASON}`, ...refundOf(chargeKey));
  } catch (err) {
    logger.error({ err, userId, source }, 'chat: question refund failed');
  }
}
