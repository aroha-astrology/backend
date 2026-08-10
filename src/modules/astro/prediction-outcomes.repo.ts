import { and, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../../config/db.js';
import { predictionOutcomes, type PredictionOutcomeRow } from '../../db/schema.js';

export type PredictionSurface = 'chat' | 'horoscope' | 'report' | 'transit_alert';

export interface RecordPredictionInput {
  userId: string;
  birthProfileId?: string | null;
  surface: PredictionSurface;
  sourceId?: string | null;
  domain?: string | null;
  claim: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  confidence?: string | null;
  /** The grounding facts this claim was built from — hashed, never stored raw. */
  facts?: string[] | null;
  model?: string | null;
  techniques?: string[];
}

/**
 * Stable hash of the fact set behind a prediction.
 *
 * The facts themselves are deliberately NOT stored: they contain the user's
 * chart in detail, and this table exists to score accuracy, not to become a
 * second copy of personal data. The hash is enough to answer the question that
 * matters — "were these two predictions made from the same inputs?".
 */
export function hashFacts(facts: string[] | null | undefined): string | null {
  if (!facts || facts.length === 0) return null;
  return crypto.createHash('sha256').update(facts.join('\n')).digest('hex').slice(0, 32);
}

/**
 * Records one dated, falsifiable claim.
 *
 * Best-effort by contract: prediction capture must never break the prediction
 * itself, so every caller wraps this in a `.catch()` and a failure here is a
 * logged miss, not a failed reply.
 */
export async function recordPrediction(
  input: RecordPredictionInput,
): Promise<{ id: string } | null> {
  const rows = await db
    .insert(predictionOutcomes)
    .values({
      userId: input.userId,
      birthProfileId: input.birthProfileId ?? null,
      surface: input.surface,
      sourceId: input.sourceId ?? null,
      domain: input.domain ?? null,
      claim: input.claim,
      windowStart: input.windowStart ?? null,
      windowEnd: input.windowEnd ?? null,
      confidence: input.confidence ?? null,
      factsHash: hashFacts(input.facts),
      model: input.model ?? null,
      techniques: input.techniques ?? [],
    })
    .returning({ id: predictionOutcomes.id });

  return rows[0] ?? null;
}

/** Attaches a user's verdict to a specific prediction. */
export async function ratePrediction(
  id: string,
  userId: string,
  rating: -1 | 0 | 1,
  happened?: boolean | null,
): Promise<boolean> {
  const rows = await db
    .update(predictionOutcomes)
    .set({
      rating,
      happened: happened ?? null,
      ratedAt: new Date(),
    })
    .where(and(eq(predictionOutcomes.id, id), eq(predictionOutcomes.userId, userId)))
    .returning({ id: predictionOutcomes.id });

  return rows.length > 0;
}

/**
 * Predictions whose window has closed but which nobody has scored yet — the
 * queue for "did this actually happen?". Ordered oldest first so the longest
 * outstanding claim is asked about before a fresher one.
 */
export async function findPredictionsDueForReview(
  userId: string,
  asOf: string,
  limit = 5,
): Promise<PredictionOutcomeRow[]> {
  return db
    .select()
    .from(predictionOutcomes)
    .where(
      and(
        eq(predictionOutcomes.userId, userId),
        isNull(predictionOutcomes.rating),
        lte(predictionOutcomes.windowEnd, asOf),
      ),
    )
    .orderBy(predictionOutcomes.windowEnd)
    .limit(limit);
}

export interface AccuracyRollup {
  surface: string;
  confidence: string | null;
  rated: number;
  correct: number;
  accuracy: number;
}

/**
 * The number this whole table exists to produce: hit rate by surface and by the
 * confidence band the engine claimed at the time.
 *
 * A calibrated system has HIGH scoring materially better than LOW. If they come
 * out the same, `dasha-confidence.ts`'s banding is decorative and should be
 * retuned — which is exactly the finding that was impossible to make before.
 */
export async function accuracyBySurfaceAndConfidence(): Promise<AccuracyRollup[]> {
  const rows = await db
    .select({
      surface: predictionOutcomes.surface,
      confidence: predictionOutcomes.confidence,
      rated: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) FILTER (WHERE ${predictionOutcomes.rating} = 1)::int`,
    })
    .from(predictionOutcomes)
    .where(sql`${predictionOutcomes.rating} IS NOT NULL`)
    .groupBy(predictionOutcomes.surface, predictionOutcomes.confidence)
    .orderBy(desc(sql`count(*)`));

  return rows.map((r) => ({
    surface: r.surface,
    confidence: r.confidence,
    rated: r.rated,
    correct: r.correct,
    accuracy: r.rated > 0 ? Math.round((r.correct / r.rated) * 1000) / 10 : 0,
  }));
}
