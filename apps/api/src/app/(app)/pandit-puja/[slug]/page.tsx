import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { benefitsForIntents, STANDARD_PROCESS_STEPS } from '@/lib/puja/benefits';
import { citySlugFromName } from '@/lib/puja/cities';
import { PujaDetailClient } from './PujaDetailClient';
import { BookNowTrigger } from './BookNowTrigger';

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ slug: string }> }

export default async function PujaDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerSupabase();

  const { data: puja } = await supabase
    .from('pujas')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (!puja) notFound();

  // Catalog offerings + this puja's specific offerings
  const { data: offerings } = await supabase
    .from('puja_offerings')
    .select('id, slug, title, description, image_path, dhanam_cost, scope, linked_puja')
    .or(`linked_puja.eq.${slug},scope.eq.catalog`)
    .eq('active', true)
    .order('scope', { ascending: false });

  // Public puja image
  let imageUrl: string | null = null;
  if (puja.image_path) {
    const { data } = supabase.storage.from('pujas').getPublicUrl(puja.image_path);
    imageUrl = data?.publicUrl ?? null;
  }

  // Resolve offering image public URLs
  const offeringsWithUrls = (offerings ?? []).map(o => {
    let url: string | null = null;
    if (o.image_path) {
      const { data } = supabase.storage.from('pujas').getPublicUrl(o.image_path);
      url = data?.publicUrl ?? null;
    }
    return { ...o, image_url: url };
  });

  // User's city — used to default the pandit list. The booking sheet refines further.
  const { data: { user } } = await supabase.auth.getUser();
  let userCitySlug: string | null = null;
  let userName: string | null = null;
  if (user) {
    const { data: u } = await supabase
      .from('users')
      .select('current_city, credits, name')
      .eq('id', user.id)
      .maybeSingle();
    userCitySlug = citySlugFromName(u?.current_city ?? null);
    userName = (u as { name?: string | null } | null)?.name ?? null;
  }

  const benefits = benefitsForIntents(puja.intent_tags ?? []);
  const totalDevoteesText = '7,500+ devotees have already participated in pujas organised through this platform';

  return (
    <div className="min-h-screen bg-bg pb-24">
      {/* Hero */}
      <div className="relative">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={puja.name_en} className="w-full h-64 md:h-96 object-cover" />
        ) : (
          <div className="w-full h-64 md:h-96 bg-gradient-to-br from-accent/30 to-primary/20 flex items-center justify-center text-6xl">
            🕉️
          </div>
        )}
        <div className="absolute top-3 left-3">
          <Link href="/pandit-puja" className="bg-bg/80 backdrop-blur px-3 py-1.5 rounded-md text-sm text-text no-underline">
            ← Back
          </Link>
        </div>
      </div>

      <div className="px-4 max-w-3xl mx-auto -mt-6 relative">
        {/* Title card */}
        <div className="j-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wider text-accent mb-1">Verified Partner Puja</div>
              <h1 className="j-display text-2xl font-bold text-text leading-tight">{puja.name_en}</h1>
              <div className="text-text-muted text-sm mt-1">{puja.name_sanskrit}</div>
              <p className="text-sm text-text-2 mt-3">{puja.short_desc}</p>
              <div className="mt-3 text-xs text-text-muted">
                <span className="text-accent">✦</span> {totalDevoteesText}
              </div>
            </div>
            <BookNowTrigger suggestedDhanam={puja.suggested_dhanam ?? 1000} />
          </div>
        </div>

        {/* Where puja performed */}
        <section className="mt-4 j-card p-5">
          <h2 className="text-sm font-bold text-text mb-2">Where Your Puja Will Be Performed</h2>
          <p className="text-sm text-text-2">
            We have verified pandits in 10 cities including Delhi, Mumbai, Bengaluru, Varanasi and Kolkata. You&apos;ll pick a specific pandit in the next step.
          </p>
        </section>

        {/* Package includes */}
        <section className="mt-4">
          <h2 className="text-sm font-bold text-text mb-2 px-1">Your Puja Package Includes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="j-card p-4">
              <div className="text-2xl mb-2">📿</div>
              <div className="font-semibold text-text text-sm">Guided Mantras & Rituals</div>
              <div className="text-xs text-text-muted mt-1">Simple instructions and mantras so you can join from home in spirit.</div>
            </div>
            <div className="j-card p-4">
              <div className="text-2xl mb-2">🎁</div>
              <div className="font-semibold text-text text-sm">Puja Video & Prasad</div>
              <div className="text-xs text-text-muted mt-1">A personalised video recorded with your sankalp + divine prasad to your home.</div>
            </div>
          </div>
        </section>

        {/* Description + benefits */}
        <section className="mt-4 j-card p-5">
          <p className="text-sm text-text-2 mb-4">{puja.long_desc}</p>
          {benefits.length > 0 && (
            <>
              <h3 className="text-sm font-bold text-text mb-2">Puja Benefits</h3>
              <div className="space-y-2">
                {benefits.map(b => (
                  <div key={b.title}>
                    <div className="text-sm font-semibold text-text">✦ {b.title}</div>
                    <div className="text-xs text-text-muted">{b.body}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Process */}
        <section className="mt-4 j-card p-5">
          <h2 className="text-sm font-bold text-text mb-3">Puja Process</h2>
          <ol className="space-y-3">
            {STANDARD_PROCESS_STEPS.map((s, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                <div>
                  <div className="text-sm font-semibold text-text">{s.title}</div>
                  <div className="text-xs text-text-muted mt-0.5">{s.description}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing summary */}
        <section className="mt-4 j-card p-5">
          <h2 className="text-sm font-bold text-text mb-1">Suggested Package</h2>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-text">{puja.suggested_dhanam ?? 1000}</span>
            <span className="text-sm text-text-muted">Dhanam</span>
            <span className="text-xs text-text-muted ml-2">(≈ ₹{((puja.suggested_dhanam ?? 1000) * 10).toLocaleString('en-IN')})</span>
          </div>
          <div className="text-xs text-text-muted mt-1">
            Additional members in your sankalp: <span className="text-accent">+10 Dhanam each</span> (max 6).
          </div>
        </section>
      </div>

      {/* Booking sheet (client) — also renders the sticky Select Package CTA */}
      <PujaDetailClient
        puja={{
          slug:             puja.slug,
          name_en:          puja.name_en,
          name_sanskrit:    puja.name_sanskrit,
          deity:            puja.deity,
          suggested_dhanam: puja.suggested_dhanam ?? 1000,
        }}
        offerings={offeringsWithUrls}
        defaultCity={userCitySlug}
        isAuthed={!!user}
        userName={userName}
      />
    </div>
  );
}
