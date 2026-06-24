import type { SupabaseClient } from '@supabase/supabase-js';

export type AppRole = 'personal' | 'astrologer' | 'pandit' | 'admin';

/**
 * Atomically appends a role to users.roles[] if not already present.
 * Uses a fetch-and-merge round-trip — fine for the low-frequency role-grant
 * paths (signup / admin grant). For high-frequency callers prefer the
 * `array_append` SQL form directly.
 *
 * Requires a Supabase client that can mutate users — typically the admin
 * (service-role) client since users RLS is restrictive.
 */
export async function ensureRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  userId: string,
  role: AppRole,
): Promise<{ added: boolean; roles: AppRole[] }> {
  const { data: row, error: readErr } = await admin
    .from('users')
    .select('roles')
    .eq('id', userId)
    .maybeSingle();
  if (readErr) throw new Error(`ensureRole read failed: ${readErr.message}`);

  const current: AppRole[] = (row?.roles ?? ['personal']) as AppRole[];
  if (current.includes(role)) {
    return { added: false, roles: current };
  }

  const next: AppRole[] = [...current.filter((r) => r !== 'personal' || role === 'personal'), role];
  // If the only role was 'personal' and we're adding a real role, drop 'personal'
  // so the new role becomes the primary (trigger keeps account_type = roles[1]).
  const cleaned: AppRole[] = next.length > 1 && next.includes('personal') && role !== 'personal'
    ? (next.filter((r) => r !== 'personal') as AppRole[])
    : next;

  const { error: updErr } = await admin
    .from('users')
    .update({ roles: cleaned })
    .eq('id', userId);
  if (updErr) throw new Error(`ensureRole write failed: ${updErr.message}`);

  return { added: true, roles: cleaned };
}
