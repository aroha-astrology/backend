import type { MetadataRoute } from 'next';

const _rawUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://arohaastrology.in';
const SITE_URL = (_rawUrl.startsWith('http') ? _rawUrl : `https://${_rawUrl}`).replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Backend / private surfaces — must never appear in SERPs.
          '/api/',          // server APIs
          '/admin/',        // admin console
          '/auth/',         // OAuth / Supabase callback URLs
          '/onboarding',    // gated onboarding flow
          '/dashboard',     // signed-in personal dashboard
          '/profile',       // personal account
          '/settings',      // personal settings
          '/credits',       // billing / wallet
          '/rewards',       // referral wallet
          '/referral',      // referral codes
          '/more',          // signed-in misc panel

          // Per-user generated content (private artifacts).
          '/kundli/[id]',   // individual generated charts
          '/chat/',         // private chat threads
          '/life-decisions/', // gated tool

          // Misc.
          '/video',         // gated video generator
          '/mobile-only.html', // intermediate page used by desktop block
        ],
        // Note: /kundli (index) and /kundli/generate ARE indexable —
        // only individual chart URLs (/kundli/<uuid>) are private.
        // Note: AI crawlers (GPTBot, ClaudeBot, anthropic-ai, CCBot,
        // Google-Extended, PerplexityBot) are intentionally allowed.
        // Tool outputs (kundli charts, AI predictions) are gated by auth,
        // so AI crawlers see only public marketing/tool-front content.
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
