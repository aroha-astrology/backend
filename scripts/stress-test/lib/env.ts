import { BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, INTERNAL_PROCESS_KEY } from '../config';

const REQUIRED_VARS = [
  ['NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
  ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
  ['INTERNAL_PROCESS_KEY', INTERNAL_PROCESS_KEY],
  ['NEXT_PUBLIC_APP_URL', BASE_URL],
] as const;

export function assertEnv(): void {
  const missing = REQUIRED_VARS.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    console.error('\n[preflight] Missing required env vars:', missing.join(', '));
    console.error('  -> Check apps/web/.env.local\n');
    process.exit(1);
  }
}
