'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/pandit/dashboard', label: 'Dashboard', emoji: '🏠' },
  { href: '/pandit/bookings',  label: 'Bookings',  emoji: '📋' },
  { href: '/pandit/prasad',    label: 'Prasad',    emoji: '📦' },
  { href: '/pandit/profile',   label: 'Profile',   emoji: '👤' },
];

export function PanditBottomNav() {
  const path = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-bg/95 backdrop-blur border-t border-border z-30">
      <div className="grid grid-cols-4">
        {ITEMS.map(item => {
          const active = path?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`py-2 flex flex-col items-center gap-0.5 no-underline ${
                active ? 'text-accent' : 'text-text-muted'
              }`}
            >
              <span className="text-lg leading-none">{item.emoji}</span>
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
