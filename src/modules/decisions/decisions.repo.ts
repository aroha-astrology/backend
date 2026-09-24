import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { decisionQueries, type DecisionQueryRow } from '../../db/schema.js';
import { decryptJson, encryptJson } from '../../lib/crypto/field-encryption.js';

export type DecisionKind = 'decision' | 'muhurta';

/** The personal half of a query, stored encrypted. */
export interface DecisionInput {
  question: string | null;
  place: { name: string | null; lat: number; lon: number; tz: string };
}

export interface DecisionQuery<R> extends Omit<DecisionQueryRow, 'input' | 'result' | 'kind'> {
  kind: DecisionKind;
  input: DecisionInput;
  result: R;
}

function open<R>(row: DecisionQueryRow): DecisionQuery<R> {
  return {
    ...row,
    kind: row.kind as DecisionKind,
    input: decryptJson<DecisionInput>(row.input) ?? {
      question: null,
      place: { name: null, lat: 0, lon: 0, tz: 'Asia/Kolkata' },
    },
    result: row.result as R,
  };
}

export async function insertDecisionQuery<R>(values: {
  userId: string;
  birthProfileId: string | null;
  kind: DecisionKind;
  category: string;
  input: DecisionInput;
  result: R;
  pricePaidPaise: number;
}): Promise<DecisionQuery<R>> {
  const [row] = await db
    .insert(decisionQueries)
    .values({ ...values, input: encryptJson(values.input)!, result: values.result })
    .returning();
  return open<R>(row!);
}

export async function findDecisionQuery<R>(
  userId: string,
  id: string,
): Promise<DecisionQuery<R> | null> {
  const [row] = await db
    .select()
    .from(decisionQueries)
    .where(and(eq(decisionQueries.userId, userId), eq(decisionQueries.id, id)))
    .limit(1);
  return row ? open<R>(row) : null;
}

/** A user's most recent results across all profiles, newest first. */
export async function listDecisionQueries<R>(
  userId: string,
  kind: DecisionKind | undefined,
  limit = 20,
): Promise<DecisionQuery<R>[]> {
  const rows = await db
    .select()
    .from(decisionQueries)
    .where(
      kind
        ? and(eq(decisionQueries.userId, userId), eq(decisionQueries.kind, kind))
        : eq(decisionQueries.userId, userId),
    )
    .orderBy(desc(decisionQueries.createdAt))
    .limit(limit);
  return rows.map((r) => open<R>(r));
}
