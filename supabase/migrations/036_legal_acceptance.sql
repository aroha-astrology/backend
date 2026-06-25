-- Track which version of the bundled legal documents (T&C + Privacy +
-- astrology disclaimer) the user has accepted. Both columns are nullable so
-- existing rows pass migration; the application treats NULL as "not accepted"
-- and prompts the user with a blocking modal on next sign-in.
--
-- Bump LEGAL_VERSION in apps/web/src/lib/legal/index.ts whenever any of the
-- three documents change — that triggers re-acceptance for everyone.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS legal_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_version     int;

COMMENT ON COLUMN users.legal_accepted_at IS 'When the user last accepted the bundled Terms, Privacy Policy, and astrology disclaimer. NULL means not yet accepted.';
COMMENT ON COLUMN users.legal_version     IS 'Bundled legal-document version the user accepted. Compared against LEGAL_VERSION in apps/web/src/lib/legal/index.ts; stale value re-prompts.';
