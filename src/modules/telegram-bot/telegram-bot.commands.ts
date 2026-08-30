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
  listRefundsBetween,
  clearDeletionRequest,
  listPendingDeletionRequestsBefore,
  usersActiveBetween,
  usersCreatedBetween,
  countUsersActiveSince,
} from '../users/users.repo.js';
import { CONCURRENT_ACTIVE_WINDOW_MS } from '../admin-alerts/admin-alerts.service.js';
import { maxOnlineCountBetween } from '../admin-alerts/admin-alerts.repo.js';
import { deleteMe } from '../users/users.service.js';
import { resolveDateRangePreset } from '../admin/admin.repo.js';
import { countFailedKundlis } from '../kundli/kundli.repo.js';
import { getFeedbackVoteCountsByUser } from '../astro/feedback.repo.js';
import { getAllActiveTokens } from '../device-tokens/device-tokens.repo.js';
import { listActiveCoupons, insertCoupon, sumPaidOrdersToday } from '../billing/billing.repo.js';
import { escapeMarkdown } from '../../lib/notifications/telegram.js';
import { notifyUsersBatch } from '../../lib/notifications/notify-user.js';
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
    const lastActive = u.lastActiveAt
      ? escapeMarkdown(u.lastActiveAt.toISOString().split('T')[0])
      : 'Never';
    return (
      `• *${name}* \\| ${contact} \\| ${balance} \\| Joined ${date}\n` +
      `  ID: \`${u.id}\` \\| Last login: ${lastActive}`
    );
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

/**
 * Approve a pending deletion request — this is where the erasure actually
 * happens, and it is irreversible. Deliberately routed through the same
 * `deleteMe` the app used to call directly, so the request/review layer sits
 * on top of the existing, audited anonymisation rather than beside it.
 *
 * Guarded on there being a live request: nobody should be able to erase an
 * account that never asked for it by fat-fingering an id here (that's what
 * `/delete` is for, and it is separately admin-gated).
 */
export async function cmdApproveDelete(idArg: string | undefined): Promise<string> {
  if (!idArg) return escapeMarkdown('Please provide a user ID: /approvedelete <id>');

  const user = await findActiveUserById(idArg);
  if (!user) return escapeMarkdown(`No active user with ID ${idArg}.`);
  if (!user.deletionRequestedAt) {
    return escapeMarkdown(
      `User ${idArg} has no pending deletion request. Use /delete to hard-delete instead.`,
    );
  }

  try {
    await deleteMe(idArg);
    return escapeMarkdown(
      `Approved. User ${idArg} has been anonymised — profile, chats, palm images and saved memory are gone. ` +
        `Phone number and account shell are retained on purpose (prevents a repeat sign-up bonus).`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return escapeMarkdown(`Failed to delete user: ${msg}`);
  }
}

/** Withdraw a pending request. Push and horoscope generation resume by themselves. */
export async function cmdRejectDelete(idArg: string | undefined): Promise<string> {
  if (!idArg) return escapeMarkdown('Please provide a user ID: /rejectdelete <id>');

  const cleared = await clearDeletionRequest(idArg);
  return escapeMarkdown(
    cleared
      ? `Rejected. User ${idArg} keeps their account; notifications and horoscopes resume.`
      : `User ${idArg} has no pending deletion request.`,
  );
}

/** Everyone currently awaiting a decision, oldest first. */
export async function cmdPendingDeletes(): Promise<string> {
  const pending = await listPendingDeletionRequestsBefore(new Date());
  if (pending.length === 0) return escapeMarkdown('No pending deletion requests.');

  const lines = pending.map((u) => {
    const days = Math.floor(
      (Date.now() - (u.deletionRequestedAt as Date).getTime()) / (24 * 60 * 60 * 1000),
    );
    return `\`${escapeMarkdown(u.id)}\` — ${escapeMarkdown(u.phoneE164 ?? u.email ?? 'no contact')} — ${days}d`;
  });
  return `*Pending Deletion Requests \\(${pending.length}\\)*\n\n${lines.join('\n')}`;
}

const peakBetween = (preset: string) => {
  const { from, to } = resolveDateRangePreset(preset);
  return maxOnlineCountBetween(from, to);
};

export async function cmdStats(): Promise<string> {
  const [
    totalUsers,
    newUsersToday,
    newUsersYesterday,
    newUsersWeek,
    revenue,
    outstanding,
    peakToday,
    peakYesterday,
    peakThisWeek,
    peakThisMonth,
    peakThisYear,
    concurrentNow,
    activeToday,
    activeYesterday,
  ] = await Promise.all([
    countUsers(),
    countNewUsersToday(),
    usersCreatedBetween(resolveDateRangePreset('yesterday')),
    countNewUsersThisWeek(),
    sumPaidOrdersToday(),
    sumWalletBalanceOutstanding(),
    peakBetween('today'),
    peakBetween('yesterday'),
    peakBetween('last7d'),
    peakBetween('last30d'),
    peakBetween('this_year'),
    countUsersActiveSince(new Date(Date.now() - CONCURRENT_ACTIVE_WINDOW_MS)),
    usersActiveBetween(resolveDateRangePreset('today')),
    usersActiveBetween(resolveDateRangePreset('yesterday')),
  ]);

  return (
    `*App Stats*\n\n` +
    `Total Users: ${totalUsers}\n` +
    `New Users Today: ${newUsersToday}\n` +
    `New Users Yesterday: ${newUsersYesterday}\n` +
    `New Users This Week: ${newUsersWeek}\n\n` +
    `Active Users \\(today\\): ${activeToday}\n` +
    `Active Users \\(yesterday\\): ${activeYesterday}\n\n` +
    `Concurrent Users \\(Online Now\\): ${concurrentNow}\n` +
    `Concurrent Users \\(today\\): ${peakToday}\n` +
    `Concurrent Users \\(yesterday\\): ${peakYesterday}\n` +
    `Concurrent Users \\(weekly\\): ${peakThisWeek}\n` +
    `Concurrent Users \\(monthly\\): ${peakThisMonth}\n` +
    `Concurrent Users \\(yearly\\): ${peakThisYear}\n\n` +
    `Revenue Today: ${escapeMarkdown(formatRupees(revenue.totalPaise))} \\(${revenue.count} order${revenue.count === 1 ? '' : 's'}\\)\n` +
    `Outstanding Wallet Balance: ${escapeMarkdown(formatRupees(outstanding))}`
  );
}

/** Distinct users active (by lastActiveAt) in each window — reuses the same `usersActiveBetween` the admin dashboard's active-users metric is built on. */
export async function cmdActiveUsers(): Promise<string> {
  const [today, yesterday, thisWeek, thisMonth] = await Promise.all([
    usersActiveBetween(resolveDateRangePreset('today')),
    usersActiveBetween(resolveDateRangePreset('yesterday')),
    usersActiveBetween(resolveDateRangePreset('last7d')),
    usersActiveBetween(resolveDateRangePreset('this_month')),
  ]);

  return (
    `*Active Users*\n\n` +
    `Today: ${today}\n` +
    `Yesterday: ${yesterday}\n` +
    `This Week: ${thisWeek}\n` +
    `This Month: ${thisMonth}`
  );
}

/**
 * Who's online right now — same 5-minute "concurrent" window
 * admin-alerts.service.ts pages on for its burst alert, so "online" here
 * means the same thing it does everywhere else in this codebase.
 *
 * ponytail: pulls the top 50 by lastActiveAt and filters client-side rather
 * than a dedicated `lastActiveAt >= cutoff` query — fine at current traffic,
 * but if concurrent users ever exceed 50 the count silently undercounts.
 * Upgrade to a proper repo query with a `count()` + capped list if that
 * threshold is ever realistic.
 */
export async function cmdOnlineUsers(): Promise<string> {
  const cutoff = new Date(Date.now() - CONCURRENT_ACTIVE_WINDOW_MS);
  const recent = await listUsersPage(50, 0, undefined, 'lastActiveAt', 'desc');
  const online = recent.filter((u) => u.lastActiveAt && u.lastActiveAt >= cutoff);

  if (online.length === 0) return escapeMarkdown('No users active in the last 5 minutes.');

  const lines = online.map((u) => {
    const name = escapeMarkdown(u.displayName || 'No Name');
    const contact = escapeMarkdown(u.email || u.phoneE164 || 'No contact');
    const minsAgo = Math.max(
      0,
      Math.round((Date.now() - (u.lastActiveAt as Date).getTime()) / 60000),
    );
    return `• *${name}* \\| ${contact} \\| ${minsAgo}m ago`;
  });

  return `*Online Now \\(${online.length}\\)* \\— last 5 min\n\n${lines.join('\n')}`;
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

/**
 * "Did anything go wrong for a user today?" — answered from the refund ledger.
 *
 * Every user-facing failure that cost somebody money writes a `refund:*` row
 * before the error is surfaced (see the chat handler's catch in
 * astro.routes.ts, and the same pattern in vastu/reports/gemstone). Reading
 * those back is both cheaper and more honest than grepping the pm2 log: it
 * lists exactly the users who paid for something and didn't get it, with no
 * false positives from a client that merely hung up.
 */
export async function cmdIncidents(dayArg: string | undefined): Promise<string> {
  const preset = (dayArg || 'today').toLowerCase();
  if (preset !== 'today' && preset !== 'yesterday') {
    return escapeMarkdown('Usage: /incidents [today|yesterday]');
  }

  const refunds = await listRefundsBetween(resolveDateRangePreset(preset));

  if (refunds.length === 0) {
    return escapeMarkdown(`No user-affecting failures ${preset}. ✅`);
  }

  const affectedUsers = new Set(refunds.map((r) => r.userId));
  const totalPaise = refunds.reduce((sum, r) => sum + r.delta, 0);

  // Group by what broke, so a systemic outage reads as one big bucket rather
  // than as N unrelated-looking lines.
  const byReason = new Map<string, typeof refunds>();
  for (const r of refunds) {
    const key = r.reason.replace(/^refund:/, '');
    byReason.set(key, [...(byReason.get(key) ?? []), r]);
  }

  // Telegram hard-caps a message at 4096 chars; keep the newest detail and
  // summarise the rest rather than having the whole reply rejected.
  const MAX_ROWS = 25;
  let rowsShown = 0;
  const sections: string[] = [];

  for (const [reason, rows] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const lines: string[] = [];
    for (const r of rows) {
      if (rowsShown >= MAX_ROWS) break;
      const name = escapeMarkdown(r.displayName || 'No Name');
      const contact = escapeMarkdown(r.phoneE164 || '—');
      const amount = escapeMarkdown(formatRupees(r.delta));
      const time = escapeMarkdown(
        r.createdAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
      );
      lines.push(`• *${name}* \\| ${contact} \\| ${amount} \\| ${time} IST`);
      rowsShown++;
    }
    sections.push(`*${escapeMarkdown(reason)}* \\(${rows.length}\\)\n${lines.join('\n')}`);
    if (rowsShown >= MAX_ROWS) break;
  }

  const omitted = refunds.length - rowsShown;
  const header =
    `*Incidents \\— ${escapeMarkdown(preset)} \\(IST\\)* ⚠️\n\n` +
    `${refunds.length} failure${refunds.length === 1 ? '' : 's'} \\| ` +
    `${affectedUsers.size} user${affectedUsers.size === 1 ? '' : 's'} affected \\| ` +
    `${escapeMarkdown(formatRupees(totalPaise))} refunded\n\n`;

  let reply = header + sections.join('\n\n');
  if (omitted > 0) {
    reply += escapeMarkdown(`\n\n…and ${omitted} more.`);
  }
  reply += escapeMarkdown('\n\nAll amounts above were auto-refunded at the time of failure.');
  return reply;
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

export async function cmdFeedback(offsetArg: string | undefined): Promise<string> {
  const PAGE_SIZE = 20;
  const offset = parseInt(offsetArg || '0', 10) || 0;

  const { rows, totalUserCount } = await getFeedbackVoteCountsByUser(PAGE_SIZE, offset);

  if (rows.length === 0) {
    return offset === 0
      ? escapeMarkdown('No chat feedback votes recorded yet.')
      : escapeMarkdown('No more users.');
  }

  const lines = rows.map((r) => {
    const contact = escapeMarkdown(r.email || r.phoneE164 || 'No contact');
    const name = escapeMarkdown(r.displayName || 'No Name');
    return (
      `• *${name}* \\| ${contact}\n` +
      `  ID: \`${r.userId}\` \\| 👍 ${r.upVotes} \\| 👎 ${r.downVotes}`
    );
  });

  const nextOffset = offset + PAGE_SIZE;
  const hasMore = nextOffset < totalUserCount;

  let reply = `*Chat Feedback by User \\(${offset + 1}\\-${offset + rows.length} of ${totalUserCount}\\)*\n\n${lines.join('\n')}`;
  if (hasMore) {
    reply += `\n\nNext page: \`/feedback ${nextOffset}\``;
  }

  return reply;
}

export async function cmdBroadcast(message: string | undefined): Promise<string> {
  if (!message) return escapeMarkdown('Please provide a message: /broadcast Hello everyone!');

  const tokens = await getAllActiveTokens();
  if (tokens.length === 0) return escapeMarkdown('No active devices to broadcast to.');

  const recipients = tokens.map((t) => ({ userId: t.userId, token: t.token }));
  const result = await notifyUsersBatch(recipients, {
    title: 'Aroha Astrology Update',
    body: message,
    type: 'admin_broadcast',
  });

  return escapeMarkdown(`Broadcast sent!\nSuccess: ${result.success}\nFailed: ${result.failure}`);
}
