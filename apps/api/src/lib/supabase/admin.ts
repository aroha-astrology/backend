import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client that uses the service role key.
 * This client bypasses Row Level Security — use only in trusted server code.
 * Never import this in client components or expose it to the browser.
 */
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for admin operations',
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
