// =============================================================================
// Deletion-request reminder — nag the admin chat until someone decides
// =============================================================================
// Deleting an account is a reviewed request (users.service.ts
// `requestAccountDeletion`), and nothing in the system erases anything on a
// timer — an admin has to run /approvedelete. That is a deliberate choice, but
// it means a single missed Telegram message would strand a user's request
// forever, which is exactly the kind of thing Play and DPDP care about.
//
// So this re-sends the request, once per still-pending user, EVERY day from
// day 6 onwards. It is a nag, not a deadline: it stops only when the request
// is approved (anonymizeUserById clears the flag) or rejected. The user was
// told "3 to 7 business days", so day 6 is the last comfortable moment to act.
// =============================================================================

import { notifyAccountDeletionRequest } from '../../lib/notifications/telegram.js';
import { listPendingDeletionRequestsBefore } from '../users/users.repo.js';
import { logger } from '../../lib/logger.js';

/** Calendar days, not business days — the user-facing "3–7 business days" is copy; this is an internal nag where a weekend's slack does not matter. */
export const DELETION_REMINDER_AFTER_DAYS = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DeletionReminderResult {
  pending: number;
  reminded: number;
}

export async function runDeletionRequestReminder(): Promise<DeletionReminderResult> {
  const cutoff = new Date(Date.now() - DELETION_REMINDER_AFTER_DAYS * DAY_MS);
  const users = await listPendingDeletionRequestsBefore(cutoff);

  let reminded = 0;
  for (const user of users) {
    const requestedAt = user.deletionRequestedAt;
    if (!requestedAt) continue; // impossible per the query, but the column is nullable

    const sent = await notifyAccountDeletionRequest({
      userId: user.id,
      contact: user.phoneE164 ?? user.email,
      requestedAt,
      pendingDays: Math.floor((Date.now() - requestedAt.getTime()) / DAY_MS),
    });
    if (sent) reminded++;
    else logger.warn({ userId: user.id }, 'deletion-reminder: telegram send failed');
  }

  return { pending: users.length, reminded };
}
