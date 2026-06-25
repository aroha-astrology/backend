import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { PanditBottomNav } from '@/components/pandit/PanditBottomNav';
import { PortalSwitcher } from '@/components/PortalSwitcher';

export const dynamic = 'force-dynamic';

export default async function PanditLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: row } = await supabase
    .from('users')
    .select('roles')
    .eq('id', user.id)
    .maybeSingle();

  const roles: string[] = (row?.roles ?? []) as string[];
  if (!roles.includes('pandit')) {
    redirect('/pandit/join');
  }

  return (
    <div className="min-h-screen bg-bg pb-20">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/pandit/dashboard" className="flex items-center gap-2 no-underline">
            <span className="text-2xl">🛕</span>
            <span className="j-display font-bold tracking-wider text-sm text-text">DEVSEVA PANDIT HUB</span>
          </Link>
          <div className="flex items-center gap-3">
            <nav className="hidden md:flex items-center gap-1 text-sm">
              <NavLink href="/pandit/dashboard">Dashboard</NavLink>
              <NavLink href="/pandit/bookings">Bookings</NavLink>
              <NavLink href="/pandit/prasad">Prasad</NavLink>
              <NavLink href="/pandit/profile">Profile</NavLink>
            </nav>
            <PortalSwitcher />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto">{children}</div>

      <PanditBottomNav />
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-text-2 hover:text-text hover:bg-card no-underline"
    >
      {children}
    </Link>
  );
}
