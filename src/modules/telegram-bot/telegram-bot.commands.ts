import {
  countUsers,
  listUsersPage,
  hardDeleteUserById,
  countNewUsersToday,
  countNewUsersThisWeek,
  sumWalletBalanceOutstanding,
  findUserByEmail,
  findUserByPhoneE164,
  findActiveUserById,
  addWalletBalance,
  deductWalletBalance,
} from '../users/users.repo.js';
import { countFailedKundlis } from '../kundli/kundli.repo.js';
import { getAllActiveTokens } from '../device-tokens/device-tokens.repo.js';
import { listActiveCoupons, insertCoupon, sumPaidOrdersToday } from '../billing/billing.repo.js';
import { escapeMarkdown } from '../../lib/notifications/telegram.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import { isUniqueViolation } from '../../lib/db-errors.js';

/** Formats an integer paise amount as a ₹ string for plain-text Telegram messages. */
function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

export async function cmdUsers(offsetArg: string | undefined): Promise<string> {
  const PAGE_SIZE = 20;
  const offset = parseInt(offsetArg || '0', 10) || 0;

  const [totalCount, users] = await Promise.all([countUsers(), listUsersPage(PAGE_SIZE, offset)]);

  if (users.length === 0) {
    return offset === 0 ? escapeMarkdown('No users found.') : escapeMarkdown('No more users.');
  }

  const lines = users.map((u) => {
    const contact = escapeMarkdown(u.email || u.phoneE164 || 'No contact');
    const name = escapeMarkdown(u.displayName || 'No Name');
    const date = escapeMarkdown(u.createdAt.toISOString().split('T')[0]);
    const balance = escapeMarkdown(formatRupees(u.walletBalancePaise));
    return `• *${name}* \\| ${contact} \\| ${balance} \\| ${date}`;
  });

  const nextOffset = offset + PAGE_SIZE;
  const hasMore = nextOffset < totalCount;

  let reply = `*Users \\(${offset + 1}\\-${offset + users.length} of ${totalCount}\\)*\n\n${lines.join('\n')}`;
  if (hasMore) {
    reply += `\n\nNext page: \`/users ${nextOffset}\``;
  }

  return reply;
}

export async function cmdDeleteUser(idArg: string | undefined): Promise<string> {
  if (!idArg) {
    return escapeMarkdown('Please provide a user ID: /delete <id>');
  }

  try {
    await hardDeleteUserById(idArg);
    return escapeMarkdown(`Successfully deleted user ${idArg} and all associated data.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return escapeMarkdown(`Failed to delete user: ${msg}`);
  }
}

export async function cmdStats(): Promise<string> {
  const [totalUsers, newUsersToday, newUsersWeek, revenue, outstanding] = await Promise.all([
    countUsers(),
    countNewUsersToday(),
    countNewUsersThisWeek(),
    sumPaidOrdersToday(),
    sumWalletBalanceOutstanding(),
  ]);

  return (
    `*App Stats*\n\n` +
    `Total Users: ${totalUsers}\n` +
    `New Users Today: ${newUsersToday}\n` +
    `New Users This Week: ${newUsersWeek}\n\n` +
    `Revenue Today: ${escapeMarkdown(formatRupees(revenue.totalPaise))} \\(${revenue.count} order${revenue.count === 1 ? '' : 's'}\\)\n` +
    `Outstanding Wallet Balance: ${escapeMarkdown(formatRupees(outstanding))}`
  );
}

const MONEY_USAGE =
  'Usage: /money <phone> <amount> — e.g. /money +919999999999 250 (negative amount to deduct)';

/** Admin-only wallet top-up/deduction, keyed by phone — the real prod credit-grant path. */
export async function cmdMoney(args: string[]): Promise<string> {
  const [phone, amountArg] = args;
  if (!phone || !amountArg) return escapeMarkdown(MONEY_USAGE);

  const amount = Number(amountArg);
  if (!Number.isFinite(amount) || amount === 0) {
    return escapeMarkdown('Amount must be a non-zero number of rupees, e.g. 250 or -50.');
  }

  const user = await findUserByPhoneE164(phone);
  if (!user) return escapeMarkdown(`No user found with phone: ${phone}`);

  const amountPaise = Math.round(Math.abs(amount) * 100);
  const name = escapeMarkdown(user.displayName || phone);
  const amountStr = escapeMarkdown(`₹${Math.abs(amount)}`);

  if (amount > 0) {
    await addWalletBalance(user.id, amountPaise, 'admin_grant');
  } else {
    const ok = await deductWalletBalance(user.id, amountPaise, 'admin_deduction');
    if (!ok) {
      return escapeMarkdown(
        `Cannot deduct ₹${Math.abs(amount)} from ${user.displayName || phone} — balance is only ${formatRupees(user.walletBalancePaise)}.`,
      );
    }
  }

  const updated = await findActiveUserById(user.id);
  const newBalance = escapeMarkdown(formatRupees(updated?.walletBalancePaise ?? 0));
  const verb = amount > 0 ? 'Added' : 'Deducted';
  const prep = amount > 0 ? 'to' : 'from';

  return `${verb} ${amountStr} ${prep} *${name}* \\(${escapeMarkdown(phone)}\\)\nNew balance: ${newBalance}`;
}

export async function cmdSearch(query: string | undefined): Promise<string> {
  if (!query) return escapeMarkdown('Please provide an email or phone: /search test@test.com');

  const user = query.includes('@')
    ? await findUserByEmail(query)
    : await findUserByPhoneE164(query);

  if (!user) return escapeMarkdown(`No user found matching: ${query}`);

  return `*User Found*\n\nID: \`${user.id}\`\nName: ${escapeMarkdown(user.displayName || 'None')}\nEmail: ${escapeMarkdown(user.email || 'None')}\nPhone: ${escapeMarkdown(user.phoneE164 || 'None')}`;
}

export async function cmdUserDetails(phone: string | undefined): Promise<string> {
  if (!phone) return escapeMarkdown('Please provide a mobile number: /user +1234567890');

  const user = await findUserByPhoneE164(phone);
  if (!user) return escapeMarkdown(`No user found with phone: ${phone}`);

  const joined = escapeMarkdown(user.createdAt.toISOString().split('T')[0]);
  const active = user.lastActiveAt
    ? escapeMarkdown(user.lastActiveAt.toISOString().split('T')[0])
    : 'Never';

  return `*User Details*\n\nID: \`${user.id}\`\nName: ${escapeMarkdown(user.displayName || 'None')}\nPhone: ${escapeMarkdown(user.phoneE164 || 'None')}\nOnboarding: ${escapeMarkdown(user.onboardingStatus || 'None')}\nPlatform: ${escapeMarkdown(user.platform || 'None')}\nJoined: ${joined}\nLast Active: ${active}`;
}

export async function cmdJobs(): Promise<string> {
  const failedKundlis = await countFailedKundlis();

  if (failedKundlis === 0) {
    return escapeMarkdown('All background jobs are running smoothly! 🚀');
  }

  return `*Job Alerts* ⚠️\n\nFailed Kundlis: ${failedKundlis}\n\nCheck server logs for more details.`;
}

export async function cmdCoupons(): Promise<string> {
  const activeCoupons = await listActiveCoupons();

  if (activeCoupons.length === 0) {
    return escapeMarkdown('No active coupons.');
  }

  const lines = activeCoupons.map((c) => {
    const discount =
      c.discountType === 'percent'
        ? `${c.discountValue}% off`
        : `₹${(c.discountValue / 100).toFixed(0)} off`;
    const usage =
      c.maxRedemptions != null
        ? `${c.redemptionCount}/${c.maxRedemptions} used`
        : `${c.redemptionCount} used`;
    const expiry = c.expiresAt
      ? escapeMarkdown(c.expiresAt.toISOString().split('T')[0] as string)
      : 'no expiry';
    return `• *${escapeMarkdown(c.code)}* \\| ${escapeMarkdown(discount)} \\| ${escapeMarkdown(usage)} \\| ${expiry}`;
  });

  return `*Active Coupons \\(${activeCoupons.length}\\)*\n\n${lines.join('\n')}`;
}

const NEWCOUPON_USAGE = 'Usage: /newcoupon CODE percent VALUE [maxRedemptions] [expiresInDays]';

export async function cmdNewCoupon(args: string[]): Promise<string> {
  const [code, type, valueArg, maxRedemptionsArg, expiresInDaysArg] = args;

  if (!code || !type || !valueArg) {
    return escapeMarkdown(NEWCOUPON_USAGE);
  }

  if (type.toLowerCase() !== 'percent') {
    return escapeMarkdown(`Only "percent" coupons are supported right now. ${NEWCOUPON_USAGE}`);
  }

  const value = Number(valueArg);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    return escapeMarkdown('Discount value must be a whole number between 1 and 100.');
  }

  let maxRedemptions: number | null = null;
  if (maxRedemptionsArg !== undefined) {
    maxRedemptions = Number(maxRedemptionsArg);
    if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) {
      return escapeMarkdown('maxRedemptions must be a positive whole number.');
    }
  }

  let expiresAt: Date | null = null;
  if (expiresInDaysArg !== undefined) {
    const expiresInDays = Number(expiresInDaysArg);
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1) {
      return escapeMarkdown('expiresInDays must be a positive whole number.');
    }
    expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  }

  const normalizedCode = code.toUpperCase();

  try {
    const coupon = await insertCoupon({
      code: normalizedCode,
      discountType: 'percent',
      discountValue: value,
      maxRedemptions,
      expiresAt,
    });

    const usage =
      coupon.maxRedemptions != null
        ? `${coupon.maxRedemptions} redemptions`
        : 'unlimited redemptions';
    const expiry = coupon.expiresAt
      ? escapeMarkdown(coupon.expiresAt.toISOString().split('T')[0] as string)
      : 'no expiry';
    return `Coupon *${escapeMarkdown(coupon.code)}* created \\| ${escapeMarkdown(`${value}% off`)} \\| ${escapeMarkdown(usage)} \\| ${expiry}`;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return escapeMarkdown(`Coupon code ${normalizedCode} already exists.`);
    }
    const msg = error instanceof Error ? error.message : String(error);
    return escapeMarkdown(`Failed to create coupon: ${msg}`);
  }
}

export async function cmdBroadcast(message: string | undefined): Promise<string> {
  if (!message) return escapeMarkdown('Please provide a message: /broadcast Hello everyone!');

  const tokens = await getAllActiveTokens();
  if (tokens.length === 0) return escapeMarkdown('No active devices to broadcast to.');

  const tokenStrings = tokens.map((t) => t.token);
  const result = await sendPushBatch(tokenStrings, 'Aroha Astrology Update', message);

  return escapeMarkdown(`Broadcast sent!\nSuccess: ${result.success}\nFailed: ${result.failure}`);
}
