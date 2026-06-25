import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: resolve(__dirname, '../apps/web/.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
  process.exit(1);
}

const IDENTIFIER = process.argv[2] ?? 's9475220017@gmail.com';
const AMOUNT = Number(process.argv[3] ?? 100);

function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  if (input.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

async function main() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const isPhone = !IDENTIFIER.includes('@');
  const lookupValue = isPhone ? normalizePhone(IDENTIFIER) : IDENTIFIER;
  const lookupColumn = isPhone ? 'phone' : 'email';

  if (isPhone && !lookupValue) {
    console.error(`Invalid phone "${IDENTIFIER}"`);
    process.exit(1);
  }

  const { data: user, error: lookupErr } = await admin
    .from('users')
    .select('id, email, phone, credits')
    .eq(lookupColumn, lookupValue!)
    .single();

  if (lookupErr || !user) {
    console.error(`User not found for ${lookupColumn} "${lookupValue}":`, lookupErr?.message);
    process.exit(1);
  }

  console.log(`Found user ${user.id} (${user.email ?? user.phone}) — current credits: ${user.credits}`);

  const { data: newCredits, error: rpcErr } = await admin.rpc('increment_credits', {
    p_user_id: user.id,
    p_amount: AMOUNT,
  });

  if (rpcErr) {
    console.error('increment_credits RPC failed:', rpcErr.message);
    process.exit(1);
  }

  const { error: txErr } = await admin.from('credit_transactions').insert({
    user_id: user.id,
    amount: AMOUNT,
    type: 'purchase',
    description: `Admin grant: +${AMOUNT} tokens`,
  });

  if (txErr) {
    console.warn('Credits added but failed to log credit_transactions row:', txErr.message);
  }

  console.log(`Credited +${AMOUNT}. New balance: ${newCredits}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
