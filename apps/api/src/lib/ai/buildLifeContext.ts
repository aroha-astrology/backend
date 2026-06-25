/**
 * Single source of truth for "what does the AI know about this user".
 *
 * Reads the users row and renders a prompt-ready string. By construction it
 * cannot include company names, college names, project names, or city — those
 * are stripped by the derive layer and never stored in the columns we read.
 *
 * The returned string is meant to be pasted into the system/user prompt
 * alongside astrology context. Keep it terse — every token costs money and
 * dilutes attention from the astrology signal.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CareerMilestone, Seniority, Sector } from '@/lib/apollo/derive';

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
  // Apollo-derived (migration 039)
  apollo_sector: Sector | null;
  apollo_seniority: Seniority | null;
  apollo_years_experience: number | null;
  apollo_state: string | null;
  apollo_country: string | null;
  apollo_estimated_salary_inr: number | null;
  apollo_salary_confidence: 'known_company' | 'sector_average' | 'unknown' | null;
  apollo_career_milestones: CareerMilestone[] | null;
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
          'apollo_sector',
          'apollo_seniority',
          'apollo_years_experience',
          'apollo_state',
          'apollo_country',
          'apollo_estimated_salary_inr',
          'apollo_salary_confidence',
          'apollo_career_milestones',
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

  // Location — state preferred (Apollo-derived). Never city.
  const state = userRow?.apollo_state ?? null;
  const country = userRow?.apollo_country ?? userRow?.current_country ?? null;
  if (state || country) {
    lines.push(`- Location: ${[state, country].filter(Boolean).join(', ')}`);
  }

  if (userRow?.apollo_sector) {
    lines.push(`- Sector: ${humanSector(userRow.apollo_sector)}`);
  } else if (userRow?.profession) {
    lines.push(`- Self-described work: ${userRow.profession} (do not quote verbatim — speak in terms of the sector)`);
  }

  if (userRow?.apollo_seniority) {
    lines.push(`- Seniority: ${humanSeniority(userRow.apollo_seniority)}`);
  }

  if (typeof userRow?.apollo_years_experience === 'number') {
    lines.push(`- Years of work experience: ${userRow.apollo_years_experience}`);
  }

  const milestones = Array.isArray(userRow?.apollo_career_milestones)
    ? userRow!.apollo_career_milestones
    : null;
  if (milestones && milestones.length > 0) {
    lines.push('- Life timeline (use this to ground predictions in real lived experience):');
    for (const m of milestones) {
      if (m.type === 'education_start') {
        lines.push(`    age ${m.age} — began ${humanEducationField(m.field)} education`);
      } else {
        const sen = m.seniority && m.seniority !== 'unknown' ? `, ${humanSeniority(m.seniority)}` : '';
        lines.push(`    age ${m.age} — entered ${humanSector(m.sector)} sector${sen}`);
      }
    }
  }

  if (
    typeof userRow?.apollo_estimated_salary_inr === 'number' &&
    userRow.apollo_estimated_salary_inr > 0
  ) {
    lines.push(
      `- Estimated annual income band: ~₹${formatLakhs(userRow.apollo_estimated_salary_inr)} (${
        userRow.apollo_salary_confidence === 'known_company'
          ? 'employer-based estimate'
          : 'sector average — treat as rough'
      })`,
    );
  }

  if (userRow?.marital_status) lines.push(`- Relationship: ${userRow.marital_status}`);
  if (userRow?.financial_status) lines.push(`- Financial self-assessment: ${userRow.financial_status}`);

  lines.push('');
  lines.push('RULES — these are non-negotiable:');
  lines.push('- Never name companies, schools, projects, clients, colleagues, or cities.');
  lines.push('- Refer to employer only as their sector or "the field you work in".');
  lines.push('- Refer to education only as the field of study (e.g. "your engineering background").');
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

function humanSector(s: Sector): string {
  const map: Record<Sector, string> = {
    software: 'software / technology',
    finance: 'finance',
    consulting: 'consulting',
    healthcare: 'healthcare',
    education: 'education',
    manufacturing: 'manufacturing',
    retail: 'retail / consumer',
    media: 'media / publishing',
    government: 'government / public sector',
    legal: 'legal',
    real_estate: 'real estate / construction',
    energy: 'energy',
    hospitality: 'hospitality',
    agriculture: 'agriculture',
    nonprofit: 'nonprofit',
    other: 'their field',
  };
  return map[s] ?? 'their field';
}

function humanSeniority(s: Seniority): string {
  const map: Record<Seniority, string> = {
    intern: 'intern',
    entry: 'entry-level',
    mid: 'mid-level',
    senior: 'senior individual contributor',
    manager: 'people manager',
    director: 'director',
    vp: 'VP',
    c_suite: 'C-suite / founder',
    unknown: 'unspecified',
  };
  return map[s] ?? 'unspecified';
}

function humanEducationField(
  field: 'engineering' | 'medicine' | 'commerce' | 'law' | 'liberal_arts' | 'science' | 'design' | 'other',
): string {
  const map: Record<string, string> = {
    engineering: 'engineering',
    medicine: 'medical',
    commerce: 'commerce / business',
    law: 'legal',
    liberal_arts: 'liberal arts',
    science: 'science',
    design: 'design / architecture',
    other: 'their',
  };
  return map[field] ?? 'their';
}

function formatLakhs(inr: number): string {
  if (inr >= 10_000_000) return `${(inr / 10_000_000).toFixed(1)} crore/yr`;
  if (inr >= 100_000) return `${(inr / 100_000).toFixed(1)}L/yr`;
  return `${Math.round(inr / 1000)}k/yr`;
}
