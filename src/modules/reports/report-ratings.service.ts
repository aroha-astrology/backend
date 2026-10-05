import { Errors } from '../../lib/errors.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { findReportById } from './reports.repo.js';
import { insertReportRating } from './report-ratings.repo.js';

/**
 * Records a per-report rating. This is feedback only: a low rating no longer
 * refunds anything (it used to refund 100% under 3 stars). `refundedPaise`
 * stays in the response, always null, so the client and admin list keep
 * working and past refunds still show in the admin Refunded column.
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

  return { id: row.id, refundedPaise: null };
}
