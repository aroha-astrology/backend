import { NextResponse } from 'next/server';
import { notifyBackendError, notifyFrontendError, notifyUserLogin, notifyNewSignup } from '@/lib/telegram';

// Simple in-memory rate limiter — resets when the serverless function cold-starts
const seen = new Map<string, { count: number; resetAt: number }>();
const WINDOW = 60_000;
const LIMIT = 15;

function allow(ip: string): boolean {
  const now = Date.now();
  const entry = seen.get(ip);
  if (!entry || now > entry.resetAt) {
    seen.set(ip, { count: 1, resetAt: now + WINDOW });
    return true;
  }
  if (entry.count >= LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (!allow(ip)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { type, message, url, userEmail, name, provider } = body as Record<string, string>;

    switch (type) {
      case 'frontend':
        if (message) await notifyFrontendError(message, url ?? '', userEmail);
        break;
      case 'login':
        if (userEmail) await notifyUserLogin(userEmail, provider ?? 'email');
        break;
      case 'signup':
        if (userEmail) await notifyNewSignup(userEmail, name ?? '');
        break;
      case 'backend':
        if (message) await notifyBackendError(url ?? 'client-reported', message);
        break;
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
