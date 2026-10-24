// =============================================================================
// Cosmic Receipts (v7 spec, Sprint 6, switch `hooks.cosmicReceipts`, ships off)
// =============================================================================
// Three timed cards a day from the Moon's aspects to the reader's natal planets. The reader marks each
// one Nailed, Partly or Missed once it has begun; a card left unmarked can still be marked the next
// day (the "yesterday check"). Tomorrow's cards can be peeked at early for coins. Cards are made once a
// day and stored, so a card never changes after the reader has seen it. No accuracy figure is shown.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { buildReceipts, PARTS, shareLine, VERDICTS, type ReceiptCard, type ReceiptPart, type Verdict } from '../../lib/astro-tools/daily-hooks/receipts.js';
import { priceOf } from '../features/features.service.js';
import { localDateFor, requireHook, resolvePlace, spendOnce, type PlaceQuery } from './hooks-common.js';
import { addDays, refFor } from './hooks-rules.js';
import { createProgressOnce, getProgress, hasUnlock, mergeProgress } from './hooks.repo.js';
import { loadNatalPoints, moonLongitudes } from './sky-day.js';

const HOOK = 'cosmicReceipts' as const;

interface DayData {
  cards: ReceiptCard[];
  verdicts: Partial<Record<ReceiptPart, Verdict>>;
}

export interface ReceiptsView {
  date: string;
  cards: (ReceiptCard & { status: 'upcoming' | 'live' | 'past'; verdict: Verdict | null })[];
  share: ReturnType<typeof shareLine>;
  /** Cards from yesterday still waiting for a mark, shown first the next morning. */
  yesterdayCheck: { date: string; parts: ReceiptPart[] } | null;
  tomorrow: { unlocked: boolean; pricePaise: number; cards: ReceiptCard[] | null };
}

function minuteOf(now: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/** The stored cards of a date, made on first ask. Null when the reader's chart cannot be read. */
async function cardsFor(user: UserRow, tz: string, date: string, now: Date): Promise<DayData | null> {
  const row = await getProgress(user.id, HOOK, '', date);
  if (row && Array.isArray((row.data as Partial<DayData>).cards)) return row.data as unknown as DayData;
  const natal = await loadNatalPoints(user, now);
  if (!natal) return null;
  const cards = buildReceipts(natal, await moonLongitudes(tz, date));
  const data: DayData = { cards, verdicts: {} };
  if (!(await createProgressOnce(user.id, HOOK, '', date, data as unknown as Record<string, unknown>))) {
    const again = await getProgress(user.id, HOOK, '', date);
    return (again?.data as unknown as DayData) ?? data;
  }
  return data;
}

export async function getReceipts(user: UserRow, q: PlaceQuery, now: Date = new Date()): Promise<ReceiptsView> {
  await requireHook(user.id, HOOK);
  const place = resolvePlace(user, q);
  const date = localDateFor(place.tz, now);
  const today = await cardsFor(user, place.tz, date, now);
  if (!today) throw Errors.unprocessable('NO_CHART');
  const minute = minuteOf(now, place.tz);

  const yesterdate = addDays(date, -1);
  const yRow = await getProgress(user.id, HOOK, '', yesterdate);
  const yd = yRow?.data as Partial<DayData> | undefined;
  const missing = yd?.cards ? PARTS.map((p) => p.part).filter((p) => !yd.verdicts?.[p]) : [];

  const tomorrowDate = addDays(date, 1);
  const unlocked = await hasUnlock(user.id, HOOK, refFor(HOOK, '', tomorrowDate, 'peek'));
  const tomorrowData = unlocked ? await cardsFor(user, place.tz, tomorrowDate, now) : null;

  return {
    date,
    cards: today.cards.map((c) => ({
      ...c,
      status: minute < c.startMin ? 'upcoming' : minute < c.endMin ? 'live' : 'past',
      verdict: today.verdicts[c.part] ?? null,
    })),
    share: shareLine(today.verdicts),
    yesterdayCheck: missing.length ? { date: yesterdate, parts: missing } : null,
    tomorrow: { unlocked, pricePaise: await priceOf(user.id, 'hooks.peekTomorrow', 1500), cards: tomorrowData?.cards ?? null },
  };
}

/** Marks one card. Today's cards can be marked once they have begun; yesterday's any time. Once per card. */
export async function markCard(
  user: UserRow,
  q: PlaceQuery & { date: 'today' | 'yesterday'; part: ReceiptPart; verdict: Verdict },
  now: Date = new Date(),
): Promise<ReceiptsView> {
  await requireHook(user.id, HOOK);
  if (!VERDICTS.includes(q.verdict)) throw Errors.badRequest('verdict must be nailed, partly or missed');
  const meta = PARTS.find((p) => p.part === q.part);
  if (!meta) throw Errors.badRequest('part must be morning, afternoon or evening');
  const place = resolvePlace(user, q);
  const today = localDateFor(place.tz, now);
  const date = q.date === 'yesterday' ? addDays(today, -1) : today;
  const row = await getProgress(user.id, HOOK, '', date);
  const data = row?.data as Partial<DayData> | undefined;
  if (!data?.cards) throw Errors.notFound('No cards for that day');
  if (q.date === 'today' && minuteOf(now, place.tz) < meta.startMin) throw Errors.conflict('NOT_YET');
  if (data.verdicts?.[q.part]) throw Errors.conflict('ALREADY_MARKED');
  await mergeProgress(user.id, HOOK, '', date, { verdicts: { ...(data.verdicts ?? {}), [q.part]: q.verdict } });
  return getReceipts(user, q, now);
}

/** Opens tomorrow's cards early (coins, once). */
export async function peekTomorrow(user: UserRow, q: PlaceQuery, now: Date = new Date()): Promise<ReceiptsView & { chargedPaise: number }> {
  await requireHook(user.id, HOOK);
  const place = resolvePlace(user, q);
  const tomorrow = addDays(localDateFor(place.tz, now), 1);
  const res = await spendOnce(user, {
    hook: HOOK,
    ref: refFor(HOOK, '', tomorrow, 'peek'),
    priceKey: 'hooks.peekTomorrow',
    fallbackPaise: 1500,
    reason: 'hook_receipts_peek',
  });
  return { ...(await getReceipts(user, q, now)), chargedPaise: res.chargedPaise };
}
