import { and, asc, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { chatGifts, users } from '../../db/schema.js';
import type { ChatGiftCampaign } from '../../config/chat-gifts.js';

/** What the app shows: the gift still running for this user, if any. */
export interface ActiveChatGift {
  campaign: string;
  questionsLeft: number;
  questionsTotal: number;
  validUntil: string;
}

/**
 * Gives the campaign to every user who exists now (erased accounts excluded).
 * Safe to run again: a user who already has it is skipped, never topped up.
 * Returns how many users got it on this run.
 */
export async function grantChatGiftToAllUsers(campaign: ChatGiftCampaign): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    insert into ${chatGifts} (user_id, campaign, questions, valid_until)
    select ${users.id}, ${campaign.key}, ${campaign.questions}, ${campaign.validUntil.toISOString()}::timestamptz
    from ${users}
    where ${users.anonymizedAt} is null
    on conflict (user_id, campaign) do nothing
    returning id`);
  return rows.length;
}

/** Gives the campaign to one user (a try-out, or a test). Same never-twice rule. */
export async function grantChatGift(userId: string, campaign: ChatGiftCampaign): Promise<boolean> {
  const rows = await db
    .insert(chatGifts)
    .values({
      userId,
      campaign: campaign.key,
      questions: campaign.questions,
      validUntil: campaign.validUntil,
    })
    .onConflictDoNothing()
    .returning({ id: chatGifts.id });
  return rows.length > 0;
}

/**
 * Spends one gift question, atomically: from the running gift that ends
 * soonest. False when the user has none left (or none still running).
 */
export async function consumeChatGift(userId: string, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(chatGifts)
    .set({ used: sql`${chatGifts.used} + 1` })
    .where(
      and(
        eq(
          chatGifts.id,
          sql`(select id from ${chatGifts}
               where user_id = ${userId} and valid_until > ${now.toISOString()}::timestamptz and used < questions
               order by valid_until asc limit 1)`,
        ),
        lt(chatGifts.used, chatGifts.questions),
      ),
    )
    .returning({ id: chatGifts.id });
  return rows.length > 0;
}

/** Gives back one gift question (the turn produced no answer): to the most recently spent gift. */
export async function refundChatGift(userId: string): Promise<void> {
  await db
    .update(chatGifts)
    .set({ used: sql`greatest(${chatGifts.used} - 1, 0)` })
    .where(
      eq(
        chatGifts.id,
        sql`(select id from ${chatGifts}
             where user_id = ${userId} and used > 0
             order by valid_until desc limit 1)`,
      ),
    );
}

/** The running gift with questions left that ends soonest, or null. */
export async function getActiveChatGift(
  userId: string,
  now: Date = new Date(),
): Promise<ActiveChatGift | null> {
  const [row] = await db
    .select()
    .from(chatGifts)
    .where(
      and(
        eq(chatGifts.userId, userId),
        gt(chatGifts.validUntil, now),
        lt(chatGifts.used, chatGifts.questions),
      ),
    )
    .orderBy(asc(chatGifts.validUntil))
    .limit(1);
  if (!row) return null;
  return {
    campaign: row.campaign,
    questionsLeft: row.questions - row.used,
    questionsTotal: row.questions,
    validUntil: row.validUntil.toISOString(),
  };
}

/** Users holding the campaign, for the announcement: only they are told about it. */
export async function listChatGiftHolders(
  campaignKey: string,
): Promise<Array<{ userId: string; locale: string | null }>> {
  return db
    .select({ userId: chatGifts.userId, locale: users.locale })
    .from(chatGifts)
    .innerJoin(users, eq(users.id, chatGifts.userId))
    .where(and(eq(chatGifts.campaign, campaignKey), isNull(users.anonymizedAt)))
    .orderBy(desc(chatGifts.createdAt));
}
