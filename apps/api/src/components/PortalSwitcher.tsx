'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Role = 'personal' | 'pandit' | 'astrologer';

const ROLE_HOME: Record<Role, string> = {
  personal:   '/dashboard',
  pandit:     '/pandit/dashboard',
  astrologer: '/astrologer/dashboard',
};

const ROLE_LABEL: Record<Role, string> = {
  personal:   '✨ Personal',
  pandit:     '🛕 Pandit Hub',
  astrologer: '🔮 Astrologer Portal',
};

/**
 * Renders a small dropdown in the top bar when the signed-in user holds more
 * than one of {personal, pandit, astrologer}. Hidden for single-role accounts.
 * Selection is remembered in sessionStorage so reloads land on the same portal.
 */
export function PortalSwitcher() {
  const router = useRouter();
  const path = usePathname() ?? '/';
  const [roles, setRoles] = useState<Role[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: row } = await supabase
        .from('users').select('roles').eq('id', user.id).maybeSingle();
      if (!cancelled) {
        const raw = (row?.roles ?? []) as string[];
        const filtered = raw.filter((r): r is Role => ['personal','pandit','astrologer'].includes(r));
        setRoles(filtered);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (roles.length < 2) return null;

  const current: Role = path.startsWith('/pandit') ? 'pandit'
                     : path.startsWith('/astrologer') ? 'astrologer'
                     : 'personal';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="px-2 py-1 rounded-md border border-border bg-card text-text text-[12px] hover:border-accent/40"
      >
        {ROLE_LABEL[current]} ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-bg border border-border rounded-md shadow-lg min-w-[180px] z-50">
          {roles.map(r => (
            <button
              key={r}
              onClick={() => {
                sessionStorage.setItem('portal', r);
                setOpen(false);
                router.push(ROLE_HOME[r]);
              }}
              className={`w-full text-left px-3 py-2 text-[13px] no-underline hover:bg-card ${
                r === current ? 'text-accent' : 'text-text'
              }`}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
