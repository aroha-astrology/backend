import { z } from '@hono/zod-openapi';

export const DailyRewardDaySchema = z
  .object({
    day: z.number().int(),
    amountPaise: z.number().int(),
    isBonusDay: z.boolean(),
    claimed: z.boolean(),
  })
  .openapi('DailyRewardDay');

export const DailyRewardStateSchema = z
  .object({
    currentDay: z.number().int(),
    claimedToday: z.boolean(),
    todayAmountPaise: z.number().int(),
    nextDayAmountPaise: z.number().int(),
    expiresInDays: z.number().int(),
    ladder: z.array(DailyRewardDaySchema),
  })
  .openapi('DailyRewardState');

export const ClaimDailyRewardResponseSchema = z
  .object({
    claimed: z.boolean(),
    walletBalancePaise: z.number().int(),
  })
  .openapi('ClaimDailyRewardResponse');
