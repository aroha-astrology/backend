import { invalidateExperienceCache } from '../features/features.service.js';
import { Errors } from '../../lib/errors.js';
import { applyExperience, readExperience, resetExperienceCooldown } from './experience.repo.js';
import type { ExperienceStatus, Skin } from './experience-rules.js';

/** A status in the shape the API returns: dates as ISO strings. */
export interface ExperienceDto {
  skin: Skin | null;
  picked: boolean;
  freeChangeLeft: boolean;
  canChange: boolean;
  nextAllowedAt: string | null;
}

function toDto(s: ExperienceStatus): ExperienceDto {
  return {
    skin: s.skin,
    picked: s.picked,
    freeChangeLeft: s.freeChangeLeft,
    canChange: s.canChange,
    nextAllowedAt: s.nextAllowedAt ? s.nextAllowedAt.toISOString() : null,
  };
}

export async function getExperience(userId: string, now: Date = new Date(), unlimited = false): Promise<ExperienceDto> {
  const status = await readExperience(userId, now, unlimited);
  if (!status) throw Errors.notFound('No such user');
  return toDto(status);
}

/** `blocked` is set (and nothing changed) when the user asked too soon after their last change. */
export async function setExperience(
  userId: string,
  to: Skin,
  now: Date = new Date(),
  unlimited = false,
): Promise<{ status: ExperienceDto; blocked: Date | null }> {
  const outcome = await applyExperience(userId, to, now, unlimited);
  if (!outcome) throw Errors.notFound('No such user');
  // A changed look changes which audience-limited features the user sees, so forget the cached look.
  invalidateExperienceCache(userId);
  const blocked = outcome.decision.kind === 'blocked' ? outcome.decision.nextAllowedAt : null;
  return { status: toDto(outcome.status), blocked };
}

export async function resetExperience(userId: string, now: Date = new Date()): Promise<ExperienceDto | null> {
  const status = await resetExperienceCooldown(userId, now);
  return status ? toDto(status) : null;
}
