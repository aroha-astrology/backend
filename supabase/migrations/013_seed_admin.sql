-- Create dedicated admin account and grant admin access.
-- The auth user must be created first via Supabase dashboard or CLI
-- (Authentication → Users → Invite user: admin@jyotishai.com).
-- This migration then ensures the users row has is_admin = TRUE.
INSERT INTO users (id, email, name, credits, is_admin)
SELECT id, email, 'Admin', 0, TRUE
FROM auth.users
WHERE email = 'admin@jyotishai.com'
ON CONFLICT (id) DO UPDATE SET is_admin = TRUE, email = EXCLUDED.email;

-- Remove admin flag from personal account
UPDATE users SET is_admin = FALSE WHERE email = 's9575220017@gmail.com';
