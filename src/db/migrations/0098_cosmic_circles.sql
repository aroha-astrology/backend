-- Cosmic Circles (v7 spec, Sprint 3). Ships OFF behind the `circles.circles` switch.
--
-- cosmic_circle_members: who is in an owner's circle. A member is either one of the owner's saved
--   birth_profiles (profile_id) or another Aroha account that accepted an invite (linked_user_id);
--   exactly one of the two. identity_hash is a blind index of the person's birth details, so the same
--   person cannot be added twice (as a profile and as a linked account, or as two profiles).
-- cosmic_circle_pulses: the daily pulse of one member, one row per member per local day.
-- cosmic_circle_invites: /circle/invite/:code. One use per code.
--
-- Hand-written (post-0050 convention): IF NOT EXISTS makes this safe to re-run.

CREATE TABLE IF NOT EXISTS "cosmic_circle_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "profile_id" uuid REFERENCES "birth_profiles"("id") ON DELETE CASCADE,
  "linked_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "identity_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cosmic_circle_members_one_target"
    CHECK (("profile_id" IS NOT NULL) <> ("linked_user_id" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cosmic_circle_members_owner_identity_uq"
  ON "cosmic_circle_members" ("owner_user_id", "identity_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "cosmic_circle_members_owner_profile_uq"
  ON "cosmic_circle_members" ("owner_user_id", "profile_id") WHERE "profile_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "cosmic_circle_members_owner_idx"
  ON "cosmic_circle_members" ("owner_user_id");

CREATE TABLE IF NOT EXISTS "cosmic_circle_pulses" (
  "member_id" uuid NOT NULL REFERENCES "cosmic_circle_members"("id") ON DELETE CASCADE,
  "local_date" text NOT NULL,
  "score" smallint NOT NULL CHECK ("score" BETWEEN 0 AND 100),
  "tone" text NOT NULL CHECK ("tone" IN ('glow', 'steady', 'quiet', 'care')),
  "notified" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("member_id", "local_date")
);

CREATE TABLE IF NOT EXISTS "cosmic_circle_invites" (
  "code" text PRIMARY KEY,
  "inviter_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "accepted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "accepted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "cosmic_circle_invites_inviter_idx"
  ON "cosmic_circle_invites" ("inviter_user_id");
