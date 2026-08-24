import { cors } from 'hono/cors';
import { env } from '../config/env.js';

// Vercel preview deploys for OUR project only — team slug "aroha-projects" (see
// .env.example's frontend-git-staging-aroha-projects.vercel.app). *.vercel.app on its own is a
// free, self-serve namespace: anyone can `vercel deploy` and be a permitted origin in about a
// minute, which reduced CORS_ORIGINS to decoration for every unauthenticated route
// (/public/moon-sign, /public/kundli-chart, place search). The team-slug segment is not
// attacker-choosable, unlike the project-name segment, so this is what actually scopes it.
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+-aroha-projects\.vercel\.app$/;

export const corsMiddleware = cors({
  origin: (origin) => {
    // Fail CLOSED on missing config — same discipline as cron-auth.ts's requireCronSecret.
    // A misconfigured (unset/emptied) CORS_ORIGINS must reject cross-origin requests, never
    // silently reflect every origin.
    if (!origin) return null;
    if (env.CORS_ORIGINS.includes(origin)) return origin;
    if (VERCEL_PREVIEW_ORIGIN.test(origin)) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  exposeHeaders: ['X-Request-Id'],
  maxAge: 600,
  credentials: false,
});
