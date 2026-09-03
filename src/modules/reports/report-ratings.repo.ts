import { count, desc, eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { reportRatings, reports, users } from '../../db/schema.js';
import { decryptField, encryptField } from '../../lib/crypto/field-encryption.js';

/** Inserts a rating row. Throws a Postgres unique-violation (SQLSTATE 23505,
 * see lib/db-errors.ts's isUniqueViolation) if this (userId, reportId) pair
 * has already rated — the service layer turns that into a 409. */
export async function insertReportRating(input: {
  userId: string;
  reportId: string;
  rating: number;
  comment?: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(reportRatings)
    .values({
      userId: input.userId,
      reportId: input.reportId,
      rating: input.rating,
      comment: input.comment ? (encryptField(input.comment) as string) : null,
    })
    .returning({ id: reportRatings.id });
  if (!row) throw new Error('insertReportRating: insert returned no row');
  return row;
}

/** Stamps the refunded amount onto an already-inserted rating row, after the
 * wallet credit has actually landed. */
export async function stampRefund(ratingId: string, refundedPaise: number): Promise<void> {
  await db.update(reportRatings).set({ refundedPaise }).where(eq(reportRatings.id, ratingId));
}

export interface AdminReportRatingRow {
  id: string;
  userId: string;
  displayName: string | null;
  phoneE164: string | null;
  reportKey: string;
  rating: number;
  comment: string | null;
  refundedPaise: number | null;
  createdAt: Date;
}

/** Every rating across all users, newest first — powers /admin/report-ratings. */
export async function listAllReportRatings(
  reportKey: string | undefined,
  limit: number,
  offset: number,
): Promise<{ rows: AdminReportRatingRow[]; total: number }> {
  const where = reportKey ? eq(reports.reportKey, reportKey) : undefined;
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: reportRatings.id,
        userId: reportRatings.userId,
        displayName: users.displayName,
        phoneE164: users.phoneE164,
        reportKey: reports.reportKey,
        rating: reportRatings.rating,
        comment: reportRatings.comment,
        refundedPaise: reportRatings.refundedPaise,
        createdAt: reportRatings.createdAt,
      })
      .from(reportRatings)
      .innerJoin(reports, eq(reports.id, reportRatings.reportId))
      .innerJoin(users, eq(users.id, reportRatings.userId))
      .where(where)
      .orderBy(desc(reportRatings.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(reportRatings)
      .innerJoin(reports, eq(reports.id, reportRatings.reportId))
      .where(where),
  ]);
  return {
    rows: rows.map((row) => ({
      ...row,
      phoneE164: decryptField(row.phoneE164),
      comment: row.comment ? decryptField(row.comment) : null,
    })),
    total: totalRows[0]?.total ?? 0,
  };
}
