/**
 * One-off: apologise to a user a failure actually cost, with a goodwill credit.
 *
 * Reuses addWalletBalance + notifyUser rather than touching the tables
 * directly, so the wallet_transactions ledger row (with the right
 * balance_after) and the Bell inbox row are both written exactly the way the
 * app itself writes them. A raw UPDATE would silently desync the ledger.
 *
 * Usage:
 *   npx tsx scripts/goodwill-credit.ts <userId> <amountPaise> "Title" "Body"
 *
 * Prints the before/after balance and how many devices actually received the
 * push, so a "0 recipients" send can never look like a success.
 */
import { addWalletBalance, findActiveUserById } from '../src/modules/users/users.repo.js';
import { notifyUser } from '../src/lib/notifications/notify-user.js';
import { findActiveTokensForUser } from '../src/modules/device-tokens/device-tokens.repo.js';

async function main() {
  const [userId, amountArg, title, body] = process.argv.slice(2);
  if (!userId || !amountArg || !title || !body) {
    throw new Error('Usage: goodwill-credit.ts <userId> <amountPaise> "Title" "Body"');
  }
  const amountPaise = Number(amountArg);
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error(`amountPaise must be a positive integer, got: ${amountArg}`);
  }

  const before = await findActiveUserById(userId);
  if (!before) throw new Error(`No active user ${userId}`);
  console.log(`User ${userId} (${before.displayName ?? 'unnamed'})`);
  console.log(`Balance before: ${before.walletBalancePaise} paise`);

  await addWalletBalance(userId, amountPaise, 'goodwill:service_failure');

  const after = await findActiveUserById(userId);
  console.log(`Balance after:  ${after?.walletBalancePaise} paise (+${amountPaise})`);

  const tokens = await findActiveTokensForUser(userId);
  console.log(`Active devices: ${tokens.length}`);

  await notifyUser(userId, { title, body, type: 'service_apology' });
  console.log(
    tokens.length === 0
      ? 'Inbox row written. No registered device — nothing pushed.'
      : 'Inbox row written and push sent.',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
