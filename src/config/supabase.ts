import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

let client: SupabaseClient | undefined;

/**
 * Service-role Supabase client for Storage and any other Supabase-managed
 * resources. The database itself is reached via Drizzle / `DATABASE_URL`.
 *
 * Returns `undefined` if SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not
 * configured — Storage features are opt-in and not required for v1.
 */
export function getSupabase(): SupabaseClient | undefined {
  if (client) return client;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return undefined;
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
