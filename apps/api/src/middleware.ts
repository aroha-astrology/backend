import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// 0 = allow all devices, 1 = block desktop (mobile only)
const DESKTOP_BLOCK: 0 | 1 = 0;

function isMobile(ua: string) {
  return /mobile|android|iphone|ipad|ipod|blackberry|windows phone|opera mini|iemobile/i.test(ua);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (DESKTOP_BLOCK === 1 && !pathname.startsWith('/api/')) {
    const ua = request.headers.get('user-agent') || '';
    if (!isMobile(ua)) {
      return new NextResponse(
        `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aroha Astrology — Mobile Only</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0f;color:#fff;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}.card{display:flex;flex-direction:column;align-items:center;gap:20px;padding:40px;text-align:center;max-width:380px}h1{font-size:22px;font-weight:700;letter-spacing:.5px}p{color:#9ca3af;font-size:15px;line-height:1.6}img{width:200px;height:200px;border-radius:12px;border:3px solid rgba(255,255,255,0.1)}small{color:#6b7280;font-size:13px}</style></head><body><div class="card"><h1>Open on Mobile</h1><p>Aroha Astrology is designed for mobile devices.<br>Scan the QR code with your phone to continue.</p><img src="/qr.png" alt="Scan to open on mobile"><small>Point your phone camera at the code above</small></div></body></html>`,
        {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        },
      );
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2]),
          );
        },
      },
    },
  );

  // Refresh session — important for keeping auth state alive
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth-flow routes (login/signup/callbacks) — anonymous-only behavior.
  const authRoutes = ['/login', '/signup', '/auth/callback', '/auth/google'];
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // Routes accessible without login. Only the landing page itself and the
  // legal pages — the legal pages must stay reachable so Razorpay KYC review,
  // and the signup terms links, can load them.
  const publicRoutes = new Set<string>([
    '/',
    '/terms', '/privacy', '/refund-policy', '/cancellation-policy', '/shipping-policy', '/contact-us',
    '/pandit/join',
  ]);
  const isSeoPublicRoute = publicRoutes.has(pathname);

  // Redirect unauthenticated users to login (except auth flow, SEO public, and APIs).
  if (!user && !isAuthRoute && !isSeoPublicRoute && !pathname.startsWith('/api/')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    return NextResponse.redirect(redirectUrl);
  }

  // Guard /admin routes — only users with is_admin = true may access.
  // Also redirect admin users from /dashboard to /admin automatically.
  if (user && (pathname.startsWith('/admin') || pathname === '/dashboard' || pathname.startsWith('/astrologer'))) {
    const { data: userRow } = await supabase
      .from('users')
      .select('is_admin, astro_status')
      .eq('id', user.id)
      .single();

    if (pathname === '/dashboard' && userRow?.is_admin) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/admin';
      return NextResponse.redirect(redirectUrl);
    }

    if (pathname.startsWith('/admin') && !userRow?.is_admin) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/dashboard';
      return NextResponse.redirect(redirectUrl);
    }

    // Astrologer route guards
    if (pathname.startsWith('/astrologer')) {
      const status = userRow?.astro_status;
      // Approved routes — must be approved
      const approvedOnlyPaths = ['/astrologer/dashboard', '/astrologer/customers', '/astrologer/upgrade'];
      const isApprovedOnly = approvedOnlyPaths.some(p => pathname.startsWith(p));
      if (isApprovedOnly && status !== 'approved') {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = status === 'rejected' ? '/astrologer/rejected' : '/astrologer/pending';
        return NextResponse.redirect(redirectUrl);
      }
      // Pending page — redirect approved users to dashboard
      if (pathname === '/astrologer/pending' && status === 'approved') {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/astrologer/dashboard';
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     * - Image files
     * - PWA-critical files: manifest.json, sw.js, icons/, .well-known/
     * - SEO + crawler files (must stay anonymously accessible): sitemap.xml,
     *   robots.txt, BingSiteAuth.xml, and any .xml/.txt at the root.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|\\.well-known|icons|downloads|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|xml|txt|apk|ipa|aab|dmg|exe|zip)$).*)',
  ],
};
