/**
 * Apollo.io people-match client.
 *
 * Calls POST /api/v1/people/match with cheap flags (no waterfall, no reveal)
 * so we don't burn credits — we only get the match record Apollo already has.
 *
 * Auth: x-api-key header. Read APOLLO_API_KEY from env; never hardcode.
 *
 * Failure behavior: returns null on any error (missing key, network, non-2xx,
 * timeout, parse error). This is best-effort enrichment — it must never block
 * login or break the auth flow.
 */

import { createAdminSupabase } from '@/lib/supabase/admin';
import { deriveFromApollo } from '@/lib/apollo/derive';
import { estimateSalaryInr } from '@/lib/apollo/salary';

const REVEAL_DELAY_HOURS = 2;

const APOLLO_ENDPOINT =
  'https://api.apollo.io/api/v1/people/match' +
  '?run_waterfall_email=false' +
  '&run_waterfall_phone=false' +
  '&reveal_personal_emails=false' +
  '&reveal_phone_number=false';

const REQUEST_TIMEOUT_MS = 8_000;

type MatchInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
};

export async function matchPersonByEmail(input: MatchInput): Promise<unknown | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;
  if (!input.email) return null;

  const body: Record<string, string> = { email: input.email };
  if (input.firstName) body.first_name = input.firstName;
  if (input.lastName) body.last_name = input.lastName;
  if (input.name && !input.firstName && !input.lastName) body.name = input.name;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(APOLLO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        accept: 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn('[apollo] match failed', res.status, await safeText(res));
      return null;
    }

    const json = (await res.json()) as { person?: unknown } | null;
    return json?.person ?? json ?? null;
  } catch (err) {
    console.warn('[apollo] match error', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}

/**
 * Idempotent: if the user already has apollo_enriched_at set, this is a no-op.
 * Safe to invoke on every login — extra calls just early-return.
 *
 * Uses the admin client because auth-callback's session-bound client gets
 * destroyed once the redirect response is sent, and this runs in `after()`.
 */
export async function enrichUserFromApolloIfNeeded(args: {
  userId: string;
  email: string;
  name?: string | null;
}): Promise<void> {
  if (!process.env.APOLLO_API_KEY) return;

  const admin = createAdminSupabase();

  const { data: existing } = await admin
    .from('users')
    .select('apollo_enriched_at')
    .eq('id', args.userId)
    .single();

  if (existing?.apollo_enriched_at) return;

  const { firstName, lastName } = splitName(args.name);
  const person = await matchPersonByEmail({
    email: args.email,
    firstName,
    lastName,
    name: args.name ?? null,
  });

  // Pull birth year from the user's primary birth profile so we can compute
  // age-at-milestone for the career timeline.
  const birthYear = await fetchBirthYear(admin, args.userId);
  const derived = deriveFromApollo(person, birthYear);
  const salary = estimateSalaryInr({
    companyName: derived.companyNameForSalaryLookup,
    sector: derived.sector,
    seniority: derived.seniority,
    country: derived.country,
  });

  const now = new Date();
  const revealAt = new Date(now.getTime() + REVEAL_DELAY_HOURS * 60 * 60 * 1000);

  await admin
    .from('users')
    .update({
      apollo_enrichment: person,
      apollo_enriched_at: now.toISOString(),
      // Derived columns (company / college names are NOT in this set).
      apollo_sector: derived.sector,
      apollo_seniority: derived.seniority,
      apollo_years_experience: derived.yearsExperience,
      apollo_state: derived.state,
      apollo_country: derived.country,
      apollo_career_milestones: derived.careerMilestones,
      apollo_estimated_salary_inr: salary.inr,
      apollo_salary_confidence: salary.confidence,
      apollo_derived_at: now.toISOString(),
      apollo_reveal_at: revealAt.toISOString(),
    })
    .eq('id', args.userId);
}

async function fetchBirthYear(
  admin: ReturnType<typeof createAdminSupabase>,
  userId: string,
): Promise<number | null> {
  const { data } = await admin
    .from('birth_profiles')
    .select('dob')
    .eq('user_id', userId)
    .eq('is_primary', true)
    .maybeSingle();
  const dob = data?.dob as string | undefined;
  if (!dob) return null;
  const year = Number(dob.slice(0, 4));
  return Number.isFinite(year) && year > 1900 && year < 2100 ? year : null;
}

function splitName(full?: string | null): { firstName: string | null; lastName: string | null } {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
