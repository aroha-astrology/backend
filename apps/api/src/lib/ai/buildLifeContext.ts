/**
 * Single source of truth for "what does the AI know about this user".
 *
 * Reads the users row and renders a prompt-ready string. By construction it
 * cannot include company names, college names, project names, or city.
 *
 * The returned string is meant to be pasted into the system/user prompt
 * alongside astrology context. Keep it terse — every token costs money and
 * dilutes attention from the astrology signal.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type UserContextRow = {
  id: string;
  name: string | null;
  language: string | null;
  // Self-reported (migrations 028, 030)
  profession: string | null;
  marital_status: string | null;
  financial_status: string | null;
  current_city: string | null;
  current_country: string | null;
};

type BirthRow = {
  dob: string | null;
  gender: string | null;
};

export type LifeContext = {
  ageYears: number | null;
  toneHint: 'teen' | 'young_adult' | 'adult' | 'mid_life' | 'senior' | 'unknown';
  promptBlock: string;
};

export async function buildLifeContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<LifeContext> {
  const [{ data: userRow }, { data: birthRow }] = await Promise.all([
    supabase
      .from('users')
      .select(
        [
          'id',
          'name',
          'language',
          'profession',
          'marital_status',
          'financial_status',
          'current_city',
          'current_country',
        ].join(','),
      )
      .eq('id', userId)
      .maybeSingle<UserContextRow>(),
    supabase
      .from('birth_profiles')
      .select('dob, gender')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .maybeSingle<BirthRow>(),
  ]);

  const ageYears = computeAge(birthRow?.dob);
  const toneHint = pickTone(ageYears);

  const lines: string[] = [];
  lines.push('USER CONTEXT');
  if (ageYears != null) lines.push(`- Age: ${ageYears}`);
  if (birthRow?.gender) lines.push(`- Gender: ${birthRow.gender}`);

  if (userRow?.current_country) {
    lines.push(`- Location: ${userRow.current_country}`);
  }

  if (userRow?.profession) {
    lines.push(
      `- Self-described work: ${userRow.profession} (do not quote verbatim — speak in terms of the sector)`,
    );
  }

  if (userRow?.marital_status) lines.push(`- Relationship: ${userRow.marital_status}`);
  if (userRow?.financial_status)
    lines.push(`- Financial self-assessment: ${userRow.financial_status}`);

  lines.push('');
  lines.push('RULES — these are non-negotiable:');
  lines.push('- Never name companies, schools, projects, clients, colleagues, or cities.');
  lines.push(
    '- Refer to education only as the field of study (e.g. "your engineering background").',
  );
  lines.push('- Treat income as a soft signal; never quote a salary number back.');
  lines.push(`- Tone: ${toneInstruction(toneHint)}`);

  return {
    ageYears,
    toneHint,
    promptBlock: lines.join('\n'),
  };
}

function computeAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

function pickTone(age: number | null): LifeContext['toneHint'] {
  if (age == null) return 'unknown';
  if (age < 20) return 'teen';
  if (age < 28) return 'young_adult';
  if (age < 40) return 'adult';
  if (age < 55) return 'mid_life';
  return 'senior';
}

function toneInstruction(tone: LifeContext['toneHint']): string {
  switch (tone) {
    case 'teen':
      return 'warm and encouraging; education and self-discovery framing; avoid heavy career/finance jargon.';
    case 'young_adult':
      return 'aspirational and direct; speak to early-career growth, relationships, and identity-building.';
    case 'adult':
      return 'grounded and practical; balance career momentum, family, and money decisions.';
    case 'mid_life':
      return 'reflective and strategic; legacy, leadership, family responsibilities, and health.';
    case 'senior':
      return 'reverent and gentle; wisdom, health, family, and inner peace.';
    default:
      return 'neutral and warm; avoid age-specific assumptions.';
  }
}
