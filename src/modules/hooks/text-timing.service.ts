// =============================================================================
// "Text them now?" (v7 spec, Sprint 6, switch `hooks.textTiming`, ships off)
// =============================================================================
// A green / amber / red timing suggestion for getting in touch with one of the reader's OWN saved
// profiles (a partner, a crush, a friend). It works without the other person's birth time: their Moon
// could then be in one of two signs on their birth date, and both are shown with a precision badge.
// "Alert me at the peak" is one push at the start of the day's best stretch, for coins (hooks.textAlert).
// The words are a timing suggestion. They never say what the other person feels or will do.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { calculatePlanetPositions } from '../../lib/astro-engine/calculations/planetPositions.js';
import { jdFromDate } from '../../lib/astro-tools/transit-events.js';
import { buildTextTiming, decode, type DecoderCard, type OtherPerson, type TextTiming } from '../../lib/astro-tools/daily-hooks/text-timing.js';
import { signOf } from '../../lib/astro-tools/daily-hooks/aspects.js';
import { normalizePushLang } from '../../lib/push-lang.js';
import { zonedInstant } from '../../lib/user-time-zone.js';
import { findOwnedBirthProfile, listBirthProfilesByOwner } from '../birth-profiles/birth-profiles.repo.js';
import { resolveProfileContext } from '../birth-profiles/profile-context.js';
import { loadBondChart } from '../bonds/bonds.service.js';
import { isFeatureOnGlobally, priceOf } from '../features/features.service.js';
import { hookPushCopy } from './hooks-copy.js';
import { localDateFor, requireHook, resolvePlace, spendOnce, type PlaceQuery } from './hooks-common.js';
import { refFor } from './hooks-rules.js';
import { insertAlarm, listAlarms } from './hooks.repo.js';
import { loadNatal, moonLongitudes } from './sky-day.js';

const HOOK = 'textTiming' as const;

export interface TextPerson {
  profileId: string;
  name: string;
  relationship: string | null;
  /** False when the profile has no birth date at all, so nothing can be read. */
  readable: boolean;
}

export interface TextVariant {
  /** 'Moon in Taurus' when the other person's birth time is unknown and the Moon changed sign that day; else null. */
  label: string | null;
  now: { color: string; score: number } | null;
  best: { start: string; end: string; score: number } | null;
  bestUntil: string | null;
  nextGreen: string | null;
  runs: { start: string; end: string; color: string; score: number }[];
  cards: DecoderCard[];
}

export interface TextTimingView {
  date: string;
  person: { profileId: string; name: string };
  /** One variant normally; two while the other person's Moon sign is uncertain. */
  variants: TextVariant[];
  precision: 'exact' | 'moon-sign-options' | 'approximate';
  alert: { pricePaise: number; armed: boolean; at: string | null };
  note: string;
}

const NOTE = 'A timing suggestion from the Moon\'s path through both charts. It is not a statement about what anyone feels.';

function minuteOf(now: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export async function listTextPeople(user: UserRow): Promise<TextPerson[]> {
  await requireHook(user.id, HOOK);
  const rows = await listBirthProfilesByOwner(user.id);
  return rows.map((r) => ({ profileId: r.id, name: r.displayName?.trim() || 'Someone', relationship: r.relationship ?? null, readable: Boolean(r.dateOfBirth) }));
}

async function longitudeAt(planet: string, instant: Date): Promise<number> {
  const sky = await calculatePlanetPositions(jdFromDate(instant), 'lahiri');
  return sky.find((p) => p.planet === planet)?.longitude ?? 0;
}

/** The other person's Moon (one or two candidates), Venus and Mercury. */
async function otherOf(user: UserRow, profileId: string, now: Date): Promise<{ name: string; people: { label: string | null; other: OtherPerson }[]; precision: TextTimingView['precision'] } | null> {
  const row = await findOwnedBirthProfile(profileId, user.id);
  if (!row) return null;
  const name = row.displayName?.trim() || 'Someone';
  const ctx = await resolveProfileContext(user, row.id);
  const exact = ctx.birthTimeAccuracy === 'exact';
  const chart = exact ? await loadBondChart(user, ctx, now).catch(() => null) : null;
  const planets = (chart?.chartData as { planets?: { planet: string; longitude: number }[] } | undefined)?.planets;
  const pick = (n: string): number | undefined => planets?.find((p) => p.planet === n)?.longitude;
  if (planets && pick('Moon') !== undefined && pick('Venus') !== undefined && pick('Mercury') !== undefined) {
    return { name, people: [{ label: null, other: { moon: pick('Moon')!, venus: pick('Venus')!, mercury: pick('Mercury')! } }], precision: 'exact' };
  }
  const dob = ctx.dateOfBirth;
  if (!dob) return null;
  const tz = ctx.placeOfBirth?.tz ?? 'UTC';
  const start = zonedInstant(dob, tz, 0);
  const end = zonedInstant(dob, tz, 1439);
  const noon = zonedInstant(dob, tz, 720);
  const [m0, m1, venus, mercury] = [await longitudeAt('Moon', start), await longitudeAt('Moon', end), await longitudeAt('Venus', noon), await longitudeAt('Mercury', noon)];
  if (signOf(m0) !== signOf(m1)) {
    const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    return {
      name,
      precision: 'moon-sign-options',
      people: [m0, m1].map((m) => ({ label: `Moon in ${SIGNS[signOf(m)]}`, other: { moon: m, venus, mercury } })),
    };
  }
  return { name, precision: 'approximate', people: [{ label: null, other: { moon: await longitudeAt('Moon', noon), venus, mercury } }] };
}

function variantOf(t: TextTiming, cards: DecoderCard[], label: string | null, nowMin: number): TextVariant {
  return {
    label,
    now: t.current ? { color: t.current.color, score: t.current.score } : null,
    best: t.best ? { start: t.best.start, end: t.best.end, score: t.best.score } : null,
    bestUntil: t.bestUntil,
    nextGreen: t.nextGreen,
    runs: t.runs.filter((r) => r.endMin > nowMin).map((r) => ({ start: r.start, end: r.end, color: r.color, score: r.score })),
    cards,
  };
}

export async function getTextTiming(user: UserRow, q: PlaceQuery & { profileId: string }, now: Date = new Date()): Promise<TextTimingView> {
  await requireHook(user.id, HOOK);
  const place = resolvePlace(user, q);
  const date = localDateFor(place.tz, now);
  const other = await otherOf(user, q.profileId, now);
  if (!other) throw Errors.notFound('Profile not found or without a birth date');
  const mine = await loadNatal(user, now);
  if (!mine.natalMoon) throw Errors.unprocessable('NO_CHART');
  const track = await moonLongitudes(place.tz, date);
  const nowMin = minuteOf(now, place.tz);
  const moonNow = track.reduce((a, b) => (Math.abs(b.atMin - nowMin) < Math.abs(a.atMin - nowMin) ? b : a)).longitude;

  const variants = other.people.map((p) => {
    const t = buildTextTiming(track, mine.natalMoon!.signIndex, p.other, nowMin);
    return variantOf(t, decode(t, moonNow, mine.natalMoon!.signIndex, p.other), p.label, nowMin);
  });
  const armed = (await listAlarms(user.id, HOOK, new Date(now.getTime() - 3_600_000))).find((a) => a.ref.startsWith(`${q.profileId}:${date}`));
  return {
    date,
    person: { profileId: q.profileId, name: other.name },
    variants,
    precision: other.precision,
    alert: { pricePaise: await priceOf(user.id, 'hooks.textAlert', 1500), armed: Boolean(armed), at: armed ? armed.fireAt.toISOString() : null },
    note: NOTE,
  };
}

/** One push at the start of today's best stretch. With two Moon options it follows the first. Coins, once per person and day. */
export async function armPeakAlert(user: UserRow, q: PlaceQuery & { profileId: string }, now: Date = new Date()): Promise<{ armed: boolean; at: string | null; chargedPaise: number; reason?: string }> {
  const view = await getTextTiming(user, q, now);
  const best = view.variants[0]!.best;
  if (!best) return { armed: false, at: null, chargedPaise: 0, reason: 'no stretch left today' };
  const place = resolvePlace(user, q);
  const startMin = Number(best.start.slice(0, 2)) * 60 + Number(best.start.slice(3));
  const fireAt = zonedInstant(view.date, place.tz, startMin);
  if (fireAt.getTime() <= now.getTime()) return { armed: false, at: null, chargedPaise: 0, reason: 'that stretch has already begun' };
  const res = await spendOnce(user, {
    hook: HOOK,
    ref: refFor(HOOK, q.profileId, view.date, 'alert'),
    priceKey: 'hooks.textAlert',
    fallbackPaise: 1500,
    reason: 'hook_text_alert',
  });
  const copy = hookPushCopy(normalizePushLang(user.locale, await isFeatureOnGlobally('lang.pushAll').catch(() => false)), 'textPeak', {
    name: view.person.name, start: best.start, end: best.end,
  });
  await insertAlarm({
    userId: user.id, hook: HOOK, ref: `${q.profileId}:${view.date}`, fireAt, title: copy.title, body: copy.body, link: '/bonds',
  });
  return { armed: true, at: fireAt.toISOString(), chargedPaise: res.chargedPaise };
}
