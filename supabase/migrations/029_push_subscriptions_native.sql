-- ============================================================================
-- 029: Push subscriptions — native platform discriminator
-- Extends push_subscriptions to hold FCM tokens alongside web-push keys.
-- Web rows: endpoint/p256dh/auth populated, platform='web' (default).
-- Android rows: fcm_token populated, platform='android-fcm'.
-- ============================================================================

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS platform  text NOT NULL DEFAULT 'web'
    CHECK (platform IN ('web', 'android-fcm', 'ios-apns')),
  ADD COLUMN IF NOT EXISTS fcm_token text;

-- Relax the NOT NULL constraints so native rows don't need web-push fields.
ALTER TABLE push_subscriptions ALTER COLUMN endpoint DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN p256dh   DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN auth     DROP NOT NULL;

-- Unique index so we can upsert on (user_id, fcm_token) without duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_fcm_token
  ON push_subscriptions (user_id, fcm_token)
  WHERE fcm_token IS NOT NULL;
