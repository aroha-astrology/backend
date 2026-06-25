import { cors } from 'hono/cors';
import { env } from '../config/env.js';

export const corsMiddleware = cors({
  origin: (origin) => {
    if (env.CORS_ORIGINS.length === 0) return origin ?? '*';
    if (!origin) return null;
    if (env.CORS_ORIGINS.includes(origin)) return origin;
    if (origin.endsWith('.vercel.app')) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  exposeHeaders: ['X-Request-Id'],
  maxAge: 600,
  credentials: false,
});
