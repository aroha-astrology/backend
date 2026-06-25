import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ALLOWED = new Set(
  (process.env.TELEGRAM_CHAT_ID ?? '').split(',').map(id => id.trim()).filter(Boolean)
);

async function reply(chatId: number | string, text: string) {
  if (!TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = body?.message as Record<string, unknown> | undefined;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = (message.chat as Record<string, unknown>)?.id as number;
  const text = ((message.text as string) ?? '').trim().toLowerCase();

  // Only respond to authorised admins
  if (!ALLOWED.has(String(chatId))) return NextResponse.json({ ok: true });

  const admin = createAdminSupabase();

  // ── /totalusers ──────────────────────────────────────────────
  if (text === '/totalusers') {
    // Page through all auth users (max 1000 per page)
    let total = 0;
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000, page });
      if (error || !data?.users?.length) break;
      total += data.users.length;
      if (data.users.length < 1000) break;
      page++;
    }

    await reply(chatId,
      `👥 <b>Total Users</b>\n\n<b>${total}</b> registered accounts`
    );
    return NextResponse.json({ ok: true });
  }

  // ── /totallive ───────────────────────────────────────────────
  if (text === '/totallive') {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const since7d  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all users and filter locally (avoids needing direct DB access to auth schema)
    let allUsers: { last_sign_in_at?: string }[] = [];
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000, page });
      if (error || !data?.users?.length) break;
      allUsers = allUsers.concat(data.users as { last_sign_in_at?: string }[]);
      if (data.users.length < 1000) break;
      page++;
    }

    const live24h = allUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at >= since24h).length;
    const live7d  = allUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at >= since7d).length;
    const live30d = allUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at >= since30d).length;
    const total   = allUsers.length;

    await reply(chatId,
      `📊 <b>Live Users</b>\n\n` +
      `Last 24 h: <b>${live24h}</b>\n` +
      `Last 7 d:  <b>${live7d}</b>\n` +
      `Last 30 d: <b>${live30d}</b>\n` +
      `Total:     <b>${total}</b>`
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
