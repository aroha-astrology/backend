# aroha-astrology/backend

The backend for Aroha Astrology — a Next.js API-only application plus the shared `@aroha-astrology/astro-engine` and `@aroha-astrology/shared` packages.

Owns:
- All `/api/*` route handlers (50+ endpoints — kundli, panchang, horoscope, match, divisional charts, varshaphal, gochar, transits, KP system, muhurta, prashna, tarot, palm, dreams, vastu, baby-names, numerology, gemstone, chat, predictions, life-journey, video, voice, pandit-puja, admin, auth, webhooks, etc.)
- All Vercel cron jobs (horoscope daily/weekly/monthly, panchang warmup, life-journey regen, auto-generate)
- The Swiss Ephemeris calculation engine (`packages/astro-engine`)
- Shared types and constants (`packages/shared`)
- Supabase migrations and edge functions (`supabase/`)
- Admin / one-off scripts (`scripts/`)

Consumed by:
- `aroha-astrology/frontend` (web app) — calls this via `NEXT_PUBLIC_API_URL`
- `aroha-astrology/mobile` (Expo apps) — same
- `aroha-astrology/landing` does NOT consume this

## Branches

- `main` — production. Protected: PR + 1 approval required, no force-push, no deletion.
- `staging` — preview. PR required.
- `develop` — active dev. Direct push allowed; no force-push.

## Stack

- Next.js 15 (API routes only — no UI)
- TypeScript 5.7
- pnpm 9 workspaces + Turbo
- Supabase (Postgres + Auth + Storage + RLS)
- Vercel deploy → `api.jyotishai.com`
- Node 20+

## Local dev

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev
```

## Origin

Split off from the original `Wookiee17/jyotish-ai` monorepo on 2026-05-24.
