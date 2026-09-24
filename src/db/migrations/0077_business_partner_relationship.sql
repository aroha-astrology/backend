-- Aroha Bonds (roadmap step 7): a saved profile can be a business partner.
-- ADD VALUE IF NOT EXISTS makes this safe to re-run. Postgres 12+ allows it
-- inside the migration transaction; the new value just can't be used in that
-- same transaction, and nothing here does.

ALTER TYPE "birth_profile_relationship" ADD VALUE IF NOT EXISTS 'business_partner';
