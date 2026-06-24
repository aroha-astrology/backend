import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Build the present-day life-context block injected into the palm soul-stage
 * prompt. Mirrors the pattern in lib/insights/runLite.ts so palm readings
 * speak to the user's actual life (age tone, sector abstraction, relationship
 * state) instead of generic, made-up specifics.
 *
 * Returns an empty string if no useful context is available — callers can
 * always append the return value without conditional logic.
 */
export async function buildLifeContextForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  // Fetch user row + most-recent birth profile in parallel.
  const [userResult, profileResult] = await Promise.all([
    supabase
      .from('users')
      .select('profession, marital_status, financial_status, current_city')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('birth_profiles')
      .select('dob')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const userRow = (userResult.data ?? null) as {
    profession?: string | null;
    marital_status?: string | null;
    financial_status?: string | null;
    current_city?: string | null;
  } | null;
  const dobStr = (profileResult.data as { dob?: string | null } | null)?.dob ?? null;

  const lines: string[] = [];

  if (dobStr) {
    const birth = new Date(dobStr);
    if (!isNaN(birth.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const hadBday =
        now.getMonth() > birth.getMonth() ||
        (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
      if (!hadBday) age -= 1;
      if (age >= 0 && age < 120) lines.push(`Age: ${age}`);
    }
  }
  if (userRow?.current_city)  lines.push(`Lives in: ${userRow.current_city}`);
  if (userRow?.profession)    lines.push(`Works as: ${userRow.profession}`);
  if (userRow?.marital_status) {
    const label: Record<string, string> = {
      single: 'Single', dating: 'Dating', engaged: 'Engaged',
      married: 'Married', separated_divorced: 'Separated/Divorced', widowed: 'Widowed',
    };
    lines.push(`Relationship: ${label[userRow.marital_status] ?? userRow.marital_status}`);
  }
  if (userRow?.financial_status && userRow.financial_status !== 'prefer_not_to_say') {
    const label: Record<string, string> = {
      tight: 'Money is tight', stable: 'Financially stable', comfortable: 'Financially comfortable',
    };
    lines.push(`Financial: ${label[userRow.financial_status] ?? userRow.financial_status}`);
  }

  if (lines.length === 0) return '';

  return (
    `\n\nSEEKER'S PRESENT LIFE — anchor your reading to this person's actual situation, but follow these HARD rules:\n` +
    `- NEVER quote profession, employer, city, or relationship status verbatim. Abstract to the SECTOR or KIND of work and speak as though the hand revealed it.\n` +
    `- NEVER invent project names, company names, colleague names, or specific past incidents.\n` +
    `- Tune voice to the age: Gen Z (≤27) casual peer, Millennial (28-43) supportive coach, Gen X+ (44+) respectful and legacy-aware.\n` +
    lines.join('\n')
  );
}
