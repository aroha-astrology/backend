import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { journalEntries, type JournalEntryRow } from '../../db/schema.js';
import { decryptJson, encryptJson } from '../../lib/crypto/field-encryption.js';
import type { LifeEventDomain } from '../../lib/astro-engine/calculations/rectification.js';

export const RATING_FIELDS = ['mood', 'energy', 'career', 'relationship', 'money'] as const;
export type RatingField = (typeof RATING_FIELDS)[number];

/** The encrypted half of an entry. */
export interface JournalBody {
  note: string | null;
  events: LifeEventDomain[];
}

/** The owner's sky that day, kept so insights can group entries by dasha and Moon. */
export interface JournalSnapshot {
  maha: string | null;
  antar: string | null;
  moonSign: string;
  moonNakshatra: string;
  /** 1-9, the day's star counted from the birth star. */
  tara: number;
}

export interface JournalEntry extends Omit<JournalEntryRow, 'body' | 'snapshot'> {
  note: string | null;
  events: LifeEventDomain[];
  snapshot: JournalSnapshot | null;
}

function open(row: JournalEntryRow): JournalEntry {
  const { body, snapshot, ...rest } = row;
  const decrypted = decryptJson<JournalBody>(body) ?? { note: null, events: [] };
  return {
    ...rest,
    note: decrypted.note,
    events: decrypted.events ?? [],
    snapshot: (snapshot as JournalSnapshot | null) ?? null,
  };
}

/** Creates or replaces the entry for (user, date). */
export async function upsertJournalEntry(values: {
  userId: string;
  entryDate: string;
  ratings: Partial<Record<RatingField, number | null>>;
  body: JournalBody;
  snapshot: JournalSnapshot | null;
}): Promise<JournalEntry> {
  const ratings = Object.fromEntries(RATING_FIELDS.map((f) => [f, values.ratings[f] ?? null]));
  const set = {
    ...ratings,
    body: encryptJson(values.body)!,
    snapshot: values.snapshot,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(journalEntries)
    .values({ userId: values.userId, entryDate: values.entryDate, ...set })
    .onConflictDoUpdate({ target: [journalEntries.userId, journalEntries.entryDate], set })
    .returning();
  return open(row!);
}

export async function listJournalEntries(
  userId: string,
  range: { from?: string; to?: string; limit?: number; order?: 'asc' | 'desc' } = {},
): Promise<JournalEntry[]> {
  const conditions = [eq(journalEntries.userId, userId)];
  if (range.from) conditions.push(gte(journalEntries.entryDate, range.from));
  if (range.to) conditions.push(lte(journalEntries.entryDate, range.to));
  const rows = await db
    .select()
    .from(journalEntries)
    .where(and(...conditions))
    .orderBy(range.order === 'asc' ? asc(journalEntries.entryDate) : desc(journalEntries.entryDate))
    .limit(range.limit ?? 400);
  return rows.map(open);
}

export async function deleteJournalEntry(userId: string, entryDate: string): Promise<boolean> {
  const deleted = await db
    .delete(journalEntries)
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.entryDate, entryDate)))
    .returning({ id: journalEntries.id });
  return deleted.length > 0;
}
