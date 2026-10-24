import { desc, eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { uiSkinChanges, users } from '../../db/schema.js';
import {
  decideExperienceChange,
  experienceStatus,
  type ExperienceDecision,
  type ExperienceRecord,
  type ExperienceStatus,
  type Skin,
} from './experience-rules.js';

function recordOf(row: {
  uiSkin: Skin | null;
  uiSkinChangedAt: Date | null;
  uiSkinFreeChangeUsed: boolean;
}): ExperienceRecord {
  return { skin: row.uiSkin, changedAt: row.uiSkinChangedAt, freeChangeUsed: row.uiSkinFreeChangeUsed };
}

const columns = {
  uiSkin: users.uiSkin,
  uiSkinChangedAt: users.uiSkinChangedAt,
  uiSkinFreeChangeUsed: users.uiSkinFreeChangeUsed,
};

export async function readExperience(userId: string, now: Date, unlimited = false): Promise<ExperienceStatus | null> {
  const [row] = await db.select(columns).from(users).where(eq(users.id, userId)).limit(1);
  return row ? experienceStatus(recordOf(row), now, unlimited) : null;
}

export interface ExperienceOutcome {
  decision: ExperienceDecision;
  status: ExperienceStatus;
}

/**
 * Pick or change a user's look. The row is locked for the whole decision, so two devices asking
 * at once get exactly one change: the second sees the first's result and is judged on it.
 * Returns null when the user does not exist.
 */
export async function applyExperience(
  userId: string,
  to: Skin,
  now: Date,
  unlimited = false,
): Promise<ExperienceOutcome | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select(columns).from(users).where(eq(users.id, userId)).limit(1).for('update');
    if (!row) return null;
    const before = recordOf(row);
    const decision = decideExperienceChange(before, to, now, unlimited);

    if (decision.kind === 'first_pick') {
      await tx.update(users).set({ uiSkin: to }).where(eq(users.id, userId));
      await tx.insert(uiSkinChanges).values({ userId, fromSkin: null, toSkin: to, kind: 'first_pick' });
      return { decision, status: experienceStatus({ ...before, skin: to }, now) };
    }
    if (decision.kind === 'test_change') {
      await tx.update(users).set({ uiSkin: to }).where(eq(users.id, userId));
      await tx.insert(uiSkinChanges).values({ userId, fromSkin: before.skin, toSkin: to, kind: 'test_change' });
      return { decision, status: experienceStatus({ ...before, skin: to }, now, true) };
    }
    if (decision.kind === 'free_change' || decision.kind === 'change') {
      await tx
        .update(users)
        .set({ uiSkin: to, uiSkinChangedAt: now, uiSkinFreeChangeUsed: true })
        .where(eq(users.id, userId));
      await tx.insert(uiSkinChanges).values({ userId, fromSkin: before.skin, toSkin: to, kind: decision.kind });
      return { decision, status: experienceStatus({ skin: to, changedAt: now, freeChangeUsed: true }, now) };
    }
    return { decision, status: experienceStatus(before, now, unlimited) };
  });
}

/** Give a user back their free change and clear the wait (admin, for support cases). Logged. */
export async function resetExperienceCooldown(userId: string, now: Date): Promise<ExperienceStatus | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select(columns).from(users).where(eq(users.id, userId)).limit(1).for('update');
    if (!row) return null;
    await tx.update(users).set({ uiSkinChangedAt: null, uiSkinFreeChangeUsed: false }).where(eq(users.id, userId));
    if (row.uiSkin) {
      await tx.insert(uiSkinChanges).values({ userId, fromSkin: row.uiSkin, toSkin: row.uiSkin, kind: 'reset' });
    }
    return experienceStatus({ skin: row.uiSkin, changedAt: null, freeChangeUsed: false }, now);
  });
}

export async function listExperienceChanges(userId: string, limit = 20) {
  return db
    .select()
    .from(uiSkinChanges)
    .where(eq(uiSkinChanges.userId, userId))
    .orderBy(desc(uiSkinChanges.createdAt))
    .limit(limit);
}
