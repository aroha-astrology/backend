import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { ProfileEditor } from '@/components/pandit/ProfileEditor';

export const dynamic = 'force-dynamic';

export default async function PanditProfilePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('pandit_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: pujas } = await supabase
    .from('pujas')
    .select('slug, name_en, name_sanskrit, deity')
    .order('name_en');

  if (!profile) redirect('/pandit/join');

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h1 className="j-display text-2xl text-text font-bold mb-4">My Profile</h1>
      <ProfileEditor
        userId={user.id}
        profile={profile}
        pujas={(pujas ?? []) as { slug: string; name_en: string; name_sanskrit: string; deity: string }[]}
      />
    </div>
  );
}
