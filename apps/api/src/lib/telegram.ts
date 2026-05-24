import { NextResponse } from 'next/server';

const TELEGRAM_API = 'https://api.telegram.org';

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function esc(text: string): string {
  return text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c));
}

export async function sendTelegramMessage(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatIds) return;

  // Supports comma-separated list of chat IDs so multiple people receive alerts
  const ids = chatIds.split(',').map(id => id.trim()).filter(Boolean);
  await Promise.all(ids.map(async (chatId) => {
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[telegram] sendMessage ${res.status} for chat ${chatId}: ${body.slice(0, 200)}`);
      }
    } catch (err) {
      console.error(`[telegram] sendMessage threw for chat ${chatId}:`, err);
    }
  }));
}

export async function notifyBackendError(route: string, error: unknown): Promise<void> {
  const msg = error instanceof Error ? error.message : String(error);
  await sendTelegramMessage(
    `🔴 <b>Backend Error</b>\n<b>Route:</b> <code>${esc(route)}</code>\n<b>Error:</b> ${esc(msg.slice(0, 300))}\n<b>Time:</b> ${ts()}`
  );
}

export async function notifyFrontendError(message: string, url: string, userEmail?: string): Promise<void> {
  const emailLine = userEmail ? `\n<b>User:</b> ${esc(userEmail)}` : '';
  await sendTelegramMessage(
    `🟡 <b>Frontend Error</b>\n<b>Message:</b> ${esc(message.slice(0, 300))}\n<b>URL:</b> ${esc(url)}${emailLine}\n<b>Time:</b> ${ts()}`
  );
}

export async function notifyUserLogin(email: string, provider = 'email'): Promise<void> {
  await sendTelegramMessage(
    `👤 <b>User Login</b>\n<b>Email:</b> ${esc(email)}\n<b>Provider:</b> ${esc(provider)}\n<b>Time:</b> ${ts()}`
  );
}

export async function notifyNewSignup(email: string, name: string): Promise<void> {
  await sendTelegramMessage(
    `✨ <b>New User Signup</b>\n<b>Email:</b> ${esc(email)}\n<b>Name:</b> ${esc(name)}\n<b>Time:</b> ${ts()}`
  );
}

export async function notifyPanditSignup(name: string, city: string, phoneOrEmail: string): Promise<void> {
  await sendTelegramMessage(
    `🕉️ <b>New Pandit Registration</b>\n<b>Name:</b> ${esc(name)}\n<b>City:</b> ${esc(city)}\n<b>Contact:</b> ${esc(phoneOrEmail)}\n<b>Time:</b> ${ts()}`
  );
}

export async function notifyAstrologerSignup(name: string, phoneOrEmail: string): Promise<void> {
  await sendTelegramMessage(
    `🔮 <b>New Astrologer Registration</b>\n<b>Name:</b> ${esc(name)}\n<b>Contact:</b> ${esc(phoneOrEmail)}\n<b>Time:</b> ${ts()}`
  );
}

export async function notifyRoleLogin(role: 'pandit' | 'astrologer', phoneOrEmail: string, name?: string): Promise<void> {
  const emoji = role === 'pandit' ? '🕉️' : '🔮';
  const label = role === 'pandit' ? 'Pandit' : 'Astrologer';
  const nameLine = name ? `\n<b>Name:</b> ${esc(name)}` : '';
  await sendTelegramMessage(
    `${emoji} <b>${label} Login</b>${nameLine}\n<b>Contact:</b> ${esc(phoneOrEmail)}\n<b>Time:</b> ${ts()}`
  );
}

export async function notifyKundliGenerated(subjectName: string, dob: string, pob: string, userEmail: string): Promise<void> {
  await sendTelegramMessage(
    `🔮 <b>Kundli Generated</b>\n<b>Name:</b> ${esc(subjectName)}\n<b>DOB:</b> ${esc(dob)}\n<b>POB:</b> ${esc(pob)}\n<b>User:</b> ${esc(userEmail)}\n<b>Time:</b> ${ts()}`
  );
}

export async function notifyReportReady(subjectName: string, reportType: string, userEmail: string): Promise<void> {
  await sendTelegramMessage(
    `📊 <b>Report Ready</b>\n<b>Name:</b> ${esc(subjectName)}\n<b>Type:</b> ${esc(reportType)}\n<b>User:</b> ${esc(userEmail)}\n<b>Time:</b> ${ts()}`
  );
}

export async function notifyVoiceCallEnabled(userEmail: string, code: string): Promise<void> {
  await sendTelegramMessage(
    `🎙️ <b>Voice Call Unlocked</b>\n<b>User:</b> ${esc(userEmail)}\n<b>Code:</b> <code>${esc(code)}</code>\n<b>Time:</b> ${ts()}`
  );
}

export async function notifyCouponRedeemed(params: {
  code: string;
  tokens: number;
  perk: string | null;
  userName: string;
  userContact: string;
}): Promise<void> {
  const { code, tokens, perk, userName, userContact } = params;
  const tokenLine = tokens > 0 ? `\n<b>Tokens:</b> +${tokens}` : '';
  const perkLine  = perk ? `\n<b>Perk:</b> ${esc(perk)}` : '';
  await sendTelegramMessage(
    `🎟️ <b>Coupon Redeemed</b>\n<b>Code:</b> <code>${esc(code)}</code>${tokenLine}${perkLine}\n<b>User:</b> ${esc(userName)}\n<b>Contact:</b> ${esc(userContact)}\n<b>Time:</b> ${ts()}`
  );
}

/** Drop-in replacement for error returns in API route catch blocks. */
export function serverError(route: string, error: unknown): Response {
  notifyBackendError(route, error); // fire-and-forget
  const msg = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json({ success: false, error: msg }, { status: 500 });
}
