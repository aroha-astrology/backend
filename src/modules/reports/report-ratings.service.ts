import { Errors } from '../../lib/errors.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { findReportById } from './reports.repo.js';
import { reasonForRow } from './reports.service.js';
import { insertReportRating, stampRefund } from './report-ratings.repo.js';
import { addWalletBalance } from '../users/users.repo.js';

/** Ratings at or above this are just feedback; below it, the user gets a
 * full refund — see docs/superpowers/specs/2026-09-03-report-rating-and-refund-design.md. */
const REFUND_BELOW_RATING = 3;

/**
 * Records a per-report rating and, for a rating under 3 stars, immediately
 * refunds 100% of what was paid for THIS report row — reusing the exact
 * `refund:report_unlock:<key>[:<month>]` reason format the objective
 * generation-failure refund already uses (see reports.service.ts), so
 * Payment History's existing isRefund/parseReason logic renders it with no
 * frontend changes.
 *
 * 404 (not 403) for a report owned by someone else — matches GET
 * /reports/{id}'s own "never confirm another user's report exists" stance.
 */
export async function rateReport(input: {
  userId: string;
  reportId: string;
  rating: number;
  comment?: string;
}): Promise<{ id: string; refundedPaise: number | null }> {
  const report = await findReportById(input.reportId);
  if (!report || report.userId !== input.userId) throw Errors.notFound('Report not found');
  if (report.status !== 'ready') throw Errors.conflict('Report is not ready to be rated');

  let row: { id: string };
  try {
    row = await insertReportRating(input);
  } catch (err) {
    if (isUniqueViolation(err)) throw Errors.conflict('This report has already been rated');
    throw err;
  }

  if (input.rating >= REFUND_BELOW_RATING) return { id: row.id, refundedPaise: null };

  const refundedPaise = report.pricePaidPaise;
  await addWalletBalance(
    input.userId,
    refundedPaise,
    `refund:${reasonForRow(report.reportKey, report.periodMonth)}`,
  );
  await stampRefund(row.id, refundedPaise);
  return { id: row.id, refundedPaise };
}
