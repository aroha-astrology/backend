// =============================================================================
// Mystery Synastry (v7 spec, Sprint 6, switch `hooks.mysteryDrop`, ships off)
// =============================================================================
// From 18:00 on the reader's clock, one scratch card a day (two with a Pass) shows which person in
// their Cosmic Circle has the strongest evening link with them, and why (lib/.../mystery.ts). The name
// and the reason stay hidden until the card is scratched. With nobody in the circle yet the card shows
// a public chart with a recorded birth moment and a nudge to add a friend (free). Never another user's
// chart. The picks are made once and stored, so a card does not change after it is shown.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { calculatePlanetPositions } from '../../lib/astro-engine/calculations/planetPositions.js';
import { jdFromDate } from '../../lib/astro-tools/transit-events.js';
import { pickPublicChart, PUBLIC_CHARTS, rankMystery, type MysteryPick } from '../../lib/astro-tools/daily-hooks/mystery.js';
import { passEntitlement } from '../../lib/entitlements.js';
import { zonedInstant } from '../../lib/user-time-zone.js';
import { bondCompatibility, bondSpec, loadBondChart } from '../bonds/bonds.service.js';
import { resolveProfileContext } from '../birth-profiles/profile-context.js';
import { loadCirclePeople } from './circle-people.js';
import { localDateFor, requireHook, resolvePlace, type PlaceQuery } from './hooks-common.js';
import { createProgressOnce, getProgress, mergeProgress } from './hooks.repo.js';

const HOOK = 'mysteryDrop' as const;
export const REVEAL_MINUTE = 18 * 60;

interface StoredCard extends MysteryPick {
  kind: 'circle' | 'public';
  scratched: boolean;
}
interface DayData {
  cards: StoredCard[];
}

export interface MysteryCardView {
  index: number;
  scratched: boolean;
  kind: 'circle' | 'public' | null;
  /** Hidden until the card is scratched. */
  name: string | null;
  score: number | null;
  why: string[] | null;
}

export interface MysteryView {
  date: string;
  /** 'waiting' before 18:00, 'ready' after. */
  state: 'waiting' | 'ready' | 'empty';
  opensInMin: number | null;
  allowed: number;
  cards: MysteryCardView[];
  /** True when the card is a public chart because the circle is empty. */
  addFriendHint: boolean;
}

function minuteOf(now: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return Number(parts.hour) * 60 + Number(parts.minute);
}

async function moonAt(instant: Date): Promise<number> {
  const sky = await calculatePlanetPositions(jdFromDate(instant), 'lahiri');
  return sky.find((p) => p.planet === 'Moon')?.longitude ?? 0;
}

async function makeCards(user: UserRow, tz: string, date: string, now: Date, allowed: number): Promise<StoredCard[]> {
  const ownerProfile = await resolveProfileContext(user, null);
  const people = await loadCirclePeople(user, date, now);
  const eveningMoon = await moonAt(zonedInstant(date, tz, 20 * 60));
  const ownerChart = await loadBondChart(user, ownerProfile, now).catch(() => null);
  const readerMoon = (ownerChart?.chartData as { planets?: { planet: string; longitude: number }[] } | undefined)?.planets?.find((p) => p.planet === 'Moon')?.longitude;

  if (ownerChart && readerMoon !== undefined) {
    const scored = people
      .filter((p) => p.chart)
      .map((p) => {
        const compat = bondCompatibility(ownerChart.ctx, p.chart!.ctx, bondSpec(p.relationship, p.gender, ownerProfile.gender), ownerProfile.gender, p.gender);
        const moon = (p.chart!.chartData as { planets: { planet: string; longitude: number }[] }).planets.find((x) => x.planet === 'Moon')?.longitude ?? 0;
        return { id: p.memberId, name: p.name, compatibility: compat.pct, moon };
      });
    if (scored.length) {
      return rankMystery(scored, readerMoon, eveningMoon).slice(0, allowed).map((r) => ({ ...r, kind: 'circle' as const, scratched: false }));
    }
  }
  // Nobody in the circle with a readable chart: a public chart, and the reader's own Moon from their chart if there is one.
  if (readerMoon === undefined) return [];
  const moons: Record<string, number> = {};
  for (const c of PUBLIC_CHARTS) moons[c.id] = await moonAt(new Date(c.instant));
  return [{ ...pickPublicChart(readerMoon, eveningMoon, moons), kind: 'public' as const, scratched: false }];
}

async function view(user: UserRow, q: PlaceQuery, now: Date, create: boolean): Promise<MysteryView> {
  const place = resolvePlace(user, q);
  const date = localDateFor(place.tz, now);
  const minute = minuteOf(now, place.tz);
  const allowed = (await passEntitlement(user.id).catch(() => null)) ? 2 : 1;
  const base = { date, allowed };
  if (minute < REVEAL_MINUTE) return { ...base, state: 'waiting', opensInMin: REVEAL_MINUTE - minute, cards: [], addFriendHint: false };

  let row = await getProgress(user.id, HOOK, '', date);
  let data = row?.data as Partial<DayData> | undefined;
  if (!data?.cards && create) {
    const cards = await makeCards(user, place.tz, date, now, allowed);
    if (cards.length) await createProgressOnce(user.id, HOOK, '', date, { cards } as unknown as Record<string, unknown>);
    row = await getProgress(user.id, HOOK, '', date);
    data = row?.data as Partial<DayData> | undefined;
  }
  const cards = data?.cards ?? [];
  if (cards.length === 0) return { ...base, state: 'empty', opensInMin: null, cards: [], addFriendHint: false };
  return {
    ...base,
    state: 'ready',
    opensInMin: null,
    addFriendHint: cards.some((c) => c.kind === 'public'),
    cards: cards.slice(0, allowed).map((c, i) => ({
      index: i,
      scratched: c.scratched,
      kind: c.scratched ? c.kind : null,
      name: c.scratched ? c.name : null,
      score: c.scratched ? c.score : null,
      why: c.scratched ? c.why : null,
    })),
  };
}

export async function getMystery(user: UserRow, q: PlaceQuery, now: Date = new Date()): Promise<MysteryView> {
  await requireHook(user.id, HOOK);
  return view(user, q, now, true);
}

/** Scratches card `index`. Once scratched it stays revealed. */
export async function scratchCard(user: UserRow, q: PlaceQuery & { index: number }, now: Date = new Date()): Promise<MysteryView> {
  await requireHook(user.id, HOOK);
  const v = await view(user, q, now, true);
  if (v.state === 'waiting') throw Errors.conflict('NOT_YET');
  const card = v.cards[q.index];
  if (!card) throw Errors.notFound('No such card');
  if (!card.scratched) {
    const row = await getProgress(user.id, HOOK, '', v.date);
    const cards = ((row?.data as Partial<DayData>).cards ?? []).map((c, i) => (i === q.index ? { ...c, scratched: true } : c));
    await mergeProgress(user.id, HOOK, '', v.date, { cards });
  }
  return view(user, q, now, false);
}
