import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PACKING_CHECKLIST = ['Dry Fruits', 'Kalawa', 'Sacred Ash', 'Deity Picture', 'Camphor', 'Sealed Pouch'];

export default async function PanditPrasadPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: bookings } = await supabase
    .from('puja_bookings')
    .select('id, puja_slug, member_count, ship_address, ship_pincode, total_dhanam, created_at')
    .eq('pandit_id', user.id)
    .eq('status', 'video_uploaded')
    .order('created_at');

  const { data: pujas } = await supabase.from('pujas').select('slug, name_en');
  const nameMap = new Map((pujas ?? []).map(p => [p.slug, p.name_en]));

  return (
    <div className="px-4 py-6">
      <h1 className="j-display text-2xl text-text font-bold mb-1">Prasad Fulfilment</h1>
      <p className="text-sm text-text-muted mb-4">
        Bookings waiting for prasad to be packed and shipped.
      </p>

      {!bookings || bookings.length === 0 ? (
        <div className="j-card p-8 text-center text-text-muted text-sm">
          Nothing waiting on prasad. Bookings show up here once the ritual video is uploaded.
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map(b => (
            <div key={b.id} className="j-card p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-sm font-semibold text-text">{nameMap.get(b.puja_slug) ?? b.puja_slug}</div>
                  <div className="text-xs text-text-muted">#{b.id.slice(0, 8)} · {b.member_count} member{b.member_count > 1 ? 's' : ''}</div>
                </div>
                <Link href={`/pandit/bookings/${b.id}`} className="text-accent text-xs no-underline">Open →</Link>
              </div>
              {(b.ship_address || b.ship_pincode) && (
                <div className="text-xs text-text-muted mb-3">
                  Ship to: {b.ship_address} {b.ship_pincode}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {PACKING_CHECKLIST.map(item => (
                  <label key={item} className="flex items-center gap-2 text-sm text-text-2">
                    <input type="checkbox" className="rounded border-border" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
