// =============================================================================
// Cosmic Circles (v7 spec, Sprint 3, switches `circles.*`, ship off)
// =============================================================================
// A circle is the people an owner keeps close: saved birth profiles, plus other Aroha accounts that
// accepted an invite link. Each member carries a daily pulse scored with the Bonds compatibility
// (nothing new on the chart side) and the Moon of the day for both charts.
//
//   - Adding a person is free here; a new birth profile still goes through the normal profile
//     flow (first 3 free, then 99), so a circle never opens a back door around that price.
//   - An accepted invite links the two accounts and uses no profile slot on either side.
//   - The first person added (or invite accepted) pays signup stage 3, once (signup-drip.ts).
//   - The same person cannot be added twice: a blind index of the birth details catches it.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { hashForLookup } from '../../lib/crypto/field-encryption.js';
import { dateInZone, userZone } from '../../lib/user-time-zone.js';
import { dailyLunarAssessment } from '../../lib/astro-tools/tara-bala.js';
import { bondCompatibility, bondSpec, loadBondChart } from '../bonds/bonds.service.js';
import type { Relationship } from '../bonds/bond-types.js';
import { findOwnedBirthProfile } from '../birth-profiles/birth-profiles.repo.js';
import { resolveProfileContext } from '../birth-profiles/profile-context.js';
import { grantSignupStage } from '../rewards/signup-drip.js';
import { findActiveUserById } from '../users/users.repo.js';
import {
  firstNameOf,
  generateInviteCode,
  identityText,
  INVITE_TTL_DAYS,
  MAX_CIRCLE,
  MAX_OPEN_INVITES,
  pulseScore,
  pulseTone,
  type PulseTone,
} from './circles-rules.js';
import {
  claimInvite,
  countMembers,
  countOpenInvites,
  deleteMember,
  findInvite,
  insertInvite,
  insertMember,
  listMembers,
  pulsesFor,
  savePulse,
  type CircleMemberRow,
} from './circles.repo.js';

export interface CircleMemberView {
  id: string;
  kind: 'profile' | 'linked';
  profileId: string | null;
  name: string;
  relationship: Relationship | null;
  /** Null while the person's chart cannot be read yet (no exact birth details). */
  pulse: { score: number; tone: PulseTone } | null;
}

export interface CircleView {
  localDate: string;
  max: number;
  members: CircleMemberView[];
  openInvites: number;
}

type ChartLoad = NonNullable<Awaited<ReturnType<typeof loadBondChart>>>;

/** Blind index of a person's birth identity, or null without a birth date. */
export function identityHashOf(input: Parameters<typeof identityText>[0]): string | null {
  const text = identityText(input);
  return text ? hashForLookup(text) : null;
}

function userIdentityHash(user: UserRow): string | null {
  return identityHashOf({
    dateOfBirth: user.dateOfBirth,
    timeOfBirth: user.timeOfBirth,
    lat: user.placeOfBirth?.lat,
    lon: user.placeOfBirth?.lon,
  });
}

/** A member's pulse for today, computed from both charts and stored. Null when a chart is unreadable. */
async function computePulse(
  owner: UserRow,
  ownerChart: ChartLoad,
  member: CircleMemberRow,
  localDate: string,
  now: Date,
): Promise<{ score: number; tone: PulseTone } | null> {
  const ownerProfile = await resolveProfileContext(owner, null);
  let theirChart: ChartLoad | null = null;
  let relationship: Relationship | null = null;
  let theirGender: UserRow['gender'] = null;

  if (member.profileId) {
    const row = await findOwnedBirthProfile(member.profileId, owner.id);
    if (!row) return null;
    relationship = row.relationship;
    theirGender = row.gender;
    theirChart = await loadBondChart(owner, await resolveProfileContext(owner, row.id), now);
  } else if (member.linkedUserId) {
    const linked = await findActiveUserById(member.linkedUserId);
    if (!linked) return null;
    theirGender = linked.gender;
    theirChart = await loadBondChart(linked, await resolveProfileContext(linked, null), now);
  }
  if (!theirChart) return null;

  const compat = bondCompatibility(
    ownerChart.ctx,
    theirChart.ctx,
    bondSpec(relationship, theirGender, ownerProfile.gender),
    ownerProfile.gender,
    theirGender,
  );

  const todayMoon = (c: ChartLoad) => c.ctx.transits.find((t) => t.planet === 'Moon');
  const dayFor = (c: ChartLoad) => {
    const moon = todayMoon(c);
    if (!moon) return 'average' as const;
    return dailyLunarAssessment(
      c.ctx.moonNakshatraIndex,
      c.ctx.moonSignIndex,
      moon.nakshatraIndex,
      moon.signIndex,
    ).overallQuality;
  };

  const score = pulseScore(compat.pct, dayFor(ownerChart), dayFor(theirChart));
  const tone = pulseTone(score);
  await savePulse({ memberId: member.id, localDate, score, tone });
  return { score, tone };
}

async function nameOf(owner: UserRow, member: CircleMemberRow): Promise<{ name: string; relationship: Relationship | null }> {
  if (member.profileId) {
    const row = await findOwnedBirthProfile(member.profileId, owner.id);
    return { name: row?.displayName?.trim() || 'Someone dear', relationship: row?.relationship ?? null };
  }
  const linked = member.linkedUserId ? await findActiveUserById(member.linkedUserId) : undefined;
  return { name: firstNameOf(linked?.displayName) || 'Friend', relationship: null };
}

/**
 * Makes sure every member has a pulse for the owner's local day (computing the missing ones) and
 * returns them keyed by member id. Used by the circle screen and by the daily pulse run.
 */
export async function ensurePulses(
  owner: UserRow,
  members: CircleMemberRow[],
  localDate: string,
  now: Date,
): Promise<Map<string, { score: number; tone: PulseTone } | null>> {
  const out = new Map<string, { score: number; tone: PulseTone } | null>();
  const have = await pulsesFor(
    members.map((m) => m.id),
    localDate,
  );
  for (const p of have) out.set(p.memberId, { score: p.score, tone: p.tone });
  const missing = members.filter((m) => !out.has(m.id));
  if (missing.length === 0) return out;

  let ownerChart: ChartLoad | null = null;
  try {
    ownerChart = await loadBondChart(owner, await resolveProfileContext(owner, null), now);
  } catch (err) {
    logger.warn({ err, userId: owner.id }, 'circles: owner chart could not be read');
  }
  for (const m of missing) {
    if (!ownerChart) {
      out.set(m.id, null);
      continue;
    }
    try {
      out.set(m.id, await computePulse(owner, ownerChart, m, localDate, now));
    } catch (err) {
      logger.warn({ err, memberId: m.id }, 'circles: pulse failed (skipped)');
      out.set(m.id, null);
    }
  }
  return out;
}

export async function getCircle(owner: UserRow, now: Date = new Date()): Promise<CircleView> {
  const localDate = dateInZone(now, userZone(owner.currentTimezone));
  const members = await listMembers(owner.id);
  const pulses = await ensurePulses(owner, members, localDate, now);
  const views = await Promise.all(
    members.map(async (m): Promise<CircleMemberView> => {
      const { name, relationship } = await nameOf(owner, m);
      return {
        id: m.id,
        kind: m.profileId ? 'profile' : 'linked',
        profileId: m.profileId,
        name,
        relationship,
        pulse: pulses.get(m.id) ?? null,
      };
    }),
  );
  return { localDate, max: MAX_CIRCLE, members: views, openInvites: await countOpenInvites(owner.id) };
}

/** Puts one of the owner's saved profiles in the circle. */
export async function addProfileMember(owner: UserRow, profileId: string): Promise<CircleMemberView> {
  const row = await findOwnedBirthProfile(profileId, owner.id);
  if (!row) throw Errors.notFound('Not one of your saved profiles');
  if ((await countMembers(owner.id)) >= MAX_CIRCLE) throw Errors.conflict('CIRCLE_FULL');

  const hash = identityHashOf({
    dateOfBirth: row.dateOfBirth,
    timeOfBirth: row.timeOfBirth,
    lat: row.placeOfBirth?.lat,
    lon: row.placeOfBirth?.lon,
  });
  // Without a birth date there is nothing to tell people apart by; the profile id stands in.
  const identityHash = hash ?? `profile:${row.id}`;
  if (hash && hash === userIdentityHash(owner)) throw Errors.conflict('THATS_YOU');

  const created = await insertMember({ ownerUserId: owner.id, profileId: row.id, identityHash });
  if (!created) throw Errors.conflict('ALREADY_IN_CIRCLE');

  // Stage 3 of the 3-stage signup bonus: the first person in the circle. Idempotent per user.
  void grantSignupStage(owner.id, 3);
  const view = await getCircle(owner);
  return view.members.find((m) => m.id === created.id)!;
}

export async function removeMember(owner: UserRow, memberId: string): Promise<void> {
  if (!(await deleteMember(owner.id, memberId))) throw Errors.notFound('Not in your circle');
}

/* -------------------------------------------------------------------------- */
/* Invites                                                                     */
/* -------------------------------------------------------------------------- */

export async function createInvite(owner: UserRow, now: Date = new Date()): Promise<{ code: string; path: string; expiresAt: string }> {
  if ((await countOpenInvites(owner.id)) >= MAX_OPEN_INVITES) throw Errors.conflict('TOO_MANY_OPEN_INVITES');
  const code = generateInviteCode();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000);
  await insertInvite({ code, inviterUserId: owner.id, expiresAt });
  return { code, path: `/circle/invite/${code}`, expiresAt: expiresAt.toISOString() };
}

export interface InvitePreview {
  /** First name only: all that is shown before the person accepts. */
  inviterName: string;
  state: 'open' | 'used' | 'expired';
}

export async function previewInvite(code: string, now: Date = new Date()): Promise<InvitePreview> {
  const invite = await findInvite(code);
  if (!invite) throw Errors.notFound('This invite link is not valid');
  const inviter = await findActiveUserById(invite.inviterUserId);
  if (!inviter) throw Errors.notFound('This invite link is not valid');
  const state = invite.acceptedAt ? 'used' : invite.expiresAt.getTime() <= now.getTime() ? 'expired' : 'open';
  return { inviterName: firstNameOf(inviter.displayName) || 'A friend', state };
}

/**
 * Links the two accounts: each lands in the other's circle, no profile slot used. The code is
 * claimed first (one use), so two taps or two devices cannot link twice.
 */
export async function acceptInvite(user: UserRow, code: string, now: Date = new Date()): Promise<{ inviterName: string }> {
  const invite = await findInvite(code);
  if (!invite) throw Errors.notFound('This invite link is not valid');
  if (invite.inviterUserId === user.id) throw Errors.conflict('THATS_YOU');
  if (invite.acceptedAt) throw Errors.conflict('INVITE_USED');
  if (invite.expiresAt.getTime() <= now.getTime()) throw Errors.conflict('INVITE_EXPIRED');

  const inviter = await findActiveUserById(invite.inviterUserId);
  if (!inviter) throw Errors.notFound('This invite link is not valid');

  const [mine, theirs] = await Promise.all([countMembers(user.id), countMembers(inviter.id)]);
  if (mine >= MAX_CIRCLE || theirs >= MAX_CIRCLE) throw Errors.conflict('CIRCLE_FULL');

  if (!(await claimInvite(code, user.id))) throw Errors.conflict('INVITE_USED');

  // The identity of a linked account is its own birth details when it has them, else its id.
  const hashOf = (u: UserRow) => userIdentityHash(u) ?? `user:${u.id}`;
  await insertMember({ ownerUserId: inviter.id, linkedUserId: user.id, identityHash: hashOf(user) });
  await insertMember({ ownerUserId: user.id, linkedUserId: inviter.id, identityHash: hashOf(inviter) });

  // Stage 3 of the signup bonus for the inviter (the first accepted invite) and for the new member
  // (their first person in the circle). Idempotent per user.
  void grantSignupStage(inviter.id, 3);
  void grantSignupStage(user.id, 3);
  return { inviterName: firstNameOf(inviter.displayName) || 'A friend' };
}
