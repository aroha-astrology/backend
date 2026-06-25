import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  breadcrumbSchema,
  faqSchema,
  webApplicationSchema,
} from '@/lib/seo/schemas';
import { SITE_NAME } from '@/lib/seo/site';
import { ZodiacWheel3D } from '@/components/3d/ZodiacWheel3D';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { AppDownloadCard } from '@/components/landing/AppDownloadCard';

export const dynamic = 'force-dynamic';

const LANDING_TITLE = 'Aroha Astrology — Free Kundli, Panchang & Daily Horoscope (Vedic Astrology)';
const LANDING_DESCRIPTION =
  'Free Vedic kundli online, accurate today panchang, daily horoscope for all 12 zodiac signs, kundli matching by Ashtakoot Guna Milan, and astrologer-reviewed Vedic remedies. Swiss Ephemeris precision built on NASA/JPL data.';

export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { title: LANDING_TITLE, description: LANDING_DESCRIPTION, url: '/', type: 'website' },
  twitter: { card: 'summary_large_image', title: LANDING_TITLE, description: LANDING_DESCRIPTION },
};

const TOOLS = [
  {
    href: '/kundli/generate',
    title: 'Free Kundli',
    desc: 'Generate your janma kundli with Lagna, Rasi, Navamsa, Vimshottari Dasha and full planetary placements — Swiss Ephemeris accurate.',
    cta: 'Generate Kundli',
    icon: '✦',
  },
  {
    href: '/panchang',
    title: "Today's Panchang",
    desc: 'Live tithi, nakshatra, yoga, karana, Rahu Kaal, Gulika Kaal, Abhijit Muhurta and Choghadiya for any city.',
    cta: 'Open Panchang',
    icon: '☉',
  },
  {
    href: '/horoscope/daily',
    title: 'Daily Horoscope',
    desc: "Today's prediction for all 12 Vedic Rashis — love, career, health, money, lucky color, and lucky number.",
    cta: 'Read Horoscope',
    icon: '☽',
  },
];

const FAQS = [
  { q: 'Is the kundli really free?', a: 'Yes. Your basic kundli — Lagna, Rasi, Navamsa, Vimshottari Dasha periods, and planetary placements — is free. Detailed astrologer-reviewed reports are paid.' },
  { q: 'How accurate are the calculations?', a: 'All planetary positions are computed using the Swiss Ephemeris, which is built on NASA / JPL ephemeris data — the same astronomical engine used by professional Vedic astrologers worldwide. Calculations are arc-second accurate.' },
  { q: 'Do I need exact birth time for an accurate kundli?', a: 'For Lagna, Navamsa, and Dasha to be correct, exact birth time matters — even a 4-minute difference can change the rising sign. If your birth time is unknown, use solar chart mode.' },
  { q: 'What is Ashtakoot Guna Milan and is it reliable for marriage?', a: 'Ashtakoot Guna Milan is the traditional Vedic 36-point compatibility score across 8 factors (Varna, Vashya, Tara, Yoni, Graha Maitri, Gana, Bhakoot, Nadi). Aroha Astrology computes the full score plus Mangal Dosha and Nadi Dosha analysis.' },
  { q: 'Is my birth data private?', a: 'Yes. Your birth data is encrypted, stored only against your account, and never sold or shared. Predictions are generated on-demand and not cached against your identity.' },
];

const ALL_TOOLS: [string, string][] = [
  ['/kundli/generate', 'Free Kundli (Janma Kundli)'],
  ['/match/new', 'Kundli Matching (Guna Milan)'],
  ['/panchang', "Today's Panchang"],
  ['/horoscope/daily', 'Daily Horoscope'],
  ['/horoscope/weekly', 'Weekly Horoscope'],
  ['/horoscope/monthly', 'Monthly Horoscope'],
  ['/horoscope/yearly', 'Yearly Horoscope'],
  ['/muhurta', 'Muhurta — Auspicious Timings'],
  ['/gochar', 'Gochar — Live Planetary Transit'],
  ['/varshaphal', 'Varshaphal — Annual Horoscope'],
  ['/vargas', 'Divisional Charts (Varga)'],
  ['/kp-system', 'KP Astrology'],
  ['/baby-names', 'Vedic Baby Names'],
  ['/gemstone', 'Gemstone Recommendation'],
  ['/vastu', 'Vastu Shastra'],
  ['/tarot', 'Tarot Reading'],
  ['/palm', 'Palmistry'],
  ['/dreams', 'Dream Analysis'],
  ['/prashna', 'Prashna Kundli'],
  ['/remedies', 'Vedic Remedies'],
  ['/life-journey', 'Life Journey & Dasha'],
  ['/couple', 'Couple Compatibility'],
  ['/pandit-puja', 'Pandit Puja Booking'],
  ['/calendar', 'Hindu Calendar'],
];

export default async function RootPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: 'Home', path: '/' }]),
          webApplicationSchema({
            name: SITE_NAME,
            description: LANDING_DESCRIPTION,
            url: '/',
            featureList: [
              'Free Vedic kundli generation',
              'Daily, weekly, monthly, and yearly horoscope',
              "Today's panchang with rahu kaal and choghadiya",
              'Kundli matching (Ashtakoot Guna Milan)',
              'Gemstone, baby names, vastu and remedy recommendations',
              'Astrologer-reviewed personalized predictions',
            ],
            isFree: true,
          }),
          faqSchema(FAQS),
        ]}
      />

      {/* Cosmic background */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-bg" />
        <div className="j-aurora-bg" />
        <div className="j-starfield" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b border-border" style={{ background: 'var(--nav-glass)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto max-w-6xl px-4">
          {/* Main row */}
          <div className="flex items-center justify-between gap-2 py-3">
            <Link href="/" className="flex items-center gap-2 no-underline min-w-0 shrink">
              <Image src="/logo.png" alt={SITE_NAME} width={28} height={28} priority className="rounded-lg shrink-0" />
              <span className="j-display j-text-gold font-bold text-[11px] sm:text-[14px] tracking-[0.10em] sm:tracking-[0.14em] sm:whitespace-nowrap leading-tight uppercase">{SITE_NAME}</span>
            </Link>
            <div className="flex items-center gap-1 sm:gap-1.5 text-sm shrink-0">
              {/* Lang + theme inline on sm+ */}
              <div className="hidden sm:flex items-center gap-1 border-r border-border pr-2 mr-1">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
              <Link href="/login" className="px-2 sm:px-3 py-1.5 text-text-muted hover:text-text no-underline text-[12px] sm:text-[13px] whitespace-nowrap">Sign in</Link>
              <Link href="/signup" className="j-btn j-btn-primary text-[12px] sm:text-[13px] no-underline whitespace-nowrap !px-3 sm:!px-4">
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Sign up free</span>
              </Link>
            </div>
          </div>
          {/* Sub-row: lang + theme on small screens */}
          <div className="sm:hidden flex items-center justify-end gap-1 pb-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative">
        {/* prettier-ignore */}
        <div data-theme="blue" style={{ background: '#070D1A', color: '#E4EEF8' }}>
        {/* HERO — 3D zodiac wheel + headline */}
        <section className="relative mx-auto max-w-6xl px-4 pt-10 pb-16 md:pt-16 md:pb-24">
            <div className="grid items-center gap-10 md:grid-cols-2">
            <div className="text-center md:text-left">
              <p className="j-eyebrow text-accent mb-3 flex items-center justify-center md:justify-start gap-2 flex-wrap">
                <span className="text-base md:text-[15px]" style={{ fontFamily: 'var(--font-devanagari)' }}>नमस्ते</span>
                <span className="opacity-50">·</span>
                <span>Namaste · Vedic Astrology · Astrologer-Crafted</span>
              </p>
              <h1 className="j-display text-4xl md:text-6xl font-bold leading-[1.05] text-text">
                Read the <span className="j-text-gold">cosmos</span>,<br />
                rewrite your day.
              </h1>
              <p className="mt-5 text-[15px] md:text-base max-w-xl md:max-w-none" style={{ color: 'rgba(228,238,248,0.88)' }}>
                NASA/JPL-grade Swiss Ephemeris precision, paired with trained Vedic
                astrologers. Generate your janma kundli, check today&rsquo;s panchang
                for any city, match horoscopes by Ashtakoot Guna Milan, and get
                personalized Vedic remedies.
              </p>
              <div className="mt-8 flex flex-wrap justify-center md:justify-start gap-3">
                <Link href="/login" className="j-btn j-btn-primary no-underline">
                  Generate Free Kundli
                </Link>
                <Link href="/login" className="j-btn j-btn-secondary no-underline">
                  Open Today&rsquo;s Panchang
                </Link>
              </div>
              <p className="mt-4 text-[13px] text-text-muted flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1">
                <span className="flex items-center gap-1.5"><span className="text-accent">✦</span> Free janma kundli — forever</span>
                <span className="opacity-40">·</span>
                <span>Detailed reports from <span className="text-text font-semibold">₹99</span></span>
              </p>
            </div>
            {/* <div className="relative h-[380px] md:h-[520px]">
              <ZodiacWheel3D className="absolute inset-0" />
            </div> */}
          </div>
        </section>
        </div>

        {/* App download */}
        <section className="mx-auto max-w-6xl px-4 pb-5">
          <AppDownloadCard />
        </section>

        {/* Trust signals strip */}
        <section className="mx-auto max-w-6xl px-4 pb-10">
          <div className="j-card p-4 md:p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-3 md:gap-x-0">
            {[
              { icon: '✦', title: 'Swiss Ephemeris', desc: 'NASA / JPL precision' },
              { icon: 'ॐ', title: '9 Languages', desc: 'हिन्दी · বাংলা · தமிழ் · …', devanagari: true },
              { icon: '☉', title: 'Free Forever', desc: 'Kundli · Panchang · Horoscope' },
              { icon: '☽', title: 'Astrologer-Reviewed', desc: 'Vedic experts review every reading' },
            ].map((s, i, arr) => (
              <div
                key={s.title}
                className={`flex items-center gap-3 px-2 md:px-3 ${i < arr.length - 1 ? 'md:border-r md:border-border' : ''}`}
              >
                <span
                  className="text-accent text-2xl leading-none shrink-0"
                  style={s.devanagari ? { fontFamily: 'var(--font-devanagari)' } : undefined}
                >
                  {s.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="j-display j-text-gold text-[12px] md:text-[13px] font-semibold leading-tight tracking-normal break-words">
                    {s.title}
                  </div>
                  <div
                    className="text-[11px] text-text-muted leading-snug mt-0.5 break-words"
                    style={s.devanagari ? { fontFamily: 'var(--font-devanagari)' } : undefined}
                  >
                    {s.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* For pandits & astrologers — join the platform */}
        <section className="mx-auto max-w-6xl px-4 pb-12">
          <Link
            href="/pandit/join"
            className="j-card relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 md:p-6 no-underline group hover:-translate-y-[1px] hover:border-[rgba(242,202,80,0.45)] hover:shadow-[0_0_25px_rgba(212,175,55,0.25)] transition-all"
          >
            <div className="flex items-start gap-4 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-3 border border-[var(--border-gold)] text-accent text-2xl">
                🕉️
              </div>
              <div className="min-w-0">
                <div className="j-eyebrow text-accent text-[10px] mb-1">For Pandits &amp; Astrologers</div>
                <h2 className="j-display j-text-gold text-lg md:text-xl font-semibold leading-tight">
                  Join the platform — grow your practice
                </h2>
                <p className="mt-1 text-[13px] text-text-2 leading-relaxed max-w-2xl">
                  Accept puja bookings, manage your client list, generate charts and
                  white-label reports, and run 1:1 consultations — all from one dashboard.
                  Free to join. Verified pandits and astrologers only.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 j-btn j-btn-primary text-[13px] no-underline self-start md:self-auto shrink-0">
              Join as Pandit / Astrologer →
            </span>
          </Link>
        </section>

        {/* Featured tools */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="grid gap-5 md:grid-cols-3">
            {TOOLS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="j-card flex flex-col gap-2 p-6 no-underline group hover:-translate-y-[2px] hover:border-[rgba(242,202,80,0.35)] hover:shadow-[0_0_25px_rgba(212,175,55,0.35)] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-3 border border-[var(--border-gold)] text-accent text-xl j-glow-pulse">
                    {t.icon}
                  </div>
                  <h2 className="j-display text-lg text-text font-semibold">{t.title}</h2>
                </div>
                <p className="text-sm text-text-2 leading-relaxed">{t.desc}</p>
                <span className="mt-2 inline-block text-sm font-semibold text-accent group-hover:text-primary-ink">
                  {t.cta} →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Three pillars */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="grid gap-6 md:grid-cols-3 text-center">
            {[
              { t: 'Swiss Ephemeris', d: 'Built on NASA / JPL ephemeris data — arc-second-accurate planetary positions, the same engine professional Vedic astrologers rely on.' },
              { t: 'Astrologer-Reviewed', d: 'Every chart and reading is shaped by trained Vedic astrologers — not just algorithms — before it ever reaches you.' },
              { t: 'Plain-Language Insight', d: 'Predictions written in everyday language that explain what your placements actually mean for you, today.' },
            ].map((p) => (
              <div key={p.t} className="j-card p-6">
                <div className="j-display j-text-gold text-2xl font-semibold mb-2">{p.t}</div>
                <p className="text-sm text-text-2 leading-relaxed">{p.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* All tools */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <h2 className="j-display text-2xl font-semibold text-text mb-5">All Vedic Tools</h2>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 md:grid-cols-3">
            {ALL_TOOLS.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="text-sm text-text-2 hover:text-accent no-underline flex items-center gap-2 group"
              >
                <span className="text-accent opacity-60 group-hover:opacity-100">✦</span>
                {label}
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-4xl px-4 pb-16">
          <h2 className="j-display text-2xl font-semibold text-text mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQS.map((f) => (
              <div key={f.q} className="j-card p-5">
                <h3 className="font-semibold text-text mb-1.5">{f.q}</h3>
                <p className="text-sm text-text-2 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-4xl px-4 pb-20">
          <div className="j-card relative overflow-hidden p-10 text-center">
            <div className="absolute inset-0 j-aurora-bg opacity-50 pointer-events-none" />
            <div className="relative">
              <h2 className="j-display text-3xl font-semibold text-text mb-2">
                Get your free kundli in 30 seconds
              </h2>
              <p className="text-text-2 mb-7">
                Enter your date, time, and place of birth — the cosmos does the rest.
              </p>
              <Link href="/signup" className="j-btn j-btn-primary no-underline">
                Get started — it&rsquo;s free
              </Link>
              <p className="mt-6 text-[13px] text-text-muted">
                Are you a pandit or astrologer?{' '}
                <Link href="/pandit/join" className="text-accent no-underline hover:underline">
                  Join the platform →
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Payment + privacy trust strip */}
      <section className="mx-auto max-w-6xl px-4 pb-10">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] text-text-muted">
          <span className="flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
              <rect width="18" height="11" x="3" y="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Secure payments
          </span>
          <span className="opacity-40">·</span>
          <span>UPI</span>
          <span className="opacity-40">·</span>
          <span>Razorpay</span>
          <span className="opacity-40">·</span>
          <span>Cards</span>
          <span className="opacity-40">·</span>
          <span>NetBanking</span>
          <span className="opacity-40 hidden md:inline">·</span>
          <span className="hidden md:flex items-center gap-1.5">
            <span className="text-accent">✦</span> Birth data encrypted &amp; private
          </span>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-text-muted flex flex-wrap items-center justify-between gap-4">
          <span>© {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</span>
          <nav className="flex gap-5">
            <Link href="/login" className="hover:text-accent no-underline">Sign in</Link>
            <Link href="/signup" className="hover:text-accent no-underline">Sign up</Link>
            <Link href="/privacy" className="hover:text-accent no-underline">Privacy</Link>
            <Link href="/terms" className="hover:text-accent no-underline">Terms</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
