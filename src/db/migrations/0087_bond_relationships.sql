-- Aroha Bonds v2: more kinds of saved people (romance that isn't a marriage,
-- in-laws and cousins, work and money ties, shared activities).
-- ADD VALUE IF NOT EXISTS makes this safe to re-run. Postgres 12+ allows it
-- inside the migration transaction; the new values just can't be used in that
-- same transaction, and nothing here does.

ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'fiance';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'situationship';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'crush';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'first_love';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'fwb';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'soulmate';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'ex';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'employee';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'colleague';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'investor';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'competitor';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'cousin';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'mother_in_law';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'father_in_law';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'roommate';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'travel_buddy';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'creative_partner';
ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'gym_partner';
