-- Fix: public.users had no FK to auth.users, so deleting an auth user
-- left the public.users row (and all child rows) orphaned.
-- This constraint ensures auth.users deletion cascades through the entire tree:
--   auth.users → public.users → birth_profiles, kundli_charts, reports, etc.

-- Clean up any orphaned rows that exist before adding the constraint
DELETE FROM public.users
WHERE id NOT IN (SELECT id FROM auth.users);

ALTER TABLE public.users
  ADD CONSTRAINT users_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
