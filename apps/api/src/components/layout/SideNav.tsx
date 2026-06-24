'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/components/ui/icon';

interface NavGroup {
  label: string;
  items: { label: string; href: string; icon: IconName; matchPaths?: string[]; locked?: boolean }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Today',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'home' },
      { label: 'Panchang', href: '/panchang', icon: 'calendar' },
      { label: 'Horoscope', href: '/horoscope/daily', icon: 'sun', matchPaths: ['/horoscope'] },
    ],
  },
  {
    label: 'My Chart',
    items: [
      { label: 'Kundli', href: '/kundli', icon: 'chart', matchPaths: ['/kundli'] },
      { label: 'Life Journey', href: '/life-journey', icon: 'heart', matchPaths: ['/life-journey'] },
      { label: 'Guna Chakra', href: '/guna-chakra', icon: 'radar', matchPaths: ['/guna-chakra'] },
      { label: 'Life Decisions', href: '/life-decisions', icon: 'star', matchPaths: ['/life-decisions'], locked: true },
    ],
  },
  {
    label: 'Predictions',
    items: [
      { label: 'Chat', href: '/chat', icon: 'chat', matchPaths: ['/chat'] },
      { label: 'Muhurta', href: '/muhurta', icon: 'moon' },
      { label: 'Prashna', href: '/prashna', icon: 'search' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Couple Match', href: '/couple', icon: 'heart', matchPaths: ['/couple', '/match'] },
      { label: 'Gemstone', href: '/gemstone', icon: 'gem' },
      { label: 'Vastu', href: '/vastu', icon: 'briefcase' },
    ],
  },
  // {
  //   label: 'Reports',
  //   items: [
  //     { label: 'All Reports', href: '/reports', icon: 'reports', matchPaths: ['/reports'] },
  //     { label: 'Career', href: '/reports/career', icon: 'briefcase' },
  //   ],
  // },
  {
    label: 'Account',
    items: [
      { label: 'Dhanam', href: '/credits', icon: 'coin' },
      // Rewards hidden — page disabled pending daily-rewards backend
      { label: 'Profile', href: '/profile', icon: 'user' },
      { label: 'Settings', href: '/settings', icon: 'settings' },
    ],
  },
];

export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-56 lg:w-60 shrink-0 border-r border-border bg-surface/80 h-screen sticky top-0 overflow-y-auto">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-16 shrink-0 border-b border-border">
        <Image src="/logo.png" alt="Aroha Astrology" width={28} height={28} className="rounded-md object-cover" />
        <span className="j-display text-[12px] text-text tracking-[0.08em]">AROHA ASTROLOGY</span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="j-eyebrow text-[9px] px-2 mb-1.5">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href ||
                  (item.matchPaths
                    ? item.matchPaths.some(p => pathname.startsWith(p))
                    : pathname.startsWith(item.href + '/'));
                if (item.locked) {
                  return (
                    <li key={item.href}>
                      <div
                        aria-disabled="true"
                        title="Coming soon"
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-dim cursor-not-allowed select-none"
                      >
                        <Icon name={item.icon} size={15} strokeWidth={1.5} />
                        <span className="flex-1">{item.label}</span>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-70"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150 no-underline',
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-text-muted hover:bg-surface-2 hover:text-text',
                      )}
                    >
                      <Icon name={item.icon} size={15} strokeWidth={isActive ? 2 : 1.5} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
