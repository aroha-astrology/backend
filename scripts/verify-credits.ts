import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: resolve(__dirname, '../apps/web/.env.local') });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

(async () => {
  const { data: u, error: ue } = await admin
    .from('users')
    .select('id, email, credits')
    .eq('email', 's9475220017@gmail.com')
    .single();
  if (ue) {
    console.error('lookup error:', ue.message);
    process.exit(1);
  }
  console.log('User:', u);

  const { data: tx, error: te } = await admin
    .from('credit_transactions')
    .select('amount, type, description, created_at')
    .eq('user_id', u!.id)
    .order('created_at', { ascending: false })
    .limit(5);
  if (te) {
    console.error('tx error:', te.message);
    process.exit(1);
  }
  console.log('Recent tx:', tx);
})();
