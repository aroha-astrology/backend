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
  const { error } = await admin.from('credit_transactions').insert({
    user_id: '2c86b824-ddb0-4129-93bf-a45bb61159ec',
    amount: 100,
    type: 'purchase',
    description: 'Admin grant: +100 tokens (s9475220017@gmail.com)',
  });
  if (error) {
    console.error('insert error:', error.message);
    process.exit(1);
  }
  console.log('Transaction logged.');
})();
