import { z } from '@hono/zod-openapi';
import { alertThrottled } from '../../lib/notifications/alerts.js';
import { consumeRateLimit } from '../../middleware/rate-limit.js';

/**
 * A sign-in failure the app had no specific message for, reported by the
 * client so the full error reaches the ops chat.
 *
 * These failures happen inside Firebase on the phone and never touch this
 * API, so nothing here could see them: the user got "Something went wrong"
 * and the only trace was an analytics event whose error code had to be
 * opened row by row. Limits are generous — the client trims before sending,
 * so a rejection here would only ever lose a report.
 */
export const AuthErrorReportSchema = z
  .object({
    step: z.enum(['otp-send', 'otp-verify', 'google', 'apple']),
    code: z.string().max(120),
    message: z.string().max(1000),
    /** JSON of the error's other fields (native plugin detail, HTTP status, request id). */
    details: z.string().max(2000).optional(),
    stack: z.string().max(2000).optional(),
    platform: z.enum(['web', 'android', 'ios']),
    /** Native shell version, e.g. "1.15 (18)". Absent in a browser. */
    appVersion: z.string().max(40).optional(),
    page: z.string().max(200).optional(),
  })
  .openapi('AuthErrorReport');

export type AuthErrorReport = z.infer<typeof AuthErrorReportSchema>;

const STEP_LABEL: Record<AuthErrorReport['step'], string> = {
  'otp-send': 'Sending the OTP',
  'otp-verify': 'Checking the OTP',
  google: 'Google sign-in',
  apple: 'Apple sign-in',
};

/**
 * sendAlert() escapes every MarkdownV2 character, which can double the
 * length; Telegram rejects anything over 4096. Half of that, less the title.
 */
const MAX_BODY_CHARS = 1900;

/** Across all callers, on top of the per-caller limiter on the route. */
const GLOBAL_MAX_PER_MINUTE = 20;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * The error code decides the throttle bucket, and it is client input: left
 * raw, every made-up code would open its own bucket and reach the chat.
 */
function codeForSignature(code: string): string {
  return code.replace(/[^A-Za-z0-9/_:.-]/g, '').slice(0, 60) || 'none';
}

function whereLabel(report: AuthErrorReport): string {
  if (report.platform === 'web') return 'Browser';
  const shell = report.platform === 'android' ? 'Android app' : 'iOS app';
  return report.appVersion ? `${shell} ${report.appVersion}` : shell;
}

export function formatAuthErrorAlert(
  report: AuthErrorReport,
  userAgent: string | undefined,
): { title: string; message: string } {
  const lines = [
    `Step: ${STEP_LABEL[report.step]}`,
    `Where: ${whereLabel(report)}`,
    `Code: ${report.code || '(none)'}`,
    `Message: ${clip(report.message || '(none)', 500)}`,
  ];
  if (report.details) lines.push(`Details: ${clip(report.details, 600)}`);
  if (report.page) lines.push(`Page: ${report.page}`);
  if (userAgent) lines.push(`Device: ${clip(userAgent, 200)}`);
  // Last, so that when the whole body is clipped it is the stack that goes.
  if (report.stack) lines.push(`Stack: ${clip(report.stack, 500)}`);

  return {
    title: `Sign-in failed: ${clip(report.code || 'no error code', 80)}`,
    message: clip(lines.join('\n'), MAX_BODY_CHARS),
  };
}

/**
 * Send one report to the ops chat. One message per step + error code per
 * 15 minutes (alertThrottled); repeats arrive as a count on the next one.
 * Never throws — see alertThrottled.
 */
export async function reportAuthError(
  report: AuthErrorReport,
  userAgent: string | undefined,
): Promise<void> {
  const hit = await consumeRateLimit('ratelimit:public-auth-error:global', 60_000);
  if (hit && hit.count > GLOBAL_MAX_PER_MINUTE) return;

  const { title, message } = formatAuthErrorAlert(report, userAgent);
  await alertThrottled(
    `auth-error:${report.step}:${codeForSignature(report.code)}`,
    title,
    message,
  );
}
