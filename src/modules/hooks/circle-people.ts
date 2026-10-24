// =============================================================================
// The people in a reader's Cosmic Circle, with their charts (shared by the hooks)
// =============================================================================
// Ghar Ka Kavach picks one of them each morning and Mystery Synastry scores them against the reader.
// This only loads; the circle module owns who is in a circle and how a pulse is scored.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { bondCategory, type BondCategory, type Relationship } from '../bonds/bond-types.js';
import { loadBondChart } from '../bonds/bonds.service.js';
import { findOwnedBirthProfile } from '../birth-profiles/birth-profiles.repo.js';
import { resolveProfileContext } from '../birth-profiles/profile-context.js';
import { firstNameOf } from '../circles/circles-rules.js';
import { listMembers, pulsesFor } from '../circles/circles.repo.js';
import { findActiveUserById } from '../users/users.repo.js';

export type LoadedChart = NonNullable<Awaited<ReturnType<typeof loadBondChart>>>;

export interface CirclePerson {
  memberId: string;
  name: string;
  relationship: Relationship | null;
  category: BondCategory;
  gender: UserRow['gender'];
  /** The circle's pulse score for the day, when one was already worked out. */
  pulse: number | null;
  /** Null while their chart cannot be read (no exact birth details). */
  chart: LoadedChart | null;
}

/** Everyone in the owner's circle, in the order they were added, each with a chart when it can be read. */
export async function loadCirclePeople(owner: UserRow, localDate: string, now: Date): Promise<CirclePerson[]> {
  const members = await listMembers(owner.id);
  if (members.length === 0) return [];
  const pulses = new Map((await pulsesFor(members.map((m) => m.id), localDate)).map((p) => [p.memberId, p.score]));
  const out: CirclePerson[] = [];
  for (const m of members) {
    try {
      if (m.profileId) {
        const row = await findOwnedBirthProfile(m.profileId, owner.id);
        if (!row) continue;
        const chart = await loadBondChart(owner, await resolveProfileContext(owner, row.id), now).catch(() => null);
        out.push({
          memberId: m.id,
          name: row.displayName?.trim() || 'Someone dear',
          relationship: row.relationship,
          category: bondCategory(row.relationship),
          gender: row.gender,
          pulse: pulses.get(m.id) ?? null,
          chart,
        });
      } else if (m.linkedUserId) {
        const linked = await findActiveUserById(m.linkedUserId);
        if (!linked) continue;
        const chart = await loadBondChart(linked, await resolveProfileContext(linked, null), now).catch(() => null);
        out.push({
          memberId: m.id,
          name: firstNameOf(linked.displayName) || 'Friend',
          relationship: null,
          category: 'social',
          gender: linked.gender,
          pulse: pulses.get(m.id) ?? null,
          chart,
        });
      }
    } catch (err) {
      logger.warn({ err, memberId: m.id }, 'hooks: circle member skipped');
    }
  }
  return out;
}
