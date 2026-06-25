import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Layout for all approved-astrologer-only pages. Anything inside
// (approved)/ requires roles[] to contain 'astrologer' AND astro_status='approved'.
export default async function AstrologerApprovedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: row } = await supabase
    .from('users')
    .select('roles, astro_status')
    .eq('id', user.id)
    .maybeSingle();

  const roles: string[] = (row?.roles ?? []) as string[];
  if (!roles.includes('astrologer')) redirect('/astrologer');
  if (row?.astro_status !== 'approved') {
    redirect(row?.astro_status === 'rejected' ? '/astrologer/rejected' : '/astrologer/pending');
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/astrologer/dashboard" className="flex items-center gap-2 no-underline">
            <span className="text-2xl">🔮</span>
            <span className="j-display font-bold tracking-wider text-sm text-text">ASTROLOGER PORTAL</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            <Tab href="/astrologer/dashboard">Hub</Tab>
            <Tab href="/astrologer/clients">Clients</Tab>
            <Tab href="/astrologer/calendar">Calendar</Tab>
            <Tab href="/astrologer/matchmaking">Match</Tab>
            <Tab href="/astrologer/reports">Reports</Tab>
            <Tab href="/astrologer/analytics">Analytics</Tab>
            <Tab href="/astrologer/settings">Settings</Tab>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto pb-20">{children}</main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-bg/95 backdrop-blur border-t border-border z-30 grid grid-cols-5 text-[10px]">
        <BNav href="/astrologer/dashboard" emoji="🏠" label="Hub" />
        <BNav href="/astrologer/clients"   emoji="👥" label="Clients" />
        <BNav href="/astrologer/calendar"  emoji="📅" label="Calendar" />
        <BNav href="/astrologer/reports"   emoji="📄" label="Reports" />
        <BNav href="/astrologer/settings"  emoji="⚙️" label="Settings" />
      </nav>
    </div>
  );
}

function Tab({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-3 py-1.5 rounded-md text-text-2 hover:text-text hover:bg-card no-underline">
      {children}
    </Link>
  );
}

function BNav({ href, emoji, label }: { href: string; emoji: string; label: string }) {
  return (
    <Link href={href} className="py-2 flex flex-col items-center gap-0.5 text-text-muted no-underline">
      <span className="text-base leading-none">{emoji}</span>
      <span>{label}</span>
    </Link>
  );
}
