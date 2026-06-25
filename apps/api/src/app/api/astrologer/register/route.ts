import { after, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ensureRole } from '@/lib/roles/ensureRole';
import { notifyAstrologerSignup } from '@/lib/telegram';

// POST /api/astrologer/register
// Appends 'astrologer' to the user's roles[] and marks astro_status='pending'.
// Existing pandits keep their 'pandit' role — this is additive.
export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: existing } = await supabase
    .from('users')
    .select('astro_status, name, email')
    .eq('id', user.id)
    .single();

  if (existing?.astro_status === 'pending' || existing?.astro_status === 'approved') {
    return NextResponse.json({ success: true, status: existing.astro_status });
  }

  const admin = createAdminSupabase();
  await ensureRole(admin, user.id, 'astrologer');
  const { error } = await admin
    .from('users')
    .update({ astro_status: 'pending' })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const name = existing?.name ?? user.email ?? 'Unknown';
  const email = existing?.email ?? user.email ?? '';

  const waMessage = encodeURIComponent(
    `🔮 *New Astrologer Registration*\nName: ${name}\nEmail: ${email}\nUser ID: ${user.id}\n\nPlease review and approve at:\nhttps://jyotish-ai-v2.vercel.app/admin`
  );
  const waUrl = `https://wa.me/919535960988?text=${waMessage}`;

  after(async () => {
    try {
      await notifyAstrologerSignup(name, email || user.phone || user.id);
    } catch (err) {
      console.warn('[astrologer register] telegram notify failed', err);
    }
  });

  return NextResponse.json({ success: true, status: 'pending', waUrl });
}
